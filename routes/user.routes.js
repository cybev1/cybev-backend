// ============================================
// FILE: routes/user.routes.js
// User Profile & Management Routes
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try { verifyToken = require('../middleware/auth'); } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

// Optional auth
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
    } catch {}
  }
  next();
};

// Load User model
let User, Blog;
try { User = require('../models/user.model'); } catch (e) { User = mongoose.model('User'); }
try { Blog = require('../models/blog.model'); } catch (e) { Blog = mongoose.model('Blog'); }

// ==========================================
// GET /api/users/profile/:identifier - Get user profile by username or ID
// ==========================================
router.get('/profile/:identifier', optionalAuth, async (req, res) => {
  try {
    const { identifier } = req.params;
    
    let user;
    
    // Try to find by ID first
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      user = await User.findById(identifier)
        .select('-password -refreshToken')
        .lean();
    }
    
    // If not found by ID, try username
    if (!user) {
      user = await User.findOne({ 
        $or: [
          { username: identifier },
          { username: identifier.toLowerCase() }
        ]
      })
      .select('-password -refreshToken')
      .lean();
    }
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Get blog stats
    const blogStats = await Blog.aggregate([
      { $match: { author: user._id, status: 'published' } },
      {
        $group: {
          _id: null,
          totalBlogs: { $sum: 1 },
          totalViews: { $sum: { $ifNull: ['$views', 0] } },
          totalLikes: { $sum: { $size: { $ifNull: ['$likes', []] } } }
        }
      }
    ]);
    
    const stats = blogStats[0] || { totalBlogs: 0, totalViews: 0, totalLikes: 0 };
    
    res.json({
      success: true,
      user: {
        ...user,
        followersCount: user.followers?.length || user.followersCount || 0,
        followingCount: user.following?.length || user.followingCount || 0
      },
      blogsCount: stats.totalBlogs,
      totalViews: stats.totalViews,
      totalLikes: stats.totalLikes
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

// ==========================================
// GET /api/users/me - Get current user
// ==========================================
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -refreshToken')
      .lean();
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, user });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

// ==========================================
// PUT /api/users/profile - Update profile
// ==========================================
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, bio, website, location, profilePicture, coverImage } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (website !== undefined) updateData.website = website;
    if (location !== undefined) updateData.location = location;
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true }
    ).select('-password -refreshToken');
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, user, message: 'Profile updated!' });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// ==========================================
// GET /api/users/search - Search users
// ==========================================
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, users: [] });
    }
    
    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } }
      ]
    })
    .select('name username profilePicture avatar bio followersCount')
    .limit(parseInt(limit))
    .lean();
    
    res.json({ success: true, users });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ==========================================
// GET /api/users/:id - Get user by ID
// ==========================================
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -refreshToken')
      .lean();
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, user });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

console.log('✅ User routes loaded');

module.exports = router;
