
const cron = require('node-cron');
const AuditLog = require('../models/audit-log.model');

async function cleanupOldAuditLogs() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  try {
    const result = await AuditLog.deleteMany({ timestamp: { $lt: cutoffDate } });
    console.log(`🧹 Cleanup complete: ${result.deletedCount} old audit logs removed.`);
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

// Schedule daily at 2:30am
cron.schedule('30 2 * * *', cleanupOldAuditLogs);
