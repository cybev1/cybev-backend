
const express = require('express');
const router = express.Router();
const { getGeoAnalytics } = require('../controllers/geo-analytics.controller');

router.get('/geo', getGeoAnalytics);

module.exports = router;
