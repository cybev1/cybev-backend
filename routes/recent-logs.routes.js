
const express = require('express');
const router = express.Router();
const AuditLog = require('../models/audit-log.model');

router.get('/recent', async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(5)
      .populate('performedBy', 'email')
      .populate('target', 'email');

    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recent logs' });
  }
});

module.exports = router;
