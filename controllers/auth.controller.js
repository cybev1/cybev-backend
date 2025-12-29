const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// Get client IP address
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         'unknown';
};

// Check if IP is new/suspicious
const isNewIP = (user, currentIP) => {
  if (!user.lastKnownIP) return true;
  if (user.lastKnownIP === currentIP) return false;
  
  // Check if IP is in trusted list
  const isTrusted = user.trustedIPs?.some(trusted => trusted.ip === currentIP);
  return !isTrusted;
};

// ========== REGISTER ==========
exports.register = async (req, res) => {
  try {
    const { name, email, username, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        ok: false,
        message: 'Email and password are required' 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ 
          success: false,
          ok: false,
          message: 'Email already registered' 
        });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ 
          success: false,
          ok: false,
          message: 'Username already taken' 
        });
      }
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    // Get IP for security tracking
    const clientIP = getClientIP(req);

    // Create user - pre-save hook will hash the password
    const user = await User.create({
      name: name || username || email.split('@')[0],
      email,
      username: username || email.split('@')[0],
      password: password, // Pre-save hook will hash this
      emailVerificationToken: verificationTokenHash,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      lastKnownIP: clientIP,
      trustedIPs: [{ ip: clientIP }],
      loginHistory: [{
        ip: clientIP,
        userAgent: req.headers['user-agent'],
        timestamp: new Date()
      }]
    });

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'cybev-secret-key',
      { expiresIn: '30d' }
    );

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/verify-email?token=${verificationToken}`;
    
    try {
      await sendEmail({
        to: user.email,
        subject: 'Welcome to CYBEV - Verify Your Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #8B5CF6;">Welcome to CYBEV! 🎉</h1>
            <p>Hi ${user.name},</p>
            <p>Thank you for joining CYBEV! Please verify your email address to unlock all features.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            <p>Or copy this link: <a href="${verificationUrl}">${verificationUrl}</a></p>
            <p>This link expires in 24 hours.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">
              If you didn't create this account, please ignore this email.
            </p>
          </div>
        `
      });
      console.log('✅ Verification email sent to:', user.email);
    } catch (emailError) {
      console.error('⚠️ Failed to send verification email:', emailError);
      // Don't fail registration if email fails
    }

    console.log('✅ User registered:', user.email, 'from IP:', clientIP);

    res.status(201).json({
      success: true,
      ok: true,
      message: 'Registration successful! Please check your email to verify your account.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        isEmailVerified: user.isEmailVerified,
        role: user.role || 'user',
        isAdmin: user.isAdmin || false
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      success: false,
      ok: false,
      message: error.message || 'Registration failed' 
    });
  }
};

// ========== VERIFY EMAIL ==========
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ 
        success: false,
        ok: false,
        message: 'Verification token is required' 
      });
    }

    // Hash the token
    const verificationTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      emailVerificationToken: verificationTokenHash,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false,
        ok: false,
        message: 'Invalid or expired verification token' 
      });
    }

    // Verify email
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    console.log('✅ Email verified for:', user.email);

    res.json({ 
      success: true,
      ok: true,
      message: 'Email verified successfully! You can now access all features.' 
    });

  } catch (error) {
    console.error('❌ Email verification error:', error);
    res.status(500).json({ 
      success: false,
      ok: false,
      message: 'Failed to verify email' 
    });
  }
};

// ========== RESEND VERIFICATION EMAIL ==========
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.json({ 
        success: true,
        ok: true,
        message: 'If that email exists, a verification link has been sent' 
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ 
        success: false,
        ok: false,
        message: 'Email is already verified' 
      });
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    user.emailVerificationToken = verificationTokenHash;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    // Send email
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/verify-email?token=${verificationToken}`;
    
    await sendEmail({
      to: user.email,
      subject: 'CYBEV - Verify Your Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8B5CF6;">Verify Your Email</h1>
          <p>Hi ${user.name},</p>
          <p>Click the button below to verify your email address:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
              Verify Email
            </a>
          </div>
          <p>This link expires in 24 hours.</p>
        </div>
      `
    });

    res.json({ 
      success: true,
      ok: true,
      message: 'Verification email sent' 
    });

  } catch (error) {
    console.error('❌ Resend verification error:', error);
    res.status(500).json({ 
      success: false,
      ok: false,
      message: 'Failed to send verification email' 
    });
  }
};

// ========== LOGIN ==========
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        ok: false,
        message: 'Email and password are required' 
      });
    }

    // Find user with password
    const user = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { username: email.toLowerCase() }
      ]
    }).select('+password');

    if (!user) {
      return res.status(401).json({ 
        success: false,
        ok: false,
        message: 'Invalid email or password' 
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({ 
        success: false,
        ok: false,
        message: 'Your account has been suspended. Please contact support.' 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      // Track suspicious activity
      user.suspiciousLoginAttempts = (user.suspiciousLoginAttempts || 0) + 1;
      await user.save();
      
      return res.status(401).json({ 
        success: false,
        ok: false,
        message: 'Invalid email or password' 
      });
    }

    // Check if email is verified (warn but don't block)
    if (!user.isEmailVerified) {
      console.log('⚠️ Login from unverified email:', user.email);
      // Continue with login, but frontend should show reminder
    }

    // Handle onboarding for users who haven't completed it
    if (!user.hasCompletedOnboarding) {
      // Check if onboarding data exists in different format
      if (user.onboardingData && user.onboardingData.role) {
        user.hasCompletedOnboarding = true;
        await user.save();
      } else if (user.contentType) {
        // Legacy format - mark as completed
        user.hasCompletedOnboarding = true;
        if (!user.onboardingData) {
          user.onboardingData = {
            role: 'Creator',
            goals: ['create'],
            experience: 'intermediate',
            completedAt: new Date()
          };
        }
      }
    }

    // Get client IP
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'];

    // Check if this is a new/suspicious IP
    const newIPDetected = isNewIP(user, clientIP);

    if (newIPDetected) {
      console.log('⚠️ New IP detected for:', user.email, '- IP:', clientIP);
      
      // Send security alert email
      try {
        await sendEmail({
          to: user.email,
          subject: '🔐 CYBEV - New Login Detected',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #F59E0B;">New Login Detected</h1>
              <p>Hi ${user.name},</p>
              <p>We detected a login to your CYBEV account from a new location:</p>
              <div style="background: #FEF3C7; padding: 15px; border-radius: 10px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>IP Address:</strong> ${clientIP}</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p style="margin: 5px 0;"><strong>Device:</strong> ${userAgent}</p>
              </div>
              <p>If this was you, you can ignore this email. Your IP has been added to trusted devices.</p>
              <p>If this wasn't you, please secure your account immediately:</p>
              <ul>
                <li>Change your password</li>
                <li>Review your account activity</li>
                <li>Enable two-factor authentication (coming soon)</li>
              </ul>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px;">
                This is an automated security notification from CYBEV.
              </p>
            </div>
          `
        });
        console.log('✅ Security alert sent to:', user.email);
      } catch (emailError) {
        console.error('⚠️ Failed to send security alert:', emailError);
      }

      // Add IP to trusted list
      if (!user.trustedIPs) user.trustedIPs = [];
      user.trustedIPs.push({ ip: clientIP });
    }

    // Update login info
    user.lastLogin = new Date();
    user.lastKnownIP = clientIP;
    user.suspiciousLoginAttempts = 0;

    // Add to login history
    if (!user.loginHistory) user.loginHistory = [];
    user.loginHistory.push({
      ip: clientIP,
      userAgent: userAgent,
      timestamp: new Date()
    });

    // Keep only last 10 login records
    if (user.loginHistory.length > 10) {
      user.loginHistory = user.loginHistory.slice(-10);
    }

    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'cybev-secret-key',
      { expiresIn: '30d' }
    );

    console.log('✅ Login successful:', user.email, 'from IP:', clientIP, '| role:', user.role, '| isAdmin:', user.isAdmin);

    // =====================================================
    // IMPORTANT: Include role and isAdmin in the response!
    // =====================================================
    res.json({
      success: true,
      ok: true,  // For frontend compatibility
      message: 'Login successful',
      token,
      newIPDetected, // Let frontend know about new IP
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        avatar: user.avatar || '',
        isEmailVerified: user.isEmailVerified || false,
        hasCompletedOnboarding: user.hasCompletedOnboarding || false,
        onboardingData: user.onboardingData,
        role: user.role || 'user',           // CRITICAL: Include role for admin check
        isAdmin: user.isAdmin || false       // CRITICAL: Include isAdmin for admin check
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false,
      ok: false,
      message: 'Login failed. Please try again.' 
    });
  }
};

// ========== FORGOT PASSWORD ==========
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        ok: false,
        message: 'Email is required' 
      });
    }

    const user = await User.findOne({ 
      email: email.toLowerCase() 
    });

    if (!user) {
      return res.json({ 
        success: true,
        ok: true,
        message: 'If that email exists, a password reset link has been sent' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/reset-password?token=${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: 'CYBEV - Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8B5CF6;">Reset Your Password</h1>
          <p>Hi ${user.name},</p>
          <p>You requested to reset your password. Click the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy this link: <a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link expires in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    });

    console.log('🔑 Password reset requested for:', user.email);

    res.json({ 
      success: true,
      ok: true,
      message: 'If that email exists, a password reset link has been sent',
      resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined
    });

  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ 
      success: false,
      ok: false,
      message: 'Failed to process request' 
    });
  }
};

// ========== RESET PASSWORD ==========
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ 
        success: false,
        ok: false,
        message: 'Token and new password are required' 
      });
    }

    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false,
        ok: false,
        message: 'Invalid or expired reset token' 
      });
    }

    // Update password - pre-save hook will hash it
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Send confirmation email
    try {
      await sendEmail({
        to: user.email,
        subject: 'CYBEV - Password Changed',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #10B981;">Password Changed Successfully</h1>
            <p>Hi ${user.name},</p>
            <p>Your password has been changed successfully.</p>
            <p>If you didn't make this change, please contact support immediately.</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('⚠️ Failed to send confirmation email:', emailError);
    }

    console.log('✅ Password reset successful for:', user.email);

    res.json({ 
      success: true,
      ok: true,
      message: 'Password reset successful. You can now login with your new password.' 
    });

  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      success: false,
      ok: false,
      message: 'Failed to reset password' 
    });
  }
};

module.exports = exports;
