
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const checkRole = require('../middleware/checkRole');

router.get('/archive', checkRole('super-admin'), async (req, res) => {
  try {
    const dir = path.join(__dirname, '../public/reports');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
    res.status(200).json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list audit files' });
  }
});

module.exports = router;
