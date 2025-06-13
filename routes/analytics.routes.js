const express = require('express');
const router = express.Router();
const { getPostAnalytics, getPostsSummary } = require('../controllers/analytics.controller');

// GET /api/analytics/post/:postId
router.get('/post/:postId', getPostAnalytics);

// GET /api/analytics/posts-summary
router.get('/posts-summary', getPostsSummary);

module.exports = router;
