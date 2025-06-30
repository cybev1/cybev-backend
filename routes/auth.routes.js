const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const verifyToken = require('../middleware/verifyToken');

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

router.get('/auth/me', verifyToken, async (req, res) => {
  try {
    const User = require('../models/user.model');
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;