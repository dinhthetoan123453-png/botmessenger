const config = require('../config');
const { safeSendMessage } = require('../utils/messageHelper');

module.exports = {
  name: 'help',
  description: 'Hiển thị danh sách tất cả các lệnh của bot',
  usage: '!help',
  async execute({ api, message, threadId, isGroup }) {
    const botId = typeof api?.getCurrentUserID === 'function' ? api.getCurrentUserID() : '61593936857305';

    const helpText = `DANH SÁCH LỆNH MESSENGER BOT:
(Tiền tố lệnh: ! hoặc /)

✦ !admin (hoặc !ad, !owner)
  └ Hiển thị thẻ thông tin quản trị viên và chủ sở hữu bot 

✦ !info [@tag / reply tin nhắn / UID]
  └ Hiển thị thẻ hình ảnh thông tin cá nhân hoặc người được tag / reply

✦ !bd [@user] <biệt danh mới> (hoặc !pb, !bietdanh, !nickname, !setname)
  └ Đổi biệt danh của người được tag @user hoặc đổi biệt danh của chính mình nếu không tag

✦ !music <tên bài hát hoặc link> (hoặc !play)
  └ Tìm kiếm và gửi nhạc từ SoundCloud hoặc link Spotify kèm ảnh bìa

✦ !stik <link video tiktok> (hoặc !tik, !tiktok, !tt)
  └ Tải video TikTok không logo kèm thông tin chi tiết

✦ !ai [câu hỏi hoặc để trống để AI phản hồi theo ngữ cảnh]

✦ !ping
  └ Kiểm tra trạng thái bot và thời gian phản hồi`;

    await safeSendMessage(api, helpText, threadId, message?.messageID, isGroup !== undefined ? !isGroup : null);
  },
};
