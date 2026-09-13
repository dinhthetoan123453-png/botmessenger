const config = require('../config');
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

/**
 * Xác định giới tính người dùng chuẩn xác (Nam / Nữ) với 4 tầng bảo vệ:
 * 1. Admin Bot luôn là Nam
 * 2. Facebook GraphQL qua api.getThreadInfo (MALE / FEMALE chuẩn gốc)
 * 3. rawGender từ Facebook API payload (2 = Nam, 1 = Nữ)
 * 4. user.gender từ ws3-fca đã được patch (male = Nam, female = Nữ)
 * 
 * @param {object} api - Instance FCA
 * @param {string} userId - UID Facebook
 * @param {string} [threadId] - ID cuộc trò chuyện hiện tại
 * @param {object} [userDetails] - Đối tượng user đã fetch sẵn (nếu có)
 * @returns {Promise<string|null>}
 */
async function getUserGender(api, userId, threadId = null, userDetails = null) {
  if (!userId) return null;
  const idStr = String(userId);

  // 1. TẦNG 1: Admin / Chủ sở hữu bot luôn luôn là Nam
  if (idStr === String(config.adminId) || idStr === '100083611166883') {
    return 'Nam';
  }

  // 2. TẦNG 2: Kiểm tra dữ liệu thành viên từ Facebook GraphQL qua api.getThreadInfo
  if (threadId && typeof api?.getThreadInfo === 'function') {
    try {
      const threadInfo = await api.getThreadInfo(threadId);
      if (threadInfo?.userInfo && Array.isArray(threadInfo.userInfo)) {
        const member = threadInfo.userInfo.find(u => String(u.id) === idStr);
        if (member?.gender) {
          const mg = String(member.gender).toUpperCase().trim();
          if (mg === 'MALE' || mg === '2') {
            return 'Nam';
          }
          if (mg === 'FEMALE' || mg === '1') {
            return 'Nữ';
          }
        }
      }
    } catch (_) {
      // Bỏ qua nếu lỗi lấy thông tin thread, chuyển sang tầng tiếp theo
    }
  }

  // 3. TẦNG 3: Kiểm tra từ userDetails (hoặc gọi getUserDetails)
  let user = userDetails;
  if (!user && api) {
    user = await getUserDetails(api, idStr);
  }

  if (user) {
    // 3a. Kiểm tra mã gốc rawGender từ Facebook API (2 = Nam, 1 = Nữ)
    if (user.rawGender !== undefined && user.rawGender !== null) {
      const raw = Number(user.rawGender);
      if (raw === 2) return 'Nam';
      if (raw === 1) return 'Nữ';
    }

    // 3b. Kiểm tra chuỗi gender đã được chuẩn hóa hoặc chuỗi gốc
    if (user.gender) {
      const g = String(user.gender).toLowerCase().trim();
      if (g === 'male' || g === 'nam' || g === '2') {
        return 'Nam';
      }
      if (g === 'female' || g === 'nữ' || g === 'nu' || g === '1') {
        return 'Nữ';
      }
      if (g !== 'no specific gender' && g !== 'none') {
        return user.gender;
      }
    }
  }

  return null;
}

module.exports = {
  getUserDetails,
  getUserName,
  getUserGender,
};
