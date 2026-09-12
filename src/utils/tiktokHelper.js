const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const TEMP_DIR = path.resolve(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Định dạng số thành chuỗi dễ đọc (ví dụ: 12500 -> 12.5K, 1500000 -> 1.5M)
 */
function formatNumber(num) {
  if (!num || isNaN(num)) return '0';
  const n = Number(num);
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return n.toLocaleString('vi-VN');
}

/**
 * Định dạng thời lượng giây sang mm:ss
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return 'Không rõ';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Trích xuất liên kết TikTok/Douyin từ đoạn văn bản (hỗ trợ mọi định dạng)
 */
function extractTikTokUrl(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9_-]+\.)?(?:tiktok\.com|douyin\.com)\/[^\s]+/i);
  if (match) {
    let url = match[0].trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    return url;
  }
  return null;
}

const randomChar = (char, range) => {
  let chars = '';
  for (let i = 0; i < range; i++) {
    chars += char[Math.floor(Math.random() * char.length)];
  }
  return chars;
};

const generateDeviceId = () => '7' + randomChar('0123456789', 18);

function getTikTokApiParams(args) {
  return new URLSearchParams({
    ...args,
    version_name: '1.1.9',
    version_code: '2018111632',
    build_number: '1.1.9',
    device_id: generateDeviceId(),
    iid: generateDeviceId(),
    manifest_version_code: '2018111632',
    update_version_code: '2018111632',
    openudid: randomChar('0123456789abcdef', 16),
    uuid: randomChar('1234567890', 16),
    _rticket: Date.now() * 1000,
    ts: Date.now(),
    device_brand: 'Google',
    device_type: 'Pixel 4',
    device_platform: 'android',
    resolution: '1080*1920',
    dpi: 420,
    os_version: '10',
    os_api: '29',
    carrier_region: 'US',
    sys_region: 'US',
    region: 'US',
    timezone_name: 'America/New_York',
    timezone_offset: '-14400',
    channel: 'googleplay',
    ac: 'wifi',
    mcc_mnc: '310260',
    is_my_cn: 0,
    ssmix: 'a',
    as: 'a1qwert123',
    cp: 'cbfhckdckkde1',
  }).toString();
}

/**
 * Trích xuất Aweme ID từ URL TikTok
 */
async function resolveAwemeId(url) {
  const directMatch = url.match(/\/(?:video|photo|v)\/(\d+)/) || url.match(/\/(\d{18,22})/);
  if (directMatch) return directMatch[1];

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });
    const finalUrl = res.url;
    const match = finalUrl.match(/\/(?:video|photo|v)\/(\d+)/) || finalUrl.match(/\/(\d{15,25})/);
    if (match) return match[1];

    const html = await res.text();
    const idMatch = html.match(/\/video\/(\d{15,25})/) ||
                    html.match(/"itemId":"(\d+)"/) ||
                    html.match(/"id":"(\d{15,25})"/);
    return idMatch ? idMatch[1] : null;
  } catch (e) {
    logger.warn('Lỗi khi theo dõi chuyển hướng link TikTok:', e.message);
    return null;
  }
}

/**
 * Lấy dữ liệu video từ API chính thức của TikTok
 */
async function fetchOfficialTikTokData(aweme_id) {
  const hosts = [
    'https://api16-normal-useast5.tiktokv.us',
    'https://api16-normal-c-useast1a.tiktokv.com',
    'https://api22-normal-c-useast1a.tiktokv.com',
  ];

  for (const host of hosts) {
    try {
      const url = `${host}/aweme/v1/feed/?${getTikTokApiParams({ aweme_id })}`;
      const res = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          'User-Agent': 'com.zhiliaoapp.musically/300904 (2018111632; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const data = await res.json();
        const item = data.aweme_list?.find(v => String(v.aweme_id) === String(aweme_id)) || data.aweme_list?.[0];
        if (item) {
          const authorName = item.author?.nickname || 'Người dùng TikTok';
          const authorUsername = item.author?.unique_id ? `@${item.author.unique_id}` : '';
          const musicTitle = item.music?.title || 'Âm thanh gốc';
          const musicAuthor = item.music?.author ? ` - ${item.music.author}` : '';
          const videoUrl = item.video?.play_addr?.url_list?.[0];
          const coverUrl = item.video?.cover?.url_list?.[0] || item.video?.origin_cover?.url_list?.[0];

          return {
            title: item.desc || 'Video TikTok không có tiêu đề',
            author: authorUsername ? `${authorName} (${authorUsername})` : authorName,
            duration: formatDuration(Math.round((item.video?.duration || 0) / 1000)),
            likes: formatNumber(item.statistics?.digg_count),
            comments: formatNumber(item.statistics?.comment_count),
            shares: formatNumber(item.statistics?.share_count),
            views: formatNumber(item.statistics?.play_count),
            music: `${musicTitle}${musicAuthor}`,
            videoUrl,
            coverUrl,
          };
        }
      }
    } catch (err) {
      logger.warn(`Thử endpoint chính thức ${host} thất bại:`, err.message);
    }
  }
  return null;
}

/**
 * Fallback: Lấy dữ liệu qua TikWM (khi không bị chặn)
 */
async function fetchTikWMData(targetUrl) {
  const endpoints = [
    `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`,
    `https://tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`,
  ];

  for (const apiUrl of endpoints) {
    try {
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.code === 0 && json.data) {
          const vData = json.data;
          let videoUrl = vData.play || vData.hdplay || vData.wmplay;
          if (videoUrl && videoUrl.startsWith('/')) {
            videoUrl = 'https://www.tikwm.com' + videoUrl;
          }
          let coverUrl = vData.cover;
          if (coverUrl && coverUrl.startsWith('/')) {
            coverUrl = 'https://www.tikwm.com' + coverUrl;
          }
          const authorName = vData.author?.nickname || 'Người dùng TikTok';
          const authorUsername = vData.author?.unique_id ? `@${vData.author.unique_id}` : '';
          const musicTitle = vData.music_info?.title || vData.music || 'Âm thanh gốc';
          const musicAuthor = vData.music_info?.author ? ` - ${vData.music_info.author}` : '';

          return {
            title: vData.title || 'Video TikTok không có tiêu đề',
            author: authorUsername ? `${authorName} (${authorUsername})` : authorName,
            duration: formatDuration(vData.duration),
            likes: formatNumber(vData.digg_count),
            comments: formatNumber(vData.comment_count),
            shares: formatNumber(vData.share_count),
            views: formatNumber(vData.play_count),
            music: `${musicTitle}${musicAuthor}`,
            videoUrl,
            coverUrl,
          };
        }
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Tải video TikTok không dán logo và trích xuất thông tin chi tiết
 * @param {string} inputUrl - Liên kết video TikTok
 */
async function downloadTikTokVideo(inputUrl) {
  const targetUrl = extractTikTokUrl(inputUrl) || inputUrl.trim();
  if (!targetUrl) {
    throw new Error('Không tìm thấy liên kết TikTok hợp lệ.');
  }

  logger.info(`Bắt đầu xử lý video TikTok: ${targetUrl}`);

  let videoMeta = null;

  // 1. Thử qua API chính thức của TikTok trước
  const awemeId = await resolveAwemeId(targetUrl);
  if (awemeId) {
    logger.info(`Đã xác định ID video TikTok: ${awemeId}, đang truy vấn dữ liệu từ API máy chủ TikTok...`);
    videoMeta = await fetchOfficialTikTokData(awemeId);
  }

  // 2. Nếu API chính thức chưa lấy được, thử fallback qua TikWM
  if (!videoMeta) {
    logger.info('Đang thử lấy qua cổng dự phòng TikWM...');
    videoMeta = await fetchTikWMData(targetUrl);
  }

  if (!videoMeta || !videoMeta.videoUrl) {
    throw new Error('Không thể tìm thấy hoặc xử lý video TikTok này. Có thể video ở chế độ riêng tư hoặc đã bị xóa.');
  }

  const timestamp = Date.now();
  const videoPath = path.join(TEMP_DIR, `tiktok_${timestamp}.mp4`);
  const coverPath = path.join(TEMP_DIR, `tiktok_cover_${timestamp}.jpg`);

  // Tải ảnh bìa nếu có
  let hasCover = false;
  if (videoMeta.coverUrl) {
    try {
      const coverRes = await fetch(videoMeta.coverUrl, {
        signal: AbortSignal.timeout(10000),
      });
      if (coverRes.ok) {
        const coverBuf = Buffer.from(await coverRes.arrayBuffer());
        fs.writeFileSync(coverPath, coverBuf);
        hasCover = true;
      }
    } catch (err) {
      logger.warn('Không thể tải ảnh bìa TikTok:', err.message);
    }
  }

  // Tải tệp video MP4 không logo về bộ nhớ tạm
  let hasVideo = false;
  logger.info(`Đang tải tệp video không logo từ CDN...`);
  try {
    const vRes = await fetch(videoMeta.videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
      },
      signal: AbortSignal.timeout(35000),
    });

    if (vRes.ok) {
      const videoBuffer = Buffer.from(await vRes.arrayBuffer());
      fs.writeFileSync(videoPath, videoBuffer);
      hasVideo = true;
      logger.success(`Đã tải xong video TikTok (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
    } else {
      logger.warn(`Không thể tải tệp video từ CDN (HTTP ${vRes.status})`);
    }
  } catch (err) {
    logger.warn('Không thể tải tệp video MP4 về bộ nhớ tạm:', err.message);
  }

  return {
    title: videoMeta.title,
    author: videoMeta.author,
    duration: videoMeta.duration,
    likes: videoMeta.likes,
    comments: videoMeta.comments,
    shares: videoMeta.shares,
    views: videoMeta.views,
    music: videoMeta.music,
    downloadUrl: videoMeta.videoUrl,
    videoPath: hasVideo ? videoPath : null,
    coverPath: hasCover ? coverPath : null,
    cleanup: () => {
      try {
        if (hasVideo && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (hasCover && fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
      } catch (_) {}
    },
  };
}

module.exports = {
  extractTikTokUrl,
  downloadTikTokVideo,
};
