const config = require('../config');
const { safeSendMessage } = require('../utils/messageHelper');
const { getUserDetails } = require('../utils/userHelper');
const { generateInfoCard } = require('../utils/cardHelper');
const logger = require('../utils/logger');

module.exports = {
  name: 'admin',
  aliases: ['ad', 'owner'],
  description: 'Hiển thị thẻ thông tin quản trị viên và chủ sở hữu bot (@toandinh27210)',
  usage: '!admin',
  async execute({ api, message, threadId }) {
    const adminId = config.adminId || '100083611166883';
    const adminName = config.adminName || 'Toàn Đinh';
    const adminTag = config.adminTag || '@toandinh27210';
    const adminFacebook = config.adminFacebook || 'https://www.facebook.com/toandinh27210';

    let cardResult = null;
    try {
      // 1. Lấy thêm thông tin chi tiết hoặc avatar của admin
      const user = await getUserDetails(api, adminId);
      const avatarUrl = user?.profilePicUrl || `https://graph.facebook.com/${adminId}/picture?width=720&height=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

      // 2. Tạo thẻ ảnh Admin Card cao cấp với giao diện vàng kim vương miện
      cardResult = await generateInfoCard({
        name: adminName,
        uid: adminId,
        badgeTitle: '★ BOT OWNER & DEVELOPER ★',
        badgeColor: '#fbbf24',
        badgeBorder: 'rgba(251, 191, 36, 0.65)',
        badgeBg: 'rgba(30, 20, 10, 0.85)',
        subtitle: '★ Quản Trị Viên & Tác Giả Bot',
        subtitleColor: '#fbbf24',
        avatarUrl,
        gender: 'Nam',
        customItems: [
          { label: 'HỌ VÀ TÊN', value: adminName, type: 'user' },
          { label: 'BIỆT DANH / TAG', value: adminTag, type: 'tag', valueColor: '#c084fc' },
          { label: 'FACEBOOK UID', value: adminId, type: 'uid' },
          { label: 'GIỚI TÍNH', value: 'Nam', type: 'gender' },
          { label: 'VAI TRÒ TRONG HỆ THỐNG', value: 'Chủ sở hữu & Quản trị viên', type: 'crown', valueColor: '#fbbf24' },
          { label: 'TRANG CÁ NHÂN FACEBOOK', value: adminFacebook, type: 'link' },
        ],
      });

      const caption = `👑 THÔNG TIN QUẢN TRỊ VIÊN BOT (ADMIN):\n` +
        `• Họ và tên: ${adminName}\n` +
        `• Biệt danh / Tag: ${adminTag}\n` +
        `• Facebook UID: ${adminId}\n` +
        `• Giới tính: Nam\n` +
        `• Vai trò: Bot Creator & Developer\n` +
        `• Trang cá nhân: ${adminFacebook}\n` +
        `• Hỗ trợ: Nhắn tin trực tiếp qua Facebook hoặc tag ${adminTag} trong nhóm nhé!`;

      // 3. Gửi thẻ hình ảnh kèm nội dung giới thiệu
      await safeSendMessage(
        api,
        {
          body: caption,
          attachments: [cardResult.imagePath],
        },
        threadId,
        message?.messageID
      );
    } catch (err) {
      logger.error('Lỗi khi tạo ảnh admin card, gửi fallback text:', err.message || err);

      const fallbackMsg = `👑 THÔNG TIN QUẢN TRỊ VIÊN BOT (ADMIN):\n` +
        `• Họ và tên: ${adminName}\n` +
        `• Biệt danh / Tag: ${adminTag}\n` +
        `• Facebook UID: ${adminId}\n` +
        `• Giới tính: Nam\n` +
        `• Vai trò: Bot Creator & Developer\n` +
        `• Trang cá nhân: ${adminFacebook}\n` +
        `• Hỗ trợ: Nhắn tin trực tiếp qua Facebook hoặc tag ${adminTag} trong nhóm nhé!`;

      await safeSendMessage(api, fallbackMsg, threadId, message?.messageID);
    } finally {
      if (cardResult && typeof cardResult.cleanup === 'function') {
        cardResult.cleanup();
      }
    }
  },
};
