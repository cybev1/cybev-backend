
const express = require('express');
const router = express.Router();
const AuditLog = require('../models/audit-log.model');
const checkRole = require('../middleware/checkRole');

router.get('/logs', checkRole('super-admin'), async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .populate('performedBy', 'email')
      .populate('target', 'email');
    res.status(200).json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load logs.' });
  }
});

module.exports = router;
