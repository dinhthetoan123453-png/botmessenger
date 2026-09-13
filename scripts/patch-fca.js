/**
 * Tự động sửa lỗi hoán đổi giới tính (gender swap bug) trong thư viện ws3-fca.
 * Trong Facebook chat/user_info: code 2 = Male (Nam), code 1 = Female (Nữ).
 * ws3-fca mặc định đảo ngược: code === 1 ? "male" : code === 2 ? "female"
 * Script này chạy tự động sau npm install (postinstall) và khi bot khởi động.
 */

const fs = require('fs');
const path = require('path');

function patchFca() {
  const targetPath = path.resolve(__dirname, '../node_modules/ws3-fca/src/deltas/apis/users/getUserInfo.js');

  if (!fs.existsSync(targetPath)) {
    // Nếu node_modules chưa được tải (ví dụ môi trường build đặc biệt), bỏ qua
    return false;
  }

  try {
    let content = fs.readFileSync(targetPath, 'utf8');
    let hasChanges = false;

    // 1. Sửa biểu thức logic xác định giới tính: 2 là male, 1 là female
    if (content.includes('code === 1 ? "male" : code === 2 ? "female"')) {
      content = content.replace(
        'code === 1 ? "male" : code === 2 ? "female"',
        'code === 2 ? "male" : code === 1 ? "female"'
      );
      hasChanges = true;
    }

    // 2. Bổ sung trường rawGender vào đối tượng trả về để các module khác dễ dàng kiểm tra trực tiếp
    if (!content.includes('rawGender: inner.gender')) {
      content = content.replace(
        'gender: getGenderString(inner.gender),',
        'gender: getGenderString(inner.gender),\n                  rawGender: inner.gender,'
      );
      hasChanges = true;
    }

    if (hasChanges) {
      fs.writeFileSync(targetPath, content, 'utf8');
      console.log('[PATCH-FCA] ✅ Đã vá thành công lỗi giới tính trong ws3-fca (getUserInfo.js)!');
      return true;
    }

    return true;
  } catch (err) {
    console.error('[PATCH-FCA] ❌ Lỗi khi vá ws3-fca:', err.message);
    return false;
  }
}

if (require.main === module) {
  patchFca();
}

module.exports = patchFca;
