const User = require('../models/user.model');

/**
 * Middleware to require email verification
 * Blocks access to protected routes until email is verified
 */
module.exports = async function requireEmailVerification(req, res, next) {
  try {
    // req.user should already be set by verifyToken middleware
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        requiresAuth: true
      });
    }

    // Fetch user from database to get current verification status
    const user = await User.findById(req.user.id).select('isEmailVerified email name');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      console.log(`⚠️ Unverified email access attempt: ${user.email}`);
      
      return res.status(403).json({
        success: false,
        error: 'Please verify your email address to access this feature',
        requiresVerification: true,
        email: user.email,
        message: 'Please check your email for a verification link. You can also request a new one from the settings page.'
      });
    }

    // Email is verified, continue
    console.log(`✅ Email verified access: ${user.email}`);
    next();

  } catch (error) {
    console.error('❌ Email verification middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify email status'
    });
  }
};
