// ============================================
// FILE: routes/analytics.routes.js
// PATH: cybev-backend/routes/analytics.routes.js
// PURPOSE: User analytics - views, engagement, audience
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// ANALYTICS SCHEMA
// ==========================================

let Analytics;
try {
  Analytics = mongoose.model('Analytics');
} catch {
  const analyticsSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contentType: { type: String, enum: ['blog', 'post', 'nft', 'profile'], required: true },
    contentId: mongoose.Schema.Types.ObjectId,
    eventType: { type: String, enum: ['view', 'like', 'comment', 'share', 'bookmark', 'click'], required: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: {
      device: String,
      browser: String,
      country: String,
      city: String,
      referrer: String,
      duration: Number // time spent in seconds
    },
    date: { type: Date, default: Date.now }
  }, { timestamps: true });

  analyticsSchema.index({ user: 1, date: -1 });
  analyticsSchema.index({ contentId: 1, eventType: 1 });
  Analytics = mongoose.model('Analytics', analyticsSchema);
}

// ==========================================
// TRACK EVENTS
// ==========================================

// POST /api/analytics/track - Track an event
router.post('/track', async (req, res) => {
  try {
    const { userId, contentType, contentId, eventType, metadata } = req.body;

    if (!userId || !contentType || !eventType) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Get viewer info from token if available
    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        viewerId = decoded.id;
      } catch {}
    }

    await Analytics.create({
      user: userId,
      contentType,
      contentId,
      eventType,
      viewer: viewerId,
      metadata: {
        ...metadata,
        userAgent: req.headers['user-agent'],
        referrer: req.headers.referer
      }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Track error:', error);
    res.status(500).json({ ok: false, error: 'Failed to track' });
  }
});

// ==========================================
// USER ANALYTICS
// ==========================================

// GET /api/analytics - Get user's analytics
router.get('/', verifyToken, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const userId = req.user.id;

    let startDate;
    switch (period) {
      case '7d': startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
      case '90d': startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); break;
      case '1y': startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get event counts
    const eventCounts = await Analytics.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), date: { $gte: startDate } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } }
    ]);

    // Transform to object
    const events = {};
    eventCounts.forEach(e => { events[e._id] = e.count; });

    // Get daily views
    const dailyViews = await Analytics.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId), 
          eventType: 'view',
          date: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get unique viewers
    const uniqueViewers = await Analytics.distinct('viewer', {
      user: new mongoose.Types.ObjectId(userId),
      eventType: 'view',
      date: { $gte: startDate },
      viewer: { $ne: null }
    });

    // Get top content
    const topContent = await Analytics.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId), 
          eventType: 'view',
          contentId: { $ne: null },
          date: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: { contentId: '$contentId', contentType: '$contentType' },
          views: { $sum: 1 }
        }
      },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]);

    // Get device breakdown
    const devices = await Analytics.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId), 
          date: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: '$metadata.device',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get location data
    const locations = await Analytics.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId),
          'metadata.country': { $ne: null },
          date: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: '$metadata.country',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Calculate engagement rate
    const totalViews = events.view || 0;
    const totalEngagements = (events.like || 0) + (events.comment || 0) + (events.share || 0);
    const engagementRate = totalViews > 0 ? ((totalEngagements / totalViews) * 100).toFixed(1) : 0;

    // Get previous period for comparison
    const previousStart = new Date(startDate.getTime() - (Date.now() - startDate.getTime()));
    const previousViews = await Analytics.countDocuments({
      user: new mongoose.Types.ObjectId(userId),
      eventType: 'view',
      date: { $gte: previousStart, $lt: startDate }
    });

    const viewsChange = previousViews > 0 
      ? (((totalViews - previousViews) / previousViews) * 100).toFixed(1)
      : 100;

    res.json({
      ok: true,
      analytics: {
        summary: {
          totalViews: events.view || 0,
          totalLikes: events.like || 0,
          totalComments: events.comment || 0,
          totalShares: events.share || 0,
          totalBookmarks: events.bookmark || 0,
          uniqueVisitors: uniqueViewers.length,
          engagementRate: parseFloat(engagementRate),
          viewsChange: parseFloat(viewsChange)
        },
        dailyViews,
        topContent,
        devices: devices.map(d => ({ device: d._id || 'unknown', count: d.count })),
        locations: locations.map(l => ({ country: l._id, count: l.count }))
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get analytics' });
  }
});

// GET /api/analytics/content/:contentId - Get content analytics
router.get('/content/:contentId', verifyToken, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { period = '30d' } = req.query;

    let startDate;
    switch (period) {
      case '7d': startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const events = await Analytics.aggregate([
      { 
        $match: { 
          contentId: new mongoose.Types.ObjectId(contentId),
          date: { $gte: startDate } 
        } 
      },
      { $group: { _id: '$eventType', count: { $sum: 1 } } }
    ]);

    const dailyStats = await Analytics.aggregate([
      { 
        $match: { 
          contentId: new mongoose.Types.ObjectId(contentId),
          date: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: { 
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            event: '$eventType'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    const summary = {};
    events.forEach(e => { summary[e._id] = e.count; });

    res.json({
      ok: true,
      analytics: {
        summary,
        dailyStats
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get content analytics' });
  }
});

// GET /api/analytics/realtime - Get realtime stats (last 5 minutes)
router.get('/realtime', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const activeViewers = await Analytics.countDocuments({
      user: new mongoose.Types.ObjectId(userId),
      eventType: 'view',
      date: { $gte: fiveMinutesAgo }
    });

    const recentEvents = await Analytics.find({
      user: new mongoose.Types.ObjectId(userId),
      date: { $gte: fiveMinutesAgo }
    })
    .populate('viewer', 'name username avatar')
    .sort({ date: -1 })
    .limit(10);

    res.json({
      ok: true,
      realtime: {
        activeViewers,
        recentEvents
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get realtime data' });
  }
});

// GET /api/analytics/followers - Get follower analytics
router.get('/followers', verifyToken, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const userId = req.user.id;

    let startDate;
    switch (period) {
      case '7d': startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Try to get Follow model
    let Follow;
    try {
      Follow = mongoose.model('Follow');
    } catch {
      return res.json({ ok: true, followers: { total: 0, growth: [], newFollowers: 0 } });
    }

    // Get total followers
    const totalFollowers = await Follow.countDocuments({ following: userId });

    // Get follower growth
    const growth = await Follow.aggregate([
      { 
        $match: { 
          following: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate } 
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

    // New followers in period
    const newFollowers = await Follow.countDocuments({
      following: userId,
      createdAt: { $gte: startDate }
    });

    res.json({
      ok: true,
      followers: {
        total: totalFollowers,
        growth,
        newFollowers
      }
    });
  } catch (error) {
    console.error('Follower analytics error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get follower analytics' });
  }
});

module.exports = router;
