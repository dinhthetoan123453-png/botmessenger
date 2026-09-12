const fs = require('fs');
const { login } = require('ws3-fca');
const config = require('./config');
const logger = require('./utils/logger');

/**
 * Xử lý giải mã và đọc thông tin AppState từ biến môi trường hoặc file cục bộ
 * @returns {Array<object>|null}
 */
function loadAppState() {
  // 1. Ưu tiên kiểm tra file appstate.json ở thư mục gốc (vì file luôn được bot tự động cập nhật phiên mới nhất)
  if (fs.existsSync(config.appStatePath)) {
    try {
      const raw = fs.readFileSync(config.appStatePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        logger.info('Tìm thấy file appstate.json tại thư mục gốc...');
        return parsed;
      }
    } catch (err) {
      logger.warn(`Đọc file appstate.json thất bại: ${err.message}`);
    }
  }

  // 2. Dự phòng: Kiểm tra từ biến môi trường FB_APPSTATE (dùng khi deploy cloud Render/Railway)
  if (process.env.FB_APPSTATE) {
    try {
      logger.info('Tìm thấy cấu hình FB_APPSTATE từ biến môi trường...');
      let str = process.env.FB_APPSTATE.trim();

      if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        str = str.slice(1, -1).trim();
      }

      // Giải mã Base64 nếu chuỗi không bắt đầu bằng [ hoặc {
      if (!str.startsWith('[') && !str.startsWith('{')) {
        try {
          const decoded = Buffer.from(str, 'base64').toString('utf8');
          if (decoded.startsWith('[') || decoded.startsWith('{')) {
            str = decoded;
          }
        } catch (_) {}
      }

      if (str.includes('\\"')) {
        str = str.replace(/\\"/g, '"');
      }

      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : (parsed.appState || parsed);
    } catch (err) {
      logger.warn(`Biến môi trường FB_APPSTATE không hợp lệ: ${err.message}`);
    }
  }

  return null;
}

/**
 * Xác thực tài khoản Facebook cá nhân bằng thư viện ws3-fca
 * @returns {Promise<object>} Instance API đã đăng nhập
 */
function authenticate() {
  return new Promise((resolve, reject) => {
    const appState = loadAppState();

    if (!appState) {
      console.log('\n' + '='.repeat(68));
      console.log('❌ CHƯA CÓ FILE "appstate.json" HOẶC BIẾN MÔI TRƯỜNG "FB_APPSTATE"!');
      console.log('='.repeat(68));
      console.log('📖 HƯỚNG DẪN LẤY APPSTATE FACEBOOK NHANH CHÓNG (1 PHÚT):');
      console.log('1. Cài đặt tiện ích mở rộng (Extension) trên Chrome / Edge / Brave:');
      console.log('   - "C3C FbState" hoặc "Cookie-Editor"');
      console.log('2. Đăng nhập tài khoản Facebook trên trình duyệt web.');
      console.log('3. Mở tiện ích mở rộng lên > Chọn "Export" dạng JSON.');
      console.log('4. Tạo một file tên là "appstate.json" tại thư mục dự án:');
      console.log(`   ${config.appStatePath}`);
      console.log('5. Dán toàn bộ nội dung JSON vừa copy vào file đó và khởi động lại bot!');
      console.log('='.repeat(68) + '\n');

      return reject(new Error('Chưa tìm thấy appstate.json hoặc FB_APPSTATE. Vui lòng làm theo hướng dẫn trên terminal.'));
    }

    logger.info('Đang kết nối phiên đăng nhập Facebook...');

    const loginOptions = {
      selfListen: false,
      listenEvents: true,
      autoMarkRead: false,
      online: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    };

    login({ appState }, loginOptions, (err, api) => {
      if (err) {
        logger.error('Đăng nhập Facebook thất bại:', err.error || err.message || err);
        return reject(err);
      }

      const botUserId = api.getCurrentUserID();
      logger.success(`Đăng nhập Facebook thành công! Bot UID: ${botUserId}`);

      // Tự động làm mới và lưu lại appstate.json mới nhất
      try {
        if (typeof api.getAppState === 'function') {
          const newAppState = api.getAppState();
          if (newAppState && newAppState.length > 0) {
            fs.writeFileSync(config.appStatePath, JSON.stringify(newAppState, null, 2), 'utf8');
            logger.info('Đã cập nhật phiên mới vào file appstate.json.');

            const b64 = Buffer.from(JSON.stringify(newAppState)).toString('base64');
            console.log('\n' + '='.repeat(65));
            console.log('📌 MÃ PHIÊN FB_APPSTATE MỚI (LƯU VÀO BIẾN MÔI TRƯỜNG TRÊN RENDER/CLOUD):');
            console.log(b64);
            console.log('='.repeat(65) + '\n');
          }
        }
      } catch (saveErr) {
        logger.warn('Không thể tự động cập nhật appstate.json:', saveErr.message);
      }

      resolve(api);
    });
  });
}

module.exports = {
  authenticate,
  loadAppState,
};
