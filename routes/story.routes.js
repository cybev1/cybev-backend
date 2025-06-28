// routes/story.routes.js
const express = require('express');
const router = express.Router();
const { getStories } = require('../controllers/story.controller');

// GET /api/stories
router.get('/', getStories);

module.exports = router;
