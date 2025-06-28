
const express = require('express');
const router = express.Router();
const { getDeviceAnalytics } = require('../controllers/device-analytics.controller');

router.get('/devices', getDeviceAnalytics);

module.exports = router;
