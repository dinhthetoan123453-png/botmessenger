/**
 * Helper logger với màu sắc và timestamp
 */
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function timestamp() {
  return new Date().toLocaleTimeString('vi-VN');
}

const logger = {
  info: (...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.blue}[INFO]${colors.reset}`, ...args),
  success: (...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.green}[SUCCESS]${colors.reset}`, ...args),
  warn: (...args) => console.warn(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset}`, ...args),
  error: (...args) => console.error(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset}`, ...args),
  bot: (...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.magenta}[BOT]${colors.reset}`, ...args),
  msg: (...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.cyan}[CHAT]${colors.reset}`, ...args),
};

module.exports = logger;
