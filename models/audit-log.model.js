
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true }, // e.g., "deactivate_user", "promote_user"
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  target: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  metadata: Object,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
