const express = require('express');
const router = express.Router();
const { getPostAnalytics } = require('../controllers/analytics.controller');

router.get('/analytics/post/:postId', getPostAnalytics);

module.exports = router;