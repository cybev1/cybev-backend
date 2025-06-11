
import fs from 'fs';
import path from 'path';

export async function logAdminActivity(action, meta = {}) {
  const logPath = path.resolve('./public/admin-logs.json');
  const log = {
    timestamp: new Date().toISOString(),
    action,
    meta,
  };

  let data = [];
  if (fs.existsSync(logPath)) {
    const raw = fs.readFileSync(logPath);
    data = JSON.parse(raw);
  }

  data.unshift(log); // latest first
  fs.writeFileSync(logPath, JSON.stringify(data, null, 2));
}
