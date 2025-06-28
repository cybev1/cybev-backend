
const express = require('express');
const router = express.Router();
const { downloadAnalyticsReport } = require('../controllers/analytics-pdf.controller');

router.get('/report', downloadAnalyticsReport);

module.exports = router;
