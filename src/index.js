// Tự động kiểm tra và vá lỗi thư viện ws3-fca trước khi khởi động bot
try {
  require('../scripts/patch-fca')();
} catch (_) {}

const net = require('net');
const dns = require('dns');

// Ưu tiên IPv4 thay vì IPv6 để tránh lỗi timeout mạng trên môi trường Cloud (Render, Docker, Railway)
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

const http = require('http');
const config = require('./config');
const { authenticate, loadAppState } = require('./auth');
const { startBot } = require('./bot');
const logger = require('./utils/logger');
const chatHistory = require('./utils/chatHistory');

let server = null;
const botState = {
  status: 'INITIALIZING', // 'INITIALIZING' | 'ONLINE' | 'WAITING_APPSTATE' | 'ERROR'
  error: null,
  botId: null,
};

// Khởi động HTTP server phục vụ Health Check và Web Dashboard
const PORT = config.port;
server = http.createServer((req, res) => {
  const url = req.url || '/';

  // 1. Health Check Endpoint cho Render / Railway / UptimeRobot
  if (url === '/health' || url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      status: botState.status === 'ONLINE' ? 'ok' : (botState.status === 'ERROR' ? 'error' : 'starting'),
      uptime: Math.floor(process.uptime()),
      message: botState.status === 'ONLINE' ? 'Messenger Bot is running' : `Messenger Bot status: ${botState.status}`,
      botId: botState.botId,
    }));
  }

  // 2. Trang chủ Web Dashboard hiển thị trạng thái và tài liệu
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    let html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Messenger Bot Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align: center; padding: 40px 15px; background: #f0f2f5; color: #1c1e21; margin: 0; }
    .card { max-width: 520px; margin: 0 auto; background: #ffffff; padding: 32px 24px; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: left; }
    h1 { color: #0084ff; font-size: 24px; margin-top: 0; margin-bottom: 16px; text-align: center; }
    .status { display: inline-block; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-bottom: 20px; }
    .status-ok { background: #e7f8ec; color: #0f8a3c; }
    .status-wait { background: #fff8e6; color: #b7791f; }
    .status-err { background: #fde8e8; color: #c81e1e; }
    .guide-box { background: #f7f9fa; border: 1px solid #e1e4e8; border-radius: 10px; padding: 16px; font-size: 14px; line-height: 1.6; margin: 16px 0; }
    .guide-box ol { margin: 8px 0; padding-left: 20px; }
    code { background: #e4e6eb; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: Consolas, monospace; }
    .note { font-size: 13px; color: #65676b; line-height: 1.5; margin-top: 15px; }
    .btn { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #0084ff; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; text-align: center; }
    .center { text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Messenger Bot Dashboard</h1>`;

    if (botState.status === 'ONLINE') {
      html += `
    <div class="center"><div class="status status-ok">● Đang hoạt động trực tuyến</div></div>
    <p style="color: #0f8a3c; font-size: 16px; font-weight: 500; text-align: center;">Bot đã kết nối Facebook thành công và đang lắng nghe tin nhắn qua MQTT!</p>
    <div class="guide-box">
      <strong>Thông tin kết nối:</strong><br>
      • UID Bot: <code>${botState.botId || 'Đã xác thực'}</code><br>
      • Tiền tố lệnh: <code>${config.prefix}</code> (Ví dụ: <code>${config.prefix}help</code>, <code>${config.prefix}ping</code>, <code>${config.prefix}music</code>)<br>
      • Tự động AI chat: <code>${config.autoReplyAi ? 'Bật' : 'Tắt'}</code>
    </div>`;
    } else if (botState.status === 'WAITING_APPSTATE') {
      html += `
    <div class="center"><div class="status status-wait">Chờ nạp AppState (Phiên đăng nhập)</div></div>
    <div class="guide-box">
      <strong>Hướng dẫn lấy AppState Facebook (1 phút):</strong>
      <ol>
        <li>Cài đặt tiện ích mở rộng <strong>C3C FbState</strong> hoặc <strong>Cookie-Editor</strong> trên Chrome/Edge.</li>
        <li>Đăng nhập tài khoản Facebook trên trình duyệt.</li>
        <li>Bấm vào tiện ích mở rộng > Chọn <strong>Export JSON</strong> để copy cookie.</li>
        <li>Tạo file <code>appstate.json</code> ở thư mục gốc dự án và dán nội dung vào đó (hoặc dán vào biến <code>FB_APPSTATE</code> trên Cloud).</li>
      </ol>
    </div>
    <div class="center"><a class="btn" href="javascript:location.reload()">Tải lại sau khi đã nạp AppState</a></div>`;
    } else if (botState.status === 'ERROR') {
      html += `
    <div class="center"><div class="status status-err">Khởi động thất bại</div></div>
    <p style="color: #c81e1e; font-size: 15px; margin: 20px 0;">${botState.error || 'Có lỗi xảy ra khi kết nối tới Facebook.'}</p>
    <p class="note">Vui lòng kiểm tra lại file appstate.json hoặc chuỗi biến môi trường FB_APPSTATE.</p>
    <div class="center"><a class="btn" href="javascript:location.reload()">Thử lại</a></div>`;
    } else {
      html += `
    <div class="center"><div class="status status-wait">Đang khởi tạo kết nối...</div></div>
    <p style="color: #65676b; font-size: 15px; margin: 20px 0; text-align: center;">Đang kết nối tới máy chủ Facebook, vui lòng đợi trong giây lát...</p>
    <div class="center"><a class="btn" href="javascript:location.reload()">Tải lại trang</a></div>`;
    }

    html += `
  </div>
</body>
</html>`;
    return res.end(html);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Máy chủ HTTP Health Check / Dashboard đang chạy tại http://0.0.0.0:${PORT}`);
});

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('       DỰ ÁN FACEBOOK MESSENGER BOT TÀI KHOẢN CÁ NHÂN');
  console.log('='.repeat(60));
  console.log('LƯU Ý QUAN TRỌNG VỀ AN TOÀN TÀI KHOẢN:');
  console.log('- Bot hoạt động bằng cách mô phỏng giao thức Facebook Messenger.');
  console.log('- Khuyến nghị nên sử dụng tài khoản phụ (nick test) để thử nghiệm.');
  console.log('- Không dùng bot để gửi tin nhắn spam hoặc kéo tin với tần suất cao.');
  console.log('='.repeat(60) + '\n');

  const appState = loadAppState();
  if (!appState) {
    botState.status = 'WAITING_APPSTATE';
    botState.error = 'Chưa tìm thấy appstate.json hoặc FB_APPSTATE';
    logger.warn('Chưa có file appstate.json hoặc biến môi trường FB_APPSTATE. Vui lòng nạp file để bắt đầu.');
    return;
  }

  try {
    const api = await authenticate();
    botState.status = 'ONLINE';
    botState.botId = api.getCurrentUserID();
    startBot(api);
  } catch (error) {
    const errMsg = error.message || String(error);
    botState.status = 'ERROR';
    botState.error = errMsg;
    logger.error('Khởi động Bot thất bại:', errMsg);
  }
}

// Xử lý dừng bot an toàn khi bấm Ctrl + C hoặc nhận tín hiệu hệ thống
process.on('SIGINT', () => {
  console.log('\n');
  logger.info('Đang tắt Messenger Bot...');
  chatHistory.flushSync();
  if (server) server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Tiến trình bot đã kết thúc.');
  chatHistory.flushSync();
  if (server) server.close();
  process.exit(0);
});

main();
