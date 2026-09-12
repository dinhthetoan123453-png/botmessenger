const config = require('../config');
const { safeSendMessage } = require('../utils/messageHelper');

module.exports = {
  name: 'help',
  description: 'Hiển thị danh sách tất cả các lệnh của bot',
  usage: '!help',
  async execute({ api, message, threadId }) {
    const commandLoader = require('./index');
    let cmdMap = commandLoader.commands;
    if (!cmdMap || cmdMap.size === 0) {
      cmdMap = commandLoader.loadCommands();
    }

    let helpText = `🤖 DANH SÁCH LỆNH MESSENGER BOT:\n`;
    helpText += `(Tiền tố lệnh: ${config.prefix} hoặc /)\n\n`;

    const uniqueCommands = Array.from(new Set(cmdMap.values()));
    // Sắp xếp thứ tự lệnh cho đẹp mắt
    const order = ['admin', 'info', 'bd', 'music', 'stik', 'ai', 'ping', 'echo', 'help'];
    uniqueCommands.sort((a, b) => {
      const idxA = order.indexOf(a.name);
      const idxB = order.indexOf(b.name);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    for (const cmd of uniqueCommands) {
      const aliasStr = Array.isArray(cmd.aliases) && cmd.aliases.length > 0 ? ` (hoặc !${cmd.aliases.join(', !')})` : '';
      helpText += `✦ ${cmd.usage || config.prefix + cmd.name}${aliasStr}\n  └ ${cmd.description || 'Không có mô tả'}\n\n`;
    }

    const botId = typeof api?.getCurrentUserID === 'function' ? api.getCurrentUserID() : '61593936857305';
    helpText += `─────────────────────\n`;
    helpText += `🤖 Tài khoản bot: Cat Nyan (UID: ${botId})\n`;
    helpText += `👑 Quản trị viên: ${config.adminName || 'Toàn Đinh'} (${config.adminTag || '@toandinh27210'})\n`;
    helpText += `💡 Mẹo: Bạn có thể dùng dấu "!" hoặc "/" ở đầu mỗi lệnh. Trong chat 1-1 với bot, bạn có thể gửi thẳng link TikTok để bot tự động tải!`;

    await safeSendMessage(api, helpText, threadId, message?.messageID);
  },
};
