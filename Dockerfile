FROM node:20-alpine

WORKDIR /app

# Cài đặt các gói phụ trợ cần thiết (nếu có thư viện yêu cầu build)
RUN apk add --no-cache python3 make g++

# Sao chép package.json và cài đặt dependencies
COPY package*.json ./
RUN npm install --production

# Sao chép toàn bộ mã nguồn
COPY . .

# Cấu hình biến môi trường
ENV PORT=3000
ENV NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"
EXPOSE 3000

# Khởi chạy bot
CMD ["node", "src/index.js"]
