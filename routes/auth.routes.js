const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/user.model');

// Authentication
router.post('/register', authController.register);  // ✅ /api/auth/register
router.post('/login', authController.login);        // ✅ /api/auth/login

// User Profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ✨ NEW: Profile endpoint (used by login to check onboarding status)
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      hasCompletedOnboarding: user.hasCompletedOnboarding || false,
      contentType: user.contentType || null
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update Profile
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

// ✨ NEW: Onboarding completion endpoint
router.post('/onboarding', verifyToken, async (req, res) => {
  try {
    const { contentType } = req.body;
    
    // Validate contentType
    if (!['blog', 'social', 'both'].includes(contentType)) {
      return res.status(400).json({ 
        error: 'Invalid content type. Must be: blog, social, or both' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user preferences
    user.contentType = contentType;
    user.hasCompletedOnboarding = true;
    await user.save();

    res.json({ 
      success: true,
      message: 'Onboarding completed',
      user: {
        id: user._id,
        contentType: user.contentType,
        hasCompletedOnboarding: user.hasCompletedOnboarding
      }
    });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

module.exports = router;
