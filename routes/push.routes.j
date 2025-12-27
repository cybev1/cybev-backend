// ============================================
// FILE: routes/push.routes.js
// Push Notification API
// ============================================
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const mongoose = require('mongoose');

// Push Token Model
const pushTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['ios', 'android', 'web'], default: 'android' },
  active: { type: Boolean, default: true },
  lastUsed: { type: Date, default: Date.now }
}, { timestamps: true });

let PushToken;
try {
  PushToken = mongoose.model('PushToken');
} catch {
  PushToken = mongoose.model('PushToken', pushTokenSchema);
}

// Firebase Admin (optional - for real FCM)
let firebaseAdmin = null;
try {
  firebaseAdmin = require('firebase-admin');
  if (!firebaseAdmin.apps.length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;
    
    if (serviceAccount) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin initialized');
    }
  }
} catch (e) {
  console.log('⚠️ Firebase Admin not available - using mock push');
}

// POST /api/push/register - Register FCM token
router.post('/register', verifyToken, async (req, res) => {
  try {
    const { token, platform } = req.body;

    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token required' });
    }

    // Upsert token
    await PushToken.findOneAndUpdate(
      { token },
      { 
        user: req.user.id, 
        token, 
        platform: platform || 'android',
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

// POST /api/push/unregister - Unregister FCM token
router.post('/unregister', verifyToken, async (req, res) => {
  try {
    const { token } = req.body;

    if (token) {
      await PushToken.findOneAndUpdate(
        { token },
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

// POST /api/push/send - Send push notification (internal use)
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    if (!userId || !title) {
      return res.status(400).json({ ok: false, error: 'userId and title required' });
    }

    const result = await sendPushToUser(userId, title, body, data);
    res.json({ ok: true, sent: result.success, failed: result.failed });
  } catch (error) {
    console.error('Push send error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send notification' });
  }
});

// POST /api/push/broadcast - Broadcast to all users (admin only)
router.post('/broadcast', verifyToken, async (req, res) => {
  try {
    // Check admin
    const User = require('../models/user.model');
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }

    const { title, body, data } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Title required' });
    }

    // Get all active tokens
    const tokens = await PushToken.find({ active: true }).distinct('token');
    
    if (tokens.length === 0) {
      return res.json({ ok: true, sent: 0, message: 'No active tokens' });
    }

    const result = await sendPushToTokens(tokens, title, body, data);
    res.json({ ok: true, sent: result.success, failed: result.failed });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ ok: false, error: 'Failed to broadcast' });
  }
});

// GET /api/push/status - Get push notification status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const tokens = await PushToken.find({ user: req.user.id, active: true });
    
    res.json({
      ok: true,
      enabled: tokens.length > 0,
      devices: tokens.map(t => ({
        platform: t.platform,
        registeredAt: t.createdAt,
        lastUsed: t.lastUsed
      }))
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get status' });
  }
});

// Helper: Send push to user
async function sendPushToUser(userId, title, body, data = {}) {
  try {
    const tokens = await PushToken.find({ user: userId, active: true });
    
    if (tokens.length === 0) {
      return { success: 0, failed: 0 };
    }

    const tokenStrings = tokens.map(t => t.token);
    return await sendPushToTokens(tokenStrings, title, body, data);
  } catch (error) {
    console.error('Send push to user error:', error);
    return { success: 0, failed: 1 };
  }
}

// Helper: Send push to tokens
async function sendPushToTokens(tokens, title, body, data = {}) {
  let success = 0;
  let failed = 0;

  // If Firebase Admin is available, use FCM
  if (firebaseAdmin && firebaseAdmin.messaging) {
    try {
      const message = {
        notification: {
          title,
          body: body || ''
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        tokens
      };

      const response = await firebaseAdmin.messaging().sendMulticast(message);
      success = response.successCount;
      failed = response.failureCount;

      // Remove invalid tokens
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered') {
              PushToken.updateOne({ token: tokens[idx] }, { active: false }).catch(() => {});
            }
          }
        });
      }
    } catch (error) {
      console.error('FCM send error:', error);
      failed = tokens.length;
    }
  } else {
    // Mock push for development
    console.log(`📱 [MOCK PUSH] To ${tokens.length} devices:`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    console.log(`   Data:`, data);
    success = tokens.length;
  }

  return { success, failed };
}

// Export helper for use in other routes
module.exports = router;
module.exports.sendPushToUser = sendPushToUser;
module.exports.sendPushToTokens = sendPushToTokens;
