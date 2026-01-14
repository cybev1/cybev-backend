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

// ========================================
// EMAIL DIAGNOSTIC ENDPOINTS
// ========================================

// Check email service status (public - for debugging)
router.get('/email-status', async (req, res) => {
  try {
    let emailService;
    try {
      emailService = require('../utils/email.service');
    } catch (e) {
      return res.json({
        ok: false,
        message: 'Email service module not loaded',
        error: e.message
      });
    }

    const status = emailService.getEmailStatus ? emailService.getEmailStatus() : { error: 'getEmailStatus not available' };
    
    res.json({
      ok: true,
      emailStatus: status,
      environment: {
        EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'not set (defaults to brevo if BREVO_API_KEY exists)',
        BREVO_API_KEY: process.env.BREVO_API_KEY ? '✅ Set (' + process.env.BREVO_API_KEY.substring(0, 8) + '...)' : '❌ Missing',
        BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || 'not set',
        RESEND_API_KEY: process.env.RESEND_API_KEY ? '✅ Set' : '❌ Missing',
        SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? '✅ Set' : '❌ Missing',
        SMTP_HOST: process.env.SMTP_HOST || 'not set',
        FROM_EMAIL: process.env.FROM_EMAIL || 'not set',
        FRONTEND_URL: process.env.FRONTEND_URL || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Test email sending (admin only)
router.post('/test-email', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user?.isAdmin) {
      return res.status(403).json({ ok: false, message: 'Admin access required' });
    }

    const { to } = req.body;
    const testEmail = to || user.email;

    let sendEmail;
    try {
      sendEmail = require('../utils/sendEmail');
    } catch (e) {
      return res.json({ ok: false, error: 'sendEmail module not loaded: ' + e.message });
    }

    console.log('🧪 ========== EMAIL TEST ==========');
    console.log('🧪 Testing email to:', testEmail);
    console.log('🧪 EMAIL_PROVIDER:', process.env.EMAIL_PROVIDER || 'not set');
    console.log('🧪 BREVO_API_KEY:', process.env.BREVO_API_KEY ? 'SET' : 'NOT SET');

    const result = await sendEmail.sendEmail({
      to: testEmail,
      subject: '🧪 CYBEV Email Test - ' + new Date().toISOString(),
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8B5CF6;">Email Test Successful! 🎉</h1>
          <p>This is a test email from CYBEV.</p>
          <p>If you received this, email delivery is working correctly.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            Sent at: ${new Date().toISOString()}<br>
            Provider: ${process.env.EMAIL_PROVIDER || 'auto'}<br>
            From: ${process.env.FROM_EMAIL || process.env.BREVO_SENDER_EMAIL || 'noreply@cybev.io'}
          </p>
        </div>
      `
    });

    console.log('🧪 Test email result:', JSON.stringify(result));
    console.log('🧪 ========== END TEST ==========');

    res.json({
      ok: result.success,
      result,
      sentTo: testEmail,
      provider: process.env.EMAIL_PROVIDER || 'auto'
    });
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
});

// Manually trigger verification email resend (admin can resend for any user)
router.post('/admin-resend-verification', verifyToken, async (req, res) => {
  try {
    const adminUser = await User.findById(req.user.id);
    if (!adminUser?.isAdmin) {
      return res.status(403).json({ ok: false, message: 'Admin access required' });
    }

    const { userId, email } = req.body;
    
    let targetUser;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email });
    } else {
      return res.status(400).json({ ok: false, message: 'userId or email required' });
    }

    if (!targetUser) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    if (targetUser.isEmailVerified) {
      return res.json({ ok: true, message: 'User already verified', alreadyVerified: true });
    }

    // Generate new token
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

    targetUser.emailVerificationToken = verificationTokenHash;
    targetUser.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await targetUser.save();

    // Send email
    const sendEmail = require('../utils/sendEmail');
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/verify-email?token=${verificationToken}`;

    const result = await sendEmail.sendEmail({
      to: targetUser.email,
      subject: 'CYBEV - Verify Your Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8B5CF6;">Verify Your Email</h1>
          <p>Hi ${targetUser.name},</p>
          <p>Please click the button below to verify your email address:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold;">
              Verify Email
            </a>
          </div>
          <p>Or copy: ${verificationUrl}</p>
        </div>
      `
    });

    res.json({
      ok: result.success,
      message: result.success ? 'Verification email sent' : 'Failed to send email',
      result,
      user: { email: targetUser.email, name: targetUser.name }
    });
  } catch (error) {
    console.error('Admin resend error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ========================================
// AUTHENTICATION ROUTES
// ========================================

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
