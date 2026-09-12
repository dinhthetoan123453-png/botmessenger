const { safeSendMessage } = require('../utils/messageHelper');

module.exports = {
  name: 'echo',
  description: 'Lặp lại nội dung bạn vừa nhập',
  usage: '!echo <nội dung>',
  async execute({ api, message, args, threadId }) {
    if (!args || args.length === 0) {
      await safeSendMessage(
        api,
        '📌 Vui lòng nhập nội dung muốn lặp lại. Ví dụ: !echo Xin chào Messenger Bot',
        threadId,
        message?.messageID
      );
      return;
    }

    const textToEcho = args.join(' ');
    await safeSendMessage(api, `📢 Echo: ${textToEcho}`, threadId, message?.messageID);
  },
};
