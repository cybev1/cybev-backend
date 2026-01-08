// ============================================
// FILE: routes/analytics-enhanced.routes.js
// Enhanced Analytics API Routes
// VERSION: 1.0
// Real-time metrics, comparisons, exports
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// ==========================================
// DASHBOARD OVERVIEW
// ==========================================

/**
 * Get comprehensive dashboard analytics
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const Post = mongoose.models.Post || require('../models/post.model');
    const User = mongoose.models.User || require('../models/user.model');
    const Blog = mongoose.models.Blog;
    const { period = '7d' } = req.query;

    const periodMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    }[period] || 7 * 24 * 60 * 60 * 1000;

    const startDate = new Date(Date.now() - periodMs);
    const previousStartDate = new Date(Date.now() - (periodMs * 2));

    // Current period stats
    const [
      currentViews,
      currentLikes,
      currentComments,
      currentFollowers,
      previousViews,
      previousLikes,
      previousComments,
      previousFollowers
    ] = await Promise.all([
      // Current period
      Post.aggregate([
        { $match: { author: mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]),
      Post.aggregate([
        { $match: { author: mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: { $size: { $ifNull: ['$likes', []] } } } } }
      ]),
      Post.aggregate([
        { $match: { author: mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$commentsCount' } } }
      ]),
      User.findById(req.user.id).select('followers').then(u => u?.followers?.length || 0),
      // Previous period
      Post.aggregate([
        { $match: { author: mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: previousStartDate, $lt: startDate } } },
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]),
      Post.aggregate([
        { $match: { author: mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: previousStartDate, $lt: startDate } } },
        { $group: { _id: null, total: { $sum: { $size: { $ifNull: ['$likes', []] } } } } }
      ]),
      Post.aggregate([
        { $match: { author: mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: previousStartDate, $lt: startDate } } },
        { $group: { _id: null, total: { $sum: '$commentsCount' } } }
      ]),
      Promise.resolve(0) // Would need historical data for previous followers
    ]);

    // Calculate growth percentages
    const calcGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const currentViewsTotal = currentViews[0]?.total || 0;
    const currentLikesTotal = currentLikes[0]?.total || 0;
    const currentCommentsTotal = currentComments[0]?.total || 0;
    const previousViewsTotal = previousViews[0]?.total || 0;
    const previousLikesTotal = previousLikes[0]?.total || 0;
    const previousCommentsTotal = previousComments[0]?.total || 0;

    res.json({
      ok: true,
      dashboard: {
        overview: {
          views: {
            current: currentViewsTotal,
            previous: previousViewsTotal,
            growth: calcGrowth(currentViewsTotal, previousViewsTotal)
          },
          likes: {
            current: currentLikesTotal,
            previous: previousLikesTotal,
            growth: calcGrowth(currentLikesTotal, previousLikesTotal)
          },
          comments: {
            current: currentCommentsTotal,
            previous: previousCommentsTotal,
            growth: calcGrowth(currentCommentsTotal, previousCommentsTotal)
          },
          followers: {
            current: currentFollowers,
            growth: 0
          }
        },
        period
      }
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get time-series analytics data
 * GET /api/analytics/timeseries
 */
router.get('/timeseries', verifyToken, async (req, res) => {
  try {
    const Post = mongoose.models.Post || require('../models/post.model');
    const { metric = 'views', period = '7d', granularity = 'day' } = req.query;

    const periodMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    }[period] || 7 * 24 * 60 * 60 * 1000;

    const startDate = new Date(Date.now() - periodMs);

    const dateFormat = {
      'hour': '%Y-%m-%d %H:00',
      'day': '%Y-%m-%d',
      'week': '%Y-W%V',
      'month': '%Y-%m'
    }[granularity] || '%Y-%m-%d';

    const metricField = {
      'views': '$views',
      'likes': { $size: { $ifNull: ['$likes', []] } },
      'comments': '$commentsCount',
      'shares': '$shares'
    }[metric] || '$views';

    const data = await Post.aggregate([
      { 
        $match: { 
          author: mongoose.Types.ObjectId(req.user.id), 
          createdAt: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          value: { $sum: metricField },
          posts: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      ok: true,
      timeseries: data.map(d => ({
        date: d._id,
        value: d.value,
        posts: d.posts
      })),
      metric,
      period,
      granularity
    });
  } catch (error) {
    console.error('Timeseries analytics error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get top performing content
 * GET /api/analytics/top-content
 */
router.get('/top-content', verifyToken, async (req, res) => {
  try {
    const Post = mongoose.models.Post || require('../models/post.model');
    const Blog = mongoose.models.Blog;
    const { type = 'all', metric = 'views', limit = 10, period = '30d' } = req.query;

    const periodMs = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      'all': null
    }[period];

    const dateFilter = periodMs ? { createdAt: { $gte: new Date(Date.now() - periodMs) } } : {};

    const sortField = {
      'views': { views: -1 },
      'likes': { likesCount: -1 },
      'comments': { commentsCount: -1 },
      'engagement': { engagementScore: -1 }
    }[metric] || { views: -1 };

    // Get top posts
    const posts = await Post.find({
      author: req.user.id,
      ...dateFilter
    })
      .sort(sortField)
      .limit(parseInt(limit))
      .select('content media views likes commentsCount createdAt type')
      .lean();

    // Calculate engagement score
    const withEngagement = posts.map(p => ({
      ...p,
      likesCount: p.likes?.length || 0,
      engagementRate: p.views > 0 
        ? (((p.likes?.length || 0) + (p.commentsCount || 0)) / p.views * 100).toFixed(2)
        : 0
    }));

    // Get top blogs if available
    let blogs = [];
    if (Blog && (type === 'all' || type === 'blog')) {
      blogs = await Blog.find({
        author: req.user.id,
        ...dateFilter
      })
        .sort(sortField)
        .limit(parseInt(limit))
        .select('title slug views likes commentsCount createdAt')
        .lean();
    }

    res.json({
      ok: true,
      topContent: {
        posts: withEngagement,
        blogs
      },
      metric,
      period
    });
  } catch (error) {
    console.error('Top content error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get audience demographics
 * GET /api/analytics/audience
 */
router.get('/audience', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    
    // Get followers with demographics
    const user = await User.findById(req.user.id)
      .populate('followers', 'country city createdAt')
      .lean();

    if (!user?.followers?.length) {
      return res.json({
        ok: true,
        audience: {
          total: 0,
          byCountry: [],
          byCity: [],
          growth: []
        }
      });
    }

    // Group by country
    const byCountry = user.followers.reduce((acc, f) => {
      const country = f.country || 'Unknown';
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {});

    // Group by city
    const byCity = user.followers.reduce((acc, f) => {
      const city = f.city || 'Unknown';
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    // Follower growth over time
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const growth = user.followers
      .filter(f => new Date(f.createdAt) >= thirtyDaysAgo)
      .reduce((acc, f) => {
        const date = new Date(f.createdAt).toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

    res.json({
      ok: true,
      audience: {
        total: user.followers.length,
        byCountry: Object.entries(byCountry)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([country, count]) => ({ country, count, percentage: (count / user.followers.length * 100).toFixed(1) })),
        byCity: Object.entries(byCity)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([city, count]) => ({ city, count })),
        growth: Object.entries(growth)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }))
      }
    });
  } catch (error) {
    console.error('Audience analytics error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get engagement metrics
 * GET /api/analytics/engagement
 */
router.get('/engagement', verifyToken, async (req, res) => {
  try {
    const Post = mongoose.models.Post || require('../models/post.model');
    const { period = '30d' } = req.query;

    const periodMs = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    }[period] || 30 * 24 * 60 * 60 * 1000;

    const startDate = new Date(Date.now() - periodMs);

    const stats = await Post.aggregate([
      { 
        $match: { 
          author: mongoose.Types.ObjectId(req.user.id), 
          createdAt: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: { $size: { $ifNull: ['$likes', []] } } },
          totalComments: { $sum: '$commentsCount' },
          totalShares: { $sum: '$shares' },
          avgViews: { $avg: '$views' },
          avgLikes: { $avg: { $size: { $ifNull: ['$likes', []] } } },
          avgComments: { $avg: '$commentsCount' }
        }
      }
    ]);

    const data = stats[0] || {
      totalPosts: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      avgViews: 0,
      avgLikes: 0,
      avgComments: 0
    };

    // Calculate engagement rate
    const totalEngagements = data.totalLikes + data.totalComments + data.totalShares;
    const engagementRate = data.totalViews > 0 
      ? (totalEngagements / data.totalViews * 100).toFixed(2)
      : 0;

    res.json({
      ok: true,
      engagement: {
        ...data,
        engagementRate,
        avgEngagementPerPost: data.totalPosts > 0 
          ? (totalEngagements / data.totalPosts).toFixed(1)
          : 0
      },
      period
    });
  } catch (error) {
    console.error('Engagement analytics error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get real-time active viewers
 * GET /api/analytics/realtime
 */
router.get('/realtime', verifyToken, async (req, res) => {
  try {
    // This would typically use Redis or in-memory store
    // For now, return mock real-time data
    const io = global.io;
    let activeViewers = 0;

    if (io) {
      const rooms = io.sockets.adapter.rooms;
      // Count viewers in user's content rooms
      // This is a simplified version
      activeViewers = Math.floor(Math.random() * 10); // Mock data
    }

    res.json({
      ok: true,
      realtime: {
        activeViewers,
        activeOnProfile: 0,
        activeOnPosts: 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Realtime analytics error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Export analytics data
 * GET /api/analytics/export
 */
router.get('/export', verifyToken, async (req, res) => {
  try {
    const Post = mongoose.models.Post || require('../models/post.model');
    const { format = 'json', period = '30d' } = req.query;

    const periodMs = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      'all': null
    }[period];

    const dateFilter = periodMs ? { createdAt: { $gte: new Date(Date.now() - periodMs) } } : {};

    const posts = await Post.find({
      author: req.user.id,
      ...dateFilter
    })
      .sort({ createdAt: -1 })
      .select('content views likes commentsCount shares createdAt type')
      .lean();

    const exportData = posts.map(p => ({
      id: p._id,
      content: p.content?.substring(0, 100) + '...',
      type: p.type || 'post',
      views: p.views || 0,
      likes: p.likes?.length || 0,
      comments: p.commentsCount || 0,
      shares: p.shares || 0,
      createdAt: p.createdAt,
      engagementRate: p.views > 0 
        ? (((p.likes?.length || 0) + (p.commentsCount || 0)) / p.views * 100).toFixed(2)
        : 0
    }));

    if (format === 'csv') {
      const headers = 'ID,Content,Type,Views,Likes,Comments,Shares,Created,Engagement Rate\n';
      const csv = headers + exportData.map(p => 
        `"${p.id}","${p.content.replace(/"/g, '""')}","${p.type}",${p.views},${p.likes},${p.comments},${p.shares},"${p.createdAt}",${p.engagementRate}%`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${period}.csv`);
      return res.send(csv);
    }

    res.json({
      ok: true,
      data: exportData,
      exported: new Date().toISOString(),
      period
    });
  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Compare periods
 * GET /api/analytics/compare
 */
router.get('/compare', verifyToken, async (req, res) => {
  try {
    const Post = mongoose.models.Post || require('../models/post.model');
    const { period1 = '7d', period2 = 'previous' } = req.query;

    const periodMs = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    }[period1] || 7 * 24 * 60 * 60 * 1000;

    const period1Start = new Date(Date.now() - periodMs);
    const period2Start = new Date(Date.now() - (periodMs * 2));

    const getStats = async (startDate, endDate) => {
      const result = await Post.aggregate([
        { 
          $match: { 
            author: mongoose.Types.ObjectId(req.user.id), 
            createdAt: { $gte: startDate, ...(endDate && { $lt: endDate }) }
          } 
        },
        {
          $group: {
            _id: null,
            posts: { $sum: 1 },
            views: { $sum: '$views' },
            likes: { $sum: { $size: { $ifNull: ['$likes', []] } } },
            comments: { $sum: '$commentsCount' }
          }
        }
      ]);
      return result[0] || { posts: 0, views: 0, likes: 0, comments: 0 };
    };

    const [current, previous] = await Promise.all([
      getStats(period1Start, null),
      getStats(period2Start, period1Start)
    ]);

    const calcChange = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    res.json({
      ok: true,
      comparison: {
        current: { ...current, period: period1 },
        previous: { ...previous, period: 'previous' },
        changes: {
          posts: calcChange(current.posts, previous.posts),
          views: calcChange(current.views, previous.views),
          likes: calcChange(current.likes, previous.likes),
          comments: calcChange(current.comments, previous.comments)
        }
      }
    });
  } catch (error) {
    console.error('Compare analytics error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
