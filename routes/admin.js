// ============================================
// FILE: backend/routes/admin.js
// PURPOSE: Admin API Routes
// ============================================

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Admin middleware
const adminAuth = async (req, res, next) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && !req.user.isAdmin)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization failed' });
  }
};

// ============================================
// DASHBOARD STATS
// ============================================

router.get('/stats', auth, adminAuth, async (req, res) => {
  try {
    // In production, fetch from database
    // const totalUsers = await User.countDocuments();
    // const activeUsers = await User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 24*60*60*1000) } });
    
    const stats = {
      totalUsers: 1250,
      activeUsers: 890,
      totalPosts: 5420,
      totalBlogs: 342,
      pendingReports: 12,
      totalRevenue: 45280,
      newUsersToday: 28,
      postsToday: 156,
      commentsToday: 423,
      growthRate: 12.5
    };

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/activity', auth, adminAuth, async (req, res) => {
  try {
    const activity = [
      { type: 'user', user: 'john_doe', action: 'registered a new account', target: '', time: '2 minutes ago', status: 'success' },
      { type: 'report', user: 'System', action: 'flagged content for review:', target: 'Post #4521', time: '5 minutes ago', status: 'warning' },
      { type: 'payment', user: 'premium_user', action: 'upgraded to', target: 'Pro Plan', time: '12 minutes ago', status: 'success' },
      { type: 'content', user: 'creator123', action: 'published new blog:', target: 'Web3 Guide', time: '18 minutes ago', status: 'success' },
      { type: 'user', user: 'Admin', action: 'banned user:', target: 'spam_account', time: '25 minutes ago', status: 'error' }
    ];

    res.json({ activity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

router.get('/users', auth, adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, filter = 'all', search = '' } = req.query;

    // In production: await User.find({...}).skip().limit()
    const users = [
      { _id: '1', name: 'John Doe', username: 'johndoe', email: 'john@example.com', role: 'user', status: 'active', verified: true, premium: false, createdAt: '2024-01-15', postsCount: 45, followersCount: 1200 },
      { _id: '2', name: 'Jane Smith', username: 'janesmith', email: 'jane@example.com', role: 'creator', status: 'active', verified: true, premium: true, createdAt: '2024-02-20', postsCount: 128, followersCount: 5400 },
    ];

    res.json({
      users,
      page: parseInt(page),
      totalPages: 5,
      total: 100
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users/:userId/:action', auth, adminAuth, async (req, res) => {
  try {
    const { userId, action } = req.params;

    switch (action) {
      case 'suspend':
        // await User.findByIdAndUpdate(userId, { status: 'suspended' });
        res.json({ success: true, message: 'User suspended' });
        break;
      case 'activate':
        // await User.findByIdAndUpdate(userId, { status: 'active' });
        res.json({ success: true, message: 'User activated' });
        break;
      case 'delete':
        // await User.findByIdAndDelete(userId);
        res.json({ success: true, message: 'User deleted' });
        break;
      case 'verify':
        // await User.findByIdAndUpdate(userId, { verified: true });
        res.json({ success: true, message: 'User verified' });
        break;
      default:
        res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Action failed' });
  }
});

// ============================================
// CONTENT MODERATION
// ============================================

router.get('/content', auth, adminAuth, async (req, res) => {
  try {
    const { filter = 'all', type = 'all', page = 1 } = req.query;

    const content = [
      { _id: '1', type: 'post', title: 'Check out my new project!', author: { name: 'John Doe', username: 'johndoe' }, status: 'published', hasMedia: true, mediaType: 'image', views: 1245, reports: 0, createdAt: '2024-12-29T10:30:00Z' },
      { _id: '2', type: 'blog', title: 'Introduction to Web3', author: { name: 'Jane Smith', username: 'janesmith' }, status: 'published', hasMedia: false, views: 3420, reports: 0, createdAt: '2024-12-29T09:15:00Z' },
    ];

    res.json({ content, page: parseInt(page), totalPages: 10 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

router.post('/content/:contentId/:action', auth, adminAuth, async (req, res) => {
  try {
    const { contentId, action } = req.params;

    switch (action) {
      case 'approve':
        res.json({ success: true, message: 'Content approved' });
        break;
      case 'remove':
        res.json({ success: true, message: 'Content removed' });
        break;
      case 'flag':
        res.json({ success: true, message: 'Content flagged' });
        break;
      default:
        res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Action failed' });
  }
});

// ============================================
// REPORTS MANAGEMENT
// ============================================

router.get('/reports', auth, adminAuth, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const reports = [
      { _id: '1', type: 'harassment', status: 'pending', contentType: 'post', contentId: '123', contentPreview: 'Offensive content...', reporter: { name: 'John', username: 'john' }, reportedUser: { name: 'Bad Actor', username: 'badactor' }, reason: 'Harassment', createdAt: new Date() },
    ];

    res.json({ reports, stats: { pending: 12, resolved: 45, dismissed: 8 } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.post('/reports/:reportId/:action', auth, adminAuth, async (req, res) => {
  try {
    const { reportId, action } = req.params;

    switch (action) {
      case 'resolve':
        res.json({ success: true, message: 'Report resolved' });
        break;
      case 'dismiss':
        res.json({ success: true, message: 'Report dismissed' });
        break;
      case 'ban':
        res.json({ success: true, message: 'User banned' });
        break;
      default:
        res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Action failed' });
  }
});

// ============================================
// REVENUE & ANALYTICS
// ============================================

router.get('/revenue', auth, adminAuth, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    res.json({
      totalRevenue: 45280,
      subscriptionRevenue: 28500,
      tipsRevenue: 8420,
      adsRevenue: 5200,
      nftRevenue: 3160,
      growth: 23.5,
      transactions: 1245,
      avgTransaction: 36.4,
      pendingPayouts: 12350
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch revenue' });
  }
});

router.get('/analytics', auth, adminAuth, async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    res.json({
      pageViews: 245890,
      uniqueVisitors: 45230,
      avgSessionDuration: 272,
      bounceRate: 34.2,
      newUsers: 3420,
      engagement: 68.5,
      postsCreated: 8945,
      commentsPosted: 34520,
      topCountries: [
        { country: 'United States', users: 12450 },
        { country: 'Nigeria', users: 8920 },
        { country: 'United Kingdom', users: 5680 }
      ],
      deviceBreakdown: { mobile: 58, desktop: 35, tablet: 7 }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ============================================
// NOTIFICATIONS
// ============================================

router.get('/notifications', auth, adminAuth, async (req, res) => {
  try {
    const notifications = [
      { id: '1', title: 'New Feature!', body: 'Check out NFT minting', audience: 'all', sentAt: new Date(), delivered: 12450, clicked: 2340, status: 'sent' },
    ];

    res.json({ notifications, stats: { totalSent: 45230, subscribers: 12450 } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.post('/notifications/send', auth, adminAuth, async (req, res) => {
  try {
    const { title, body, url, audience, scheduledFor } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body required' });
    }

    // Send via push routes or schedule
    res.json({ success: true, message: scheduledFor ? 'Notification scheduled' : 'Notification sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// ============================================
// MONETIZATION SETTINGS
// ============================================

router.get('/monetization', auth, adminAuth, async (req, res) => {
  try {
    res.json({
      plans: [
        { id: '1', name: 'Free', price: 0, subscribers: 45230 },
        { id: '2', name: 'Pro', price: 9.99, subscribers: 1890 },
        { id: '3', name: 'Creator', price: 19.99, subscribers: 560 }
      ],
      creatorSettings: {
        revenueShare: 80,
        minPayout: 50,
        payoutSchedule: 'monthly'
      },
      adsSettings: {
        enabled: true,
        cpm: 2.50,
        fillRate: 78
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch monetization settings' });
  }
});

router.put('/monetization', auth, adminAuth, async (req, res) => {
  try {
    const { creatorSettings, adsSettings, plans } = req.body;
    // Update settings in database
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
