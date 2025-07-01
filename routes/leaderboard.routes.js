
const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboard.controller');

router.get('/leaderboard', leaderboardController.getTopEarners);

module.exports = router;
