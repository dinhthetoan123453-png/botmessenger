const path = require('path');
require('dotenv').config();

module.exports = {
  prefix: process.env.BOT_PREFIX || '!',
  autoReplyAi: process.env.AUTO_REPLY_AI === 'true',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  safeDelayMin: parseInt(process.env.SAFE_DELAY_MIN, 10) || 1000,
  safeDelayMax: parseInt(process.env.SAFE_DELAY_MAX, 10) || 2500,
  aiHistoryLimit: parseInt(process.env.AI_HISTORY_LIMIT, 10) || 8,
  port: parseInt(process.env.PORT, 10) || 3000,
  adminId: process.env.ADMIN_ID || '100083611166883',
  adminName: process.env.ADMIN_NAME || 'Toàn Đinh',
  adminTag: process.env.ADMIN_TAG || '@toandinh27210',
  adminFacebook: process.env.ADMIN_FB || 'https://www.facebook.com/toandinh27210',
  appStatePath: path.resolve(__dirname, '../appstate.json'),
  tempDir: path.resolve(__dirname, '../temp'),
};
