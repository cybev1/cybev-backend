// ============================================
// FILE: routes/admin-analytics.routes.js
// Admin Analytics & Dashboard API
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Models
const User = require('../models/user.model');

// Admin check middleware
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('role isAdmin');
    if (!user || (user.role !== 'admin' && !user.isAdmin)) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Auth check failed' });
  }
};

// Apply to all routes
router.use(verifyToken, isAdmin);

// ==========================================
// DASHBOARD OVERVIEW
// ==========================================

router.get('/overview', async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const thisWeek = new Date(today - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    // Get all model references
    const Blog = mongoose.models.Blog;
    const Post = mongoose.models.Post;
    const LiveStream = mongoose.models.LiveStream;
    const Transaction = mongoose.models.Transaction;
    const Notification = mongoose.models.Notification;

    // User stats
    const [totalUsers, newUsersToday, newUsersWeek, newUsersMonth, activeUsersWeek] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: thisWeek } }),
      User.countDocuments({ createdAt: { $gte: thisMonth } }),
      User.countDocuments({ lastActive: { $gte: thisWeek } })
    ]);

    // Content stats
    let blogStats = { total: 0, today: 0, week: 0 };
    let postStats = { total: 0, today: 0, week: 0 };
    
    if (Blog) {
      [blogStats.total, blogStats.today, blogStats.week] = await Promise.all([
        Blog.countDocuments(),
        Blog.countDocuments({ createdAt: { $gte: today } }),
        Blog.countDocuments({ createdAt: { $gte: thisWeek } })
      ]);
    }

    if (Post) {
      [postStats.total, postStats.today, postStats.week] = await Promise.all([
        Post.countDocuments(),
        Post.countDocuments({ createdAt: { $gte: today } }),
        Post.countDocuments({ createdAt: { $gte: thisWeek } })
      ]);
    }

    // Live stream stats
    let streamStats = { total: 0, live: 0, today: 0 };
    if (LiveStream) {
      [streamStats.total, streamStats.live, streamStats.today] = await Promise.all([
        LiveStream.countDocuments(),
        LiveStream.countDocuments({ status: 'live' }),
        LiveStream.countDocuments({ createdAt: { $gte: today } })
      ]);
    }

    // Revenue stats
    let revenueStats = { total: 0, thisMonth: 0, lastMonth: 0 };
    if (Transaction) {
      const [totalRevenue, monthRevenue, prevMonthRevenue] = await Promise.all([
        Transaction.aggregate([
          { $match: { status: 'completed', type: { $in: ['tip', 'donation', 'subscription', 'token_purchase'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: thisMonth }, type: { $in: ['tip', 'donation', 'subscription', 'token_purchase'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: lastMonth, $lt: thisMonth }, type: { $in: ['tip', 'donation', 'subscription', 'token_purchase'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);
      
      revenueStats.total = totalRevenue[0]?.total || 0;
      revenueStats.thisMonth = monthRevenue[0]?.total || 0;
      revenueStats.lastMonth = prevMonthRevenue[0]?.total || 0;
    }

    // Calculate growth percentages
    const userGrowth = lastMonth > 0 ? Math.round(((newUsersMonth - newUsersWeek) / newUsersWeek) * 100) : 0;
    const revenueGrowth = revenueStats.lastMonth > 0 
      ? Math.round(((revenueStats.thisMonth - revenueStats.lastMonth) / revenueStats.lastMonth) * 100) 
      : 0;

    res.json({
      ok: true,
      overview: {
        users: {
          total: totalUsers,
          today: newUsersToday,
          week: newUsersWeek,
          month: newUsersMonth,
          activeWeek: activeUsersWeek,
          growth: userGrowth
        },
        content: {
          blogs: blogStats,
          posts: postStats,
          total: blogStats.total + postStats.total
        },
        streams: streamStats,
        revenue: {
          ...revenueStats,
          growth: revenueGrowth,
          currency: 'NGN'
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch overview' });
  }
});

// ==========================================
// USER ANALYTICS
// ==========================================

router.get('/users/chart', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const signups = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill in missing dates
    const data = [];
    const current = new Date(startDate);
    const today = new Date();
    
    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      const found = signups.find(s => s._id === dateStr);
      data.push({
        date: dateStr,
        signups: found?.count || 0
      });
      current.setDate(current.getDate() + 1);
    }

    res.json({ ok: true, data });
  } catch (error) {
    console.error('User chart error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch user chart' });
  }
});

router.get('/users/list', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status, sort = 'createdAt', order = 'desc' } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role;
    
    // Status filter for email verification and ban status
    if (status === 'banned') query.isBanned = true;
    if (status === 'verified') query.isEmailVerified = true;
    if (status === 'unverified') query.isEmailVerified = { $ne: true };
    if (status === 'active') query.isBanned = { $ne: true };

    const sortObj = { [sort]: order === 'asc' ? 1 : -1 };

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email username avatar role isVerified isEmailVerified isBanned banReason banExpires createdAt lastActive lastLogin tokenBalance walletBalance status')
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    // Get summary counts
    const [totalUnverified, totalBanned, totalVerified] = await Promise.all([
      User.countDocuments({ isEmailVerified: { $ne: true } }),
      User.countDocuments({ isBanned: true }),
      User.countDocuments({ isEmailVerified: true })
    ]);

    // Map status to isBanned for backwards compatibility
    const mappedUsers = users.map(user => ({
      ...user,
      isBanned: user.isBanned || user.status === 'suspended',
      isEmailVerified: user.isEmailVerified || false // Ensure this field exists
    }));

    res.json({
      ok: true,
      users: mappedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      summary: {
        totalUnverified,
        totalBanned,
        totalVerified
      }
    });
  } catch (error) {
    console.error('User list error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch users' });
  }
});

// ==========================================
// CONTENT ANALYTICS
// ==========================================

router.get('/content/stats', async (req, res) => {
  try {
    const Blog = mongoose.models.Blog;
    const Post = mongoose.models.Post;
    const Vlog = mongoose.models.Vlog;

    const stats = {
      blogs: { total: 0, published: 0, draft: 0, aiGenerated: 0 },
      posts: { total: 0, withMedia: 0 },
      vlogs: { total: 0 }
    };

    if (Blog) {
      [stats.blogs.total, stats.blogs.published, stats.blogs.draft, stats.blogs.aiGenerated] = await Promise.all([
        Blog.countDocuments(),
        Blog.countDocuments({ status: 'published' }),
        Blog.countDocuments({ status: 'draft' }),
        Blog.countDocuments({ isAIGenerated: true })
      ]);
    }

    if (Post) {
      [stats.posts.total, stats.posts.withMedia] = await Promise.all([
        Post.countDocuments(),
        Post.countDocuments({ $or: [{ images: { $exists: true, $ne: [] } }, { video: { $exists: true } }] })
      ]);
    }

    if (Vlog) {
      stats.vlogs.total = await Vlog.countDocuments();
    }

    res.json({ ok: true, stats });
  } catch (error) {
    console.error('Content stats error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch content stats' });
  }
});

router.get('/content/top', async (req, res) => {
  try {
    const { type = 'blog', limit = 10 } = req.query;
    const Blog = mongoose.models.Blog;
    const Post = mongoose.models.Post;

    let content = [];

    if (type === 'blog' && Blog) {
      content = await Blog.find({ status: 'published' })
        .select('title author views shares reactions createdAt featuredImage')
        .populate('author', 'name username avatar')
        .sort({ views: -1 })
        .limit(parseInt(limit))
        .lean();
      
      content = content.map(b => ({
        ...b,
        engagement: (b.views || 0) + (b.shares?.total || 0) + Object.values(b.reactions || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0)
      }));
    } else if (type === 'post' && Post) {
      content = await Post.find()
        .select('content author likes comments shares createdAt images')
        .populate('author', 'name username avatar')
        .sort({ 'likes.length': -1 })
        .limit(parseInt(limit))
        .lean();
      
      content = content.map(p => ({
        ...p,
        engagement: (p.likes?.length || 0) + (p.comments?.length || 0) + (p.shares || 0)
      }));
    }

    res.json({ ok: true, content });
  } catch (error) {
    console.error('Top content error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch top content' });
  }
});

// ==========================================
// REVENUE ANALYTICS
// ==========================================

router.get('/revenue/chart', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const Transaction = mongoose.models.Transaction;
    
    if (!Transaction) {
      return res.json({ ok: true, data: [] });
    }

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const revenue = await Transaction.aggregate([
      { 
        $match: { 
          status: 'completed', 
          createdAt: { $gte: startDate },
          type: { $in: ['tip', 'donation', 'subscription', 'token_purchase'] }
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill in missing dates
    const data = [];
    const current = new Date(startDate);
    const today = new Date();
    
    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      const found = revenue.find(r => r._id === dateStr);
      data.push({
        date: dateStr,
        revenue: found?.total || 0,
        transactions: found?.count || 0
      });
      current.setDate(current.getDate() + 1);
    }

    res.json({ ok: true, data });
  } catch (error) {
    console.error('Revenue chart error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch revenue chart' });
  }
});

router.get('/revenue/breakdown', async (req, res) => {
  try {
    const Transaction = mongoose.models.Transaction;
    
    if (!Transaction) {
      return res.json({ ok: true, breakdown: [] });
    }

    const breakdown = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.json({ ok: true, breakdown });
  } catch (error) {
    console.error('Revenue breakdown error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch breakdown' });
  }
});

// ==========================================
// LIVE STREAMS MANAGEMENT
// ==========================================

router.get('/streams', async (req, res) => {
  try {
    const LiveStream = mongoose.models.LiveStream;
    
    if (!LiveStream) {
      return res.json({ ok: true, streams: [] });
    }

    const { status, limit = 20 } = req.query;
    const query = status ? { status } : {};

    const streams = await LiveStream.find(query)
      .select('title host status viewerCount startedAt endedAt thumbnail')
      .populate('host', 'name username avatar')
      .sort({ startedAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ ok: true, streams });
  } catch (error) {
    console.error('Streams error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch streams' });
  }
});

// ==========================================
// REPORTS & FLAGS
// ==========================================

router.get('/reports', async (req, res) => {
  try {
    const Report = mongoose.models.Report;
    
    if (!Report) {
      return res.json({ ok: true, reports: [], total: 0 });
    }

    const { status = 'pending', page = 1, limit = 20 } = req.query;

    const [reports, total] = await Promise.all([
      Report.find({ status })
        .populate('reporter', 'name username avatar')
        .populate('reportedUser', 'name username avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Report.countDocuments({ status })
    ]);

    res.json({
      ok: true,
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch reports' });
  }
});

// ==========================================
// USER MANAGEMENT ACTIONS
// ==========================================

router.post('/users/:userId/ban', async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration } = req.body; // duration in days, null = permanent

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    user.isBanned = true;
    user.status = 'suspended';
    user.banReason = reason;
    user.banExpires = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
    user.bannedBy = req.user.id;
    user.bannedAt = new Date();
    await user.save();

    res.json({ ok: true, message: 'User banned', user: { id: user._id, isBanned: true } });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to ban user' });
  }
});

router.post('/users/:userId/unban', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        isBanned: false, 
        status: 'active',
        banReason: null, 
        banExpires: null,
        bannedBy: null,
        bannedAt: null
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, message: 'User unbanned' });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to unban user' });
  }
});

router.post('/users/:userId/verify', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { isVerified: true, verifiedAt: new Date() },
      { new: true }
    ).select('name username isVerified');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, message: 'User verified', user });
  } catch (error) {
    console.error('Verify user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to verify user' });
  }
});

router.post('/users/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['user', 'creator', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('name username role');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, message: 'Role updated', user });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update role' });
  }
});

// ==========================================
// SEND VERIFICATION REMINDER
// ==========================================

router.post('/users/:userId/send-verification-reminder', async (req, res) => {
  try {
    const { userId } = req.params;
    const crypto = require('crypto');
    const sendEmail = require('../utils/sendEmail');

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ ok: false, error: 'User email is already verified' });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    user.emailVerificationToken = verificationTokenHash;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    // Send reminder email
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/verify-email?token=${verificationToken}`;
    
    await sendEmail({
      to: user.email,
      subject: '⚠️ Action Required: Verify Your CYBEV Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #F59E0B;">Verify Your Email</h1>
          <p>Hi ${user.name},</p>
          <p>We noticed you haven't verified your email address yet. Please verify to unlock all CYBEV features:</p>
          <ul>
            <li>✅ Create and publish content</li>
            <li>✅ Earn tokens and rewards</li>
            <li>✅ Access premium features</li>
            <li>✅ Connect with the community</li>
          </ul>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
              Verify My Email
            </a>
          </div>
          <p>Or copy this link: <a href="${verificationUrl}">${verificationUrl}</a></p>
          <p>This link expires in 24 hours.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            If you didn't create a CYBEV account, please ignore this email.
          </p>
        </div>
      `
    });

    console.log('📧 Verification reminder sent to:', user.email);

    res.json({ ok: true, message: 'Verification reminder sent' });
  } catch (error) {
    console.error('Send verification reminder error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send reminder' });
  }
});

// Bulk send verification reminders
router.post('/users/send-bulk-verification-reminders', async (req, res) => {
  try {
    const crypto = require('crypto');
    const sendEmail = require('../utils/sendEmail');

    // Find all unverified users
    const unverifiedUsers = await User.find({ 
      isEmailVerified: { $ne: true },
      email: { $exists: true, $ne: '' }
    }).select('name email').limit(100); // Limit to prevent overload

    let sent = 0;
    let failed = 0;

    for (const user of unverifiedUsers) {
      try {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenHash = crypto
          .createHash('sha256')
          .update(verificationToken)
          .digest('hex');

        await User.findByIdAndUpdate(user._id, {
          emailVerificationToken: verificationTokenHash,
          emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000
        });

        const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/verify-email?token=${verificationToken}`;
        
        await sendEmail({
          to: user.email,
          subject: '⚠️ Complete Your CYBEV Registration',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #F59E0B;">Complete Your Registration</h1>
              <p>Hi ${user.name},</p>
              <p>You're almost there! Verify your email to start using CYBEV.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
                  Verify Email
                </a>
              </div>
              <p>This link expires in 24 hours.</p>
            </div>
          `
        });

        sent++;
      } catch (err) {
        console.error('Failed to send to:', user.email, err.message);
        failed++;
      }
    }

    res.json({ 
      ok: true, 
      message: `Sent ${sent} reminders, ${failed} failed`,
      sent,
      failed,
      total: unverifiedUsers.length
    });
  } catch (error) {
    console.error('Bulk reminder error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send bulk reminders' });
  }
});

// ==========================================
// CONTENT MODERATION
// ==========================================

router.post('/content/:type/:id/remove', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { reason } = req.body;

    let Model;
    if (type === 'blog') Model = mongoose.models.Blog;
    else if (type === 'post') Model = mongoose.models.Post;
    else if (type === 'vlog') Model = mongoose.models.Vlog;
    else if (type === 'comment') Model = mongoose.models.Comment;

    if (!Model) {
      return res.status(400).json({ ok: false, error: 'Invalid content type' });
    }

    const content = await Model.findByIdAndUpdate(
      id,
      { 
        isRemoved: true, 
        removedAt: new Date(), 
        removedBy: req.user.id,
        removalReason: reason 
      },
      { new: true }
    );

    if (!content) {
      return res.status(404).json({ ok: false, error: 'Content not found' });
    }

    res.json({ ok: true, message: 'Content removed' });
  } catch (error) {
    console.error('Remove content error:', error);
    res.status(500).json({ ok: false, error: 'Failed to remove content' });
  }
});

// ==========================================
// SYSTEM HEALTH
// ==========================================

router.get('/system/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Get collection sizes
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionStats = [];
    
    for (const col of collections.slice(0, 10)) {
      try {
        const stats = await mongoose.connection.db.collection(col.name).stats();
        collectionStats.push({
          name: col.name,
          count: stats.count,
          size: Math.round(stats.size / 1024) + ' KB'
        });
      } catch {}
    }

    res.json({
      ok: true,
      system: {
        database: dbStatus,
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        },
        node: process.version,
        collections: collectionStats
      }
    });
  } catch (error) {
    console.error('System health error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch system health' });
  }
});

// ==========================================
// DATA QUALITY - NAME AUDITING
// ==========================================

// Name validation helper
const validateNameQuality = (name) => {
  const issues = [];
  if (!name || typeof name !== 'string') return { score: 0, issues: ['Empty name'], severity: 'critical' };
  
  const trimmedName = name.trim();
  let score = 100;
  
  if (trimmedName.length < 2) { issues.push('Too short'); score -= 30; }
  if (/^\d+/.test(trimmedName)) { issues.push('Starts with numbers'); score -= 20; }
  if (/^\d{10,}/.test(trimmedName.replace(/\s/g, ''))) { issues.push('Phone number'); score -= 40; }
  if (!/[a-zA-Z]/.test(trimmedName)) { issues.push('No letters'); score -= 40; }
  
  const digitCount = (trimmedName.match(/\d/g) || []).length;
  if (digitCount > 4) { issues.push(`${digitCount} digits`); score -= 15; }
  if (/(.)\1{4,}/i.test(trimmedName)) { issues.push('Repeated chars'); score -= 25; }
  
  const fakeNames = ['test', 'user', 'admin', 'guest', 'demo', 'sample', 'fake', 'null', 'undefined', 'anonymous', 'n/a', 'none', 'xxx', 'yyy', 'zzz'];
  if (fakeNames.includes(trimmedName.toLowerCase())) { issues.push('Fake name'); score -= 40; }
  
  const letterCount = (trimmedName.match(/[a-zA-Z]/g) || []).length;
  if (letterCount < 2) { issues.push(`${letterCount} letter(s)`); score -= 25; }
  
  score = Math.max(0, score);
  return { score, issues, severity: score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical' };
};

// Get users with low-quality names
router.get('/data-quality/flagged-names', async (req, res) => {
  try {
    const { severity = 'all', page = 1, limit = 50 } = req.query;

    // Fetch all users and analyze names
    const allUsers = await User.find({})
      .select('name email username avatar isEmailVerified createdAt nameQualityScore flaggedForReview')
      .lean();

    const analyzed = allUsers.map(user => {
      const validation = validateNameQuality(user.name);
      return { ...user, ...validation };
    });

    // Filter by severity
    let filtered = analyzed;
    if (severity === 'critical') filtered = analyzed.filter(u => u.severity === 'critical');
    else if (severity === 'warning') filtered = analyzed.filter(u => u.severity === 'warning');
    else if (severity === 'flagged') filtered = analyzed.filter(u => u.severity !== 'good');

    // Sort by score (worst first)
    filtered.sort((a, b) => a.score - b.score);

    // Paginate
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + parseInt(limit));

    // Summary
    const summary = {
      total: allUsers.length,
      critical: analyzed.filter(u => u.severity === 'critical').length,
      warning: analyzed.filter(u => u.severity === 'warning').length,
      good: analyzed.filter(u => u.severity === 'good').length
    };

    res.json({
      ok: true,
      users: paginated,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filtered.length,
        pages: Math.ceil(filtered.length / limit)
      }
    });
  } catch (error) {
    console.error('Flagged names error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch flagged names' });
  }
});

// Update user name (admin override)
router.post('/data-quality/update-name/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'Name must be at least 2 characters' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        name: name.trim(),
        nameQualityScore: 100,
        nameQualityIssues: [],
        flaggedForReview: false
      },
      { new: true }
    ).select('name username email');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, message: 'Name updated', user });
  } catch (error) {
    console.error('Update name error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update name' });
  }
});

// Request user to update their name (sends email)
router.post('/data-quality/request-name-update/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const sendEmail = require('../utils/sendEmail');

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    await sendEmail({
      to: user.email,
      subject: '📝 Please Update Your CYBEV Profile Name',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8B5CF6;">Update Your Profile Name</h1>
          <p>Hi there,</p>
          <p>We noticed your profile name on CYBEV may need updating. To help build a great community, we ask that all users have a proper display name.</p>
          <p><strong>Current name:</strong> ${user.name}</p>
          <p>Please update your profile with your real name or a proper display name.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://cybev.io'}/settings/profile" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
              Update My Profile
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            Thank you for being part of the CYBEV community!
          </p>
        </div>
      `
    });

    // Mark user as notified
    await User.findByIdAndUpdate(userId, {
      nameUpdateRequestedAt: new Date()
    });

    res.json({ ok: true, message: 'Name update request sent' });
  } catch (error) {
    console.error('Request name update error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send request' });
  }
});

// Bulk request name updates for all flagged users
router.post('/data-quality/bulk-request-name-updates', async (req, res) => {
  try {
    const sendEmail = require('../utils/sendEmail');
    
    // Get all users with bad names
    const allUsers = await User.find({}).select('name email').lean();
    
    const flaggedUsers = allUsers.filter(user => {
      const validation = validateNameQuality(user.name);
      return validation.severity !== 'good';
    });

    let sent = 0;
    let failed = 0;

    for (const user of flaggedUsers.slice(0, 50)) { // Limit to 50
      try {
        await sendEmail({
          to: user.email,
          subject: '📝 Please Update Your CYBEV Profile Name',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #8B5CF6;">Update Your Profile</h1>
              <p>Please update your profile name to continue enjoying CYBEV.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'https://cybev.io'}/settings/profile" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
                  Update Profile
                </a>
              </div>
            </div>
          `
        });
        sent++;
      } catch {
        failed++;
      }
    }

    res.json({ 
      ok: true, 
      message: `Sent ${sent} requests, ${failed} failed`,
      sent,
      failed,
      total: flaggedUsers.length
    });
  } catch (error) {
    console.error('Bulk request error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send bulk requests' });
  }
});

module.exports = router;
