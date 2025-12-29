// ============================================
// FILE: routes/admin.routes.js
// Admin Dashboard API
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Admin middleware - checks both role AND isAdmin field
const isAdmin = async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id);
    
    // Check both role === 'admin' OR isAdmin === true
    if (!user || (user.role !== 'admin' && !user.isAdmin)) {
      console.log('❌ Admin access denied for:', user?.email, '| role:', user?.role, '| isAdmin:', user?.isAdmin);
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    
    console.log('✅ Admin access granted for:', user.email);
    req.adminUser = user; // Attach admin user to request
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ ok: false, error: 'Auth error' });
  }
};

// GET /api/admin/stats - Dashboard statistics
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const Blog = mongoose.model('Blog');
    
    // Get current date boundaries
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      totalBlogs,
      usersToday,
      usersThisWeek,
      usersThisMonth,
      blogsToday,
      blogsThisWeek,
      recentUsers,
      recentBlogs,
      topBlogs
    ] = await Promise.all([
      User.countDocuments(),
      Blog.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfToday } }),
      User.countDocuments({ createdAt: { $gte: startOfWeek } }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Blog.countDocuments({ createdAt: { $gte: startOfToday } }),
      Blog.countDocuments({ createdAt: { $gte: startOfWeek } }),
      User.find()
        .select('name username email avatar createdAt')
        .sort({ createdAt: -1 })
        .limit(5),
      Blog.find()
        .select('title author authorName views likes createdAt')
        .populate('author', 'name username')
        .sort({ createdAt: -1 })
        .limit(5),
      Blog.find()
        .select('title author authorName views likes createdAt')
        .populate('author', 'name username')
        .sort({ views: -1 })
        .limit(10)
    ]);

    // Calculate total engagement
    const engagementStats = await Blog.aggregate([
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: { $size: { $ifNull: ['$likes', []] } } },
          totalShares: { $sum: { $ifNull: ['$shareCount', 0] } },
          totalComments: { $sum: { $ifNull: ['$commentCount', 0] } }
        }
      }
    ]);

    const engagement = engagementStats[0] || { totalViews: 0, totalLikes: 0, totalShares: 0, totalComments: 0 };

    res.json({
      ok: true,
      stats: {
        totalUsers,
        totalBlogs,
        users: {
          total: totalUsers,
          today: usersToday,
          thisWeek: usersThisWeek,
          thisMonth: usersThisMonth
        },
        content: {
          blogs: totalBlogs,
          comments: engagement.totalComments
        },
        engagement: {
          views: engagement.totalViews,
          likes: engagement.totalLikes,
          shares: engagement.totalShares
        },
        growth: {
          users: usersThisWeek,
          blogs: blogsThisWeek
        }
      },
      recentUsers: recentUsers.map(u => ({
        _id: u._id,
        name: u.name,
        username: u.username,
        email: u.email,
        avatar: u.avatar,
        createdAt: u.createdAt
      })),
      recentBlogs: recentBlogs.map(b => ({
        _id: b._id,
        title: b.title,
        authorName: b.author?.name || b.authorName || 'Unknown',
        views: b.views || 0,
        likes: b.likes || [],
        createdAt: b.createdAt
      })),
      topBlogs: topBlogs.map(b => ({
        _id: b._id,
        title: b.title,
        authorName: b.author?.name || b.authorName || 'Unknown',
        views: b.views || 0,
        likes: b.likes || [],
        createdAt: b.createdAt
      }))
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
    const { search, status, role } = req.query;

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status === 'verified') {
      query.isEmailVerified = true;
    } else if (status === 'banned') {
      query.isBanned = true;
    }
    
    if (role && role !== '') {
      query.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
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
    console.error('Admin users error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:id - Update user (generic)
router.put('/users/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const { role, isBanned, isEmailVerified } = req.body;
    
    const updateData = {};
    
    if (role !== undefined) {
      if (!['user', 'creator', 'moderator', 'admin'].includes(role)) {
        return res.status(400).json({ ok: false, error: 'Invalid role' });
      }
      updateData.role = role;
      // Also update isAdmin flag
      updateData.isAdmin = role === 'admin';
    }
    
    if (isBanned !== undefined) {
      updateData.isBanned = isBanned;
      if (isBanned) {
        updateData.bannedAt = new Date();
      }
    }
    
    if (isEmailVerified !== undefined) {
      updateData.isEmailVerified = isEmailVerified;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    console.log('✅ User updated:', user.email, '| Changes:', updateData);
    res.json({ ok: true, user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update user' });
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
      { 
        role,
        isAdmin: role === 'admin' // Also update isAdmin flag
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    console.log('✅ User role updated:', user.email, '→', role);
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
        isBanned: !!banned,
        banReason: reason || '',
        bannedAt: banned ? new Date() : null
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    console.log(banned ? '🚫 User banned:' : '✅ User unbanned:', user.email);
    res.json({ ok: true, user, message: banned ? 'User banned' : 'User unbanned' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update ban status' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const Blog = mongoose.model('Blog');
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Optionally delete user's content
    if (req.query.deleteContent === 'true') {
      await Blog.deleteMany({ author: req.params.id });
      console.log('🗑️ Deleted all content for user:', user.email);
    }

    await User.findByIdAndDelete(req.params.id);
    
    console.log('🗑️ User deleted:', user.email);
    res.json({ ok: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete user' });
  }
});

// GET /api/admin/blogs - List all blogs
router.get('/blogs', verifyToken, isAdmin, async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { authorName: { $regex: search, $options: 'i' } }
      ];
    }

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
    console.error('Admin blogs error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch blogs' });
  }
});

// GET /api/admin/content - Combined content (blogs + comments)
router.get('/content', verifyToken, isAdmin, async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { type, status } = req.query;

    let query = {};
    
    if (status === 'flagged') {
      query.isFlagged = true;
    } else if (status === 'hidden') {
      query.isHidden = true;
    }

    // For now, just return blogs
    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate('author', 'name username avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Blog.countDocuments(query)
    ]);

    const content = blogs.map(b => ({
      ...b.toObject(),
      contentType: 'blog'
    }));

    res.json({
      ok: true,
      content,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Admin content error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch content' });
  }
});

// PUT /api/admin/moderate/:type/:id - Moderate content
router.put('/moderate/:type/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { action, reason } = req.body;
    
    if (type !== 'blog' && type !== 'comment') {
      return res.status(400).json({ ok: false, error: 'Invalid content type' });
    }

    const Model = mongoose.model(type === 'blog' ? 'Blog' : 'Comment');
    
    let update = {};
    switch (action) {
      case 'hide':
        update = { isHidden: true, hiddenReason: reason };
        break;
      case 'unhide':
        update = { isHidden: false, hiddenReason: null };
        break;
      case 'flag':
        update = { isFlagged: true, flagReason: reason };
        break;
      case 'unflag':
        update = { isFlagged: false, flagReason: null };
        break;
      case 'delete':
        await Model.findByIdAndDelete(id);
        return res.json({ ok: true, message: `${type} deleted` });
      default:
        return res.status(400).json({ ok: false, error: 'Invalid action' });
    }

    const item = await Model.findByIdAndUpdate(id, update, { new: true });
    
    if (!item) {
      return res.status(404).json({ ok: false, error: `${type} not found` });
    }

    console.log(`✅ Content moderated: ${type} ${id} → ${action}`);
    res.json({ ok: true, item, message: `${type} ${action}d` });
  } catch (error) {
    console.error('Moderation error:', error);
    res.status(500).json({ ok: false, error: 'Moderation failed' });
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

    console.log('🗑️ Blog deleted:', blog.title);
    res.json({ ok: true, message: 'Blog deleted' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to delete blog' });
  }
});

// GET /api/admin/reports - Get reported content
router.get('/reports', verifyToken, isAdmin, async (req, res) => {
  try {
    // If you have a Report model, query it here
    // For now, return flagged content
    const Blog = mongoose.model('Blog');
    
    const flaggedContent = await Blog.find({ isFlagged: true })
      .populate('author', 'name username')
      .sort({ updatedAt: -1 })
      .limit(50);

    res.json({ 
      ok: true, 
      reports: flaggedContent.map(b => ({
        _id: b._id,
        type: 'blog',
        title: b.title,
        author: b.author,
        reason: b.flagReason,
        createdAt: b.createdAt
      })),
      message: 'Reports fetched' 
    });
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch reports' });
  }
});

module.exports = router;
