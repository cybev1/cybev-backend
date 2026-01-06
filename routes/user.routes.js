// ============================================
// FILE: routes/user.routes.js
// User Routes with Preferences & Profile Updates
// VERSION: 5.0 - Phase 3 Update
// ============================================

const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const verifyToken = require('../middleware/verifyToken');
const multer = require('multer');

// ==========================================
// PROFILE ENDPOINTS
// ==========================================

// Get current user's full profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        bio: user.bio || '',
        avatar: user.avatar || '',
        isEmailVerified: user.isEmailVerified,
        hasCompletedOnboarding: user.hasCompletedOnboarding,
        preferences: user.preferences,
        linkedProviders: user.linkedProviders || ['email'],
        socialLinks: user.socialLinks,
        followerCount: user.followerCount || 0,
        followingCount: user.followingCount || 0,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch profile' });
  }
});

// Update profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, username, bio, socialLinks } = req.body;
    const userId = req.user.id;

    // Check if username is taken (if being changed)
    if (username) {
      const existingUser = await User.findOne({ 
        username: username.toLowerCase(),
        _id: { $ne: userId }
      });
      
      if (existingUser) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Username is already taken' 
        });
      }
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username.toLowerCase();
    if (bio !== undefined) updateData.bio = bio;
    if (socialLinks) updateData.socialLinks = socialLinks;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({
      ok: true,
      success: true,
      message: 'Profile updated',
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        socialLinks: user.socialLinks
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update profile' });
  }
});

// ==========================================
// PREFERENCES ENDPOINTS
// ==========================================

// Get user preferences
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({
      ok: true,
      preferences: user.preferences || {
        theme: 'system',
        emailNotifications: true,
        pushNotifications: true,
        language: 'en',
        notifications: {
          likes: true,
          comments: true,
          follows: true,
          mentions: true,
          messages: true,
          tips: true,
          marketing: false
        }
      }
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch preferences' });
  }
});

// Update user preferences
router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const { theme, notifications, language, emailNotifications, pushNotifications } = req.body;
    const userId = req.user.id;

    const updateData = {};

    // Update theme
    if (theme && ['light', 'dark', 'system'].includes(theme)) {
      updateData['preferences.theme'] = theme;
    }

    // Update language
    if (language) {
      updateData['preferences.language'] = language;
    }

    // Update email notifications toggle
    if (typeof emailNotifications === 'boolean') {
      updateData['preferences.emailNotifications'] = emailNotifications;
    }

    // Update push notifications toggle
    if (typeof pushNotifications === 'boolean') {
      updateData['preferences.pushNotifications'] = pushNotifications;
    }

    // Update individual notification preferences
    if (notifications && typeof notifications === 'object') {
      const validKeys = ['likes', 'comments', 'follows', 'mentions', 'messages', 'tips', 'marketing'];
      
      for (const key of validKeys) {
        if (typeof notifications[key] === 'boolean') {
          updateData[`preferences.notifications.${key}`] = notifications[key];
        }
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, select: 'preferences' }
    );

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({
      ok: true,
      success: true,
      message: 'Preferences updated',
      preferences: user.preferences
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update preferences' });
  }
});

// ==========================================
// PASSWORD CHANGE
// ==========================================

router.put('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        ok: false, 
        error: 'New password must be at least 6 characters' 
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Check if user has a password (might be OAuth-only)
    if (!user.password) {
      return res.status(400).json({ 
        ok: false, 
        error: 'You signed up with a social provider. Set a password first.' 
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ ok: false, error: 'Current password is incorrect' });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    res.json({
      ok: true,
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ ok: false, error: 'Failed to change password' });
  }
});

// Set password (for OAuth users who want to add password login)
router.post('/set-password', verifyToken, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.id;

    if (!password || password.length < 6) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Password must be at least 6 characters' 
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    if (user.password) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Password already set. Use change-password instead.' 
      });
    }

    user.password = password;
    if (!user.linkedProviders.includes('email')) {
      user.linkedProviders.push('email');
    }
    await user.save();

    res.json({
      ok: true,
      success: true,
      message: 'Password set successfully. You can now login with email.'
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ ok: false, error: 'Failed to set password' });
  }
});

// ==========================================
// AVATAR UPLOAD
// ==========================================

// Configure multer for avatar upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

router.post('/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    // In production, upload to Cloudinary or S3
    // For now, we'll assume you have cloudinary configured
    const cloudinary = require('cloudinary').v2;
    
    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'cybev/avatars',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Update user avatar
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: result.secure_url },
      { new: true, select: 'avatar' }
    );

    res.json({
      ok: true,
      success: true,
      avatar: user.avatar
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ ok: false, error: 'Failed to upload avatar' });
  }
});

// ==========================================
// PUBLIC PROFILE (by username)
// ==========================================

router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username: username.toLowerCase() })
      .select('name username bio avatar followerCount followingCount socialLinks createdAt');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
        socialLinks: user.socialLinks,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get public profile error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch user' });
  }
});

// ==========================================
// ACCOUNT DELETION
// ==========================================

router.delete('/account', verifyToken, async (req, res) => {
  try {
    const { password, confirmation } = req.body;
    const userId = req.user.id;

    if (confirmation !== 'DELETE') {
      return res.status(400).json({ 
        ok: false, 
        error: 'Please type DELETE to confirm account deletion' 
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // If user has password, verify it
    if (user.password && password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ ok: false, error: 'Incorrect password' });
      }
    }

    // Soft delete - mark as deleted but keep data for 30 days
    user.status = 'deleted';
    user.email = `deleted_${user._id}_${user.email}`;
    user.username = `deleted_${user._id}`;
    await user.save();

    // TODO: Queue background job to:
    // - Delete user's posts after 30 days
    // - Remove from followers/following
    // - Delete uploaded media

    res.json({
      ok: true,
      success: true,
      message: 'Account scheduled for deletion. You can recover within 30 days by contacting support.'
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete account' });
  }
});

module.exports = router;
