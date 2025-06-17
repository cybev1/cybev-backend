
const express = require('express');
const router = express.Router();
const { triggerWeeklyReport } = require('../controllers/report-manual.controller');

router.get('/trigger-report', triggerWeeklyReport);

module.exports = router;
