
const express = require('express');
const router = express.Router();
const { getAdminAnalytics } = require('../controllers/analytics.controller');

router.get('/admin/analytics', getAdminAnalytics);

module.exports = router;
