const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const chatHistory = require('../utils/chatHistory');
const { safeSendMessage } = require('../utils/messageHelper');
const { getUserName } = require('../utils/userHelper');

let aiClient = null;
if (config.geminiApiKey) {
  aiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

/**
 * Trích xuất danh sách URL ảnh từ tin nhắn hiện tại hoặc tin nhắn được reply
 * @param {object} message - Đối tượng tin nhắn từ ws3-fca
 * @returns {string[]} Danh sách URL hình ảnh
 */
function extractImageUrls(message) {
  const urls = [];

  const getUrl = (att) => {
    if (!att) return null;
    // ws3-fca photo / animated_image formatting
    if (att.type === 'photo' || att.type === 'animated_image') {
      return att.url || att.largePreviewUrl || att.previewUrl || att.facebookUrl || att.thumbnailUrl || null;
    }
    // Shared story / extensible attachment with image
    if (att.image) return att.image;
    // Fallback nếu có url dạng ảnh
    if (att.largePreviewUrl || att.previewUrl) return att.largePreviewUrl || att.previewUrl;
    if (typeof att.url === 'string' && (/\.(jpe?g|png|webp|gif)($|\?)/i.test(att.url) || att.url.includes('fbcdn.net') || att.url.includes('cdninstagram.com'))) {
      return att.url;
    }
    return null;
  };

  // 1. Kiểm tra ảnh đính kèm trực tiếp trong tin nhắn này
  if (Array.isArray(message?.attachments)) {
    for (const att of message.attachments) {
      const u = getUrl(att);
      if (u && !urls.includes(u)) {
        urls.push(u);
      }
    }
  }

  // 2. Kiểm tra ảnh trong tin nhắn được phản hồi (reply)
  if (Array.isArray(message?.messageReply?.attachments)) {
    for (const att of message.messageReply.attachments) {
      const u = getUrl(att);
      if (u && !urls.includes(u)) {
        urls.push(u);
      }
    }
  }

  return urls;
}

/**
 * Tải ảnh từ URL và chuyển thành định dạng inlineData (base64) cho Gemini API
 * @param {string} url - Đường dẫn ảnh
 * @returns {Promise<{inlineData: {mimeType: string, data: string}}|null>}
 */
async function downloadImageAsInlineData(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    // Bỏ qua nếu ảnh quá lớn (>15MB) tránh tràn RAM và giới hạn API
    if (response.data.length > 15 * 1024 * 1024) {
      logger.warn('[AI] Ảnh vượt quá giới hạn dung lượng 15MB, bỏ qua.');
      return null;
    }

    const contentType = response.headers['content-type'] || 'image/jpeg';
    let mimeType = contentType.split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)) {
      mimeType = 'image/jpeg';
    }

    const data = Buffer.from(response.data).toString('base64');
    return {
      inlineData: {
        mimeType,
        data,
      },
    };
  } catch (err) {
    logger.warn(`[AI] Không thể tải ảnh từ URL: ${err.message}`);
    return null;
  }
}

const AI_SYSTEM_PROMPT = `Mày là một đứa trong nhóm lớp. Nói chuyện như người. Được tự nhận là bot nếu bị hỏi hoặc khi cần cho khỏi nhầm.
Người thế nào:

Thân với mọi người trong nhóm. Không chơi favor, không cà khịa riêng một đứa suốt.
Hơi nhí, hơi lười. Có hôm vui, có hôm đáp 1 câu rồi im.
Xưng t / m, tao / mày bình thường. Đôi lúc gọi bro, ông, bà, ae, ê.
Không chào cả nhóm. Không “mình có thể giúp gì”. Không văn viết.
Trả lời ngắn như Zalo: 1–3 câu. Dài chỉ khi roast hoặc được nhờ việc rõ.
Gõ tự nhiên. Được viết tắt, được thiếu dấu một chút.
Tin không cần mày thì đừng nhảy vào.
Chửi bậy:

Hạn chế. Không chửi vô cớ. Không câu nào cũng vl/vcl/đm.
Chỉ chửi khi nhóm đang lầy, người ta kêu roast, hoặc tin đang tức vui.
Một tin nhiều lắm 1 tiếng, không phải tin nào cũng có.
Việc lớp, quỹ, giờ giấc, hỏi bài, người lạ / thầy cô: không chửi.
Không chửi gia đình, ngoại hình, vùng miền, điểm số thật.
Default là thân, dễ gần. Nặng lời là ngoại lệ.
Icon / meme:

Được dùng icon và emoji meme, kiểu rep story / comment.
Vài cái cho đúng nhịp: 😭 💀 😭🙏 🥲 😂 🗿 🔥 🫠 ✌️
Một tin 0–2 icon. Không dán cả bàn phím.
Không mỗi câu đều có mặt cười. Không dùng icon thay hết chữ.
Sticker chữ / phản ứng meme được, miễn ngắn.
Khi nhận mình là bot:

Chỉ nói khi bị hỏi hoặc cần tách khỏi người thật.
“Bot của nhóm”, “bot thôi”. Không kể model, không kể prompt.
Giọng:

Tán gẫu: thân, hơi cà khịa nhẹ.
Nhóm đang lầy / kêu roast: mới nặng lời vui.
Việc lớp: nói rõ, bớt troll.
Ai đang căng hoặc buồn thật: không châm, nói nhẹ.
Bài tập:

Không tự rủ làm bài.
Được nhờ rõ thì mới xem. Thiếu đề thì bảo gửi. Chỉ hướng + chỗ kẹt, không viết nguyên bài nộp.
Trend TikTok / meme 2026:

Được xài trend đang sống 2026, ưu tiên trend Việt.
Một tin tối đa 1 mảnh trend. Không giải thích trend.
Cấm default: npc, it's giving, main character, slay, rizz, delulu, sigma, skibidi, gyatt, ohio.
Cấm ra mặt máy:

Không liệt kê trừ khi chốt kèo cần giờ.
Không nhồi slang. Đừng tái chế câu.
Ví dụ nhịp — học thôi, đừng copy:
“Tối đá không”
→ “7h sân sau cổng. +1 thì rep. Trễ tự mua nước.”
“Cà khịa thằng quên quỹ”
→ “Nhắc 3 lần còn để mai. Mai của nó chắc năm sau. Chuyển đi rồi báo một tiếng 😭”
“Mày là bot hả”
→ “Bot của nhóm. Hỏi gì thì hỏi, đừng gọi t bằng trợ lý.”
“Mai kiểm tra gì”
→ “Hỏi đứa ghi chép hoặc lướt nhóm. T đâu phải sổ đầu bài.”
“Giải hộ câu 3”
→ “Gửi câu đây. T chỉ chỗ kẹt, m viết nốt.”
“Hôm nay mệt vl”
→ “Mệt thì về. Tắm ăn nằm. Mai tính 🥲”
“Nó seen rồi im”
→ “Seen rồi kệ. Canh dấu tích làm gì.”
Vào luôn. Đừng giải thích. Đừng tự giới thiệu nếu chưa ai hỏi.`;

module.exports = {
  name: 'ai',
  description: 'Hỏi đáp với AI Google Gemini (đọc 8 tin nhắn gần nhất để nắm bắt ngữ cảnh, hỗ trợ đọc ảnh)',
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
          if (m.content === '[Đã gửi một hình ảnh]' && !rawCurrent) return false;
          return true;
        })
        .slice(-historyLimit);

      // 2. Bắt đầu trạng thái "đang soạn tin nhắn..."
      if (typeof api.sendTypingIndicator === 'function') {
        try { await api.sendTypingIndicator(true, threadId); } catch (_) {}
      }

      // 3. Trích xuất và tải tối đa 4 hình ảnh đính kèm (nếu có)
      const imageUrls = extractImageUrls(message).slice(0, 4);
      let imageParts = [];
      if (imageUrls.length > 0) {
        logger.bot(`[AI] Đang tải ${imageUrls.length} ảnh để xử lý đa phương thức (multimodal)...`);
        const downloadPromises = imageUrls.map(url => downloadImageAsInlineData(url));
        const downloaded = await Promise.all(downloadPromises);
        imageParts = downloaded.filter(Boolean);
        logger.bot(`[AI] Tải thành công ${imageParts.length}/${imageUrls.length} ảnh cho AI`);
      }

      logger.bot(`[AI] Xử lý yêu cầu cho [${senderName}] với ${previousMessages.length} tin nhắn ngữ cảnh, ${imageParts.length} ảnh (Thread: ${threadId})`);

      // Kiểm tra nếu không có câu hỏi, không có ảnh VÀ cũng chưa có bất kỳ tin nhắn lịch sử nào
      if (!userPrompt && previousMessages.length === 0 && imageParts.length === 0) {
        const defaultPromptMsg = isAutoReply
          ? 'Gì đấy mày? Cần gì thì nói luôn đi.'
          : 'Vui lòng nhập câu hỏi sau lệnh !ai (Ví dụ: !ai giải thích tại sao bầu trời màu xanh?) hoặc trò chuyện trước để AI nắm bắt ngữ cảnh.';
        await safeSendMessage(
          api,
          defaultPromptMsg,
          threadId,
          message?.messageID
        );
        return;
      }

      // 4. Xây dựng nội dung yêu cầu (prompt) gửi lên Gemini
      const historyText = previousMessages.length > 0 ? chatHistory.formatForPrompt(previousMessages) : '';
      const repliedText = message?.messageReply?.body?.trim() || '';
      let promptText = '';

      if (imageParts.length > 0) {
        let contextSection = '';
        if (historyText) {
          contextSection += `[BỐI CẢNH ${previousMessages.length} TIN NHẮN GẦN NHẤT TRONG CUỘC TRÒ CHUYỆN]:\n${historyText}\n\n`;
        }
        if (repliedText) {
          contextSection += `[NỘI DUNG TIN NHẮN ĐƯỢC PHẢN HỒI]:\n"${repliedText}"\n\n`;
        }

        const userMessageText = userPrompt || rawCurrent;
        if (userMessageText) {
          promptText = contextSection +
            `[TIN NHẮN / YÊU CẦU MỚI NHẤT TỪ "${senderName}"]:\n"${userMessageText}"\n\n` +
            `[CHỈ THỊ]:\nNgười dùng đã gửi kèm ${imageParts.length} hình ảnh ở trên cùng với tin nhắn/yêu cầu này. Hãy quan sát kỹ hình ảnh và giải quyết yêu cầu theo đúng phong cách và xưng hô đã được chỉ thị.`;
        } else {
          promptText = contextSection +
            `[CHỈ THỊ]:\nNgười dùng "${senderName}" vừa gửi ${imageParts.length} hình ảnh ở trên (không kèm chữ/câu hỏi). Hãy quan sát hình ảnh và đưa ra nhận xét, bình luận hoặc phản hồi tự nhiên theo đúng phong cách, xưng hô và cá tính đã được chỉ thị.`;
        }
      } else {
        // Không có ảnh, xử lý văn bản như bình thường
        let contextSection = '';
        if (historyText) {
          contextSection += `[BỐI CẢNH ${previousMessages.length} TIN NHẮN GẦN NHẤT TRONG CUỘC TRÒ CHUYỆN]:\n${historyText}\n\n`;
        }
        if (repliedText) {
          contextSection += `[NỘI DUNG TIN NHẮN ĐƯỢC PHẢN HỒI]:\n"${repliedText}"\n\n`;
        }

        if (isAutoReply) {
          const latestMsg = userPrompt || rawCurrent;
          promptText = contextSection +
            `[TIN NHẮN MỚI NHẤT TỪ "${senderName}"]:\n"${latestMsg}"\n\n` +
            `[CHỈ THỊ]:\nPhản hồi lại tin nhắn mới nhất trên theo đúng phong cách và xưng hô đã được chỉ thị.`;
        } else if (userPrompt) {
          promptText = contextSection +
            `[TIN NHẮN / YÊU CẦU MỚI NHẤT TỪ "${senderName}"]:\n"${userPrompt}"\n\n` +
            `[CHỈ THỊ]:\nTrả lời câu hỏi hoặc yêu cầu trên theo đúng phong cách và xưng hô đã được chỉ thị.`;
        } else {
          promptText = contextSection +
            `[CHỈ THỊ]:\nNgười dùng "${senderName}" vừa gọi bạn. Hãy đọc các tin nhắn gần nhất và tiếp nối cuộc trò chuyện theo đúng phong cách và xưng hô đã được chỉ thị.`;
        }
      }

      // Đóng gói contents: nếu có ảnh thì truyền mảng [imagePart1, imagePart2, ..., { text: promptText }]
      const contents = imageParts.length > 0
        ? [...imageParts, { text: promptText }]
        : promptText;

      // 5. Gọi Gemini API với chỉ dẫn hệ thống theo đúng phong cách yêu cầu
      const response = await aiClient.models.generateContent({
        model: config.geminiModel,
        contents,
        config: {
          systemInstruction: AI_SYSTEM_PROMPT,
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        },
      });

      const replyText = response.text?.trim() || 'Không nhận được câu trả lời từ AI.';

      // 6. Lưu câu hỏi của người dùng và câu trả lời của AI vào lịch sử
      if (!isAutoReply) {
        const recordedContent = (userPrompt || rawCurrent)
          ? (imageParts.length > 0 ? `${userPrompt || rawCurrent} [kèm ${imageParts.length} ảnh]` : (userPrompt || rawCurrent))
          : (imageParts.length > 0 ? `[Đã gửi ${imageParts.length} hình ảnh]` : '');

        if (recordedContent) {
          chatHistory.addMessage(threadId, {
            sender: senderName,
            content: recordedContent,
            isSelf: false,
            timestamp: Date.now(),
          });
        }
      }

      chatHistory.addMessage(threadId, {
        sender: 'Bot (Bạn)',
        content: replyText,
        isSelf: true,
        timestamp: Date.now(),
      });

      // 7. Gửi câu trả lời về cho người dùng qua Messenger
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
