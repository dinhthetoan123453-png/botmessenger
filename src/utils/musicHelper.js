const fs = require('fs');
const path = require('path');
const play = require('play-dl');
const spotifyUrlInfo = require('spotify-url-info')(fetch);
const logger = require('./logger');

const TEMP_DIR = path.resolve(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

let soundCloudInitialized = false;

async function ensureSoundCloud() {
  if (!soundCloudInitialized) {
    try {
      const clientID = await play.getFreeClientID();
      await play.setToken({ soundcloud: { client_id: clientID } });
      soundCloudInitialized = true;
    } catch (err) {
      logger.error('Lỗi khởi tạo SoundCloud client ID:', err.message);
    }
  }
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return 'Không rõ';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Tìm kiếm bài hát từ Spotify hoặc SoundCloud và tải về file tạm
 * @param {string} query - Từ khóa tìm kiếm hoặc link Spotify / SoundCloud
 */
async function searchAndDownloadMusic(query) {
  await ensureSoundCloud();

  let trackTitle = '';
  let trackArtist = '';
  let coverUrl = '';
  let source = 'SoundCloud';
  let trackObj = null;

  // 1. Kiểm tra xem có phải link Spotify không
  const isSpotify = /open\.spotify\.com\/track\/|spotify:track:/i.test(query);

  if (isSpotify) {
    try {
      source = 'Spotify';
      const preview = await spotifyUrlInfo.getPreview(query);
      trackTitle = preview.title || preview.track || 'Unknown';
      trackArtist = preview.artist || 'Unknown';
      coverUrl = preview.image || '';

      // Tìm bản audio tương ứng trên SoundCloud
      const scSearch = await play.search(`${trackArtist} - ${trackTitle}`, {
        source: { soundcloud: 'tracks' },
        limit: 1,
      });

      if (scSearch && scSearch.length > 0) {
        trackObj = scSearch[0];
      }
    } catch (spErr) {
      logger.warn('Lỗi khi đọc thông tin Spotify:', spErr.message);
    }
  }

  // 2. Nếu không phải Spotify hoặc là tìm kiếm SoundCloud thông thường
  if (!trackObj) {
    try {
      const searchResults = await play.search(query, {
        source: { soundcloud: 'tracks' },
        limit: 1,
      });

      if (searchResults && searchResults.length > 0) {
        trackObj = searchResults[0];
        trackTitle = trackObj.name || query;
        trackArtist = trackObj.user?.name || 'Nghệ sĩ';
        if (!coverUrl && trackObj.thumbnail) {
          coverUrl = trackObj.thumbnail.replace('-large.jpg', '-t500x500.jpg');
        }
      }
    } catch (scErr) {
      logger.error('Lỗi khi tìm kiếm trên SoundCloud:', scErr.message);
    }
  }

  if (!trackObj) {
    return null;
  }

  const timestamp = Date.now();
  const imagePath = path.join(TEMP_DIR, `cover_${timestamp}.jpg`);
  const audioPath = path.join(TEMP_DIR, `audio_${timestamp}.mp3`);

  // Tải ảnh bìa
  let hasImage = false;
  if (coverUrl) {
    try {
      const imgRes = await fetch(coverUrl);
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(imagePath, buffer);
        hasImage = true;
      }
    } catch (imgErr) {
      logger.warn('Không thể tải ảnh bìa bài hát:', imgErr.message);
    }
  }

  // Tải audio stream
  const streamInfo = await play.stream_from_info(trackObj);
  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(audioPath);
    streamInfo.stream.on('error', (err) => {
      writeStream.destroy();
      reject(err);
    });
    writeStream.on('error', (err) => {
      if (typeof streamInfo.stream.destroy === 'function') {
        streamInfo.stream.destroy();
      }
      reject(err);
    });
    writeStream.on('finish', resolve);
    streamInfo.stream.pipe(writeStream);
  });

  return {
    title: trackTitle,
    artist: trackArtist,
    source,
    duration: formatDuration(trackObj.durationInSec),
    imagePath: hasImage ? imagePath : null,
    audioPath,
    cleanup: () => {
      try {
        if (hasImage && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (_) {}
    },
  };
}

module.exports = {
  searchAndDownloadMusic,
};
