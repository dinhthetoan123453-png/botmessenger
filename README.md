# Facebook Messenger Userbot (Bot Messenger Tài Khoản Cá Nhân)

Dự án Facebook Messenger Bot chạy trực tiếp trên tài khoản Facebook cá nhân (Userbot) được xây dựng bằng **Node.js** và thư viện **ws3-fca** (giao thức MQTT WebSocket). Dự án kế thừa toàn bộ cấu trúc module hoá, hỗ trợ đăng nhập qua `appstate.json`, tích hợp AI Google Gemini (phân tích 8 tin nhắn ngữ cảnh gần nhất), tìm kiếm và gửi nhạc từ SoundCloud/Spotify kèm ảnh bìa và file âm thanh MP3, cùng chức năng tải video TikTok không watermark (gửi trực tiếp tệp MP4).

---

## ⚠️ Lưu ý quan trọng về an toàn tài khoản Facebook

- Facebook chưa hỗ trợ API chính thức cho tài khoản người dùng cá nhân (chỉ có API cho Fanpage). Thư viện hoạt động bằng cách mô phỏng giao thức web và MQTT.
- **Khuyến nghị sử dụng tài khoản phụ (nick phụ / nick test)** để thử nghiệm trước khi dùng trên nick chính.
- Không dùng bot để gửi tin nhắn spam, tag hàng loạt hoặc gửi tin với tần suất quá cao để tránh bị checkpoint tài khoản.
- File `appstate.json` chứa thông tin cookie đăng nhập của bạn, **tuyệt đối không chia sẻ cho người khác hoặc commit file này lên GitHub công khai**.

---

## 📁 Cấu trúc thư mục

```text
bot messenger/
├── src/
│   ├── commands/              # Thư mục chứa các lệnh
│   │   ├── admin.js           # Lệnh !admin (thông tin admin @toandinh27210)
│   │   ├── ai.js              # Lệnh !ai (tích hợp Gemini AI + đọc ngữ cảnh)
│   │   ├── bd.js              # Lệnh !bd (đổi biệt danh @user hoặc bản thân)
│   │   ├── echo.js            # Lệnh !echo (lặp lại tin nhắn)
│   │   ├── help.js            # Lệnh !help (danh sách lệnh)
│   │   ├── info.js            # Lệnh !info (thông tin người gửi/UID Facebook)
│   │   ├── music.js           # Lệnh !music (tìm và gửi nhạc kèm ảnh bìa & MP3)
│   │   ├── ping.js            # Lệnh !ping (kiểm tra độ trễ, uptime)
│   │   ├── stik.js            # Lệnh !stik (tải video TikTok không logo)
│   │   └── index.js           # Bộ nạp lệnh tự động
│   ├── utils/
│   │   ├── chatHistory.js     # Quản lý bộ nhớ đệm lịch sử chat 8 tin nhắn cho AI
│   │   ├── logger.js          # Ghi log console có màu sắc và timestamp
│   │   ├── messageHelper.js   # Bọc gửi tin nhắn, file media và reply an toàn
│   │   ├── musicHelper.js     # Tìm và tải nhạc từ SoundCloud / Spotify
│   │   ├── tiktokHelper.js    # Trích xuất và tải video TikTok không watermark
│   │   └── userHelper.js      # Cache tên và thông tin người dùng từ UID
│   ├── auth.js                # Xử lý xác thực tài khoản Facebook qua AppState
│   ├── bot.js                 # Lắng nghe tin nhắn MQTT, chống spam và điều hướng lệnh
│   ├── config.js              # Cấu hình biến môi trường từ file .env
│   └── index.js               # Entry point chính và máy chủ Web Dashboard
├── .env.example               # Mẫu file cấu hình biến môi trường
├── .gitignore                 # Bỏ qua node_modules, appstate.json, temp...
├── Dockerfile                 # Đóng gói container Docker
├── package.json               # Quản lý dependencies và scripts
├── render.yaml                # Cấu hình triển khai tự động lên Render.com
└── README.md                  # Hướng dẫn chi tiết
```

---

## 🚀 Hướng dẫn cài đặt và khởi chạy

### Bước 1: Cài đặt thư viện phụ thuộc
Mở Terminal tại thư mục dự án và chạy:

```bash
npm install
```

### Bước 2: Chuẩn bị file cấu hình `.env`
Sao chép file `.env.example` thành `.env`:

```bash
cp .env.example .env
```
Mở file `.env` và điền:
- `GEMINI_API_KEY`: Lấy API Key miễn phí tại [Google AI Studio](https://aistudio.google.com/app/apikey).
- `BOT_PREFIX`: Tiền tố lệnh (mặc định: `!`).

### Bước 3: Lấy file phiên đăng nhập `appstate.json` (Chỉ mất 1 phút)
1. Cài đặt tiện ích mở rộng xuất cookie trên trình duyệt Chrome/Edge:
   - Khuyên dùng: **C3C FbState** hoặc **Cookie-Editor**.
2. Đăng nhập tài khoản Facebook trên trình duyệt web.
3. Bấm vào icon tiện ích mở rộng > Chọn **Export** (hoặc Export JSON) để sao chép dữ liệu cookie.
4. Tạo một file tên là `appstate.json` tại thư mục gốc của dự án (`/home/toandinh/Documents/bot messenger/appstate.json`).
5. Dán toàn bộ nội dung JSON vừa copy vào file đó và lưu lại.

### Bước 4: Khởi động bot
```bash
npm start
```
Bot sẽ tự động kết nối và in thông tin:
```text
[INFO] Tìm thấy file appstate.json tại thư mục gốc...
[SUCCESS] Đăng nhập Facebook thành công! Bot UID: 1000xxxxxxxxx
[BOT] Bot đang lắng nghe tin nhắn qua giao thức MQTT với tiền tố: [ ! ]
```

Bạn cũng có thể mở trình duyệt tại địa chỉ `http://localhost:3000` để xem Web Dashboard kiểm tra trạng thái hoạt động của bot.

---

## 📋 Danh sách các lệnh

| Lệnh | Cú pháp | Mô tả |
| :--- | :--- | :--- |
| `admin` | `!admin` (hoặc `/admin`, `!ad`, `!owner`) | Thẻ hình ảnh thông tin quản trị viên & chủ sở hữu bot (@toandinh27210). |
| `bd` / `bietdanh` | `!bd [@user] <tên mới>` | Đổi biệt danh của người được tag @user hoặc của chính mình nếu không tag. Dùng `!bd reset` để xóa biệt danh. |
| `ping` | `!ping` (hoặc `/ping`) | Kiểm tra độ trễ mạng (latency) và thời gian bot đã hoạt động liên tục (uptime). |
| `help` | `!help` (hoặc `/help`) | Xem danh sách tất cả các lệnh của bot kèm cú pháp hướng dẫn. |
| `info` | `!info [@tag / reply]` | Hiển thị thẻ hình ảnh đồ họa (Profile Card) nền anime Gojo Satoru chứa avatar, giới tính chuẩn xác, Facebook UID, tên, liên kết trang cá nhân. |
| `echo` | `!echo <nội dung>` | Lặp lại tin nhắn vừa nhập. |
| `music` | `!music <tên bài>` hoặc `!music <link Spotify/SoundCloud>` | Tìm nhạc từ SoundCloud/Spotify, gửi ảnh bìa và tệp âm thanh `.mp3` trực tiếp vào Messenger. |
| `stik` / `tik` / `tiktok` | `!stik <link>` / `!tik <link>` | Tải video TikTok không dán logo (no watermark), gửi ảnh bìa, thống kê tim/view và tệp video `.mp4`. |
| `ai` | `!ai [câu hỏi]` | Trò chuyện cùng Google Gemini AI. Bot tự động đọc 8 tin nhắn gần nhất để đưa ra câu trả lời tự nhiên, phù hợp với ngữ cảnh hội thoại. Gõ `!ai xem` để xem lịch sử ngữ cảnh đang lưu. |

---

## 🎬 Tính năng tải video TikTok không logo (`!stik`)

- **Cú pháp**:
  - `!stik https://vt.tiktok.com/...`
  - `/stik https://vt.tiktok.com/...`
  - `!tik https://www.tiktok.com/@user/video/...`
- **Tự động tải tiện lợi**:
  - Trong cuộc trò chuyện riêng 1-1 với bot, bạn chỉ cần **gửi trực tiếp đường link TikTok**, bot sẽ tự động phát hiện và gửi video không logo về mà không cần gõ lệnh.
- **Bot sẽ gửi**:
  1. Ảnh bìa kèm thông tin chi tiết: Tác giả, Tiêu đề, Thời lượng, Âm nhạc nền, Lượt thích, Bình luận, Lượt xem.
  2. Tệp video `.mp4` không dán logo trực tiếp lên đoạn chat để xem ngay.
  3. Đường link xem/tải trực tiếp chất lượng cao dự phòng.
  4. Tự động dọn dẹp các tệp tạm trên đĩa sau khi gửi thành công.

---

## 🎵 Tính năng tìm và gửi nhạc (`!music` / `!nhac`)

- Tìm theo tên bài hát trên SoundCloud:
  `!music Chúng ta của tương lai`
  `!nhac Đi về nhà`
- Gửi link bài hát từ Spotify:
  `!music https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT`
- Gửi link bài hát từ SoundCloud:
  `!music https://soundcloud.com/...`

Bot sẽ:
1. Gửi ảnh bìa bài hát kèm thông tin nghệ sĩ, nguồn phát và thời lượng.
2. Gửi tệp âm thanh audio `.mp3` trực tiếp lên đoạn chat Messenger.
3. Tự động xóa file âm thanh tạm trên máy sau khi gửi.

---

## 🌐 Hướng dẫn Host Bot chạy 24/7 (Lưu ý về Vercel)

### Tại sao không nên host bot trên Vercel?
- **Vercel** là nền tảng **Serverless / Edge Functions**: Mỗi tiến trình chỉ chạy khi có request HTTP đến và tự động tắt (sleep/terminate) sau **10 đến 60 giây**.
- **Facebook Userbot (`ws3-fca`)** hoạt động bằng cách duy trì kết nối **MQTT WebSocket liên tục 24/7** để đón nhận tin nhắn theo thời gian thực.
- Nếu deploy lên Vercel, bot sẽ bị ngắt kết nối ngay lập tức sau vài giây và không thể nhận được tin nhắn.

### Nền tảng khuyến nghị thay thế (Chạy 24/7 miễn phí)
1. **Render.com** (Khuyên dùng nhất - có gói Free Web Service).
2. **Railway.app** (Triển khai 1-click từ GitHub).
3. **Koyeb** (Hỗ trợ micro-instance miễn phí).
4. **VPS Linux cá nhân** (Chạy bằng `pm2 start src/index.js` hoặc Docker).

---

### Các bước deploy lên Render.com

#### Bước 1: Lấy chuỗi mã hóa `FB_APPSTATE`
1. Khởi động bot ở máy tính cá nhân bằng lệnh `npm start`.
2. Khi đăng nhập thành công, bot sẽ tự động in chuỗi **MÃ PHIÊN FB_APPSTATE MỚI** (chuỗi Base64) ra terminal.
3. Sao chép toàn bộ chuỗi Base64 này.

#### Bước 2: Đẩy mã nguồn lên GitHub
```bash
git init
git add .
git commit -m "feat: Sẵn sàng deploy Messenger Bot"
git branch -M main
git remote add origin <link-github-cua-ban>
git push -u origin main
```

#### Bước 3: Tạo Web Service trên Render
1. Truy cập [Render Dashboard](https://dashboard.render.com/) > Chọn **New +** > **Web Service**.
2. Kết nối tới kho lưu trữ GitHub của bạn.
3. Thiết lập thông số:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Vào mục **Environment Variables** (Biến môi trường) và thêm:
   - `FB_APPSTATE`: Dán chuỗi Base64 đã copy ở Bước 1.
   - `GEMINI_API_KEY`: API Key Gemini của bạn.
   - `BOT_PREFIX`: `!`
   - `AUTO_REPLY_AI`: `false` (hoặc `true` nếu muốn AI tự động trả lời trong chat riêng).
5. Bấm **Deploy Web Service**. Bot sẽ tự động đăng nhập và duy trì trực tuyến 24/7!
