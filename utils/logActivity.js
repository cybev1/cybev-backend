
const fs = require('fs');
const path = require('path');

function logActivity(type, detail) {
  const logPath = path.join(__dirname, '../logs/admin-activity.log');
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${type}] ${detail}\n`;
  fs.appendFileSync(logPath, entry);
}

module.exports = logActivity;
