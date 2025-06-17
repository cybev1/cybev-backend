
const express = require('express');
const router = express.Router();
const { getEarningsBreakdown } = require('../controllers/earnings-analytics.controller');

router.get('/earnings-breakdown', getEarningsBreakdown);

module.exports = router;
