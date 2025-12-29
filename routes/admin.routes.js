// ============================================
// FILE: routes/admin.routes.js
// PATH: cybev-backend/routes/admin.routes.js
// PURPOSE: Admin dashboard - users, content, analytics, settings
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Admin middleware
const adminOnly = async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id);
    
    if (!user || (!user.isAdmin && user.role !== 'admin')) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    
    req.adminUser = user;
    next();
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Authorization failed' });
  }
};

// ==========================================
// DASHBOARD STATS
// ==========================================

// GET /api/admin/stats - Get dashboard statistics
router.get('/stats', verifyToken, adminOnly, async (req, res) => {
  try {
    const User = mongoose.model('User');
    
    // Get models if they exist
    let Blog, NFT, Stake, Transaction;
    try { Blog = mongoose.model('Blog'); } catch {}
    try { NFT = mongoose.model('NFT'); } catch {}
    try { Stake = mongoose.model('Stake'); } catch {}
    try { Transaction = mongoose.model('Transaction'); } catch {}

    // User stats
    const totalUsers = await User.countDocuments();
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    const newUsersThisWeek = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const activeUsers = await User.countDocuments({
      lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    // Content stats
    let totalBlogs = 0, publishedBlogs = 0, totalNFTs = 0, listedNFTs = 0;
    if (Blog) {
      totalBlogs = await Blog.countDocuments();
      publishedBlogs = await Blog.countDocuments({ status: 'published' });
    }
    if (NFT) {
      totalNFTs = await NFT.countDocuments();
      listedNFTs = await NFT.countDocuments({ isListed: true, status: 'minted' });
    }

    // Staking stats
    let totalStaked = 0, activeStakes = 0;
    if (Stake) {
      const stakingStats = await Stake.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]);
      if (stakingStats[0]) {
        totalStaked = stakingStats[0].total;
        activeStakes = stakingStats[0].count;
      }
    }

    // Growth trends (last 7 days)
    const userGrowth = await User.aggregate([
      { 
        $match: { 
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      ok: true,
      stats: {
        users: {
          total: totalUsers,
          today: newUsersToday,
          thisWeek: newUsersThisWeek,
          thisMonth: newUsersThisMonth,
          verified: verifiedUsers,
          active: activeUsers
        },
        content: {
          totalBlogs,
          publishedBlogs,
          totalNFTs,
          listedNFTs
        },
        staking: {
          totalStaked,
          activeStakes
        },
        growth: {
          users: userGrowth
        }
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get stats' });
  }
});

// ==========================================
// USER MANAGEMENT
// ==========================================

// GET /api/admin/users - Get all users
router.get('/users', verifyToken, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status, sort = 'newest' } = req.query;

    const User = mongoose.model('User');
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (status === 'verified') query.isVerified = true;
    if (status === 'banned') query.isBanned = true;
    if (status === 'admin') query.isAdmin = true;

    let sortOption = { createdAt: -1 };
    if (sort === 'oldest') sortOption = { createdAt: 1 };
    if (sort === 'name') sortOption = { name: 1 };

    const users = await User.find(query)
      .select('-password')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({ ok: true, users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get users' });
  }
});

// PUT /api/admin/users/:userId - Update user
router.put('/users/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    const User = mongoose.model('User');

    if (userId === req.user.id && updates.isAdmin === false) {
      return res.status(400).json({ ok: false, error: 'Cannot remove your own admin status' });
    }

    const allowedUpdates = ['name', 'email', 'role', 'isAdmin', 'isVerified', 'isBanned', 'tokenBalance'];
    const updateData = {};
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) updateData[field] = updates[field];
    });

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    res.json({ ok: true, user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update user' });
  }
});

// POST /api/admin/users/:userId/ban - Ban user
router.post('/users/:userId/ban', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const User = mongoose.model('User');

    if (userId === req.user.id) {
      return res.status(400).json({ ok: false, error: 'Cannot ban yourself' });
    }

    const user = await User.findByIdAndUpdate(userId, { 
      isBanned: true, banReason: reason, bannedAt: new Date(), bannedBy: req.user.id
    }, { new: true }).select('-password');

    res.json({ ok: true, user, message: 'User banned' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to ban user' });
  }
});

// POST /api/admin/users/:userId/unban - Unban user
router.post('/users/:userId/unban', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const User = mongoose.model('User');

    const user = await User.findByIdAndUpdate(userId, { 
      isBanned: false, banReason: null, bannedAt: null
    }, { new: true }).select('-password');

    res.json({ ok: true, user, message: 'User unbanned' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to unban user' });
  }
});

// DELETE /api/admin/users/:userId - Delete user
router.delete('/users/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ ok: false, error: 'Cannot delete yourself' });
    }
    await mongoose.model('User').findByIdAndDelete(userId);
    res.json({ ok: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to delete user' });
  }
});

// ==========================================
// CONTENT MODERATION
// ==========================================

// GET /api/admin/content - Get all content
router.get('/content', verifyToken, adminOnly, async (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 20 } = req.query;
    const content = [];

    if (type === 'all' || type === 'blogs') {
      try {
        const Blog = mongoose.model('Blog');
        const blogs = await Blog.find().populate('author', 'name username').sort({ createdAt: -1 }).limit(10);
        content.push(...blogs.map(b => ({ ...b.toObject(), contentType: 'blog' })));
      } catch {}
    }

    if (type === 'all' || type === 'nfts') {
      try {
        const NFT = mongoose.model('NFT');
        const nfts = await NFT.find().populate('creator', 'name username').sort({ createdAt: -1 }).limit(10);
        content.push(...nfts.map(n => ({ ...n.toObject(), contentType: 'nft' })));
      } catch {}
    }

    content.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, content });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get content' });
  }
});

// POST /api/admin/content/:contentId/hide - Hide content
router.post('/content/:contentId/hide', verifyToken, adminOnly, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { type, reason } = req.body;

    let Model;
    if (type === 'blog') Model = mongoose.model('Blog');
    else if (type === 'nft') Model = mongoose.model('NFT');
    else return res.status(400).json({ ok: false, error: 'Invalid type' });

    await Model.findByIdAndUpdate(contentId, { isHidden: true, hiddenReason: reason });
    res.json({ ok: true, message: 'Content hidden' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to hide content' });
  }
});

// POST /api/admin/content/:contentId/feature - Feature content
router.post('/content/:contentId/feature', verifyToken, adminOnly, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { type, featured } = req.body;

    let Model;
    if (type === 'blog') Model = mongoose.model('Blog');
    else if (type === 'nft') Model = mongoose.model('NFT');
    else return res.status(400).json({ ok: false, error: 'Invalid type' });

    await Model.findByIdAndUpdate(contentId, { isFeatured: featured });
    res.json({ ok: true, message: featured ? 'Featured' : 'Unfeatured' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update' });
  }
});

// ==========================================
// ANALYTICS
// ==========================================

// GET /api/admin/analytics - Get analytics
router.get('/analytics', verifyToken, adminOnly, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const User = mongoose.model('User');

    let startDate;
    switch (period) {
      case '24h': startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
      case '7d': startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const userSignups = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const topUsers = await User.find().sort({ tokenBalance: -1 }).limit(10).select('name username avatar tokenBalance');

    res.json({ ok: true, analytics: { userSignups, topUsers } });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get analytics' });
  }
});

// ==========================================
// PLATFORM SETTINGS
// ==========================================

let Settings;
try { Settings = mongoose.model('Settings'); } catch {
  const settingsSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    value: mongoose.Schema.Types.Mixed,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }, { timestamps: true });
  Settings = mongoose.model('Settings', settingsSchema);
}

// GET /api/admin/settings
router.get('/settings', verifyToken, adminOnly, async (req, res) => {
  try {
    const settings = await Settings.find();
    const settingsObj = {};
    settings.forEach(s => { settingsObj[s.key] = s.value; });
    res.json({ ok: true, settings: settingsObj });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get settings' });
  }
});

// PUT /api/admin/settings
router.put('/settings', verifyToken, adminOnly, async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await Settings.findOneAndUpdate({ key }, { value, updatedBy: req.user.id }, { upsert: true });
    }
    res.json({ ok: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update settings' });
  }
});

// ==========================================
// BULK ACTIONS
// ==========================================

router.post('/bulk/users', verifyToken, adminOnly, async (req, res) => {
  try {
    const { action, userIds } = req.body;
    const User = mongoose.model('User');
    const filteredIds = userIds.filter(id => id !== req.user.id);

    let result;
    switch (action) {
      case 'ban':
        result = await User.updateMany({ _id: { $in: filteredIds } }, { isBanned: true });
        break;
      case 'unban':
        result = await User.updateMany({ _id: { $in: filteredIds } }, { isBanned: false });
        break;
      case 'verify':
        result = await User.updateMany({ _id: { $in: filteredIds } }, { isVerified: true });
        break;
      case 'delete':
        result = await User.deleteMany({ _id: { $in: filteredIds } });
        break;
      default:
        return res.status(400).json({ ok: false, error: 'Invalid action' });
    }

    res.json({ ok: true, message: `${action} completed`, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Bulk action failed' });
  }
});

module.exports = router;
