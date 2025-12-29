// ============================================
// FILE: routes/push.routes.js
// PATH: cybev-backend/routes/push.routes.js
// PURPOSE: Push notifications - subscribe, send, manage
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// PUSH SUBSCRIPTION SCHEMA
// ==========================================

let PushSubscription;
try {
  PushSubscription = mongoose.model('PushSubscription');
} catch {
  const pushSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: String,
      auth: String
    },
    device: {
      type: { type: String }, // mobile, desktop, tablet
      browser: String,
      os: String
    },
    isActive: { type: Boolean, default: true },
    lastUsed: { type: Date, default: Date.now }
  }, { timestamps: true });

  pushSchema.index({ user: 1 });
  pushSchema.index({ endpoint: 1 }, { unique: true });
  
  PushSubscription = mongoose.model('PushSubscription', pushSchema);
}

// ==========================================
// NOTIFICATION PREFERENCES SCHEMA
// ==========================================

let NotificationPreferences;
try {
  NotificationPreferences = mongoose.model('NotificationPreferences');
} catch {
  const prefsSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    push: {
      enabled: { type: Boolean, default: true },
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      follows: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      tips: { type: Boolean, default: true },
      nftSales: { type: Boolean, default: true },
      stakingRewards: { type: Boolean, default: true },
      liveStreams: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false }
    },
    email: {
      enabled: { type: Boolean, default: true },
      digest: { type: String, enum: ['none', 'daily', 'weekly'], default: 'daily' },
      marketing: { type: Boolean, default: false }
    },
    quiet: {
      enabled: { type: Boolean, default: false },
      startTime: { type: String, default: '22:00' },
      endTime: { type: String, default: '08:00' }
    }
  }, { timestamps: true });

  NotificationPreferences = mongoose.model('NotificationPreferences', prefsSchema);
}

// ==========================================
// SUBSCRIPTION MANAGEMENT
// ==========================================

// POST /api/push/subscribe - Subscribe to push notifications
router.post('/subscribe', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { subscription, device } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ ok: false, error: 'Invalid subscription' });
    }

    // Upsert subscription
    const pushSub = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        user: userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        device: device || {},
        isActive: true,
        lastUsed: new Date()
      },
      { upsert: true, new: true }
    );

    // Ensure user has notification preferences
    await NotificationPreferences.findOneAndUpdate(
      { user: userId },
      { $setOnInsert: { user: userId } },
      { upsert: true }
    );

    res.json({ ok: true, subscription: pushSub });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ ok: false, error: 'Failed to subscribe' });
  }
});

// POST /api/push/unsubscribe - Unsubscribe from push notifications
router.post('/unsubscribe', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { endpoint } = req.body;

    if (endpoint) {
      // Unsubscribe specific device
      await PushSubscription.deleteOne({ endpoint, user: userId });
    } else {
      // Unsubscribe all devices
      await PushSubscription.deleteMany({ user: userId });
    }

    res.json({ ok: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ ok: false, error: 'Failed to unsubscribe' });
  }
});

// GET /api/push/subscriptions - Get user's subscriptions
router.get('/subscriptions', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscriptions = await PushSubscription.find({ user: userId, isActive: true })
      .select('device lastUsed createdAt');

    res.json({ ok: true, subscriptions });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get subscriptions' });
  }
});

// ==========================================
// NOTIFICATION PREFERENCES
// ==========================================

// GET /api/push/preferences - Get notification preferences
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    let prefs = await NotificationPreferences.findOne({ user: userId });
    
    if (!prefs) {
      prefs = await NotificationPreferences.create({ user: userId });
    }

    res.json({ ok: true, preferences: prefs });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get preferences' });
  }
});

// PUT /api/push/preferences - Update notification preferences
router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    const prefs = await NotificationPreferences.findOneAndUpdate(
      { user: userId },
      updates,
      { new: true, upsert: true }
    );

    res.json({ ok: true, preferences: prefs });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update preferences' });
  }
});

// ==========================================
// SEND NOTIFICATIONS
// ==========================================

// Helper function to send push notification
const sendPushNotification = async (userId, notification) => {
  try {
    // Check user preferences
    const prefs = await NotificationPreferences.findOne({ user: userId });
    
    if (prefs && !prefs.push.enabled) {
      return { sent: false, reason: 'Push disabled' };
    }

    // Check quiet hours
    if (prefs?.quiet.enabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const { startTime, endTime } = prefs.quiet;
      
      if (startTime < endTime) {
        if (currentTime >= startTime && currentTime < endTime) {
          return { sent: false, reason: 'Quiet hours' };
        }
      } else {
        if (currentTime >= startTime || currentTime < endTime) {
          return { sent: false, reason: 'Quiet hours' };
        }
      }
    }

    // Get user's subscriptions
    const subscriptions = await PushSubscription.find({ user: userId, isActive: true });
    
    if (subscriptions.length === 0) {
      return { sent: false, reason: 'No subscriptions' };
    }

    // In production, use web-push library here
    // const webpush = require('web-push');
    // webpush.setVapidDetails(...)
    // await webpush.sendNotification(subscription, JSON.stringify(notification));

    // For now, emit via Socket.IO
    const io = global.io;
    if (io) {
      io.to(`user:${userId}`).emit('push-notification', notification);
    }

    // Update last used timestamp
    await PushSubscription.updateMany(
      { user: userId, isActive: true },
      { lastUsed: new Date() }
    );

    return { sent: true, count: subscriptions.length };
  } catch (error) {
    console.error('Send push error:', error);
    return { sent: false, reason: error.message };
  }
};

// POST /api/push/send - Send notification to user (internal use)
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { userId, title, body, icon, url, data } = req.body;

    // Check if sender is admin or system
    const User = mongoose.model('User');
    const sender = await User.findById(req.user.id);
    
    if (!sender?.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Admin only' });
    }

    const notification = {
      title,
      body,
      icon: icon || '/icon-192.png',
      badge: '/badge-72.png',
      url: url || '/',
      data: data || {},
      timestamp: new Date()
    };

    const result = await sendPushNotification(userId, notification);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send notification' });
  }
});

// POST /api/push/broadcast - Send to all users (admin only)
router.post('/broadcast', verifyToken, async (req, res) => {
  try {
    const { title, body, icon, url } = req.body;

    const User = mongoose.model('User');
    const sender = await User.findById(req.user.id);
    
    if (!sender?.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Admin only' });
    }

    // Get all users with push enabled
    const prefs = await NotificationPreferences.find({ 'push.enabled': true }).select('user');
    const userIds = prefs.map(p => p.user);

    const notification = {
      title,
      body,
      icon: icon || '/icon-192.png',
      url: url || '/',
      timestamp: new Date()
    };

    let sentCount = 0;
    for (const userId of userIds) {
      const result = await sendPushNotification(userId, notification);
      if (result.sent) sentCount++;
    }

    res.json({ ok: true, sent: sentCount, total: userIds.length });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ ok: false, error: 'Failed to broadcast' });
  }
});

// ==========================================
// NOTIFICATION TRIGGERS
// ==========================================

// These functions can be called from other routes to trigger notifications

const triggerNotification = async (type, data) => {
  try {
    const { recipientId, senderId, message, url } = data;
    
    // Get sender info
    const User = mongoose.model('User');
    const sender = senderId ? await User.findById(senderId).select('name avatar') : null;

    // Check preferences
    const prefs = await NotificationPreferences.findOne({ user: recipientId });
    if (prefs && prefs.push[type] === false) {
      return { triggered: false, reason: `${type} notifications disabled` };
    }

    const notification = {
      title: getNotificationTitle(type, sender?.name),
      body: message,
      icon: sender?.avatar || '/icon-192.png',
      url: url || '/',
      type,
      data
    };

    return await sendPushNotification(recipientId, notification);
  } catch (error) {
    console.error('Trigger notification error:', error);
    return { triggered: false, reason: error.message };
  }
};

const getNotificationTitle = (type, senderName) => {
  const name = senderName || 'Someone';
  switch (type) {
    case 'likes': return `${name} liked your post`;
    case 'comments': return `${name} commented on your post`;
    case 'follows': return `${name} started following you`;
    case 'mentions': return `${name} mentioned you`;
    case 'messages': return `New message from ${name}`;
    case 'tips': return `${name} sent you a tip!`;
    case 'nftSales': return 'Your NFT was sold!';
    case 'stakingRewards': return 'Staking rewards available';
    case 'liveStreams': return `${name} is live now!`;
    default: return 'New notification';
  }
};

// Export for use in other routes
module.exports = router;
module.exports.triggerNotification = triggerNotification;
module.exports.sendPushNotification = sendPushNotification;
