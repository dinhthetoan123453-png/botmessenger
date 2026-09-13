const { safeSendMessage } = require('../utils/messageHelper');
const { getUserDetails, getUserName, getUserGender } = require('../utils/userHelper');
const { generateInfoCard } = require('../utils/cardHelper');
const logger = require('../utils/logger');

/**
 * Xác định UID của đối tượng cần xem thông tin:
 * 1. Tag (mention) @người_dùng
 * 2. Reply (trả lời) tin nhắn của người khác
 * 3. Nhập UID hoặc link Facebook trực tiếp trong đối số
 * 4. Tìm kiếm thành viên nhóm theo tên (nếu tag text thông thường)
 * 5. Mặc định là chính người gửi lệnh
 */
async function resolveTargetUserId(api, message, args, threadId, isGroup) {
  // 1. Kiểm tra tag người dùng (Mentions)
  if (message?.mentions && typeof message.mentions === 'object') {
    const mentionKeys = Object.keys(message.mentions);
    if (mentionKeys.length > 0) {
      logger.info(`Phát hiện tag mention đối tượng: ${mentionKeys[0]} (${message.mentions[mentionKeys[0]]})`);
      return mentionKeys[0];
    }
  }

  // 2. Kiểm tra trả lời (Reply) tin nhắn của người khác
  if (message?.messageReply?.senderID) {
    const replySenderId = String(message.messageReply.senderID);
    logger.info(`Phát hiện đối tượng qua tin nhắn phản hồi (Reply): ${replySenderId}`);
    return replySenderId;
  }

  // 3. Kiểm tra nếu người dùng truyền UID Facebook hoặc đường dẫn profile trong args
  if (Array.isArray(args) && args.length > 0) {
    const firstArg = args[0].trim();

    // Dạng UID số nguyên dài
    if (/^\d{4,25}$/.test(firstArg)) {
      return firstArg;
    }

    // Dạng đường link trang cá nhân Facebook
    const matchId = firstArg.match(/(?:id=|profile\.php\?id=)(\d+)/);
    if (matchId && matchId[1]) {
      return matchId[1];
    }
  }

  // 4. Dự phòng: Tìm kiếm thành viên trong nhóm theo tên gõ trong lệnh
  if (Array.isArray(args) && args.length > 0 && isGroup && typeof api?.getThreadInfo === 'function') {
    const rawSearch = args.join(' ').replace(/^@/, '').toLowerCase().trim();
    if (rawSearch.length > 1) {
      try {
        const threadInfo = await api.getThreadInfo(threadId);
        if (threadInfo?.userInfo && Array.isArray(threadInfo.userInfo)) {
          const matched = threadInfo.userInfo.find(u =>
            (u.name && u.name.toLowerCase().includes(rawSearch)) ||
            (u.vanity && u.vanity.toLowerCase().includes(rawSearch))
          );
          if (matched && matched.id) {
            logger.info(`Tìm thấy thành viên [${matched.name}] (UID: ${matched.id}) khớp với từ khóa '${rawSearch}'`);
            return String(matched.id);
          }
        }
      } catch (err) {
        logger.warn('Không thể tìm kiếm thành viên nhóm theo tên:', err.message);
      }
    }
  }

  // 5. Mặc định là chính người gửi lệnh
  return message?.senderID || 'Không rõ';
}

module.exports = {
  name: 'info',
  description: 'Hiển thị thẻ hình ảnh thông tin cá nhân hoặc người được tag / reply',
  usage: '!info [@tag / reply tin nhắn / UID]',
  async execute({ api, message, args, threadId, isGroup }) {
    const chatType = isGroup ? 'Nhóm chat Messenger' : 'Tin nhắn riêng (1-1)';

    // 1. Xác định UID mục tiêu cần xem thông tin
    const targetId = await resolveTargetUserId(api, message, args, threadId, isGroup);

    let cardResult = null;
    try {
      // 2. Lấy thông tin chi tiết người dùng
      const user = await getUserDetails(api, targetId);
      const targetName = user?.name || (await getUserName(api, targetId));
      const avatarUrl = user?.profilePicUrl || `https://graph.facebook.com/${targetId}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

      // Xác định giới tính chuẩn xác với cơ chế đa tầng
      const genderText = await getUserGender(api, targetId, threadId, user);

      // 3. Tạo hình ảnh thẻ thông tin (Info Card)
      cardResult = await generateInfoCard({
        name: targetName,
        uid: targetId,
        chatType,
        threadId,
        avatarUrl,
        gender: genderText,
      });

      // 4. Gửi thẻ hình ảnh vào đoạn chat Messenger
      await safeSendMessage(
        api,
        {
          body: `✨ Thẻ thông tin tài khoản Facebook của [${targetName}]`,
          attachments: [cardResult.imagePath],
        },
        threadId,
        message?.messageID
      );
    } catch (err) {
      logger.error('Lỗi khi tạo ảnh info card, chuyển sang gửi dạng text:', err.message || err);

      // Dự phòng gửi tin nhắn văn bản nếu lỗi tạo ảnh
      const targetName = await getUserName(api, targetId);
      const fallbackMsg = `ℹ️ THÔNG TIN TÀI KHOẢN FACEBOOK:\n` +
        `• Tên: ${targetName}\n` +
        `• UID Facebook: ${targetId}\n` +
        `• Trang cá nhân: https://facebook.com/${targetId}\n` +
        `• Cuộc trò chuyện: ${chatType}\n` +
        `• Thread ID: ${threadId}\n` +
        `• Message ID: ${message?.messageID || 'N/A'}`;

      await safeSendMessage(api, fallbackMsg, threadId, message?.messageID);
    } finally {
      if (cardResult && typeof cardResult.cleanup === 'function') {
        cardResult.cleanup();
      }
    }
  },
};
