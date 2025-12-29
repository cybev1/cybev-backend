// ============================================
// FILE: routes/admin.routes.js
// Admin Dashboard API
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Admin middleware
const isAdmin = async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Auth error' });
  }
};

// GET /api/admin/stats - Dashboard statistics
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const Blog = mongoose.model('Blog');
    
    const [totalUsers, totalBlogs, recentUsers, recentBlogs] = await Promise.all([
      User.countDocuments(),
      Blog.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
      Blog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
    ]);

    res.json({
      ok: true,
      stats: {
        totalUsers,
        totalBlogs,
        recentUsers,
        recentBlogs,
        growth: {
          users: recentUsers,
          blogs: recentBlogs
        }
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/users - List all users
router.get('/users', verifyToken, isAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments()
    ]);

    res.json({
      ok: true,
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:id/role - Update user role
router.put('/users/:id/role', verifyToken, isAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const { role } = req.body;
    
    if (!['user', 'creator', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, user });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update role' });
  }
});

// PUT /api/admin/users/:id/ban - Ban/unban user
router.put('/users/:id/ban', verifyToken, isAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const { banned, reason } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 
        banned: !!banned,
        banReason: reason || '',
        bannedAt: banned ? new Date() : null
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, user, message: banned ? 'User banned' : 'User unbanned' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update ban status' });
  }
});

// GET /api/admin/blogs - List all blogs
router.get('/blogs', verifyToken, isAdmin, async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const query = status ? { status } : {};

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate('author', 'name username avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Blog.countDocuments(query)
    ]);

    res.json({
      ok: true,
      blogs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch blogs' });
  }
});

// DELETE /api/admin/blogs/:id - Delete blog
router.delete('/blogs/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const blog = await Blog.findByIdAndDelete(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    res.json({ ok: true, message: 'Blog deleted' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to delete blog' });
  }
});

// GET /api/admin/reports - Get reported content
router.get('/reports', verifyToken, isAdmin, async (req, res) => {
  try {
    // If you have a Report model, query it here
    res.json({ ok: true, reports: [], message: 'Reports system ready' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch reports' });
  }
});

module.exports = router;
