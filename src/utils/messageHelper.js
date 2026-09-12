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
async function safeSendMessage(api, payload, threadId, replyToMessageId = null) {
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

  try {
    return await api.sendMessage(msgObj, String(threadId), targetReplyId);
  } catch (err) {
    if (targetReplyId) {
      logger.warn(`Gửi tin nhắn kèm trích dẫn (${targetReplyId}) thất bại: ${err.message}. Đang thử lại không trích dẫn...`);
      try {
        return await api.sendMessage(msgObj, String(threadId));
      } catch (innerErr) {
        if (typeof api.sendMessageMqtt === 'function' && !msgObj.attachment) {
          try {
            logger.info('Đang chuyển sang gửi qua MQTT channel (/ls_req)...');
            return await api.sendMessageMqtt(msgObj, String(threadId));
          } catch (_) {}
        }
        logger.error('Thử lại gửi tin nhắn không trích dẫn vẫn thất bại:', innerErr.message || innerErr);
        throw innerErr;
      }
    } else {
      if (typeof api.sendMessageMqtt === 'function' && !msgObj.attachment) {
        try {
          logger.info('Đang chuyển sang gửi qua MQTT channel (/ls_req)...');
          return await api.sendMessageMqtt(msgObj, String(threadId));
        } catch (_) {}
      }
      throw err;
    }
  }
}

module.exports = {
  safeSendMessage,
};
