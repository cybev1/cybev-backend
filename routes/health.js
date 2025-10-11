// backend/routes/health.js
const express = require('express');
const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

module.exports = router;
