const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const logger = require('../utils/logger');
const chatHistory = require('../utils/chatHistory');
const { safeSendMessage } = require('../utils/messageHelper');
const { getUserName } = require('../utils/userHelper');

let aiClient = null;
if (config.geminiApiKey) {
  aiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

module.exports = {
  name: 'ai',
  description: 'Hỏi đáp với AI Google Gemini (đọc 8 tin nhắn gần nhất để nắm bắt ngữ cảnh)',
  usage: '!ai [câu hỏi hoặc để trống để AI phản hồi theo ngữ cảnh]',
  async execute({ api, message, args, threadId, isGroup, isAutoReply = false }) {
    if (!config.geminiApiKey) {
      await safeSendMessage(
        api,
        'Tính năng AI chưa được cấu hình.\nBạn vui lòng mở file .env và điền GEMINI_API_KEY (lấy hoàn toàn miễn phí tại https://aistudio.google.com/app/apikey).',
        threadId,
        message?.messageID
      );
      return;
    }

    if (!aiClient) {
      aiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }

    const senderId = message?.senderID;
    const senderName = await getUserName(api, senderId);
    const hasArgs = Boolean(args && args.length > 0);
    const userPrompt = hasArgs ? args.join(' ').trim() : '';
    const historyLimit = config.aiHistoryLimit || 8;

    // Xem lịch sử ngữ cảnh đang lưu: !ai xem hoặc !ai history
    if (userPrompt.toLowerCase() === 'xem' || userPrompt.toLowerCase() === 'history') {
      const msgs = chatHistory.getHistory(threadId, historyLimit);
      if (msgs.length === 0) {
        await safeSendMessage(
          api,
          'Hiện chưa có tin nhắn nào được lưu trong bộ nhớ ngữ cảnh của cuộc trò chuyện này.',
          threadId,
          message?.messageID
        );
        return;
      }

      const formatted = chatHistory.formatForPrompt(msgs);
      await safeSendMessage(
        api,
        `[LỊCH SỬ ${msgs.length} TIN NHẮN NGỮ CẢNH GẦN NHẤT]:\n\n${formatted}\n\nAI sẽ tự động tham khảo các tin nhắn trên khi bạn gọi !ai.`,
        threadId,
        message?.messageID
      );
      return;
    }

    try {
      // 1. Lấy lịch sử các tin nhắn gần nhất trong cuộc hội thoại từ bộ nhớ
      const fullHistory = chatHistory.getHistory(threadId, historyLimit + 5);

      // Lọc bỏ tin nhắn hiện tại để không bị trùng lặp
      const rawCurrent = message?.body?.trim() || '';
      const previousMessages = fullHistory
        .filter(m => {
          if (!m || !m.content) return false;
          if (m.content === rawCurrent || (userPrompt && m.content === userPrompt)) return false;
          return true;
        })
        .slice(-historyLimit);

      logger.bot(`[AI] Xử lý yêu cầu cho [${senderName}] với ${previousMessages.length} tin nhắn ngữ cảnh gần nhất (Thread: ${threadId})`);

      // Kiểm tra nếu không có câu hỏi VÀ cũng chưa có bất kỳ tin nhắn lịch sử nào
      if (!userPrompt && previousMessages.length === 0) {
        await safeSendMessage(
          api,
          'Vui lòng nhập câu hỏi sau lệnh !ai (Ví dụ: !ai giải thích tại sao bầu trời màu xanh?) hoặc trò chuyện trước để AI nắm bắt ngữ cảnh.',
          threadId,
          message?.messageID
        );
        return;
      }

      // 2. Xây dựng prompt chứa bối cảnh các tin nhắn gần nhất
      let contents = '';
      const historyText = previousMessages.length > 0 ? chatHistory.formatForPrompt(previousMessages) : '';

      if (isAutoReply) {
        const latestMsg = userPrompt || rawCurrent;
        contents = (historyText ? `[BỐI CẢNH ${previousMessages.length} TIN NHẮN TRƯỚC ĐÓ TRONG CUỘC TRÒ CHUYỆN]:\n${historyText}\n\n` : '') +
          `[TIN NHẮN MỚI NHẤT VỪA NHẬN TỪ "${senderName}"]:\n"${latestMsg}"\n\n` +
          `[YÊU CẦU]:\nBạn là chủ tài khoản Facebook cá nhân đang trò chuyện 1-1 với "${senderName}". Hãy đọc kỹ bối cảnh và phản hồi lại tin nhắn mới nhất trên một cách tự nhiên, thân thiện, ngắn gọn như người thật đang nhắn tin Messenger.`;
      } else if (userPrompt) {
        contents = (historyText ? `[BỐI CẢNH ${previousMessages.length} TIN NHẮN GẦN NHẤT TRONG CUỘC TRÒ CHUYỆN]:\n${historyText}\n\n` : '') +
          `[CÂU HỎI / YÊU CẦU MỚI NHẤT TỪ "${senderName}"]:\n"${userPrompt}"\n\n` +
          `[YÊU CẦU]:\nHãy phân tích kỹ bối cảnh các tin nhắn trên (nếu có) để trả lời câu hỏi mới nhất một cách tối ưu, tự nhiên, chính xác và súc tích nhất cho tin nhắn Messenger.`;
      } else {
        contents = `[BỐI CẢNH ${previousMessages.length} TIN NHẮN GẦN NHẤT TRONG CUỘC TRÒ CHUYỆN]:\n${historyText}\n\n` +
          `[YÊU CẦU]:\nNgười dùng "${senderName}" vừa gọi AI hỗ trợ. Hãy phân tích kỹ các tin nhắn gần nhất trên và đưa ra câu trả lời hoặc phản hồi tối ưu nhất để tiếp nối, giải quyết vấn đề mọi người đang bàn luận trong cuộc trò chuyện.`;
      }

      // 3. Gọi Gemini API với chỉ dẫn hệ thống tối ưu phong cách chat Messenger
      if (typeof api.sendTypingIndicator === 'function') {
        try { await api.sendTypingIndicator(true, threadId); } catch (_) {}
      }

      const response = await aiClient.models.generateContent({
        model: config.geminiModel,
        contents,
        config: {
          systemInstruction: `Bạn là trợ lý AI thông minh trên ứng dụng Facebook Messenger.
Nhiệm vụ của bạn: Đọc và hiểu sâu bối cảnh tin nhắn gần nhất để tối ưu câu trả lời cho người dùng.

Quy tắc phản hồi tối ưu:
- Hiểu ngữ cảnh: Nhận diện chủ đề đang bàn luận, xưng hô phù hợp, giải mã các đại từ thay thế (ví dụ: "chỗ đó", "nó", "quán đấy", "ai", "bao nhiêu").
- Phong cách nhắn tin Messenger: Trả lời bằng tiếng Việt tự nhiên, thân thiện, ngắn gọn, súc tích, đi thẳng vào trọng tâm (1-3 câu hoặc vài gạch đầu dòng rõ ràng).
- Trực tiếp giải quyết câu hỏi hoặc nhu cầu của người dùng.`,
        },
      });

      const replyText = response.text?.trim() || 'Không nhận được câu trả lời từ AI.';

      // 4. Lưu câu hỏi của người dùng và câu trả lời của AI vào lịch sử
      if (userPrompt && !isAutoReply) {
        chatHistory.addMessage(threadId, {
          sender: senderName,
          content: userPrompt,
          isSelf: false,
          timestamp: Date.now(),
        });
      }

      chatHistory.addMessage(threadId, {
        sender: 'Bot (Bạn)',
        content: replyText,
        isSelf: true,
        timestamp: Date.now(),
      });

      // 5. Gửi câu trả lời về cho người dùng qua Messenger
      await safeSendMessage(api, replyText, threadId, message?.messageID, isGroup !== undefined ? !isGroup : null);
    } catch (err) {
      logger.error('Lỗi khi gọi Gemini API:', err);
      await safeSendMessage(
        api,
        `Lỗi xử lý AI: ${err.message || 'Không thể kết nối đến máy chủ AI.'}`,
        threadId,
        message?.messageID,
        isGroup !== undefined ? !isGroup : null
      );
    } finally {
      if (typeof api.sendTypingIndicator === 'function') {
        try { await api.sendTypingIndicator(false, threadId); } catch (_) {}
      }
    }
  },
};
