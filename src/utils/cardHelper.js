const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const logger = require('./logger');

const TEMP_DIR = path.resolve(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 1. Nạp và đăng ký font chữ tiếng Việt (Arial, Arial Bold) và Emoji
const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');

try {
  const arialPath = path.join(FONTS_DIR, 'arial.ttf');
  const arialBoldPath = path.join(FONTS_DIR, 'arialbd.ttf');
  const emojiPath = path.join(FONTS_DIR, 'seguiemj.ttf');

  if (fs.existsSync(arialPath)) {
    GlobalFonts.registerFromPath(arialPath, 'ArialCard');
  }
  if (fs.existsSync(arialBoldPath)) {
    GlobalFonts.registerFromPath(arialBoldPath, 'ArialCardBold');
  }
  if (fs.existsSync(emojiPath)) {
    GlobalFonts.registerFromPath(emojiPath, 'SegoeEmoji');
  }

  // Đăng ký bổ sung font hệ thống Linux nếu có
  const systemFonts = [
    '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/google-noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/google-noto/NotoSans-Bold.ttf',
  ];
  for (const fp of systemFonts) {
    if (fs.existsSync(fp)) {
      try { GlobalFonts.registerFromPath(fp); } catch (_) {}
    }
  }
} catch (fontErr) {
  logger.warn('Lỗi khi nạp font chữ vào Canvas:', fontErr.message);
}

const FONT_REGULAR = '"ArialCard", "DejaVu Sans", "Noto Sans", sans-serif';
const FONT_BOLD = '"ArialCardBold", "ArialCard", "DejaVu Sans", "Noto Sans", sans-serif';

// Đường dẫn ảnh nền tùy chọn (Gojo / Anime / Custom theme)
const BG_IMAGE_PATH = path.resolve(__dirname, '../../assets/card_bg.png');
let cachedBgImage = null;

async function getBackgroundImage() {
  if (cachedBgImage) return cachedBgImage;
  if (fs.existsSync(BG_IMAGE_PATH)) {
    try {
      cachedBgImage = await loadImage(BG_IMAGE_PATH);
      return cachedBgImage;
    } catch (err) {
      logger.warn('Lỗi khi nạp ảnh nền tùy chỉnh card_bg.png:', err.message);
    }
  }
  return null;
}

/**
 * Vẽ hình chữ nhật bo góc (Rounded Rectangle)
 */
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Tải ảnh avatar từ URL (hỗ trợ timeout)
 */
async function fetchAvatarImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      return await loadImage(buffer);
    }
  } catch (err) {
    logger.warn('Không thể tải ảnh avatar người dùng:', err.message);
  }
  return null;
}

/**
 * Vẽ icon vector sắc nét cho từng loại trường thông tin (không phụ thuộc font emoji)
 */
function drawFieldIcon(ctx, type, x, y, extra) {
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.fillStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'user') {
    // Icon người: Đầu tròn + thân vòng cung
    ctx.beginPath();
    ctx.arc(x, y - 6, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + 8, 8, Math.PI, 0, false);
    ctx.stroke();
  } else if (type === 'uid') {
    // Icon thẻ ID / Căn cước
    roundRect(ctx, x - 9, y - 8, 18, 16, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 3);
    ctx.lineTo(x + 5, y - 3);
    ctx.moveTo(x - 5, y + 2);
    ctx.lineTo(x + 2, y + 2);
    ctx.stroke();
  } else if (type === 'gender') {
    // Icon giới tính: Venus (Nữ ♀) hoặc Mars (Nam ♂)
    if (extra === 'Nữ' || extra === 'female') {
      ctx.strokeStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(x, y - 2, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + 2.5);
      ctx.lineTo(x, y + 8);
      ctx.moveTo(x - 3.5, y + 5);
      ctx.lineTo(x + 3.5, y + 5);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(x - 2, y + 2, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 1, y - 1);
      ctx.lineTo(x + 7, y - 7);
      ctx.moveTo(x + 3, y - 7);
      ctx.lineTo(x + 7, y - 7);
      ctx.lineTo(x + 7, y - 3);
      ctx.stroke();
    }
  } else if (type === 'chat') {
    // Icon bong bóng trò chuyện
    ctx.beginPath();
    roundRect(ctx, x - 9, y - 8, 18, 13, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 5);
    ctx.lineTo(x - 7, y + 9);
    ctx.lineTo(x + 1, y + 5);
    ctx.stroke();
  } else if (type === 'thread') {
    // Icon Hash (#) cho Thread ID
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 8);
    ctx.lineTo(x - 5, y + 8);
    ctx.moveTo(x + 5, y - 8);
    ctx.lineTo(x + 3, y + 8);
    ctx.moveTo(x - 8, y - 3);
    ctx.lineTo(x + 8, y - 3);
    ctx.moveTo(x - 8, y + 3);
    ctx.lineTo(x + 8, y + 3);
    ctx.stroke();
  } else if (type === 'link') {
    // Icon chuỗi liên kết (Chain Link)
    ctx.beginPath();
    ctx.arc(x - 3, y - 2, 4, Math.PI * 0.75, Math.PI * 1.75);
    ctx.lineTo(x + 1, y + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 3, y + 2, 4, -Math.PI * 0.25, Math.PI * 0.75);
    ctx.lineTo(x - 1, y - 2);
    ctx.stroke();
  } else if (type === 'crown' || type === 'admin') {
    // Icon vương miện cho Admin / Bot Owner
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 5);
    ctx.lineTo(x - 8, y - 3);
    ctx.lineTo(x - 4, y + 1);
    ctx.lineTo(x, y - 5);
    ctx.lineTo(x + 4, y + 1);
    ctx.lineTo(x + 8, y - 3);
    ctx.lineTo(x + 8, y + 5);
    ctx.closePath();
    ctx.stroke();
  } else if (type === 'tag') {
    // Icon thẻ tag / @username
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === 'join' || type === 'event') {
    // Icon checkmark tròn cho sự kiện gia nhập
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y);
    ctx.lineTo(x - 1, y + 2.5);
    ctx.lineTo(x + 3.5, y - 2.5);
    ctx.stroke();
  } else if (type === 'leave' || type === 'bye') {
    // Icon mũi tên tạm biệt
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x + 3, y);
    ctx.lineTo(x + 0.5, y - 2.5);
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 0.5, y + 2.5);
    ctx.stroke();
  } else if (type === 'heart') {
    // Icon trái tim
    ctx.beginPath();
    ctx.moveTo(x, y + 4.5);
    ctx.bezierCurveTo(x - 5.5, y - 0.5, x - 5.5, y - 5.5, x, y - 2.5);
    ctx.bezierCurveTo(x + 5.5, y - 5.5, x + 5.5, y - 0.5, x, y + 4.5);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Tạo ảnh thẻ thông tin người dùng (User Profile Card)
 * @param {object} info
 * @param {string} info.name - Tên người dùng
 * @param {string} info.uid - Facebook UID
 * @param {string} info.chatType - Loại hội thoại (Nhóm / Cá nhân)
 * @param {string} info.threadId - ID cuộc trò chuyện
 * @param {string} [info.avatarUrl] - URL avatar
 * @param {string} [info.gender] - Giới tính
 * @returns {Promise<{ imagePath: string, cleanup: Function }>}
 */
async function generateInfoCard(info) {
  const width = 940;
  const height = 530;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Nền hình ảnh Gojo Satoru hoặc Fallback Gradient
  const bgImg = await getBackgroundImage();
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, width, height);

    // Lớp phủ tối mờ tinh tế giúp hình nền hòa quyện với thẻ
    const overlayGrad = ctx.createLinearGradient(0, 0, width, height);
    overlayGrad.addColorStop(0, 'rgba(8, 12, 22, 0.25)');
    overlayGrad.addColorStop(0.5, 'rgba(10, 15, 30, 0.15)');
    overlayGrad.addColorStop(1, 'rgba(6, 9, 18, 0.45)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Nền mặc định dạng Gradient tối hiện đại
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0a0e17');
    bgGrad.addColorStop(0.5, '#101726');
    bgGrad.addColorStop(1, '#080c14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Hiệu ứng ánh sáng trang trí
    const orb1 = ctx.createRadialGradient(160, 140, 10, 160, 140, 280);
    orb1.addColorStop(0, 'rgba(0, 132, 255, 0.28)');
    orb1.addColorStop(1, 'rgba(0, 132, 255, 0)');
    ctx.fillStyle = orb1;
    ctx.fillRect(0, 0, width, height);

    const orb2 = ctx.createRadialGradient(820, 440, 10, 820, 440, 280);
    orb2.addColorStop(0, 'rgba(155, 81, 224, 0.24)');
    orb2.addColorStop(1, 'rgba(155, 81, 224, 0)');
    ctx.fillStyle = orb2;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Khung thẻ chính dạng Frosted Glassmorphism
  const cardX = 35;
  const cardY = 35;
  const cardW = width - 70;
  const cardH = height - 70;

  // Đổ bóng khung
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 35;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 12;

  // Nền thẻ kính mờ bán trong suốt (để lộ hình nền anime phía sau)
  roundRect(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.fillStyle = 'rgba(8, 13, 26, 0.50)';
  ctx.fill();
  ctx.restore();

  // Viền sáng biến đổi theo chủ đề thẻ (Info / Welcome / Goodbye / Admin)
  ctx.lineWidth = 2;
  const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  let shadowGlow = '#38bdf8';

  if (info.cardTheme === 'welcome') {
    borderGrad.addColorStop(0, 'rgba(52, 211, 153, 0.95)');   // Emerald
    borderGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.7)');   // Cyan
    borderGrad.addColorStop(1, 'rgba(168, 85, 247, 0.85)');   // Purple
    shadowGlow = '#34d399';
  } else if (info.cardTheme === 'goodbye') {
    borderGrad.addColorStop(0, 'rgba(251, 113, 133, 0.95)');  // Rose
    borderGrad.addColorStop(0.5, 'rgba(244, 63, 94, 0.7)');    // Red-pink
    borderGrad.addColorStop(1, 'rgba(147, 51, 234, 0.85)');   // Violet
    shadowGlow = '#fb7185';
  } else if (info.cardTheme === 'admin') {
    borderGrad.addColorStop(0, 'rgba(251, 191, 36, 0.95)');   // Gold
    borderGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.7)');   // Amber
    borderGrad.addColorStop(1, 'rgba(168, 85, 247, 0.85)');   // Purple
    shadowGlow = '#fbbf24';
  } else {
    borderGrad.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
    borderGrad.addColorStop(0.5, 'rgba(192, 132, 252, 0.6)');
    borderGrad.addColorStop(1, 'rgba(147, 51, 234, 0.85)');
    shadowGlow = '#38bdf8';
  }
  ctx.strokeStyle = borderGrad;
  ctx.stroke();

  // 3. Header Badge: Tiêu đề thẻ (tự biến đổi theo loại thẻ: User hoặc Admin)
  const badgeTitle = info.badgeTitle || 'FACEBOOK USER PROFILE';
  const badgeColor = info.badgeColor || (info.cardTheme === 'welcome' ? '#34d399' : info.cardTheme === 'goodbye' ? '#fb7185' : '#38bdf8');
  const badgeBorder = info.badgeBorder || (info.cardTheme === 'welcome' ? 'rgba(52, 211, 153, 0.6)' : info.cardTheme === 'goodbye' ? 'rgba(251, 113, 133, 0.6)' : 'rgba(56, 189, 248, 0.5)');
  const badgeBg = info.badgeBg || 'rgba(15, 23, 42, 0.75)';

  const badgeX = cardX + 28;
  const badgeY = cardY + 20;
  roundRect(ctx, badgeX, badgeY, 260, 30, 15);
  ctx.fillStyle = badgeBg;
  ctx.fill();
  ctx.strokeStyle = badgeBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = badgeColor;
  ctx.font = `bold 12px ${FONT_BOLD}`;
  ctx.fillText(badgeTitle, badgeX + 18, badgeY + 20);

  // 4. Phần bên trái: Avatar tròn và tên người dùng
  const avatarX = cardX + 115;
  const avatarY = cardY + 160;
  const avatarR = 65;

  // Vòng phát sáng bao quanh avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR + 4, 0, Math.PI * 2);
  const ringGrad = ctx.createLinearGradient(avatarX - avatarR, avatarY - avatarR, avatarX + avatarR, avatarY + avatarR);
  if (info.cardTheme === 'welcome') {
    ringGrad.addColorStop(0, '#34d399');
    ringGrad.addColorStop(1, '#38bdf8');
  } else if (info.cardTheme === 'goodbye') {
    ringGrad.addColorStop(0, '#fb7185');
    ringGrad.addColorStop(1, '#a855f7');
  } else if (info.cardTheme === 'admin') {
    ringGrad.addColorStop(0, '#fbbf24');
    ringGrad.addColorStop(1, '#c084fc');
  } else {
    ringGrad.addColorStop(0, '#38bdf8');
    ringGrad.addColorStop(1, '#c084fc');
  }
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 3.5;
  ctx.shadowColor = shadowGlow;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();

  // Vẽ hình ảnh avatar
  let loadedAvatar = null;
  if (info.avatarUrl) {
    loadedAvatar = await fetchAvatarImage(info.avatarUrl);
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.clip();

  if (loadedAvatar) {
    ctx.drawImage(loadedAvatar, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
  } else {
    // Fallback nếu không tải được avatar
    const fallbackGrad = ctx.createLinearGradient(avatarX - avatarR, avatarY - avatarR, avatarX + avatarR, avatarY + avatarR);
    fallbackGrad.addColorStop(0, '#0284c7');
    fallbackGrad.addColorStop(1, '#9333ea');
    ctx.fillStyle = fallbackGrad;
    ctx.fillRect(avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 46px ${FONT_BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = (info.name || 'U').charAt(0).toUpperCase();
    ctx.fillText(initial, avatarX, avatarY);
  }
  ctx.restore();

  // Chấm trạng thái trực tuyến màu xanh lá
  const dotX = avatarX + 44;
  const dotY = avatarY + 44;
  ctx.save();
  ctx.beginPath();
  ctx.arc(dotX, dotY, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#22c55e';
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.strokeStyle = '#0b1120';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // Tên người dùng dưới avatar (bên trái)
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 20px ${FONT_BOLD}`;
  ctx.textAlign = 'center';

  let displayName = info.name || 'Người dùng Facebook';
  if (displayName.length > 18) displayName = displayName.slice(0, 16) + '...';
  ctx.fillText(displayName, avatarX, avatarY + avatarR + 36);

  // Subtitle bên dưới tên: Giới tính hiển thị chuẩn xác hoặc danh hiệu tùy chỉnh
  const subText = info.subtitle || (info.gender ? `Giới tính: ${info.gender}` : 'Thành viên Facebook');
  ctx.fillStyle = info.subtitleColor || (info.gender === 'Nam' ? '#60a5fa' : info.gender === 'Nữ' ? '#f472b6' : '#94a3b8');
  ctx.font = `bold 13px ${FONT_BOLD}`;
  ctx.fillText(subText, avatarX, avatarY + avatarR + 60);
  ctx.restore();

  // 5. Đường phân cách thẳng đứng
  const sepX = cardX + 235;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sepX, cardY + 65);
  ctx.lineTo(sepX, cardY + cardH - 45);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // 6. Phần bên phải: Các ô thông tin chi tiết (6 ô hỗ trợ danh sách tùy biến)
  const gridX = sepX + 25;
  const gridW = cardW - (sepX - cardX) - 50;
  const items = info.customItems || [
    { label: 'HỌ VÀ TÊN', value: info.name || 'Không xác định', type: 'user' },
    { label: 'FACEBOOK UID', value: info.uid || 'Không rõ', type: 'uid' },
    { label: 'GIỚI TÍNH', value: info.gender || 'Chưa cập nhật', type: 'gender' },
    { label: 'LOẠI HỘI THOẠI', value: info.chatType || 'Nhóm chat Messenger', type: 'chat' },
    { label: 'ID CUỘC TRÒ CHUYỆN (THREAD ID)', value: info.threadId || 'N/A', type: 'thread' },
    { label: 'TRANG CÁ NHÂN', value: `https://facebook.com/${info.uid}`, type: 'link' },
  ];

  const itemH = 47;
  const itemGap = 8;
  const startY = cardY + 58;

  ctx.textAlign = 'left';

  items.forEach((item, index) => {
    const y = startY + index * (itemH + itemGap);

    // Nền của từng ô thông tin: Kính mờ màu sẫm
    roundRect(ctx, gridX, y, gridW, itemH, 9);
    ctx.fillStyle = 'rgba(10, 16, 32, 0.72)';
    ctx.fill();
    ctx.strokeStyle = item.borderColor || 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Vẽ icon vector sắc nét (hỗ trợ phân biệt giới tính Nam/Nữ và các loại biểu tượng)
    drawFieldIcon(ctx, item.type, gridX + 20, y + Math.floor(itemH / 2), item.value);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;

    // Tiêu đề nhỏ (Label)
    ctx.fillStyle = item.labelColor || '#94a3b8';
    ctx.font = `bold 9.5px ${FONT_BOLD}`;
    ctx.fillText(item.label, gridX + 40, y + 17);

    // Giá trị (Value)
    ctx.fillStyle = item.valueColor || (item.type === 'uid' || item.type === 'link' 
      ? '#38bdf8' 
      : item.type === 'gender' 
        ? (item.value === 'Nam' ? '#60a5fa' : item.value === 'Nữ' ? '#f472b6' : '#38bdf8') 
        : item.type === 'crown' || item.type === 'admin'
          ? '#fbbf24'
          : '#ffffff');
    ctx.font = `bold 12.5px ${FONT_BOLD}`;

    let valText = item.value;
    if (valText && valText.length > 44) valText = valText.slice(0, 42) + '...';
    ctx.fillText(valText || '', gridX + 40, y + 36);
    ctx.restore();
  });

  // 7. Footer ghi chú chân thẻ
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `11px ${FONT_REGULAR}`;
  ctx.textAlign = 'right';
  const timeStr = new Date().toLocaleString('vi-VN', { hour12: false });
  const footerStr = info.footerText || `Messenger Bot System • Thời gian tạo: ${timeStr}`;
  ctx.fillText(footerStr, cardX + cardW - 20, cardY + cardH - 16);
  ctx.restore();

  // Xuất file ảnh PNG ra thư mục temp
  const timestamp = Date.now();
  const imagePath = path.join(TEMP_DIR, `info_card_${timestamp}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(imagePath, buffer);

  return {
    imagePath,
    cleanup: () => {
      // Trì hoãn 10 giây trước khi xóa file temp để đảm bảo stream upload hoàn tất
      setTimeout(() => {
        try {
          if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        } catch (_) {}
      }, 10000);
    },
  };
}

module.exports = {
  generateInfoCard,
};
