const fs = require('fs');
const logger = require('./logger');

/**
 * Gửi tin nhắn an toàn qua Facebook Messenger:
 * Hỗ trợ nội dung văn bản (body), tệp đính kèm (ảnh, audio, video) qua ReadStream,
 * và tự động dự phòng nếu phản hồi theo tin nhắn (reply/quote) gặp sự cố.
 *
 * @param {object} api - Instance FCA api
 * @param {string|object} payload - Nội dung gửi (chuỗi hoặc object { body/msg, attachments/attachment, quote/replyToMessage })
 * @param {string|number} threadId - ID hội thoại
 * @param {string} [replyToMessageId] - ID tin nhắn cần trích dẫn/trả lời
 */
async function safeSendMessage(api, payload, threadId, replyToMessageId = null, isSingleUser = null) {
  if (!api || !threadId) return null;

  let msgObj = {};
  let targetReplyId = replyToMessageId;

  if (typeof payload === 'string') {
    msgObj = { body: payload };
  } else if (typeof payload === 'object' && payload !== null) {
    const text = payload.body || payload.msg || '';
    if (text) {
      msgObj.body = text;
    }

    if (payload.quote || payload.replyToMessage) {
      targetReplyId = payload.quote?.messageID || payload.quote?.data?.msgId || payload.replyToMessage || targetReplyId;
    }

    if (payload.mentions) {
      msgObj.mentions = payload.mentions;
    }

    // Xử lý tệp đính kèm (hỗ trợ cả attachments dạng mảng đường dẫn file)
    const rawAttachments = payload.attachments || payload.attachment;
    if (rawAttachments) {
      const list = Array.isArray(rawAttachments) ? rawAttachments : [rawAttachments];
      const streams = [];

      for (const item of list) {
        if (typeof item === 'string' && fs.existsSync(item)) {
          streams.push(fs.createReadStream(item));
        } else if (typeof item === 'object' && item !== null) {
          streams.push(item);
        }
      }

      if (streams.length > 0) {
        msgObj.attachment = streams.length === 1 ? streams[0] : streams;
      }
    }
  }

  // Đảm bảo không gửi object rỗng
  if (!msgObj.body && !msgObj.attachment) {
    logger.warn('Tin nhắn rỗng, bỏ qua thao tác gửi.');
    return null;
  }

  // Xác định xem có phải là chat riêng 1-1 không (isSingleUser)
  let isSingle = isSingleUser;
  if (typeof isSingle !== 'boolean') {
    if (typeof payload === 'object' && payload !== null) {
      if (typeof payload.isSingleUser === 'boolean') isSingle = payload.isSingleUser;
      else if (typeof payload.isGroup === 'boolean') isSingle = !payload.isGroup;
    }
  }

  // Hàm hỗ trợ gửi tin nhắn qua ws3-fca api.sendMessage
  async function attemptSend(singleUserFlag, replyId) {
    return await api.sendMessage(msgObj, String(threadId), replyId, singleUserFlag);
  }

  // Chiến lược gửi:
  // Nếu đã biết rõ (isSingle !== null): thử với giá trị đó trước.
  // Nếu chưa biết: thử gửi dạng nhóm (false), nếu lỗi 1545012 sẽ tự động chuyển sang 1-1 (true).
  const primarySingle = isSingle === true;
  const secondarySingle = !primarySingle;

  try {
    return await attemptSend(primarySingle, targetReplyId);
  } catch (err) {
    logger.warn(`Lần gửi 1 tới ${threadId} (isSingleUser=${primarySingle}, reply=${!!targetReplyId}) thất bại: ${err.message || err}`);

    // Thử lại lần 2: Đổi chế độ giữa 1-1 và Group
    try {
      logger.info(`Đang thử lại chế độ ngược lại (isSingleUser=${secondarySingle})...`);
      return await attemptSend(secondarySingle, targetReplyId);
    } catch (flipErr) {
      // Thử lại lần 3: Nếu có kèm reply ID thì thử bỏ reply ID (gửi tin nhắn thông thường)
      if (targetReplyId) {
        try {
          logger.info(`Đang thử lại không kèm trích dẫn (isSingleUser=${primarySingle})...`);
          return await attemptSend(primarySingle, null);
        } catch (_) {
          try {
            logger.info(`Đang thử lại không kèm trích dẫn (isSingleUser=${secondarySingle})...`);
            return await attemptSend(secondarySingle, null);
          } catch (finalErr) {
            logger.error(`Tất cả các lần thử gửi tin nhắn tới ${threadId} đều thất bại:`, finalErr.message || finalErr);
            throw finalErr;
          }
        }
      }
      throw flipErr;
    }
  }
}

module.exports = {
  safeSendMessage,
};
