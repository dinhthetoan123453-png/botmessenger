const { safeSendMessage } = require('../utils/messageHelper');
const { getUserName } = require('../utils/userHelper');
const logger = require('../utils/logger');

/**
 * Đổi biệt danh thành viên trong cuộc trò chuyện (Group hoặc 1-1)
 * Hỗ trợ cả API api.nickname (ws3-fca) và api.changeNickname (fca)
 */
async function setParticipantNickname(api, nickname, threadId, participantId) {
  if (typeof api.nickname === 'function') {
    return await api.nickname(nickname, String(threadId), String(participantId));
  }
  if (typeof api.changeNickname === 'function') {
    return await new Promise((resolve, reject) => {
      api.changeNickname(nickname, String(threadId), String(participantId), (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }
  throw new Error('Thư viện Messenger chưa hỗ trợ chức năng đổi biệt danh.');
}

module.exports = {
  name: 'bd',
  aliases: ['pb', 'bietdanh', 'nickname', 'setname'],
  description: 'Đổi biệt danh của người được tag @user hoặc đổi biệt danh của chính mình nếu không tag',
  usage: '!bd [@user] <biệt danh mới>',
  async execute({ api, message, args, threadId, isGroup }) {
    const rawBody = message?.body || '';
    // Lấy phần văn bản phía sau tiền tố và tên lệnh (vd: !bd hoặc /bd hoặc !pb hoặc /pb)
    const contentAfterCmd = rawBody.replace(/^[!/][^\s]+\s*/, '').trim();

    // 1. Nếu người dùng chỉ gõ tên lệnh mà không nhập bất kỳ nội dung nào
    if (!contentAfterCmd) {
      const senderName = await getUserName(api, message?.senderID);
      const helpMsg = `Hướng dẫn sử dụng lệnh !bd (Đổi Biệt Danh):\n` +
        `• !bd <tên mới> : Đổi biệt danh của chính bạn\n` +
        `• !bd @user <tên mới> : Đổi biệt danh của người được tag\n` +
        `• !bd reset : Xóa biệt danh của bạn (về tên mặc định)\n` +
        `• !bd @user reset : Xóa biệt danh của người được tag\n\n` +
        `Ví dụ:\n` +
        `• !bd Siêu Nhân Trừ Gian\n` +
        `• !bd @${senderName || 'Bạn'} Đẹp Trai Số 1`;

      return await safeSendMessage(api, helpMsg, threadId, message?.messageID);
    }

    const mentions = message?.mentions;
    const hasMentionsObj = Boolean(mentions && typeof mentions === 'object' && Object.keys(mentions).length > 0);
    const hasAtSymbol = contentAfterCmd.includes('@');
    const replySenderId = message?.messageReply?.senderID ? String(message.messageReply.senderID) : null;

    let targetId = null;
    let targetName = null;
    let newNickname = '';
    let isSelf = false;

    // 2. Phân loại đối tượng cần đổi biệt danh:
    if (hasMentionsObj) {
      // Trường hợp A: Facebook gửi cấu trúc Mentions chuẩn qua MQTT
      const mentionKeys = Object.keys(mentions);
      targetId = String(mentionKeys[0]);
      const mentionTagText = String(mentions[targetId] || '');
      targetName = mentionTagText.replace(/^@/, '').trim();

      const cleanTagName = targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      newNickname = contentAfterCmd.replace(new RegExp(`@?${cleanTagName}`, 'i'), '').trim();

      if (newNickname === contentAfterCmd) {
        const fbName = await getUserName(api, targetId);
        if (fbName) {
          const cleanFbName = fbName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          newNickname = contentAfterCmd.replace(new RegExp(`@?${cleanFbName}`, 'i'), '').trim();
        }
      }

      newNickname = newNickname.replace(/^@\S+\s*/, '').trim();
      isSelf = targetId === String(message?.senderID);
    } else if (hasAtSymbol) {
      // Trường hợp B: Người dùng gõ text @Tên nhưng Facebook không tạo entity mentions
      // Tuyệt đối KHÔNG gán cho chính người gửi nếu có ký tự @ trong lệnh
      if (isGroup && typeof api?.getThreadInfo === 'function') {
        try {
          const threadInfo = await api.getThreadInfo(threadId);
          const userInfoList = threadInfo?.userInfo || [];
          const nicknamesMap = threadInfo?.nicknames || {};

          const atIndex = contentAfterCmd.indexOf('@');
          const textFromAt = contentAfterCmd.slice(atIndex + 1).trim();

          // Sắp xếp các thành viên theo độ dài tên giảm dần để tránh khớp nhầm tên ngắn
          const sortedMembers = [...userInfoList].sort(
            (a, b) => (b.name?.length || 0) - (a.name?.length || 0)
          );

          let matchedMember = null;
          for (const member of sortedMembers) {
            const memberName = (member.name || '').trim();
            const memberNick = (nicknamesMap[member.id] || '').trim();
            const memberVanity = (member.vanity || '').trim();
            const candidates = [memberName, memberNick, memberVanity].filter(Boolean);

            for (const cand of candidates) {
              if (textFromAt.toLowerCase().startsWith(cand.toLowerCase())) {
                matchedMember = {
                  id: String(member.id),
                  name: memberName || cand,
                  matchedText: cand,
                };
                break;
              }
            }
            if (matchedMember) break;
          }

          if (matchedMember) {
            targetId = matchedMember.id;
            targetName = matchedMember.name;
            const cleanMatched = matchedMember.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            newNickname = contentAfterCmd.replace(new RegExp(`@?${cleanMatched}`, 'i'), '').trim();
            isSelf = targetId === String(message?.senderID);
          }
        } catch (err) {
          logger.warn('Lỗi khi tìm thành viên từ getThreadInfo:', err.message);
        }
      } else if (!isGroup) {
        // Trong chat riêng 1-1: nếu có @tag, đối tượng chính là người đối diện trong cuộc trò chuyện
        targetId = String(threadId);
        targetName = await getUserName(api, targetId);
        const atIndex = contentAfterCmd.indexOf('@');
        const afterAt = contentAfterCmd.slice(atIndex + 1).trim();
        // Bỏ phần tên tag để lấy nickname mới
        newNickname = afterAt.replace(/^\S+\s*/, '').trim();
        isSelf = false;
      }

      // Nếu có ký tự @ nhưng không tìm thấy thành viên trong nhóm
      if (!targetId) {
        return await safeSendMessage(
          api,
          `⚠️ Không tìm thấy thành viên được tag trong nhóm!\n` +
          `Vui lòng kiểm tra lại tên sau ký tự @ hoặc chọn trực tiếp gợi ý tag của Messenger.`,
          threadId,
          message?.messageID
        );
      }
    } else if (replySenderId && replySenderId !== String(message?.senderID)) {
      // Trường hợp C: Người dùng reply tin nhắn của thành viên khác và gõ !bd
      targetId = replySenderId;
      targetName = await getUserName(api, targetId);
      newNickname = contentAfterCmd;
      isSelf = false;
    } else {
      // Trường hợp D: Người dùng KHÔNG tag ai, KHÔNG có ký tự @, KHÔNG reply ai
      // Khi này mới đổi biệt danh cho chính người gửi lệnh
      targetId = String(message?.senderID);
      targetName = await getUserName(api, targetId);
      newNickname = contentAfterCmd;
      isSelf = true;
    }

    // Nếu tag người khác nhưng quên không điền biệt danh mới
    if (!isSelf && !newNickname) {
      return await safeSendMessage(
        api,
        `Vui lòng nhập biệt danh muốn đổi sau tên người được tag!\n` +
        `Ví dụ: !bd @${targetName} Đẹp Trai\n` +
        `(Nếu muốn xóa biệt danh trở về ban đầu, hãy gõ: !bd @${targetName} reset)`,
        threadId,
        message?.messageID
      );
    }

    // Kiểm tra xem người dùng có muốn xóa (reset) biệt danh không
    const isReset = ['reset', 'xoa', 'xóa', 'clear', 'default', 'none', 'goc', 'gốc'].includes(newNickname.toLowerCase());
    const finalNickname = isReset ? '' : newNickname.slice(0, 100);

    try {
      logger.info(`Đang đổi biệt danh cho UID ${targetId} thành "${finalNickname}" (Thread: ${threadId})...`);
      await setParticipantNickname(api, finalNickname, threadId, targetId);

      if (isSelf) {
        if (isReset) {
          await safeSendMessage(
            api,
            `Đã xóa biệt danh của bạn (trở về tên mặc định Facebook).`,
            threadId,
            message?.messageID
          );
        } else {
          await safeSendMessage(
            api,
            `Đã đổi biệt danh của bạn thành: "${finalNickname}"`,
            threadId,
            message?.messageID
          );
        }
      } else {
        const displayTag = `@${targetName}`;
        if (isReset) {
          await safeSendMessage(
            api,
            {
              body: `Đã xóa biệt danh của ${displayTag} (trở về tên mặc định Facebook).`,
              mentions: [{ tag: displayTag, id: targetId }],
            },
            threadId,
            message?.messageID
          );
        } else {
          await safeSendMessage(
            api,
            {
              body: `Đã đổi biệt danh của ${displayTag} thành: "${finalNickname}"`,
              mentions: [{ tag: displayTag, id: targetId }],
            },
            threadId,
            message?.messageID
          );
        }
      }
    } catch (err) {
      logger.error(`Đổi biệt danh cho UID ${targetId} thất bại:`, err.message || err);

      await safeSendMessage(
        api,
        `Không thể đổi biệt danh: ${err.message || 'Lỗi quyền hạn hoặc hạn chế từ Facebook.'}`,
        threadId,
        message?.messageID
      );
    }
  },
};
