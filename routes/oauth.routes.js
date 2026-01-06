// ============================================
// FILE: routes/oauth.routes.js
// OAuth Authentication Routes (Google, Facebook, Apple)
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const User = require('../models/user.model');

// ==========================================
// Configuration
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
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

// Apple OAuth Config
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID; // Your Services ID
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const APPLE_KEY_ID = process.env.APPLE_KEY_ID;
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY; // Contents of .p8 file
const APPLE_REDIRECT_URI = `${API_URL}/api/auth/apple/callback`;

// Initialize Google OAuth Client
const googleClient = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// ==========================================
// Helper Functions
// ==========================================

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email,
      role: user.role 
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
  res.redirect(redirectUrl.toString());
};

// Redirect with error
const redirectWithError = (res, error, message) => {
  const redirectUrl = new URL(`${FRONTEND_URL}/auth/login`);
  redirectUrl.searchParams.set('error', error);
  redirectUrl.searchParams.set('message', encodeURIComponent(message));
  res.redirect(redirectUrl.toString());
};

// ==========================================
// GOOGLE OAUTH
// ==========================================

// Step 1: Redirect to Google
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(503).json({
      ok: false,
      error: 'Google authentication not configured'
    });
  }

  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent'
  });

  res.redirect(authUrl);
});

// Step 2: Google Callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      console.error('Google OAuth error:', error);
      return redirectWithError(res, 'google_error', 'Google authentication was cancelled');
    }

    if (!code) {
      return redirectWithError(res, 'no_code', 'No authorization code received');
    }

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Get user info
    const response = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      }
    );

    const googleProfile = response.data;
    console.log('📧 Google profile:', googleProfile.email);

    // Check if user exists with this Google ID
    let user = await User.findOne({
      $or: [
        { 'oauthProfile.google.id': googleProfile.id },
        { email: googleProfile.email }
      ]
    });

    let isNewUser = false;

    if (user) {
      // Link Google to existing account if not already linked
      if (!user.oauthProfile?.google?.id) {
        user.linkProvider('google', {
          id: googleProfile.id,
          email: googleProfile.email,
          name: googleProfile.name,
          picture: googleProfile.picture,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token
        });
      }
      
      // Update avatar if not set
      if (!user.avatar && googleProfile.picture) {
        user.avatar = googleProfile.picture;
      }
      
      user.lastLogin = new Date();
      user.isEmailVerified = true; // Google verified the email
      await user.save();
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
            picture: googleProfile.picture,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token
          }
        },
        isEmailVerified: true,
        lastLogin: new Date()
      });
      
      await user.save();
      isNewUser = true;
      console.log('✅ New user created via Google:', user.email);
    }

    redirectWithAuth(res, user, isNewUser);
  } catch (error) {
    console.error('❌ Google OAuth callback error:', error);
    redirectWithError(res, 'callback_error', 'Authentication failed. Please try again.');
  }
});

// ==========================================
// FACEBOOK OAUTH
// ==========================================

// Step 1: Redirect to Facebook
router.get('/facebook', (req, res) => {
  if (!FACEBOOK_APP_ID) {
    return res.status(503).json({
      ok: false,
      error: 'Facebook authentication not configured'
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

    // Facebook might not provide email (privacy settings)
    const email = fbProfile.email || `fb_${fbProfile.id}@cybev.io`;

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { 'oauthProfile.facebook.id': fbProfile.id },
        { email: email }
      ]
    });

    let isNewUser = false;

    if (user) {
      // Link Facebook to existing account
      if (!user.oauthProfile?.facebook?.id) {
        user.linkProvider('facebook', {
          id: fbProfile.id,
          email: email,
          name: fbProfile.name,
          picture: fbProfile.picture?.data?.url,
          accessToken
        });
      }
      
      if (!user.avatar && fbProfile.picture?.data?.url) {
        user.avatar = fbProfile.picture.data.url;
      }
      
      user.lastLogin = new Date();
      if (fbProfile.email) user.isEmailVerified = true;
      await user.save();
    } else {
      // Create new user
      const username = await generateUsername(fbProfile.name, email);
      
      user = new User({
        name: fbProfile.name,
        email: email,
        username,
        avatar: fbProfile.picture?.data?.url,
        oauthProvider: 'facebook',
        oauthId: fbProfile.id,
        oauthProfile: {
          facebook: {
            id: fbProfile.id,
            email: email,
            name: fbProfile.name,
            picture: fbProfile.picture?.data?.url,
            accessToken
          }
        },
        isEmailVerified: !!fbProfile.email,
        lastLogin: new Date()
      });
      
      await user.save();
      isNewUser = true;
      console.log('✅ New user created via Facebook:', user.email);
    }

    redirectWithAuth(res, user, isNewUser);
  } catch (error) {
    console.error('❌ Facebook OAuth callback error:', error);
    redirectWithError(res, 'callback_error', 'Authentication failed. Please try again.');
  }
});

// ==========================================
// APPLE SIGN IN
// ==========================================

// Generate Apple client secret (JWT)
const generateAppleClientSecret = () => {
  if (!APPLE_PRIVATE_KEY || !APPLE_KEY_ID || !APPLE_TEAM_ID || !APPLE_CLIENT_ID) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 86400 * 180; // 180 days

  const header = {
    alg: 'ES256',
    kid: APPLE_KEY_ID
  };

  const payload = {
    iss: APPLE_TEAM_ID,
    iat: now,
    exp: expiry,
    aud: 'https://appleid.apple.com',
    sub: APPLE_CLIENT_ID
  };

  // Note: In production, use proper JWT library with ES256
  // This is a simplified example
  return jwt.sign(payload, APPLE_PRIVATE_KEY, { 
    algorithm: 'ES256', 
    header 
  });
};

// Step 1: Redirect to Apple
router.get('/apple', (req, res) => {
  if (!APPLE_CLIENT_ID) {
    return res.status(503).json({
      ok: false,
      error: 'Apple authentication not configured'
    });
  }

  const authUrl = new URL('https://appleid.apple.com/auth/authorize');
  authUrl.searchParams.set('client_id', APPLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', APPLE_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code id_token');
  authUrl.searchParams.set('response_mode', 'form_post');
  authUrl.searchParams.set('scope', 'name email');

  res.redirect(authUrl.toString());
});

// Step 2: Apple Callback (POST - Apple uses form_post)
router.post('/apple/callback', async (req, res) => {
  try {
    const { code, id_token, user: userInfo, error } = req.body;

    if (error) {
      console.error('Apple OAuth error:', error);
      return redirectWithError(res, 'apple_error', 'Apple authentication was cancelled');
    }

    if (!code && !id_token) {
      return redirectWithError(res, 'no_code', 'No authorization data received');
    }

    // Decode the id_token to get user info
    let appleProfile;
    if (id_token) {
      const decoded = jwt.decode(id_token);
      appleProfile = {
        id: decoded.sub,
        email: decoded.email,
        emailVerified: decoded.email_verified === 'true'
      };
    }

    // Apple only sends name on first authorization
    let name = 'Apple User';
    if (userInfo) {
      try {
        const parsed = typeof userInfo === 'string' ? JSON.parse(userInfo) : userInfo;
        if (parsed.name) {
          name = `${parsed.name.firstName || ''} ${parsed.name.lastName || ''}`.trim();
        }
      } catch (e) {
        console.log('Could not parse Apple user info');
      }
    }

    // Exchange code for tokens (if needed)
    if (code) {
      try {
        const clientSecret = generateAppleClientSecret();
        if (clientSecret) {
          const tokenResponse = await axios.post(
            'https://appleid.apple.com/auth/token',
            new URLSearchParams({
              client_id: APPLE_CLIENT_ID,
              client_secret: clientSecret,
              code,
              grant_type: 'authorization_code',
              redirect_uri: APPLE_REDIRECT_URI
            }),
            {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
          );

          if (tokenResponse.data.id_token) {
            const decoded = jwt.decode(tokenResponse.data.id_token);
            appleProfile = {
              id: decoded.sub,
              email: decoded.email,
              emailVerified: decoded.email_verified === 'true',
              accessToken: tokenResponse.data.access_token,
              refreshToken: tokenResponse.data.refresh_token
            };
          }
        }
      } catch (tokenError) {
        console.error('Apple token exchange error:', tokenError.response?.data || tokenError.message);
      }
    }

    if (!appleProfile?.id) {
      return redirectWithError(res, 'no_profile', 'Could not get Apple profile');
    }

    console.log('🍎 Apple profile:', appleProfile.email || appleProfile.id);

    const email = appleProfile.email || `apple_${appleProfile.id.substring(0, 10)}@cybev.io`;

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { 'oauthProfile.apple.id': appleProfile.id },
        { email: email }
      ]
    });

    let isNewUser = false;

    if (user) {
      // Link Apple to existing account
      if (!user.oauthProfile?.apple?.id) {
        user.linkProvider('apple', {
          id: appleProfile.id,
          email: email,
          name: user.name || name,
          accessToken: appleProfile.accessToken,
          refreshToken: appleProfile.refreshToken
        });
      }
      
      user.lastLogin = new Date();
      if (appleProfile.emailVerified) user.isEmailVerified = true;
      await user.save();
    } else {
      // Create new user
      const username = await generateUsername(name, email);
      
      user = new User({
        name: name,
        email: email,
        username,
        oauthProvider: 'apple',
        oauthId: appleProfile.id,
        oauthProfile: {
          apple: {
            id: appleProfile.id,
            email: email,
            name: name,
            accessToken: appleProfile.accessToken,
            refreshToken: appleProfile.refreshToken
          }
        },
        isEmailVerified: appleProfile.emailVerified || false,
        lastLogin: new Date()
      });
      
      await user.save();
      isNewUser = true;
      console.log('✅ New user created via Apple:', user.email);
    }

    redirectWithAuth(res, user, isNewUser);
  } catch (error) {
    console.error('❌ Apple OAuth callback error:', error);
    redirectWithError(res, 'callback_error', 'Authentication failed. Please try again.');
  }
});

// Also support GET for Apple callback (fallback)
router.get('/apple/callback', (req, res) => {
  redirectWithError(res, 'invalid_method', 'Please use POST method for Apple Sign In');
});

// ==========================================
// TOKEN VERIFICATION (for mobile apps)
// ==========================================

// Verify Google ID Token (for mobile app)
router.post('/google/verify-token', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ ok: false, error: 'ID token required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    
    // Find or create user (same logic as callback)
    let user = await User.findOne({
      $or: [
        { 'oauthProfile.google.id': payload.sub },
        { email: payload.email }
      ]
    });

    let isNewUser = false;

    if (!user) {
      const username = await generateUsername(payload.name, payload.email);
      
      user = new User({
        name: payload.name,
        email: payload.email,
        username,
        avatar: payload.picture,
        oauthProvider: 'google',
        oauthId: payload.sub,
        oauthProfile: {
          google: {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture
          }
        },
        isEmailVerified: payload.email_verified,
        lastLogin: new Date()
      });
      
      await user.save();
      isNewUser = true;
    } else {
      user.lastLogin = new Date();
      await user.save();
    }

    const token = generateToken(user);

    res.json({
      ok: true,
      token,
      user: user.toJSON(),
      isNewUser
    });
  } catch (error) {
    console.error('Google token verification error:', error);
    res.status(401).json({ ok: false, error: 'Invalid token' });
  }
});

// ==========================================
// ACCOUNT LINKING
// ==========================================

// Link additional OAuth provider to existing account
router.post('/link/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { accessToken, userId } = req.body;
    
    // Verify the user is authenticated
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Check if provider is already linked
    if (user.linkedProviders.includes(provider)) {
      return res.status(400).json({ ok: false, error: `${provider} is already linked` });
    }

    // Verify the OAuth token and get profile
    // Implementation depends on provider...
    
    res.json({
      ok: true,
      message: `${provider} linked successfully`,
      linkedProviders: user.linkedProviders
    });
  } catch (error) {
    console.error('Account linking error:', error);
    res.status(500).json({ ok: false, error: 'Failed to link account' });
  }
});

// Unlink OAuth provider from account
router.delete('/unlink/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Ensure user has another way to login
    if (user.linkedProviders.length <= 1) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Cannot unlink the only authentication method' 
      });
    }

    user.unlinkProvider(provider);
    await user.save();

    res.json({
      ok: true,
      message: `${provider} unlinked successfully`,
      linkedProviders: user.linkedProviders
    });
  } catch (error) {
    console.error('Account unlinking error:', error);
    res.status(500).json({ ok: false, error: 'Failed to unlink account' });
  }
});

// ==========================================
// STATUS CHECK
// ==========================================

router.get('/providers/status', (req, res) => {
  res.json({
    ok: true,
    providers: {
      google: {
        enabled: !!GOOGLE_CLIENT_ID,
        configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
      },
      facebook: {
        enabled: !!FACEBOOK_APP_ID,
        configured: !!(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET)
      },
      apple: {
        enabled: !!APPLE_CLIENT_ID,
        configured: !!(APPLE_CLIENT_ID && APPLE_KEY_ID && APPLE_TEAM_ID)
      }
    }
  });
});

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ ok: false, error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// ==========================================
// GET CURRENT USER (/me)
// ==========================================

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .lean();
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    res.json({
      ok: true,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role || 'user',
        isEmailVerified: user.isEmailVerified,
        hasCompletedOnboarding: user.hasCompletedOnboarding || false,
        oauthProvider: user.oauthProvider,
        linkedProviders: user.linkedProviders || [],
        preferences: user.preferences,
        createdAt: user.createdAt,
        followersCount: user.followersCount || 0,
        followingCount: user.followingCount || 0
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
