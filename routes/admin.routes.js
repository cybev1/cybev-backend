// ============================================
// FILE: routes/admin.routes.js
// Admin dashboard API endpoints
// ============================================
const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Blog = require('../models/blog.model');
const Post = require('../models/post.model');
const Comment = require('../models/comment.model');
const verifyToken = require('../middleware/verifyToken');

// Admin middleware - checks if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        ok: false, 
        error: 'Admin access required' 
      });
    }
    req.adminUser = user;
    next();
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Authorization failed' });
  }
};

// ==================== STATS ====================

// GET /api/admin/stats - Get dashboard stats
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // User stats
    const [totalUsers, newUsersToday, newUsersWeek, newUsersMonth] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: thisWeek } }),
      User.countDocuments({ createdAt: { $gte: thisMonth } })
    ]);

    // Content stats
    const [totalBlogs, totalPosts, totalComments] = await Promise.all([
      Blog.countDocuments({}),
      Post.countDocuments({}).catch(() => 0),
      Comment.countDocuments({}).catch(() => 0)
    ]);

    // Engagement stats
    const blogs = await Blog.find({}).select('views likes shares');
    const totalViews = blogs.reduce((sum, b) => sum + (b.views || 0), 0);
    const totalLikes = blogs.reduce((sum, b) => sum + (b.likes?.length || 0), 0);
    const totalShares = blogs.reduce((sum, b) => sum + (b.shares?.total || 0), 0);

    // Top content
    const topBlogs = await Blog.find({})
      .sort({ views: -1 })
      .limit(5)
      .select('title views likes authorName createdAt')
      .populate('author', 'name username');

    // Recent activity
    const recentUsers = await User.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name username email createdAt');

    const recentBlogs = await Blog.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title authorName createdAt category')
      .populate('author', 'name username');

    res.json({
      ok: true,
      stats: {
        users: {
          total: totalUsers,
          today: newUsersToday,
          thisWeek: newUsersWeek,
          thisMonth: newUsersMonth
        },
        content: {
          blogs: totalBlogs,
          posts: totalPosts,
          comments: totalComments
        },
        engagement: {
          views: totalViews,
          likes: totalLikes,
          shares: totalShares
        }
      },
      topBlogs,
      recentUsers,
      recentBlogs
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch stats' });
  }
});

// ==================== USER MANAGEMENT ====================

// GET /api/admin/users - List all users
router.get('/users', verifyToken, isAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      role = '',
      status = '',
      sort = '-createdAt' 
    } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) query.role = role;
    if (status === 'banned') query.isBanned = true;
    if (status === 'verified') query.isEmailVerified = true;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.json({
      ok: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch users' });
  }
});

// GET /api/admin/users/:id - Get single user details
router.get('/users/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get user's content stats
    const [blogCount, postCount, commentCount] = await Promise.all([
      Blog.countDocuments({ author: user._id }),
      Post.countDocuments({ authorId: user._id }).catch(() => 0),
      Comment.countDocuments({ author: user._id }).catch(() => 0)
    ]);

    res.json({
      ok: true,
      user,
      stats: {
        blogs: blogCount,
        posts: postCount,
        comments: commentCount
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch user' });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const { role, isBanned, isEmailVerified, note } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Prevent demoting yourself
    if (user._id.toString() === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ ok: false, error: 'Cannot change your own role' });
    }

    if (role !== undefined) user.role = role;
    if (isBanned !== undefined) user.isBanned = isBanned;
    if (isEmailVerified !== undefined) user.isEmailVerified = isEmailVerified;
    if (note !== undefined) user.adminNote = note;

    await user.save();

    res.json({ ok: true, user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Prevent deleting yourself
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ ok: false, error: 'Cannot delete your own account' });
    }

    // Optionally: delete user's content
    const { deleteContent } = req.query;
    if (deleteContent === 'true') {
      await Blog.deleteMany({ author: user._id });
      await Post.deleteMany({ authorId: user._id });
      await Comment.deleteMany({ author: user._id });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ ok: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete user' });
  }
});

// ==================== CONTENT MODERATION ====================

// GET /api/admin/content - List all content for moderation
router.get('/content', verifyToken, isAdmin, async (req, res) => {
  try {
    const { 
      type = 'all', 
      status = 'all',
      page = 1, 
      limit = 20,
      sort = '-createdAt'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    let content = [];
    let total = 0;

    if (type === 'blogs' || type === 'all') {
      const query = {};
      if (status === 'flagged') query.isFlagged = true;
      if (status === 'hidden') query.isHidden = true;

      const blogs = await Blog.find(query)
        .sort(sort)
        .skip(type === 'all' ? 0 : skip)
        .limit(type === 'all' ? 10 : parseInt(limit))
        .select('title content authorName category createdAt views likes isFlagged isHidden')
        .populate('author', 'name username email');

      content.push(...blogs.map(b => ({ ...b.toObject(), contentType: 'blog' })));
      if (type === 'blogs') {
        total = await Blog.countDocuments(query);
      }
    }

    if (type === 'comments' || type === 'all') {
      const query = { isDeleted: false };
      if (status === 'flagged') query.isFlagged = true;

      const comments = await Comment.find(query)
        .sort(sort)
        .skip(type === 'all' ? 0 : skip)
        .limit(type === 'all' ? 10 : parseInt(limit))
        .select('content authorName createdAt isFlagged')
        .populate('author', 'name username email');

      content.push(...comments.map(c => ({ ...c.toObject(), contentType: 'comment' })));
      if (type === 'comments') {
        total = await Comment.countDocuments(query);
      }
    }

    // Sort combined results
    content.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      ok: true,
      content: type === 'all' ? content.slice(0, parseInt(limit)) : content,
      pagination: type !== 'all' ? {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      } : null
    });
  } catch (error) {
    console.error('List content error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch content' });
  }
});

// PUT /api/admin/content/:type/:id - Moderate content
router.put('/content/:type/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { action, reason } = req.body;

    let Model;
    if (type === 'blog') Model = Blog;
    else if (type === 'comment') Model = Comment;
    else return res.status(400).json({ ok: false, error: 'Invalid content type' });

    const content = await Model.findById(id);
    if (!content) {
      return res.status(404).json({ ok: false, error: 'Content not found' });
    }

    switch (action) {
      case 'hide':
        content.isHidden = true;
        content.moderationReason = reason;
        content.moderatedAt = new Date();
        content.moderatedBy = req.user.id;
        break;
      case 'unhide':
        content.isHidden = false;
        break;
      case 'flag':
        content.isFlagged = true;
        content.flagReason = reason;
        break;
      case 'unflag':
        content.isFlagged = false;
        content.flagReason = null;
        break;
      case 'delete':
        if (type === 'comment') {
          content.isDeleted = true;
          content.content = '[removed by moderator]';
        } else {
          await Model.findByIdAndDelete(id);
          return res.json({ ok: true, message: 'Content deleted' });
        }
        break;
      default:
        return res.status(400).json({ ok: false, error: 'Invalid action' });
    }

    await content.save();
    res.json({ ok: true, content });
  } catch (error) {
    console.error('Moderate content error:', error);
    res.status(500).json({ ok: false, error: 'Failed to moderate content' });
  }
});

// ==================== REPORTS ====================

// GET /api/admin/reports - Get platform reports
router.get('/reports', verifyToken, isAdmin, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (period) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Daily signups
    const userSignups = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Daily blogs
    const blogCreations = await Blog.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Category distribution
    const categoryStats = await Blog.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      ok: true,
      reports: {
        userSignups,
        blogCreations,
        categoryStats
      },
      period
    });
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ ok: false, error: 'Failed to generate reports' });
  }
});

module.exports = router;
