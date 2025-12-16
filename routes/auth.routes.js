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

// ========== PUBLIC ROUTES (No auth required) ==========
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// ========== AUTHENTICATED ROUTES (Token required, NO email verification) ==========
// Profile endpoint - can access even without verification
router.get('/profile', verifyToken, async (req, res) => {
  try {
    console.log('📋 Fetching profile for user:', req.user.id);
    
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = {
      id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      hasCompletedOnboarding: user.hasCompletedOnboarding || false,
      onboardingData: user.onboardingData || null,
      avatar: user.avatar,
      bio: user.bio,
      isEmailVerified: user.isEmailVerified || false
    };

    console.log('✅ Profile data:', {
      id: profile.id,
      hasCompletedOnboarding: profile.hasCompletedOnboarding,
      hasOnboardingData: !!profile.onboardingData,
      isEmailVerified: profile.isEmailVerified
    });

    res.json(profile);
  } catch (error) {
    console.error('❌ Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// User basic info - no verification required
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ========== PROTECTED ROUTES (Token + Email Verification Required) ==========

// Complete Onboarding - REQUIRES EMAIL VERIFICATION
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

// Legacy onboarding endpoint (keep for backward compatibility)
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

module.exports = router;
