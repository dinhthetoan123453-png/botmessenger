const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const commands = new Map();

function loadCommands() {
  commands.clear();
  const files = fs.readdirSync(__dirname).filter(file => file.endsWith('.js') && file !== 'index.js');

  for (const file of files) {
    try {
      const commandPath = path.join(__dirname, file);
      delete require.cache[require.resolve(commandPath)];
      const command = require(commandPath);

      if (command.name && typeof command.execute === 'function') {
        commands.set(command.name.toLowerCase(), command);
        if (Array.isArray(command.aliases)) {
          for (const alias of command.aliases) {
            commands.set(alias.toLowerCase(), command);
          }
        }
      }
    } catch (err) {
      logger.error(`Lỗi tải lệnh từ file ${file}:`, err);
    }
  }

  logger.info(`Đã tải thành công ${commands.size} tên lệnh (bao gồm tên rút gọn): [${Array.from(commands.keys()).join(', ')}]`);
  return commands;
}

module.exports = {
  commands,
  loadCommands,
};
