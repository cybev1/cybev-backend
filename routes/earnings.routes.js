// routes/earnings.routes.js
const express = require('express');
const router = express.Router();
const { getUserEarnings } = require('../controllers/earnings.controller');

router.get('/', getUserEarnings);

module.exports = router;
