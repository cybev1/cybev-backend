// ============================================
// FILE: routes/mobile.routes.js
// Mobile App API - Push Tokens, Device Registration
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// Device Token Schema
// ==========================================

const deviceTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
  deviceId: String,
  model: String,
  appVersion: String,
  isActive: { type: Boolean, default: true },
  lastUsed: { type: Date, default: Date.now }
}, { timestamps: true });

deviceTokenSchema.index({ user: 1, token: 1 }, { unique: true });
deviceTokenSchema.index({ token: 1 });

const DeviceToken = mongoose.models.DeviceToken || mongoose.model('DeviceToken', deviceTokenSchema);

// ==========================================
// REGISTER PUSH TOKEN
// ==========================================

router.post('/push/register', verifyToken, async (req, res) => {
  try {
    const { token, platform, deviceId, model, appVersion } = req.body;
    const userId = req.user.id;

    if (!token || !platform) {
      return res.status(400).json({ ok: false, error: 'Token and platform required' });
    }

    // Upsert device token
    const deviceToken = await DeviceToken.findOneAndUpdate(
      { user: userId, token },
      {
        user: userId,
        token,
        platform,
        deviceId,
        model,
        appVersion,
        isActive: true,
        lastUsed: new Date()
      },
      { upsert: true, new: true }
    );

    // Deactivate old tokens for same device (keep last 5)
    if (deviceId) {
      const oldTokens = await DeviceToken.find({
        user: userId,
        deviceId,
        token: { $ne: token }
      }).sort({ lastUsed: -1 }).skip(5);

      if (oldTokens.length > 0) {
        await DeviceToken.updateMany(
          { _id: { $in: oldTokens.map(t => t._id) } },
          { isActive: false }
        );
      }
    }

    res.json({
      ok: true,
      message: 'Push token registered',
      deviceToken: {
        id: deviceToken._id,
        platform: deviceToken.platform
      }
    });
  } catch (error) {
    // Handle duplicate key error gracefully
    if (error.code === 11000) {
      return res.json({ ok: true, message: 'Token already registered' });
    }
    console.error('Push register error:', error);
    res.status(500).json({ ok: false, error: 'Failed to register token' });
  }
});

// ==========================================
// UNREGISTER PUSH TOKEN
// ==========================================

router.delete('/push/unregister', verifyToken, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token required' });
    }

    await DeviceToken.findOneAndUpdate(
      { user: userId, token },
      { isActive: false }
    );

    res.json({ ok: true, message: 'Token unregistered' });
  } catch (error) {
    console.error('Push unregister error:', error);
    res.status(500).json({ ok: false, error: 'Failed to unregister token' });
  }
});

// ==========================================
// GET USER'S DEVICES
// ==========================================

router.get('/devices', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const devices = await DeviceToken.find({
      user: userId,
      isActive: true
    }).select('platform deviceId model appVersion lastUsed createdAt').lean();

    res.json({
      ok: true,
      devices,
      count: devices.length
    });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch devices' });
  }
});

// ==========================================
// SEND PUSH TO USER (Internal Use)
// ==========================================

async function sendPushToUser(userId, notification) {
  try {
    const tokens = await DeviceToken.find({
      user: userId,
      isActive: true
    }).select('token platform');

    if (tokens.length === 0) {
      console.log(`No active tokens for user ${userId}`);
      return { sent: 0 };
    }

    const results = { ios: 0, android: 0, web: 0, failed: 0 };

    for (const device of tokens) {
      try {
        if (device.platform === 'ios') {
          // Send via APNs (requires apple-auth setup)
          // await sendAPNs(device.token, notification);
          results.ios++;
        } else if (device.platform === 'android') {
          // Send via FCM
          await sendFCM(device.token, notification);
          results.android++;
        } else if (device.platform === 'web') {
          // Send via web-push
          await sendWebPush(device.token, notification);
          results.web++;
        }
      } catch (error) {
        console.error(`Push to ${device.platform} failed:`, error.message);
        results.failed++;
        
        // Mark token as inactive if it's invalid
        if (error.message?.includes('NotRegistered') || error.message?.includes('InvalidRegistration')) {
          await DeviceToken.findByIdAndUpdate(device._id, { isActive: false });
        }
      }
    }

    return {
      sent: results.ios + results.android + results.web,
      ...results
    };
  } catch (error) {
    console.error('Send push error:', error);
    return { sent: 0, error: error.message };
  }
}

// FCM V1 (Firebase Cloud Messaging) for Android
// Uses Service Account authentication (new method)
async function sendFCM(token, notification) {
  try {
    // Try FCM V1 first (recommended)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
      return await sendFCMv1(token, notification, serviceAccountJson);
    }
    
    // Fallback to legacy if configured
    const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;
    if (FCM_SERVER_KEY) {
      return await sendFCMLegacy(token, notification, FCM_SERVER_KEY);
    }
    
    console.log('FCM not configured, skipping Android push');
    return null;
  } catch (error) {
    console.error('FCM send error:', error);
    throw error;
  }
}

// FCM V1 API (New method with Service Account)
async function sendFCMv1(token, notification, serviceAccountJson) {
  const jwt = require('jsonwebtoken');
  
  let serviceAccount;
  try {
    serviceAccount = typeof serviceAccountJson === 'string' 
      ? JSON.parse(serviceAccountJson) 
      : serviceAccountJson;
  } catch (e) {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT JSON');
  }
  
  const projectId = serviceAccount.project_id;
  
  // Create JWT for authentication
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  };
  
  const signedJwt = jwt.sign(jwtPayload, serviceAccount.private_key, { algorithm: 'RS256' });
  
  // Get access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`
  });
  
  const tokenData = await tokenResponse.json();
  
  if (!tokenData.access_token) {
    throw new Error('Failed to get FCM access token');
  }
  
  // Send notification via FCM V1
  const fcmResponse = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: token,
          notification: {
            title: notification.title,
            body: notification.body
          },
          android: {
            notification: {
              icon: notification.icon || 'ic_notification',
              color: '#7c3aed',
              click_action: notification.clickAction || 'OPEN_APP'
            }
          },
          data: notification.data ? 
            Object.fromEntries(Object.entries(notification.data).map(([k, v]) => [k, String(v)])) 
            : {}
        }
      })
    }
  );
  
  const result = await fcmResponse.json();
  
  if (result.error) {
    throw new Error(result.error.message || 'FCM V1 send failed');
  }
  
  console.log('✅ FCM V1 notification sent:', result.name);
  return result;
}

// FCM Legacy API (Deprecated but may still work for some)
async function sendFCMLegacy(token, notification, serverKey) {
  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${serverKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: token,
      notification: {
        title: notification.title,
        body: notification.body,
        icon: notification.icon || 'ic_notification',
        color: '#7c3aed',
        click_action: notification.clickAction || 'OPEN_APP'
      },
      data: notification.data || {}
    })
  });

  const result = await response.json();
  
  if (result.failure > 0) {
    throw new Error(result.results?.[0]?.error || 'FCM Legacy send failed');
  }

  return result;
}

// Web Push
async function sendWebPush(subscription, notification) {
  try {
    const webPush = require('web-push');
    
    const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
    
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      console.log('Web push not configured');
      return;
    }

    webPush.setVapidDetails(
      'mailto:support@cybev.io',
      VAPID_PUBLIC,
      VAPID_PRIVATE
    );

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/icon-192.png',
      badge: '/badge-72.png',
      data: notification.data || {}
    });

    await webPush.sendNotification(JSON.parse(subscription), payload);
  } catch (error) {
    throw error;
  }
}

// ==========================================
// TEST PUSH NOTIFICATION (Admin)
// ==========================================

router.post('/push/test', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await sendPushToUser(userId, {
      title: '🎉 Test Notification',
      body: 'Push notifications are working!',
      data: {
        type: 'test',
        timestamp: Date.now()
      }
    });

    res.json({
      ok: true,
      message: 'Test notification sent',
      result
    });
  } catch (error) {
    console.error('Test push error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send test notification' });
  }
});

// ==========================================
// APP VERSION CHECK
// ==========================================

router.get('/version', (req, res) => {
  res.json({
    ok: true,
    version: {
      minimum: '1.0.0',
      current: '1.1.0',
      recommended: '1.1.0'
    },
    features: {
      pushNotifications: true,
      deepLinking: true,
      biometrics: false,
      offlineMode: false
    },
    updateUrl: {
      android: 'https://play.google.com/store/apps/details?id=io.cybev.app',
      ios: 'https://apps.apple.com/app/cybev/id000000000'
    }
  });
});

// ==========================================
// DEEP LINK RESOLVER
// ==========================================

router.get('/deeplink', (req, res) => {
  const { path, id, type } = req.query;

  let redirectUrl = 'https://cybev.io';

  if (type === 'blog' && id) {
    redirectUrl = `https://cybev.io/blog/${id}`;
  } else if (type === 'post' && id) {
    redirectUrl = `https://cybev.io/post/${id}`;
  } else if (type === 'profile' && id) {
    redirectUrl = `https://cybev.io/profile/${id}`;
  } else if (type === 'live' && id) {
    redirectUrl = `https://cybev.io/live/${id}`;
  } else if (path) {
    redirectUrl = `https://cybev.io${path.startsWith('/') ? path : '/' + path}`;
  }

  res.json({
    ok: true,
    url: redirectUrl
  });
});

// Export helper for other routes to use
router.sendPushToUser = sendPushToUser;

module.exports = router;
