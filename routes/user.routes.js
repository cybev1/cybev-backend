// ============================================
// FILE: routes/user.routes.js
// User Routes - COMPLETE MERGED VERSION
// VERSION: 7.0 - Fixed Analytics & Stats
// FIXES:
//   - Posts count (checks author, user, userId fields)
//   - Followers/Following count (removed status:active requirement)
//   - Added websites, blogs, views counting
//   - Added wallet balance
//   - Added /stats endpoint
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');

// Get User model
const getUser = () => mongoose.models.User || require('../models/user.model');

// Get model safely
const getModel = (name) => {
  try {
    return mongoose.models[name] || null;
  } catch (e) {
    return null;
  }
};

// Helper: Count documents with multiple possible field names
const countWithFields = async (Model, userId, fields) => {
  if (!Model || !userId) return 0;
  
  const objectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  const orConditions = fields.map(field => ({ [field]: objectId }));
  
  try {
    // Try with ObjectId first
    let count = await Model.countDocuments({ $or: orConditions });
    if (count > 0) return count;
    
    // Try with string ID as fallback
    const stringConditions = fields.map(field => ({ [field]: userId.toString() }));
    count = await Model.countDocuments({ $or: stringConditions });
    return count;
  } catch (e) {
    console.error(`Count error for ${Model.modelName}:`, e.message);
    return 0;
  }
};

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
// HELPER: Get comprehensive user stats
// ==========================================
const getUserStats = async (userId) => {
  const Post = getModel('Post');
  const Follow = getModel('Follow');
  const Website = getModel('Website');
  const Blog = getModel('Blog');
  const Vlog = getModel('Vlog');
  const Reward = getModel('Reward');

  // Count posts (check multiple field names)
  const postsCount = await countWithFields(Post, userId, ['author', 'user', 'userId', 'createdBy']);

  // Count followers (people following this user) - check multiple field names
  // Note: removed status:'active' requirement as it might not exist
  const followersCount = await countWithFields(Follow, userId, ['following', 'followee', 'targetUser', 'followedUser']);

  // Count following (people this user follows)
  const followingCount = await countWithFields(Follow, userId, ['follower', 'user', 'sourceUser', 'userId']);

  // Count websites
  const websitesCount = await countWithFields(Website, userId, ['owner', 'user', 'userId', 'author', 'createdBy']);

  // Count blogs/articles
  const blogsCount = await countWithFields(Blog, userId, ['author', 'user', 'userId', 'owner', 'createdBy']);

  // Count vlogs
  const vlogsCount = await countWithFields(Vlog, userId, ['author', 'user', 'userId', 'createdBy']);

  // Get total views
  let totalViews = 0;
  const objectId = new mongoose.Types.ObjectId(userId);
  
  if (Post) {
    try {
      const postViews = await Post.aggregate([
        { $match: { $or: [{ author: objectId }, { user: objectId }, { userId: objectId }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
      ]);
      totalViews += postViews[0]?.total || 0;
    } catch (e) {}
  }
  
  if (Blog) {
    try {
      const blogViews = await Blog.aggregate([
        { $match: { $or: [{ author: objectId }, { user: objectId }, { userId: objectId }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
      ]);
      totalViews += blogViews[0]?.total || 0;
    } catch (e) {}
  }
  
  if (Website) {
    try {
      const siteViews = await Website.aggregate([
        { $match: { $or: [{ owner: objectId }, { user: objectId }, { userId: objectId }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
      ]);
      totalViews += siteViews[0]?.total || 0;
    } catch (e) {}
  }

  // Get wallet balance
  let walletBalance = 0;
  if (Reward) {
    try {
      const rewards = await Reward.aggregate([
        { $match: { user: objectId, status: { $in: ['completed', null, undefined] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      walletBalance = rewards[0]?.total || 0;
    } catch (e) {
      // Try without status filter
      try {
        const rewards = await Reward.aggregate([
          { $match: { user: objectId } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        walletBalance = rewards[0]?.total || 0;
      } catch (e2) {}
    }
  }

  return {
    postsCount,
    followersCount,
    followingCount,
    websitesCount,
    blogsCount,
    vlogsCount,
    totalViews,
    walletBalance,
    // Aliases for frontend compatibility
    posts: postsCount,
    followers: followersCount,
    following: followingCount,
    websites: websitesCount,
    blogs: blogsCount,
    vlogs: vlogsCount,
    views: totalViews,
    balance: walletBalance
  };
};

// ==========================================
// CURRENT USER ENDPOINTS (MUST BE FIRST!)
// ==========================================

// GET /api/users/me - Get current authenticated user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const userId = req.user.id || req.user.userId || req.user._id;
    
    const user = await User.findById(userId).select('-password -__v');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get comprehensive stats
    const stats = await getUserStats(userId);

    res.json({
      ok: true,
      user: {
        ...user.toObject(),
        ...stats
      }
    });
  } catch (err) {
    console.error('Error fetching current user:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/users/me/stats - Get only stats for current user
router.get('/me/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user._id;
    const stats = await getUserStats(userId);
    res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('Error fetching user stats:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/users/profile - Get current user's profile (alias for /me)
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const userId = req.user.id || req.user.userId || req.user._id;
    
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get stats
    const stats = await getUserStats(userId);

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
        createdAt: user.createdAt,
        ...stats
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch profile' });
  }
});

// ==========================================
// STATS ENDPOINT
// ==========================================

// GET /api/users/stats/:userId - Get stats for any user
router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }

    const stats = await getUserStats(userId);
    res.json({ ok: true, stats });
  } catch (err) {
    console.error('Error fetching user stats:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
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
    const currentUserId = req.user?.id || req.user?.userId;

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

    // Get comprehensive stats
    const stats = await getUserStats(user._id);

    res.json({
      ok: true,
      user: {
        ...user.toObject(),
        ...stats
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
    const user = await User.findById(req.user.id || req.user.userId).select('preferences');
    
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
    const userId = req.user.id || req.user.userId;

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

// PUT /api/users/update-profile - Update profile during onboarding
// NOTE: No email verification required - used during onboarding flow
router.put('/update-profile', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const userId = req.user.id || req.user.userId;
    const { 
      username, bio, interests, profilePicture, 
      hasCompletedOnboarding, name, avatar 
    } = req.body;

    console.log('📝 Update profile request for user:', userId);
    console.log('📝 Data:', { username, hasCompletedOnboarding, hasAvatar: !!(profilePicture || avatar) });

    const updateData = {};

    // Handle username - check if available
    if (username) {
      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      const existingUser = await User.findOne({ 
        username: cleanUsername,
        _id: { $ne: userId }
      });
      
      if (existingUser) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Username is already taken',
          message: 'Username is already taken'
        });
      }
      updateData.username = cleanUsername;
    }

    // Handle other fields
    if (bio !== undefined) updateData.bio = bio;
    if (name) updateData.name = name;
    if (interests && Array.isArray(interests)) updateData.interests = interests;
    
    // Handle avatar/profilePicture (base64 or URL)
    if (profilePicture) {
      updateData.avatar = profilePicture;
    } else if (avatar) {
      updateData.avatar = avatar;
    }

    // Handle onboarding completion
    if (hasCompletedOnboarding === true) {
      updateData.hasCompletedOnboarding = true;
      updateData.onboardingCompletedAt = new Date();
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    console.log('✅ Profile updated successfully for:', user.email);

    res.json({
      ok: true,
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        bio: user.bio,
        avatar: user.avatar,
        interests: user.interests,
        hasCompletedOnboarding: user.hasCompletedOnboarding
      }
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to update profile',
      message: error.message 
    });
  }
});

// PUT /api/users/profile - Update profile (Enhanced for full profile)
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const { 
      name, username, bio, socialLinks, location, website,
      avatar, coverImage, personalInfo, locationData
    } = req.body;
    const userId = req.user.id || req.user.userId;

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
    
    // Basic fields
    if (name) updateData.name = name;
    if (username) updateData.username = username.toLowerCase();
    if (bio !== undefined) updateData.bio = bio;
    if (location !== undefined) updateData.location = location;
    if (website !== undefined) updateData.website = website;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (socialLinks) updateData.socialLinks = socialLinks;
    
    // Personal Info (Facebook-like extended profile)
    if (personalInfo) {
      const personalInfoUpdate = {};
      const allowedPersonalFields = [
        'firstName', 'lastName', 'middleName', 'nickname',
        'dateOfBirth', 'gender', 'pronouns',
        'phone', 'alternateEmail',
        'currentCity', 'currentCountry', 'hometown', 'hometownCountry',
        'occupation', 'company', 'jobTitle', 'industry',
        'education', 'school', 'graduationYear',
        'relationshipStatus',
        'interests', 'skills', 'languages',
        'aboutMe', 'religion', 'politicalViews',
        'favoriteQuote', 'favoriteMusic', 'favoriteMovies', 'favoriteBooks', 'favoriteSports',
        'visibility'
      ];
      
      for (const field of allowedPersonalFields) {
        if (personalInfo[field] !== undefined) {
          personalInfoUpdate[`personalInfo.${field}`] = personalInfo[field];
        }
      }
      
      Object.assign(updateData, personalInfoUpdate);
    }
    
    // Location Data
    if (locationData) {
      const locationDataUpdate = {};
      const allowedLocationFields = [
        'providedCountry', 'providedCity', 'providedLocation',
        'detectedCountry', 'detectedCity', 'detectedRegion',
        'detectedIP', 'detectedTimezone', 'detectedAt',
        'locationType', 'locationMatches', 'coordinates'
      ];
      
      for (const field of allowedLocationFields) {
        if (locationData[field] !== undefined) {
          locationDataUpdate[`locationData.${field}`] = locationData[field];
        }
      }
      
      Object.assign(updateData, locationDataUpdate);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get updated stats
    const stats = await getUserStats(userId);

    res.json({
      ok: true,
      success: true,
      message: 'Profile updated successfully',
      user: {
        ...user.toObject(),
        ...stats
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/users/me - Update current user (alias)
router.put('/me', verifyToken, async (req, res) => {
  try {
    const User = getUser();
    const userId = req.user.id || req.user.userId;
    const allowedFields = ['name', 'username', 'bio', 'avatar', 'coverImage', 'location', 'website', 'socialLinks'];
    
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Check username uniqueness
    if (updateData.username) {
      const existing = await User.findOne({
        username: { $regex: new RegExp(`^${updateData.username}$`, 'i') },
        _id: { $ne: userId }
      });
      if (existing) {
        return res.status(400).json({ ok: false, error: 'Username already taken' });
      }
      updateData.username = updateData.username.toLowerCase();
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const stats = await getUserStats(userId);

    res.json({
      ok: true,
      user: { ...user.toObject(), ...stats }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// AVATAR & COVER UPLOAD
// ==========================================

// POST /api/users/avatar - Upload avatar
router.post('/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  try {
    const User = getUser();
    const userId = req.user.id || req.user.userId;
    
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file provided' });
    }

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
      userId,
      { avatar: avatarUrl },
      { new: true }
    ).select('-password');

    res.json({ ok: true, avatar: avatarUrl, user });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/users/cover - Upload cover image
router.post('/cover', verifyToken, upload.single('cover'), async (req, res) => {
  try {
    const User = getUser();
    const userId = req.user.id || req.user.userId;
    
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file provided' });
    }

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
      userId,
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
    const userId = req.user.id || req.user.userId;

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
    const userId = req.user.id || req.user.userId;

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
    }).select('name username bio avatar coverImage followerCount followingCount socialLinks createdAt isVerified');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get stats
    const stats = await getUserStats(user._id);

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
        coverImage: user.coverImage,
        isVerified: user.isVerified,
        socialLinks: user.socialLinks,
        createdAt: user.createdAt,
        ...stats
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
    const userId = req.user.id || req.user.userId;

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
    
    // Skip if it looks like a reserved route or ObjectId
    const reserved = ['me', 'profile', 'suggested', 'preferences', 'avatar', 'account', 'username', 'stats'];
    if (reserved.includes(username.toLowerCase())) {
      return res.status(404).json({ ok: false, error: 'Invalid route' });
    }

    // Check if it's an ObjectId (user ID lookup)
    if (mongoose.Types.ObjectId.isValid(username) && username.length === 24) {
      const user = await User.findById(username).select('-password -__v');
      if (user) {
        const stats = await getUserStats(user._id);
        return res.json({ ok: true, user: { ...user.toObject(), ...stats } });
      }
    }
    
    // Username lookup
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    }).select('name username bio avatar coverImage isVerified socialLinks createdAt');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get stats
    const stats = await getUserStats(user._id);

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
        coverImage: user.coverImage,
        isVerified: user.isVerified,
        socialLinks: user.socialLinks,
        createdAt: user.createdAt,
        ...stats
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch user' });
  }
});

module.exports = router;
