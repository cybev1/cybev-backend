// ============================================
// FILE: routes/user.routes.js
// User Routes - COMPLETE MERGED VERSION
// VERSION: 6.0 - Fixed username lookup + /me endpoint
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');

// Get User model
const getUser = () => mongoose.models.User || require('../models/user.model');

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// Configure multer for avatar/cover upload
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

// ==========================================
// CURRENT USER ENDPOINTS (MUST BE FIRST!)
// ==========================================

// GET /api/users/me - Get current authenticated user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const user = await User.findById(req.user.id)
      .select('-password -__v');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get post count
    const Post = mongoose.models.Post;
    let postsCount = 0;
    if (Post) {
      postsCount = await Post.countDocuments({ author: user._id });
    }

    // Get follow counts
    const Follow = mongoose.models.Follow;
    let followersCount = user.followersCount || user.followers?.length || 0;
    let followingCount = user.followingCount || user.following?.length || 0;
    
    if (Follow) {
      [followersCount, followingCount] = await Promise.all([
        Follow.countDocuments({ following: user._id, status: 'active' }),
        Follow.countDocuments({ follower: user._id, status: 'active' })
      ]);
    }

    res.json({
      ok: true,
      user: {
        ...user.toObject(),
        postsCount,
        followersCount,
        followingCount
      }
    });
  } catch (err) {
    console.error('Error fetching current user:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/users/profile - Get current user's profile (alias for /me)
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const User = getUser();
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
        coverImage: user.coverImage || '',
        isEmailVerified: user.isEmailVerified,
        hasCompletedOnboarding: user.hasCompletedOnboarding,
        preferences: user.preferences,
        linkedProviders: user.linkedProviders || ['email'],
        socialLinks: user.socialLinks,
        followerCount: user.followerCount || user.followersCount || 0,
        followingCount: user.followingCount || 0,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch profile' });
  }
});

// ==========================================
// SUGGESTED USERS
// ==========================================

// GET /api/users/suggested - Get suggested users to follow
router.get('/suggested', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const limit = parseInt(req.query.limit) || 5;
    const currentUserId = req.user?.id;

    // Get users the current user is already following
    let followingIds = [];
    if (currentUserId) {
      const currentUser = await User.findById(currentUserId).select('following');
      followingIds = currentUser?.following?.map(id => id.toString()) || [];
    }

    // Find users that are not the current user and not already followed
    const query = {
      _id: { $nin: [...followingIds, currentUserId].filter(Boolean) },
      status: { $ne: 'deleted' }
    };

    const users = await User.find(query)
      .select('username name avatar bio isVerified followers followersCount')
      .sort({ followersCount: -1, createdAt: -1 })
      .limit(limit);

    const formattedUsers = users.map(user => ({
      _id: user._id,
      username: user.username,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      isVerified: user.isVerified || false,
      followers: user.followersCount || user.followers?.length || 0
    }));

    res.json({ ok: true, users: formattedUsers });
  } catch (err) {
    console.error('Error fetching suggested users:', err);
    res.status(500).json({ ok: false, error: 'Server error', users: [] });
  }
});

// ==========================================
// USERNAME LOOKUP (CRITICAL FOR PROFILE PAGES)
// ==========================================

// GET /api/users/username/:username - Get user by username
router.get('/username/:username', async (req, res) => {
  try {
    const User = getUser();
    const { username } = req.params;

    console.log(`Looking up user: ${username}`);

    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    }).select('-password -__v');

    if (!user) {
      console.log(`User not found: ${username}`);
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get post count
    const Post = mongoose.models.Post;
    let postsCount = 0;
    if (Post) {
      postsCount = await Post.countDocuments({ author: user._id });
    }

    // Get follow counts
    const Follow = mongoose.models.Follow;
    let followersCount = user.followersCount || user.followers?.length || 0;
    let followingCount = user.followingCount || user.following?.length || 0;
    
    if (Follow) {
      [followersCount, followingCount] = await Promise.all([
        Follow.countDocuments({ following: user._id, status: 'active' }),
        Follow.countDocuments({ follower: user._id, status: 'active' })
      ]);
    }

    res.json({
      ok: true,
      user: {
        ...user.toObject(),
        postsCount,
        followersCount,
        followingCount
      }
    });
  } catch (error) {
    console.error('Get user by username error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// PREFERENCES ENDPOINTS
// ==========================================

// GET /api/users/preferences
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const User = getUser();
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

// PUT /api/users/preferences
router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const { theme, notifications, language, emailNotifications, pushNotifications } = req.body;
    const userId = req.user.id;

    const updateData = {};

    if (theme && ['light', 'dark', 'system'].includes(theme)) {
      updateData['preferences.theme'] = theme;
    }
    if (language) {
      updateData['preferences.language'] = language;
    }
    if (typeof emailNotifications === 'boolean') {
      updateData['preferences.emailNotifications'] = emailNotifications;
    }
    if (typeof pushNotifications === 'boolean') {
      updateData['preferences.pushNotifications'] = pushNotifications;
    }
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
// PROFILE UPDATE ENDPOINTS
// ==========================================

// PUT /api/users/profile - Update profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const { name, username, bio, socialLinks, location, website } = req.body;
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
    if (location !== undefined) updateData.location = location;
    if (website !== undefined) updateData.website = website;
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
      user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update profile' });
  }
});

// ==========================================
// AVATAR & COVER UPLOAD
// ==========================================

// POST /api/users/avatar
router.post('/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    const User = getUser();
    let avatarUrl;

    // Check if Cloudinary is configured
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const cloudinary = require('cloudinary').v2;
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
      avatarUrl = result.secure_url;
    } else {
      // Fallback to base64 (not recommended for production)
      avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: avatarUrl },
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

// POST /api/users/upload-avatar (alias)
router.post('/upload-avatar', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No image provided' });
    }

    const User = getUser();
    let avatarUrl;
    
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const cloudinary = require('cloudinary').v2;
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'cybev/avatars',
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      avatarUrl = result.secure_url;
    } else {
      avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: avatarUrl },
      { new: true }
    ).select('-password');

    res.json({ ok: true, avatar: avatarUrl, user });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/users/upload-cover
router.post('/upload-cover', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No image provided' });
    }

    const User = getUser();
    let coverUrl;
    
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const cloudinary = require('cloudinary').v2;
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'cybev/covers',
            transformation: [
              { width: 1500, height: 500, crop: 'fill', gravity: 'center' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      coverUrl = result.secure_url;
    } else {
      coverUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { coverImage: coverUrl },
      { new: true }
    ).select('-password');

    res.json({ ok: true, coverImage: coverUrl, user });
  } catch (error) {
    console.error('Upload cover error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// PASSWORD MANAGEMENT
// ==========================================

// PUT /api/users/change-password
router.put('/change-password', verifyToken, async (req, res) => {
  try {
    const User = getUser();
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

    if (!user.password) {
      return res.status(400).json({ 
        ok: false, 
        error: 'You signed up with a social provider. Set a password first.' 
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ ok: false, error: 'Current password is incorrect' });
    }

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

// POST /api/users/set-password (for OAuth users)
router.post('/set-password', verifyToken, async (req, res) => {
  try {
    const User = getUser();
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
// PUBLIC PROFILE ENDPOINTS
// ==========================================

// GET /api/users/profile/:username - Get public profile by username
router.get('/profile/:username', async (req, res) => {
  try {
    const User = getUser();
    const { username } = req.params;
    
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    }).select('name username bio avatar coverImage followerCount followingCount socialLinks createdAt');

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
        coverImage: user.coverImage,
        followerCount: user.followerCount || user.followersCount || 0,
        followingCount: user.followingCount || 0,
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
    const User = getUser();
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

    if (user.password && password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ ok: false, error: 'Incorrect password' });
      }
    }

    // Soft delete
    user.status = 'deleted';
    user.email = `deleted_${user._id}_${user.email}`;
    user.username = `deleted_${user._id}`;
    await user.save();

    res.json({
      ok: true,
      success: true,
      message: 'Account scheduled for deletion.'
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete account' });
  }
});

// ==========================================
// CATCH-ALL: GET USER BY USERNAME (MUST BE LAST!)
// ==========================================

// GET /api/users/:username - Get user by username (fallback)
router.get('/:username', async (req, res) => {
  try {
    const User = getUser();
    const { username } = req.params;
    
    // Skip if it looks like a reserved route
    const reserved = ['me', 'profile', 'suggested', 'preferences', 'avatar', 'account', 'username'];
    if (reserved.includes(username.toLowerCase())) {
      return res.status(404).json({ ok: false, error: 'Invalid route' });
    }
    
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    }).select('name username bio avatar coverImage followerCount followingCount socialLinks createdAt');

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
        coverImage: user.coverImage,
        followerCount: user.followerCount || user.followersCount || 0,
        followingCount: user.followingCount || 0,
        socialLinks: user.socialLinks,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch user' });
  }
});

module.exports = router;
