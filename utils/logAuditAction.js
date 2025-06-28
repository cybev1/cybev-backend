
const AuditLog = require('../models/audit-log.model');

async function logAuditAction({ action, performedBy, target, metadata = {} }) {
  try {
    await AuditLog.create({ action, performedBy, target, metadata });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

module.exports = logAuditAction;
