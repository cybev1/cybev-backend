
const express = require('express');
const router = express.Router();
const { register, login, checkSession } = require('../controllers/auth.controller');
const authenticateToken = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.get('/check-session', authenticateToken, checkSession);

module.exports = router;
