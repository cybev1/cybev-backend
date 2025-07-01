const express = require('express');
const router = express.Router();
const { getUserInfo, updateUserProfile } = require('../controllers/user.controller');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/user/me', authMiddleware, getUserInfo);
router.put('/user/update', authMiddleware, updateUserProfile);

module.exports = router;