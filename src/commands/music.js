const { searchAndDownloadMusic } = require('../utils/musicHelper');
const { safeSendMessage } = require('../utils/messageHelper');
const logger = require('../utils/logger');

module.exports = {
  name: 'music',
  aliases: ['play'],
  description: 'Tìm kiếm và gửi nhạc từ SoundCloud hoặc link Spotify kèm ảnh bìa',
  usage: '!music <tên bài hát hoặc link>',
  async execute({ api, message, args, threadId }) {
    if (!args || args.length === 0) {
      await safeSendMessage(
        api,
        '📌 Vui lòng nhập tên bài hát hoặc link Spotify / SoundCloud.\nVí dụ: !music Chúng ta của tương lai',
        threadId,
        message?.messageID
      );
      return;
    }

    const query = args.join(' ');

    // Thông báo đang xử lý
    await safeSendMessage(
      api,
      `⏳ Đang tìm kiếm và xử lý bài hát: "${query}". Vui lòng đợi trong giây lát...`,
      threadId,
      message?.messageID
    );

    let result = null;
    try {
      result = await searchAndDownloadMusic(query);

      if (!result) {
        await safeSendMessage(
          api,
          `❌ Không tìm thấy bài hát nào với từ khóa: "${query}".`,
          threadId,
          message?.messageID
        );
        return;
      }

      logger.info(`Tìm thấy bài hát: ${result.title} - ${result.artist}`);

      // 1. Gửi ảnh bìa kèm thông tin bài hát
      const infoMsg = `🎵 [THÔNG TIN BÀI HÁT]\n` +
        `• Tên: ${result.title}\n` +
        `• Nghệ sĩ: ${result.artist}\n` +
        `• Nguồn: ${result.source}\n` +
        `• Thời lượng: ${result.duration}`;

      if (result.imagePath) {
        await safeSendMessage(
          api,
          {
            body: infoMsg,
            attachments: [result.imagePath],
          },
          threadId,
          message?.messageID
        );
      } else {
        await safeSendMessage(api, infoMsg, threadId, message?.messageID);
      }

      // 2. Gửi file âm thanh (audio mp3)
      if (result.audioPath) {
        logger.info(`Đang tải lên file audio: ${result.audioPath}`);
        await safeSendMessage(
          api,
          {
            body: `🎶 Audio: ${result.title}.mp3`,
            attachments: [result.audioPath],
          },
          threadId
        );
      }
    } catch (err) {
      logger.error('Lỗi khi tìm hoặc gửi nhạc:', err.message || err);
      await safeSendMessage(
        api,
        `❌ Có lỗi xảy ra khi tải bài hát: ${err.message || 'Lỗi không xác định'}`,
        threadId,
        message?.messageID
      );
    } finally {
      if (result && typeof result.cleanup === 'function') {
        result.cleanup();
      }
    }
  },
};
