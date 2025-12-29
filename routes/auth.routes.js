const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const verifyToken = require('../middleware/verifyToken');
const requireEmailVerification = require('../middleware/requireEmailVerification');
const User = require('../models/user.model');

// Handle OPTIONS preflight for all routes
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Authentication routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// User Profile - Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    // Return user with role and isAdmin fields explicitly included
    res.json({
      ok: true,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        avatar: user.avatar || '',
        bio: user.bio || '',
        isEmailVerified: user.isEmailVerified || false,
        hasCompletedOnboarding: user.hasCompletedOnboarding || false,
        onboardingData: user.onboardingData,
        role: user.role || 'user',           // IMPORTANT: Include role
        isAdmin: user.isAdmin || false,       // IMPORTANT: Include isAdmin
        followerCount: user.followerCount || 0,
        followingCount: user.followingCount || 0,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch user' });
  }
});

// Profile endpoint (used by login to check onboarding status)
router.get('/profile', verifyToken, async (req, res) => {
  try {
    console.log('📋 Fetching profile for user:', req.user.id);
    
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      hasCompletedOnboarding: user.hasCompletedOnboarding || false,
      onboardingData: user.onboardingData || null,
      avatar: user.avatar || '',
      bio: user.bio || '',
      isEmailVerified: user.isEmailVerified || false,
      role: user.role || 'user',           // IMPORTANT: Include role
      isAdmin: user.isAdmin || false       // IMPORTANT: Include isAdmin
    };

    console.log('✅ Profile data:', {
      id: profile.id,
      hasCompletedOnboarding: profile.hasCompletedOnboarding,
      hasOnboardingData: !!profile.onboardingData,
      role: profile.role,
      isAdmin: profile.isAdmin
    });

    res.json(profile);
  } catch (error) {
    console.error('❌ Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update Profile - REQUIRES EMAIL VERIFICATION
router.post('/update-profile', verifyToken, requireEmailVerification, async (req, res) => {
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

// Complete Onboarding endpoint - REQUIRES EMAIL VERIFICATION
router.put('/complete-onboarding', verifyToken, requireEmailVerification, async (req, res) => {
  try {
    const { fullName, role, goals, experience } = req.body;
    
    console.log('💾 Saving onboarding data for user:', req.user.id);
    console.log('📋 Onboarding data:', { fullName, role, goals, experience });
    
    // Validation
    if (!role || !goals || !experience) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        error: 'Missing required fields: role, goals, experience' 
      });
    }
    
    // Find user
    const user = await User.findById(req.user.id);
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update onboarding data
    user.hasCompletedOnboarding = true;
    user.onboardingData = {
      fullName: fullName || user.name,
      role,
      goals,
      experience,
      completedAt: new Date()
    };
    
    await user.save();
    
    console.log('✅ Onboarding completed successfully for:', user.email);
    
    res.json({
      success: true,
      message: 'Onboarding completed successfully',
      user: {
        id: user._id,
        hasCompletedOnboarding: user.hasCompletedOnboarding,
        onboardingData: user.onboardingData
      }
    });
    
  } catch (error) {
    console.error('❌ Onboarding save error:', error);
    res.status(500).json({ 
      error: 'Failed to save onboarding data',
      message: error.message 
    });
  }
});

// Legacy onboarding endpoint (keep for backward compatibility) - REQUIRES EMAIL VERIFICATION
router.post('/onboarding', verifyToken, requireEmailVerification, async (req, res) => {
  try {
    const { contentType } = req.body;
    
    if (!['blog', 'social', 'both'].includes(contentType)) {
      return res.status(400).json({ 
        error: 'Invalid content type. Must be: blog, social, or both' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

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

// Search users
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 20, skip = 0 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ ok: true, users: [], total: 0 });
    }
    
    const query = {
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    };
    
    const users = await User.find(query)
      .select('username name avatar bio followerCount followingCount')
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ followerCount: -1 });
    
    const total = await User.countDocuments(query);
    
    res.json({
      ok: true,
      success: true,
      users,
      pagination: { total, limit: parseInt(limit), skip: parseInt(skip) }
    });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ ok: false, error: 'Search failed' });
  }
});

// Get user profile by username (PUBLIC)
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username })
      .select('username name avatar bio followerCount followingCount createdAt');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    res.json({ ok: true, success: true, user });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch user' });
  }
});

module.exports = router;
