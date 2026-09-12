const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const CACHE_FILE = path.join(__dirname, '../../temp/chat_history.json');

/**
 * Quản lý lịch sử tin nhắn gần nhất theo từng cuộc hội thoại (threadId)
 * Dùng để cung cấp ngữ cảnh tin nhắn gần nhất cho AI tối ưu câu trả lời.
 */
class ChatHistory {
  constructor(maxPerThread = 30, maxThreads = 500) {
    this.maxPerThread = maxPerThread;
    this.maxThreads = maxThreads;
    /** @type {Map<string, Array<{sender: string, content: string, isSelf: boolean, timestamp: number}>>} */
    this.history = new Map();
    this.saveTimeout = null;

    this.loadFromDisk();
  }

  /**
   * Nạp lịch sử tin nhắn từ file lưu trữ nếu có
   */
  loadFromDisk() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [key, msgs] of Object.entries(data)) {
            if (Array.isArray(msgs)) {
              this.history.set(String(key), msgs.slice(-this.maxPerThread));
            }
          }
          logger.info(`Đã khôi phục lịch sử chat cho ${this.history.size} hội thoại từ bộ nhớ lưu trữ.`);
        }
      }
    } catch (err) {
      logger.warn(`Không thể đọc file chat_history.json: ${err.message}`);
    }
  }

  /**
   * Lưu lịch sử tin nhắn ra đĩa (debounce 2 giây để tối ưu I/O)
   */
  saveToDisk() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        const dir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const obj = {};
        for (const [key, val] of this.history.entries()) {
          obj[key] = val;
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
      } catch (err) {
        logger.warn(`Không thể lưu file chat_history.json: ${err.message}`);
      }
    }, 2000);
  }

  /**
   * Lưu lịch sử tin nhắn ra đĩa ngay lập tức (dùng khi tắt bot)
   */
  flushSync() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj = {};
      for (const [key, val] of this.history.entries()) {
        obj[key] = val;
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      logger.warn(`Không thể ghi file chat_history.json: ${err.message}`);
    }
  }

  /**
   * Thêm một tin nhắn vào lịch sử của threadId
   * @param {string|number} rawThreadId 
   * @param {{sender: string, content: string, isSelf?: boolean, timestamp?: number}} msg 
   */
  addMessage(rawThreadId, { sender, content, isSelf = false, timestamp = Date.now() }) {
    if (!rawThreadId || !content || typeof content !== 'string') return;
    const threadId = String(rawThreadId);
    const cleanContent = content.trim();
    if (!cleanContent) return;

    // Giới hạn số lượng thread để tránh rò rỉ bộ nhớ
    if (!this.history.has(threadId) && this.history.size >= this.maxThreads) {
      const firstKey = this.history.keys().next().value;
      if (firstKey) this.history.delete(firstKey);
    }

    if (!this.history.has(threadId)) {
      this.history.set(threadId, []);
    }

    const list = this.history.get(threadId);

    // Tránh lưu trùng lặp tin nhắn giống hệt nhau trong vòng 2.5 giây
    const isDuplicate = list.some(
      m => m.content === cleanContent &&
           m.sender === sender &&
           Math.abs(timestamp - m.timestamp) < 2500
    );
    if (isDuplicate) return;

    list.push({
      sender: sender || (isSelf ? 'Bot (Bạn)' : 'Người dùng'),
      content: cleanContent,
      isSelf: Boolean(isSelf),
      timestamp: Number(timestamp) || Date.now(),
    });

    // Sắp xếp theo thứ tự thời gian tăng dần
    list.sort((a, b) => a.timestamp - b.timestamp);

    // Giữ tối đa maxPerThread tin nhắn gần nhất
    if (list.length > this.maxPerThread) {
      list.splice(0, list.length - this.maxPerThread);
    }

    this.saveToDisk();
  }

  /**
   * Lấy danh sách tin nhắn gần nhất trong bộ nhớ
   * @param {string|number} rawThreadId 
   * @param {number} limit 
   * @returns {Array<{sender: string, content: string, isSelf: boolean, timestamp: number}>}
   */
  getRecentMessages(rawThreadId, limit = 8) {
    if (!rawThreadId) return [];
    const threadId = String(rawThreadId);
    const list = this.history.get(threadId) || [];
    return list.slice(-limit);
  }

  /**
   * Lấy lịch sử tin nhắn cho hội thoại
   * @param {string|number} rawThreadId 
   * @param {number} limit 
   * @returns {Array<{sender: string, content: string, isSelf: boolean, timestamp: number}>}
   */
  getHistory(rawThreadId, limit = 8) {
    return this.getRecentMessages(rawThreadId, limit);
  }

  /**
   * Định dạng danh sách tin nhắn thành chuỗi văn bản ngữ cảnh dễ đọc cho AI
   * @param {Array<{sender: string, content: string, isSelf: boolean}>} messages 
   * @returns {string}
   */
  formatForPrompt(messages) {
    if (!messages || messages.length === 0) return '';
    return messages
      .map((m, idx) => {
        const senderName = m.isSelf ? 'Bot (Bạn)' : m.sender;
        return `${idx + 1}. [${senderName}]: ${m.content}`;
      })
      .join('\n');
  }

  /**
   * Xóa lịch sử của một cuộc hội thoại
   * @param {string|number} rawThreadId 
   */
  clearThread(rawThreadId) {
    const threadId = String(rawThreadId);
    this.history.delete(threadId);
    this.saveToDisk();
  }
}

// Singleton instance dùng chung
const chatHistory = new ChatHistory();

module.exports = chatHistory;
