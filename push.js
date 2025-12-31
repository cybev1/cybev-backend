// ============================================
// FILE: backend/routes/push.js
// PURPOSE: Push Notification API Routes
// ============================================

const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const auth = require('../middleware/auth');

// Configure web-push with VAPID keys
// Generate keys: npx web-push generate-vapid-keys
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-FbRouAf7-fGzgldXA1Ofe28XQ9-1KH9qPGU'
};

webpush.setVapidDetails(
  'mailto:admin@cybev.io',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// In-memory subscription store (use MongoDB in production)
let subscriptions = new Map();

// Subscribe to push notifications
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user.id;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    // Store subscription
    subscriptions.set(userId, {
      subscription,
      userId,
      createdAt: new Date(),
      preferences: {
        likes: true,
        comments: true,
        follows: true,
        mentions: true,
        messages: true,
        earnings: true,
        system: true
      }
    });

    // Save to database
    // await PushSubscription.findOneAndUpdate(
    //   { userId },
    //   { subscription, userId, createdAt: new Date() },
    //   { upsert: true }
    // );

    res.json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    subscriptions.delete(userId);
    
    // Remove from database
    // await PushSubscription.deleteOne({ userId });

    res.json({ success: true, message: 'Unsubscribed from push notifications' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Send test notification
router.post('/test', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const subData = subscriptions.get(userId);

    if (!subData) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const payload = JSON.stringify({
      title: 'CYBEV Test Notification',
      body: 'Push notifications are working! 🎉',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'test',
      data: {
        url: '/settings/push-notifications'
      }
    });

    await webpush.sendNotification(subData.subscription, payload);
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Test notification error:', error);
    if (error.statusCode === 410) {
      // Subscription expired, remove it
      subscriptions.delete(req.user.id);
      return res.status(410).json({ error: 'Subscription expired' });
    }
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Send notification to specific user (internal use)
async function sendToUser(userId, notification) {
  const subData = subscriptions.get(userId);
  if (!subData) return false;

  // Check user preferences
  if (notification.type && !subData.preferences[notification.type]) {
    return false;
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: notification.tag || 'notification',
    data: notification.data || {}
  });

  try {
    await webpush.sendNotification(subData.subscription, payload);
    return true;
  } catch (error) {
    if (error.statusCode === 410) {
      subscriptions.delete(userId);
    }
    return false;
  }
}

// Send notification to multiple users (admin use)
router.post('/broadcast', auth, async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { title, body, url, audience } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'broadcast',
      data: { url: url || '/' }
    });

    let sent = 0;
    let failed = 0;
    const toRemove = [];

    for (const [userId, subData] of subscriptions) {
      // Filter by audience if specified
      if (audience && audience !== 'all') {
        // Add audience filtering logic here
      }

      try {
        await webpush.sendNotification(subData.subscription, payload);
        sent++;
      } catch (error) {
        failed++;
        if (error.statusCode === 410) {
          toRemove.push(userId);
        }
      }
    }

    // Clean up expired subscriptions
    toRemove.forEach(userId => subscriptions.delete(userId));

    res.json({
      success: true,
      stats: { sent, failed, total: subscriptions.size }
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Failed to broadcast' });
  }
});

// Get VAPID public key
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Export helper function
router.sendToUser = sendToUser;

module.exports = router;
