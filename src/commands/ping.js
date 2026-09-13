const { safeSendMessage } = require('../utils/messageHelper');

const startTime = Date.now();

module.exports = {
  name: 'ping',
  description: 'Kiểm tra trạng thái bot và thời gian phản hồi',
  usage: '!ping',
  async execute({ api, message, threadId, isGroup }) {
    const msgTimestamp = message?.timestamp ? parseInt(message.timestamp, 10) : Date.now();
    const latency = Date.now() - msgTimestamp;
    const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    const replyMsg = `Pong!\n` +
      `• Độ trễ: ${Math.abs(latency)}ms\n` +
      `• Thời gian hoạt động: ${hours}h ${minutes}m ${seconds}s\n` +
      `• Trạng thái: Trực tuyến (Online)`;

    await safeSendMessage(api, replyMsg, threadId, message?.messageID, isGroup !== undefined ? !isGroup : null);
  },
};
