const config = require('./config');
const logger = require('./utils/logger');
const chatHistory = require('./utils/chatHistory');
const { commands, loadCommands } = require('./commands');
const { extractTikTokUrl } = require('./utils/tiktokHelper');
const { getUserName } = require('./utils/userHelper');
const { safeSendMessage } = require('./utils/messageHelper');
const { handleGroupEvent } = require('./utils/groupEventHandler');

/**
 * Hàm tạo khoảng nghỉ ngẫu nhiên để mô phỏng hành vi của người thật,
 * tránh bị Facebook gắn cờ spam hoặc checkpoint tài khoản.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Kiểm tra xem tin nhắn có phải là thông báo hoặc phản hồi hệ thống tự động của bot không,
 * nhằm loại bỏ khỏi chatHistory để tránh làm ô nhiễm ngữ cảnh AI.
 */
function isBotSystemMessage(content) {
  if (!content || typeof content !== 'string') return false;
  const text = content.trim();
  return text.startsWith('🏓 Pong!') ||
         text.startsWith('📢 Echo:') ||
         text.startsWith('🎵 [THÔNG TIN BÀI HÁT]') ||
         text.startsWith('🎬 [THÔNG TIN VIDEO TIKTOK]') ||
         text.startsWith('⏳ Đang') ||
         text.startsWith('🎥 Video:') ||
         text.startsWith('⚠️ ') ||
         text.startsWith('❌ ') ||
         text.startsWith('📌 ') ||
         text.startsWith('🎶 Audio:') ||
         text.startsWith('DANH SÁCH LỆNH') ||
         text.startsWith('🤖 DANH SÁCH LỆNH') ||
         text.startsWith('ℹ️ THÔNG TIN CUỘC TRÒ CHUYỆN:') ||
         text.startsWith("Lệnh '") ||
         text.startsWith('Lỗi ') ||
         text.startsWith('📋 [LỊCH SỬ') ||
         text.startsWith('Vui lòng nhập');
}

/**
 * Khởi động lắng nghe tin nhắn qua MQTT và phân phối lệnh
 * @param {object} api - Instance FCA đã đăng nhập
 */
function startBot(api) {
  // 1. Tải danh sách các lệnh từ thư mục commands
  loadCommands();

  logger.bot(`Bot đang lắng nghe tin nhắn qua giao thức MQTT với tiền tố: [ ${config.prefix} ]`);

  // 2. Bắt đầu lắng nghe sự kiện MQTT
  api.listenMqtt(async (err, event) => {
    if (err) {
      logger.error('Lỗi nhận sự kiện MQTT:', err.message || err);
      return;
    }

    if (!event) return;

    try {
      // 1. Xử lý các sự kiện nhóm (thành viên mới tham gia / thành viên rời nhóm)
      if (event.type === 'event') {
        await handleGroupEvent({ api, event });
        return;
      }

      // 2. Chỉ xử lý tin nhắn dạng tin nhắn thường (message) hoặc phản hồi tin nhắn (message_reply)
      if (event.type !== 'message' && event.type !== 'message_reply') return;
      if (!event.body || typeof event.body !== 'string') return;

      const rawContent = event.body.trim();
      const threadId = String(event.threadID);
      const senderId = String(event.senderID);
      const isGroup = Boolean(event.isGroup);
      const botId = api.getCurrentUserID();

      // Bỏ qua tin nhắn do chính tài khoản bot gửi đi
      if (senderId === String(botId)) return;

      // Lấy tên người gửi
      const senderName = await getUserName(api, senderId);

      // In log tin nhắn nhận được ra terminal theo thời gian thực
      logger.msg(`[${isGroup ? 'Nhóm' : 'Riêng'}] ${senderName}: "${rawContent}"`);

      // Kiểm tra xem tin nhắn có bắt đầu bằng tiền tố lệnh không (hỗ trợ cả config.prefix, /, !)
      let prefixUsed = null;
      if (rawContent.startsWith(config.prefix)) {
        prefixUsed = config.prefix;
      } else if (rawContent.startsWith('/')) {
        prefixUsed = '/';
      } else if (rawContent.startsWith('!')) {
        prefixUsed = '!';
      }

      const isCommand = Boolean(prefixUsed);

      // Lưu tin nhắn vào lịch sử nếu không phải lệnh và không phải tin hệ thống
      if (!isCommand && !isBotSystemMessage(rawContent)) {
        chatHistory.addMessage(threadId, {
          sender: senderName,
          content: rawContent,
          isSelf: false,
          timestamp: Number(event.timestamp) || Date.now(),
        });
      }

      // 3. Xử lý lệnh
      if (isCommand) {
        const fullCommand = rawContent.slice(prefixUsed.length).trim();
        if (!fullCommand) return;

        const args = fullCommand.split(/\s+/);
        const commandName = args.shift().toLowerCase();
        if (!commandName) return;

        const command = commands.get(commandName);
        if (command) {
          logger.bot(`Thực thi lệnh '${commandName}' từ [${senderName}] (Thread: ${threadId})`);

          // Giả lập độ trễ an toàn và hiển thị trạng thái "đang soạn tin nhắn..." để mô phỏng người thật
          const delay = getRandomDelay(config.safeDelayMin, config.safeDelayMax);
          if (typeof api.sendTypingIndicator === 'function') {
            try {
              await api.sendTypingIndicator(true, threadId);
            } catch (_) {}
          }
          await sleep(delay);

          try {
            await command.execute({
              api,
              message: event,
              args,
              threadId,
              isGroup,
            });
          } finally {
            if (typeof api.sendTypingIndicator === 'function') {
              try {
                await api.sendTypingIndicator(false, threadId);
              } catch (_) {}
            }
          }
        } else {
          // Lệnh không tồn tại (chỉ thông báo trong chat riêng 1-1 để tránh spam nhóm chat)
          if (!isGroup) {
            const delay = getRandomDelay(config.safeDelayMin, config.safeDelayMax);
            if (typeof api.sendTypingIndicator === 'function') {
              try {
                await api.sendTypingIndicator(true, threadId);
              } catch (_) {}
            }
            await sleep(delay);

            await safeSendMessage(
              api,
              `Lệnh '${prefixUsed}${commandName}' không tồn tại. Gõ '${prefixUsed}help' để xem danh sách lệnh.`,
              threadId,
              event.messageID
            );

            if (typeof api.sendTypingIndicator === 'function') {
              try {
                await api.sendTypingIndicator(false, threadId);
              } catch (_) {}
            }
          }
        }
        return;
      }

      // 4. Tự động nhận diện liên kết TikTok gửi trực tiếp trong chat 1-1
      const directTikTokUrl = extractTikTokUrl(rawContent);
      if (directTikTokUrl && !isGroup) {
        const stikCmd = commands.get('stik');
        if (stikCmd) {
          logger.bot(`Tự động kích hoạt tải video TikTok từ liên kết của [${senderName}]`);
          const delay = getRandomDelay(config.safeDelayMin, config.safeDelayMax);
          if (typeof api.sendTypingIndicator === 'function') {
            try {
              await api.sendTypingIndicator(true, threadId);
            } catch (_) {}
          }
          await sleep(delay);

          try {
            await stikCmd.execute({
              api,
              message: event,
              args: [directTikTokUrl],
              threadId,
              isGroup,
            });
          } finally {
            if (typeof api.sendTypingIndicator === 'function') {
              try {
                await api.sendTypingIndicator(false, threadId);
              } catch (_) {}
            }
          }
          return;
        }
      }

      // 5. Tự động phản hồi bằng AI trong chat riêng 1-1 (nếu bật AUTO_REPLY_AI=true)
      const shouldAutoTriggerAI = !isGroup && config.autoReplyAi;
      if (shouldAutoTriggerAI && config.geminiApiKey) {
        const aiCmd = commands.get('ai');
        if (aiCmd) {
          logger.bot(`Tự động phản hồi AI cho [${senderName}] trong chat riêng 1-1`);
          const delay = getRandomDelay(config.safeDelayMin, config.safeDelayMax);
          if (typeof api.sendTypingIndicator === 'function') {
            try {
              await api.sendTypingIndicator(true, threadId);
            } catch (_) {}
          }
          await sleep(delay);

          try {
            await aiCmd.execute({
              api,
              message: event,
              args: rawContent ? rawContent.split(/\s+/) : [],
              threadId,
              isGroup,
              isAutoReply: true,
            });
          } finally {
            if (typeof api.sendTypingIndicator === 'function') {
              try {
                await api.sendTypingIndicator(false, threadId);
              } catch (_) {}
            }
          }
        }
      }
    } catch (err) {
      logger.error('Lỗi khi xử lý tin nhắn:', err.message || err);
    }
  });
}

module.exports = {
  startBot,
};
