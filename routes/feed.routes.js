// routes/feed.routes.js
const express = require('express');
const router = express.Router();
const { getFeed } = require('../controllers/feed.controller');

// GET /api/posts/feed
router.get('/feed', getFeed);

module.exports = router;
