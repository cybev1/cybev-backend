// ============================================
// FILE: routes/notifications-advanced.routes.js
// Advanced Notification API Routes
// VERSION: 1.0
// Digest settings, scheduled, bulk
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

// Admin middleware
const requireAdmin = async (req, res, next) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// Get notification service
const getNotificationService = () => {
  try {
    return require('../services/notification.service');
  } catch (err) {
    console.error('Notification service not found:', err.message);
    return null;
  }
};

// ==========================================
// USER PREFERENCES
// ==========================================

/**
 * Get notification preferences
 * GET /api/notifications/preferences
 */
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const user = await User.findById(req.user.id).select('notificationPreferences');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const defaultPrefs = {
      // Notification types
      like: true,
      comment: true,
      follow: true,
      mention: true,
      message: true,
      announcement: true,
      reward: true,
      stream: true,
      event: true,
      group: true,
      
      // Delivery settings
      frequency: 'instant', // 'instant', 'hourly', 'daily', 'weekly'
      emailEnabled: true,
      pushEnabled: true,
      
      // Quiet hours
      quietHoursEnabled: false,
      quietHoursStart: 22, // 10 PM
      quietHoursEnd: 8, // 8 AM
      
      // Digest preferences
      digestTime: '09:00', // When to send daily digest
      digestDay: 1, // Monday for weekly digest (0-6)
      
      // Grouping
      groupSimilar: true
    };

    res.json({
      ok: true,
      preferences: { ...defaultPrefs, ...user.notificationPreferences }
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Update notification preferences
 * PUT /api/notifications/preferences
 */
router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const allowedFields = [
      'like', 'comment', 'follow', 'mention', 'message', 'announcement',
      'reward', 'stream', 'event', 'group', 'frequency', 'emailEnabled',
      'pushEnabled', 'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd',
      'digestTime', 'digestDay', 'groupSimilar'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[`notificationPreferences.${field}`] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true }
    ).select('notificationPreferences');

    res.json({
      ok: true,
      preferences: user.notificationPreferences
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Pause all notifications
 * POST /api/notifications/pause
 */
router.post('/pause', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const { duration } = req.body; // hours, or 0 for indefinite

    const pauseUntil = duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null;

    await User.findByIdAndUpdate(req.user.id, {
      'notificationPreferences.paused': true,
      'notificationPreferences.pausedUntil': pauseUntil
    });

    res.json({
      ok: true,
      message: pauseUntil 
        ? `Notifications paused until ${pauseUntil.toLocaleString()}`
        : 'Notifications paused indefinitely'
    });
  } catch (error) {
    console.error('Pause notifications error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Resume notifications
 * POST /api/notifications/resume
 */
router.post('/resume', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');

    await User.findByIdAndUpdate(req.user.id, {
      'notificationPreferences.paused': false,
      'notificationPreferences.pausedUntil': null
    });

    res.json({ ok: true, message: 'Notifications resumed' });
  } catch (error) {
    console.error('Resume notifications error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// SCHEDULED NOTIFICATIONS
// ==========================================

/**
 * Schedule a notification for later
 * POST /api/notifications/schedule
 */
router.post('/schedule', verifyToken, async (req, res) => {
  try {
    const notificationService = getNotificationService();
    if (!notificationService) {
      return res.status(500).json({ ok: false, error: 'Notification service not available' });
    }

    const { userId, title, message, type, scheduledFor, actionUrl, data } = req.body;

    if (!scheduledFor || !title) {
      return res.status(400).json({ ok: false, error: 'scheduledFor and title required' });
    }

    const scheduled = await notificationService.scheduleNotification({
      userId: userId || req.user.id,
      title,
      message,
      type: type || 'reminder',
      scheduledFor: new Date(scheduledFor),
      actionUrl,
      data
    });

    res.status(201).json({ ok: true, scheduled });
  } catch (error) {
    console.error('Schedule notification error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get scheduled notifications
 * GET /api/notifications/scheduled
 */
router.get('/scheduled', verifyToken, async (req, res) => {
  try {
    const ScheduledNotification = mongoose.models.ScheduledNotification;
    if (!ScheduledNotification) {
      return res.json({ ok: true, notifications: [] });
    }

    const notifications = await ScheduledNotification.find({
      userId: req.user.id,
      status: 'scheduled',
      scheduledFor: { $gte: new Date() }
    }).sort({ scheduledFor: 1 }).limit(50);

    res.json({ ok: true, notifications });
  } catch (error) {
    console.error('Get scheduled error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Cancel scheduled notification
 * DELETE /api/notifications/scheduled/:id
 */
router.delete('/scheduled/:id', verifyToken, async (req, res) => {
  try {
    const ScheduledNotification = mongoose.models.ScheduledNotification;
    if (!ScheduledNotification) {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }

    const notification = await ScheduledNotification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { status: 'cancelled' },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }

    res.json({ ok: true, message: 'Scheduled notification cancelled' });
  } catch (error) {
    console.error('Cancel scheduled error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// NOTIFICATION HISTORY & STATS
// ==========================================

/**
 * Get notification statistics
 * GET /api/notifications/stats
 */
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const Notification = mongoose.models.Notification || require('../models/notification.model');
    const { period = '7d' } = req.query;

    const periodMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    }[period] || 7 * 24 * 60 * 60 * 1000;

    const startDate = new Date(Date.now() - periodMs);

    const [byType, byDay, totals] = await Promise.all([
      // By type
      Notification.aggregate([
        { $match: { user: mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: startDate } } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      // By day
      Notification.aggregate([
        { $match: { user: mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Totals
      Notification.aggregate([
        { $match: { user: mongoose.Types.ObjectId(req.user.id) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unread: { $sum: { $cond: ['$read', 0, 1] } }
          }
        }
      ])
    ]);

    res.json({
      ok: true,
      stats: {
        byType: byType.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
        byDay,
        total: totals[0]?.total || 0,
        unread: totals[0]?.unread || 0
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// ADMIN: BULK & ANNOUNCEMENTS
// ==========================================

/**
 * Send announcement to all users (admin)
 * POST /api/notifications/admin/announcement
 */
router.post('/admin/announcement', verifyToken, requireAdmin, async (req, res) => {
  try {
    const notificationService = getNotificationService();
    if (!notificationService) {
      return res.status(500).json({ ok: false, error: 'Notification service not available' });
    }

    const { title, message, actionUrl, sendPush, sendEmail, targetAudience } = req.body;

    if (!title || !message) {
      return res.status(400).json({ ok: false, error: 'Title and message required' });
    }

    // Build user query based on audience
    let userQuery = { role: { $ne: 'banned' } };
    if (targetAudience === 'premium') {
      userQuery.isPremium = true;
    } else if (targetAudience === 'creators') {
      userQuery.isCreator = true;
    }

    const results = await notificationService.sendBulkNotification({
      userQuery,
      type: 'announcement',
      title,
      message,
      actionUrl,
      priority: 'high',
      sendPush: sendPush !== false,
      sendEmail: sendEmail === true
    });

    res.json({
      ok: true,
      message: `Announcement sent to ${results.sent} users`,
      results
    });
  } catch (error) {
    console.error('Send announcement error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Send notification to specific users (admin)
 * POST /api/notifications/admin/bulk
 */
router.post('/admin/bulk', verifyToken, requireAdmin, async (req, res) => {
  try {
    const notificationService = getNotificationService();
    if (!notificationService) {
      return res.status(500).json({ ok: false, error: 'Notification service not available' });
    }

    const { userIds, title, message, type, actionUrl, sendPush, sendEmail } = req.body;

    if (!userIds?.length || !title) {
      return res.status(400).json({ ok: false, error: 'userIds array and title required' });
    }

    const results = await notificationService.sendBulkNotification({
      userIds,
      type: type || 'admin',
      title,
      message,
      actionUrl,
      sendPush: sendPush !== false,
      sendEmail: sendEmail === true
    });

    res.json({
      ok: true,
      message: `Notification sent to ${results.sent} users`,
      results
    });
  } catch (error) {
    console.error('Bulk notification error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Process digest notifications (admin/cron)
 * POST /api/notifications/admin/process-digests
 */
router.post('/admin/process-digests', verifyToken, requireAdmin, async (req, res) => {
  try {
    const notificationService = getNotificationService();
    if (!notificationService) {
      return res.status(500).json({ ok: false, error: 'Notification service not available' });
    }

    const { frequency = 'daily' } = req.body;
    const results = await notificationService.processDigests(frequency);

    res.json({ ok: true, results });
  } catch (error) {
    console.error('Process digests error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Process scheduled notifications (admin/cron)
 * POST /api/notifications/admin/process-scheduled
 */
router.post('/admin/process-scheduled', verifyToken, requireAdmin, async (req, res) => {
  try {
    const notificationService = getNotificationService();
    if (!notificationService) {
      return res.status(500).json({ ok: false, error: 'Notification service not available' });
    }

    const results = await notificationService.processScheduledNotifications();
    res.json({ ok: true, results });
  } catch (error) {
    console.error('Process scheduled error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get notification delivery stats (admin)
 * GET /api/notifications/admin/delivery-stats
 */
router.get('/admin/delivery-stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const Notification = mongoose.models.Notification || require('../models/notification.model');
    const { period = '7d' } = req.query;

    const periodMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    }[period] || 7 * 24 * 60 * 60 * 1000;

    const startDate = new Date(Date.now() - periodMs);

    const [byStatus, byMethod, byType] = await Promise.all([
      Notification.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Notification.aggregate([
        { $match: { createdAt: { $gte: startDate }, deliveryMethod: { $exists: true } } },
        { $group: { _id: '$deliveryMethod', count: { $sum: 1 } } }
      ]),
      Notification.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      ok: true,
      stats: {
        byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        byMethod: byMethod.reduce((acc, m) => ({ ...acc, [m._id]: m.count }), {}),
        byType
      }
    });
  } catch (error) {
    console.error('Delivery stats error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
