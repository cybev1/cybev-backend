const express = require('express');
const router = express.Router();
const stakeController = require('../controllers/stake.controller');
const authenticate = require('../middleware/auth');

router.post('/stake', authenticate, stakeController.stakeTokens);
router.post('/unstake', authenticate, stakeController.unstakeTokens);
router.get('/stake/status', authenticate, stakeController.getStakeStatus);
router.get('/stake/history', authenticate, stakeController.getStakeHistory);

module.exports = router;