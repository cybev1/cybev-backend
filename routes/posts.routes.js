const express = require('express');
const router = express.Router();
const { getMyPosts } = require('../controllers/posts.controller');

// GET /api/posts/my-posts
router.get('/my-posts', getMyPosts);

module.exports = router;
