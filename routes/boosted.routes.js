const express = require('express');
const router = express.Router();
const { getBoostedPosts } = require('../controllers/boosted.controller');

router.get('/posts/boosted', getBoostedPosts);

module.exports = router;