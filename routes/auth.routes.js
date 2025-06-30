const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/user.model');

router.post('/register', authController.register);  // ✅ /api/auth/register
router.post('/login', authController.login);        // ✅ /api/auth/login

router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/update-profile', verifyToken, async (req, res) => {
  try {
    const { name, referral } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, referral },
      { new: true, select: '-password' }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;