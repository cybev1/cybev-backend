
const express = require('express');
const router = express.Router();
const { getFollowing } = require('../controllers/follow.controller');

router.get('/users/following', getFollowing);

module.exports = router;
