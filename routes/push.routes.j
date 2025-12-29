// ============================================
// FILE: routes/push.routes.js
// Push Notifications API
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Push Token Schema
const pushTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  platform: { type: String, enum: ['web', 'ios', 'android'], default: 'web' },
  deviceInfo: { type: String },
  active: { type: Boolean, default: true },
  lastUsed: { type: Date, default: Date.now }
}, { timestamps: true });

pushTokenSchema.index({ user: 1, token: 1 }, { unique: true });

let PushToken;
try {
  PushToken = mongoose.model('PushToken');
} catch {
  PushToken = mongoose.model('PushToken', pushTokenSchema);
}

// POST /api/push/register - Register push token
router.post('/register', verifyToken, async (req, res) => {
  try {
    const { token, platform, deviceInfo } = req.body;

    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token required' });
    }

    // Upsert token
    await PushToken.findOneAndUpdate(
      { user: req.user.id, token },
      {
        user: req.user.id,
        token,
        platform: platform || 'web',
        deviceInfo,
        active: true,
        lastUsed: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true, message: 'Push token registered' });
  } catch (error) {
    console.error('Push register error:', error);
    res.status(500).json({ ok: false, error: 'Failed to register token' });
  }
});

// POST /api/push/unregister - Unregister push token
router.post('/unregister', verifyToken, async (req, res) => {
  try {
    const { token } = req.body;

    if (token) {
      await PushToken.findOneAndUpdate(
        { user: req.user.id, token },
        { active: false }
      );
    } else {
      // Deactivate all tokens for user
      await PushToken.updateMany(
        { user: req.user.id },
        { active: false }
      );
    }

    res.json({ ok: true, message: 'Push token unregistered' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to unregister token' });
  }
});

// POST /api/push/send - Send push notification to user (internal use)
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    // Get user's active push tokens
    const tokens = await PushToken.find({ user: userId, active: true });

    if (tokens.length === 0) {
      return res.json({ ok: true, sent: 0, message: 'No active push tokens' });
    }

    // In production, use Firebase Admin SDK or similar
    // For now, log the notification
    console.log(`📱 Push notification to user ${userId}:`, { title, body, data });
    console.log(`   Tokens: ${tokens.length}`);

    // Here you would integrate with FCM:
    // const messaging = admin.messaging();
    // await messaging.sendMulticast({
    //   tokens: tokens.map(t => t.token),
    //   notification: { title, body },
    //   data
    // });

    res.json({ 
      ok: true, 
      sent: tokens.length,
      message: 'Push notifications queued'
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to send push' });
  }
});

// POST /api/push/broadcast - Broadcast to all users (admin only)
router.post('/broadcast', verifyToken, async (req, res) => {
  try {
    // Check if admin
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }

    const { title, body, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({ ok: false, error: 'Title and body required' });
    }

    const tokens = await PushToken.find({ active: true });
    
    console.log(`📢 Broadcasting push notification to ${tokens.length} devices:`, { title, body });

    // In production, batch send via FCM
    // Batch in groups of 500 (FCM limit)

    res.json({ 
      ok: true, 
      recipients: tokens.length,
      message: 'Broadcast queued'
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to broadcast' });
  }
});

// GET /api/push/status - Get push notification status for user
router.get('/status', verifyToken, async (req, res) => {
  try {
    const tokens = await PushToken.find({ user: req.user.id, active: true })
      .select('platform deviceInfo lastUsed createdAt');

    res.json({
      ok: true,
      enabled: tokens.length > 0,
      devices: tokens.map(t => ({
        platform: t.platform,
        deviceInfo: t.deviceInfo,
        lastUsed: t.lastUsed,
        registeredAt: t.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get status' });
  }
});

// Utility function to send push (can be imported by other routes)
const sendPushToUser = async (userId, notification) => {
  try {
    const tokens = await PushToken.find({ user: userId, active: true });
    if (tokens.length === 0) return { sent: 0 };

    console.log(`📱 Push to ${userId}:`, notification.title);
    
    // Integrate with FCM here in production
    
    return { sent: tokens.length };
  } catch (error) {
    console.error('Send push error:', error);
    return { sent: 0, error: error.message };
  }
};

module.exports = router;
module.exports.sendPushToUser = sendPushToUser;
