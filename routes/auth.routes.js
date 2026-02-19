// ============================================
// FILE: routes/auth.routes.js
// Authentication Routes - COMPLETE WITH GOOGLE OAUTH
// VERSION: 8.0 - Added Google OAuth + Facebook OAuth
// FIXES: Google OAuth 404, Profile update during onboarding
// ============================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const authController = require('../controllers/auth.controller');
const verifyToken = require('../middleware/verifyToken');
const requireEmailVerification = require('../middleware/requireEmailVerification');
const User = require('../models/user.model');

// ==========================================
// CONFIGURATION
// ==========================================

const JWT_SECRET = process.env.JWT_SECRET || 'cybev-secret-key';
const JWT_EXPIRES = '30d';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cybev.io';
const API_URL = process.env.API_URL || 'https://api.cybev.io';

// Google OAuth Config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = `${API_URL}/api/auth/google/callback`;

// Facebook OAuth Config
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = `${API_URL}/api/auth/facebook/callback`;

// Handle OPTIONS preflight for all routes
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email,
      role: user.role || 'user'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
};

// Generate unique username from name/email
const generateUsername = async (name, email) => {
  let baseUsername = name 
    ? name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15)
    : email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (!baseUsername) baseUsername = 'user';
  
  let username = baseUsername;
  let counter = 1;
  
  while (await User.findOne({ username })) {
    username = `${baseUsername}${counter}`;
    counter++;
  }
  
  return username;
};

// Redirect with token (for OAuth callback)
const redirectWithAuth = (res, user, isNewUser = false) => {
  const token = generateToken(user);
  const redirectUrl = new URL(`${FRONTEND_URL}/auth/oauth-callback`);
  redirectUrl.searchParams.set('token', token);
  redirectUrl.searchParams.set('new', isNewUser ? '1' : '0');
  console.log('✅ OAuth redirect to:', redirectUrl.toString());
  res.redirect(redirectUrl.toString());
};

// Redirect with error
const redirectWithError = (res, error, message) => {
  const redirectUrl = new URL(`${FRONTEND_URL}/auth/login`);
  redirectUrl.searchParams.set('error', error);
  redirectUrl.searchParams.set('message', encodeURIComponent(message));
  console.log('❌ OAuth error redirect:', message);
  res.redirect(redirectUrl.toString());
};

// ==========================================
// GOOGLE OAUTH ROUTES
// ==========================================

// Step 1: Redirect to Google
router.get('/google', (req, res) => {
  console.log('🔵 Google OAuth initiated');
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('❌ Google OAuth not configured');
    return res.status(503).json({
      ok: false,
      error: 'Google authentication not configured',
      message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables'
    });
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('🔵 Redirecting to Google:', authUrl.toString());
  res.redirect(authUrl.toString());
});

// Step 2: Google Callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    console.log('🔵 Google callback received');

    if (error) {
      console.error('Google OAuth error:', error);
      return redirectWithError(res, 'google_error', 'Google authentication was cancelled');
    }

    if (!code) {
      return redirectWithError(res, 'no_code', 'No authorization code received');
    }

    // Exchange code for tokens
    console.log('🔵 Exchanging code for tokens...');
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const { access_token, id_token } = tokenResponse.data;

    // Get user info
    console.log('🔵 Fetching user info from Google...');
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const googleProfile = userInfoResponse.data;
    console.log('📧 Google profile:', googleProfile.email);

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { 'oauthProfile.google.id': googleProfile.id },
        { email: googleProfile.email }
      ]
    });

    let isNewUser = false;

    if (user) {
      // Link Google to existing account if not already linked
      if (!user.oauthProfile) user.oauthProfile = {};
      if (!user.oauthProfile.google?.id) {
        user.oauthProfile.google = {
          id: googleProfile.id,
          email: googleProfile.email,
          name: googleProfile.name,
          picture: googleProfile.picture
        };
      }
      
      // Update avatar if not set
      if (!user.avatar && googleProfile.picture) {
        user.avatar = googleProfile.picture;
      }
      
      user.lastLogin = new Date();
      user.isEmailVerified = true; // Google verified the email
      
      // Add google to linked providers if not present
      if (!user.linkedProviders) user.linkedProviders = [];
      if (!user.linkedProviders.includes('google')) {
        user.linkedProviders.push('google');
      }
      
      await user.save();
      console.log('✅ Existing user logged in via Google:', user.email);
    } else {
      // Create new user
      const username = await generateUsername(googleProfile.name, googleProfile.email);
      
      user = new User({
        name: googleProfile.name,
        email: googleProfile.email,
        username,
        avatar: googleProfile.picture,
        oauthProvider: 'google',
        oauthId: googleProfile.id,
        oauthProfile: {
          google: {
            id: googleProfile.id,
            email: googleProfile.email,
            name: googleProfile.name,
            picture: googleProfile.picture
          }
        },
        linkedProviders: ['google'],
        isEmailVerified: true,
        lastLogin: new Date()
      });
      
      await user.save();
      isNewUser = true;
      console.log('✅ New user created via Google:', user.email);
    }

    redirectWithAuth(res, user, isNewUser);
  } catch (error) {
    console.error('❌ Google OAuth callback error:', error.response?.data || error.message);
    redirectWithError(res, 'callback_error', 'Authentication failed. Please try again.');
  }
});

// ==========================================
// FACEBOOK OAUTH ROUTES
// ==========================================

// Step 1: Redirect to Facebook
router.get('/facebook', (req, res) => {
  console.log('🔵 Facebook OAuth initiated');
  
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    console.error('❌ Facebook OAuth not configured');
    return res.status(503).json({
      ok: false,
      error: 'Facebook authentication not configured',
      message: 'Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET environment variables'
    });
  }

  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  authUrl.searchParams.set('redirect_uri', FACEBOOK_REDIRECT_URI);
  authUrl.searchParams.set('scope', 'email,public_profile');
  authUrl.searchParams.set('response_type', 'code');

  res.redirect(authUrl.toString());
});

// Step 2: Facebook Callback
router.get('/facebook/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;

    if (error) {
      console.error('Facebook OAuth error:', error, error_description);
      return redirectWithError(res, 'facebook_error', error_description || 'Facebook authentication was cancelled');
    }

    if (!code) {
      return redirectWithError(res, 'no_code', 'No authorization code received');
    }

    // Exchange code for access token
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
        code
      }
    });

    const accessToken = tokenResponse.data.access_token;

    // Get user info
    const profileResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
      params: {
        access_token: accessToken,
        fields: 'id,name,email,picture.width(200).height(200)'
      }
    });

    const fbProfile = profileResponse.data;
    console.log('📘 Facebook profile:', fbProfile.email || fbProfile.id);

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { 'oauthProfile.facebook.id': fbProfile.id },
        ...(fbProfile.email ? [{ email: fbProfile.email }] : [])
      ]
    });

    let isNewUser = false;

    if (user) {
      // Link Facebook to existing account
      if (!user.oauthProfile) user.oauthProfile = {};
      if (!user.oauthProfile.facebook?.id) {
        user.oauthProfile.facebook = {
          id: fbProfile.id,
          email: fbProfile.email,
          name: fbProfile.name,
          picture: fbProfile.picture?.data?.url
        };
      }
      
      if (!user.avatar && fbProfile.picture?.data?.url) {
        user.avatar = fbProfile.picture.data.url;
      }
      
      user.lastLogin = new Date();
      if (fbProfile.email) user.isEmailVerified = true;
      
      if (!user.linkedProviders) user.linkedProviders = [];
      if (!user.linkedProviders.includes('facebook')) {
        user.linkedProviders.push('facebook');
      }
      
      await user.save();
      console.log('✅ Existing user logged in via Facebook:', user.email || fbProfile.id);
    } else {
      // Create new user
      const username = await generateUsername(fbProfile.name, fbProfile.email || `fb${fbProfile.id}`);
      
      user = new User({
        name: fbProfile.name,
        email: fbProfile.email || `${fbProfile.id}@facebook.placeholder`,
        username,
        avatar: fbProfile.picture?.data?.url,
        oauthProvider: 'facebook',
        oauthId: fbProfile.id,
        oauthProfile: {
          facebook: {
            id: fbProfile.id,
            email: fbProfile.email,
            name: fbProfile.name,
            picture: fbProfile.picture?.data?.url
          }
        },
        linkedProviders: ['facebook'],
        isEmailVerified: !!fbProfile.email,
        lastLogin: new Date()
      });
      
      await user.save();
      isNewUser = true;
      console.log('✅ New user created via Facebook:', user.email || fbProfile.id);
    }

    redirectWithAuth(res, user, isNewUser);
  } catch (error) {
    console.error('❌ Facebook OAuth callback error:', error.response?.data || error.message);
    redirectWithError(res, 'callback_error', 'Authentication failed. Please try again.');
  }
});

// ==========================================
// OAUTH PROVIDERS STATUS
// ==========================================

router.get('/providers/status', (req, res) => {
  res.json({
    ok: true,
    providers: {
      google: {
        enabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
        configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
      },
      facebook: {
        enabled: !!(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET),
        configured: !!(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET)
      }
    }
  });
});

// ==========================================
// EMAIL DIAGNOSTIC ENDPOINTS
// ==========================================

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

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

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
        role: user.role || 'user',
        isAdmin: user.isAdmin || false,
        followerCount: user.followerCount || 0,
        followingCount: user.followingCount || 0,
        linkedProviders: user.linkedProviders || [],
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
      role: user.role || 'user',
      isAdmin: user.isAdmin || false
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

console.log('✅ Auth routes v8.0 loaded - Google OAuth + Facebook OAuth included');

module.exports = router;
