const logger = require('./logger');

// Bộ nhớ cache tạm thông tin người dùng trong RAM (hạn 1 giờ)
const userCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Lấy thông tin người dùng từ Facebook UID (có cache để tránh nghẽn API)
 * @param {object} api - Instance FCA
 * @param {string} userId - UID Facebook
 * @returns {Promise<object|null>}
 */
async function getUserDetails(api, userId) {
  if (!api || !userId) return null;
  const idStr = String(userId);

  const cached = userCache.get(idStr);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.data;
  }

  try {
    if (typeof api.getUserInfo === 'function') {
      const data = await api.getUserInfo(idStr);
      const user = Array.isArray(data) ? data[0] : (data?.[idStr] || data);
      if (user) {
        userCache.set(idStr, {
          data: user,
          cachedAt: Date.now(),
        });
        return user;
      }
    }
  } catch (err) {
    logger.warn(`Không thể lấy thông tin Facebook UID ${userId}: ${err.message}`);
  }

  return null;
}

/**
 * Lấy tên hiển thị của người dùng từ Facebook UID
 * @param {object} api - Instance FCA
 * @param {string} userId - UID Facebook
 * @returns {Promise<string>}
 */
async function getUserName(api, userId) {
  if (!userId) return 'Người dùng Facebook';
  const user = await getUserDetails(api, userId);
  return user?.name || `Facebook User (${userId})`;
}

module.exports = {
  getUserDetails,
  getUserName,
};
