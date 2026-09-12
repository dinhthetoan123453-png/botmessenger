const { safeSendMessage } = require('./messageHelper');
const { getUserDetails, getUserName } = require('./userHelper');
const { generateInfoCard } = require('./cardHelper');
const logger = require('./logger');

/**
 * Xử lý sự kiện khi có thành viên tham gia hoặc rời nhóm
 * @param {object} params
 * @param {object} params.api - FCA instance
 * @param {object} params.event - MQTT delta event
 */
async function handleGroupEvent({ api, event }) {
  if (!event || event.type !== 'event') return;

  const threadId = String(event.threadID);
  const botId = String(api.getCurrentUserID());

  // 1. SỰ KIỆN: CÓ THÀNH VIÊN GIA NHẬP NHÓM (log:subscribe)
  if (event.logMessageType === 'log:subscribe') {
    const addedParticipants = event.logMessageData?.addedParticipants || [];
    if (!Array.isArray(addedParticipants) || addedParticipants.length === 0) return;

    // Lấy tên nhóm nếu có
    let threadName = 'nhóm chat';
    try {
      if (typeof api.getThreadInfo === 'function') {
        const threadInfo = await api.getThreadInfo(threadId);
        if (threadInfo?.name) threadName = threadInfo.name;
      }
    } catch (_) {}

    for (const participant of addedParticipants) {
      const userId = String(participant.userFbId || participant.fbid || participant.id || '');
      if (!userId) continue;

      // Nếu chính tài khoản bot được thêm vào nhóm
      if (userId === botId) {
        await safeSendMessage(
          api,
          `🤖 Xin chào cả nhà! Cảm ơn mọi người đã thêm Bot vào nhóm chat [${threadName}].\n` +
          `👉 Gõ !help để xem danh sách toàn bộ các tính năng và lệnh hữu ích của bot nhé!`,
          threadId
        );
        continue;
      }

      // Với thành viên mới: Tạo ảnh thẻ chào mừng phong cách Gojo (Welcome Card)
      let cardResult = null;
      try {
        const user = await getUserDetails(api, userId);
        const name = participant.fullName || user?.name || (await getUserName(api, userId));
        const avatarUrl = user?.profilePicUrl || `https://graph.facebook.com/${userId}/picture?width=720&height=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

        let genderText = null;
        if (user?.gender) {
          const g = String(user.gender).toLowerCase().trim();
          if (g === 'male' || g === 'nam' || g === '2') {
            genderText = 'Nam';
          } else if (g === 'female' || g === 'nữ' || g === 'nu' || g === '1') {
            genderText = 'Nữ';
          }
        }

        cardResult = await generateInfoCard({
          name,
          uid: userId,
          cardTheme: 'welcome',
          badgeTitle: '★ WELCOME TO THE GROUP ★',
          badgeColor: '#34d399',
          subtitle: '★ Chào Mừng Gia Nhập Nhóm! ★',
          subtitleColor: '#34d399',
          avatarUrl,
          gender: genderText,
          footerText: `Messenger Bot System • Chào mừng thành viên mới`,
          customItems: [
            { label: 'THÀNH VIÊN MỚI', value: name, type: 'user' },
            { label: 'FACEBOOK UID', value: userId, type: 'uid' },
            { label: 'GIỚI TÍNH', value: genderText || 'Chưa cập nhật', type: 'gender' },
            { label: 'SỰ KIỆN', value: 'Gia nhập nhóm thành công', type: 'join', valueColor: '#34d399' },
            { label: 'NHÓM CHAT', value: threadName, type: 'chat' },
            { label: 'TRANG CÁ NHÂN', value: `https://facebook.com/${userId}`, type: 'link' },
          ],
        });

        const welcomeCaption = `🎉 CHÀO MỪNG THÀNH VIÊN MỚI!\n` +
          `Chào mừng [${name}] đã gia nhập vào nhóm chat [${threadName}]! ✨\n` +
          `Chúc bạn có những giây phút trò chuyện, giao lưu thật vui vẻ cùng mọi người nha!\n` +
          `💡 Gõ !help để xem danh sách lệnh của bot.`;

        await safeSendMessage(
          api,
          {
            body: welcomeCaption,
            attachments: [cardResult.imagePath],
          },
          threadId
        );
        logger.bot(`Đã gửi thẻ chào mừng thành viên mới [${name}] (UID: ${userId}) trong nhóm: ${threadName}`);
      } catch (err) {
        logger.error(`Lỗi khi tạo thẻ chào mừng thành viên ${userId}:`, err.message || err);
      } finally {
        if (cardResult && typeof cardResult.cleanup === 'function') {
          cardResult.cleanup();
        }
      }
    }
  }

  // 2. SỰ KIỆN: CÓ THÀNH VIÊN RỜI HOẶC BỊ XÓA KHỎI NHÓM (log:unsubscribe)
  else if (event.logMessageType === 'log:unsubscribe') {
    const leftUserId = String(event.logMessageData?.leftParticipantFbId || '');
    if (!leftUserId) return;

    // Nếu chính bot bị kích khỏi nhóm thì không gửi
    if (leftUserId === botId) return;

    // Lấy tên nhóm nếu có
    let threadName = 'nhóm chat';
    try {
      if (typeof api.getThreadInfo === 'function') {
        const threadInfo = await api.getThreadInfo(threadId);
        if (threadInfo?.name) threadName = threadInfo.name;
      }
    } catch (_) {}

    let cardResult = null;
    try {
      const leftUserName = (await getUserName(api, leftUserId)) || 'Thành viên';
      const user = await getUserDetails(api, leftUserId);
      const avatarUrl = user?.profilePicUrl || `https://graph.facebook.com/${leftUserId}/picture?width=720&height=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

      let genderText = null;
      if (user?.gender) {
        const g = String(user.gender).toLowerCase().trim();
        if (g === 'male' || g === 'nam' || g === '2') {
          genderText = 'Nam';
        } else if (g === 'female' || g === 'nữ' || g === 'nu' || g === '1') {
          genderText = 'Nữ';
        }
      }

      cardResult = await generateInfoCard({
        name: leftUserName,
        uid: leftUserId,
        cardTheme: 'goodbye',
        badgeTitle: '★ GOODBYE & FAREWELL ★',
        badgeColor: '#fb7185',
        subtitle: '★ Tạm Biệt & Hẹn Gặp Lại! ★',
        subtitleColor: '#fb7185',
        avatarUrl,
        gender: genderText,
        footerText: `Messenger Bot System • Tạm biệt thành viên rời nhóm`,
        customItems: [
          { label: 'HỌ VÀ TÊN', value: leftUserName, type: 'user' },
          { label: 'FACEBOOK UID', value: leftUserId, type: 'uid' },
          { label: 'GIỚI TÍNH', value: genderText || 'Chưa cập nhật', type: 'gender' },
          { label: 'SỰ KIỆN', value: 'Đã rời khỏi nhóm chat', type: 'leave', valueColor: '#fb7185' },
          { label: 'NHÓM CHAT', value: threadName, type: 'chat' },
          { label: 'LỜI CHÚC', value: 'Chúc bạn luôn may mắn & thành công', type: 'heart', valueColor: '#f43f5e' },
        ],
      });

      const goodbyeCaption = `👋 TẠM BIỆT VÀ HẸN GẶP LẠI!\n` +
        `Thành viên [${leftUserName}] đã rời khỏi nhóm chat [${threadName}].\n` +
        `Cảm ơn những kỉ niệm cùng mọi người và chúc bạn luôn gặp nhiều may mắn, thành công trên con đường phía trước! 🌟`;

      await safeSendMessage(
        api,
        {
          body: goodbyeCaption,
          attachments: [cardResult.imagePath],
        },
        threadId
      );
      logger.bot(`Đã gửi thẻ tạm biệt thành viên [${leftUserName}] (UID: ${leftUserId}) trong nhóm: ${threadName}`);
    } catch (err) {
      logger.error(`Lỗi khi tạo thẻ tạm biệt thành viên ${leftUserId}:`, err.message || err);
    } finally {
      if (cardResult && typeof cardResult.cleanup === 'function') {
        cardResult.cleanup();
      }
    }
  }
}

module.exports = {
  handleGroupEvent,
};
