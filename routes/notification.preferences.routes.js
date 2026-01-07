// ============================================
// FILE: routes/notification.preferences.routes.js
// Notification Preferences Routes
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// GET NOTIFICATION PREFERENCES
// ==========================================

router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences.notifications email');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    // Default preferences if not set
    const defaultPreferences = {
      // In-app notifications
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      messages: true,
      tips: true,
      
      // Email notifications
      emailLikes: false,
      emailComments: true,
      emailFollows: true,
      emailMentions: true,
      emailMessages: false,
      emailDigest: true,  // Weekly digest
      marketing: false    // Marketing emails
    };
    
    const preferences = {
      ...defaultPreferences,
      ...user.preferences?.notifications
    };
    
    res.json({
      ok: true,
      preferences,
      email: user.email
    });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get preferences' });
  }
});

// ==========================================
// UPDATE NOTIFICATION PREFERENCES
// ==========================================

router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const {
      // In-app
      likes,
      comments,
      follows,
      mentions,
      messages,
      tips,
      // Email
      emailLikes,
      emailComments,
      emailFollows,
      emailMentions,
      emailMessages,
      emailDigest,
      marketing
    } = req.body;
    
    const updateData = {};
    
    // Only update provided fields
    if (likes !== undefined) updateData['preferences.notifications.likes'] = likes;
    if (comments !== undefined) updateData['preferences.notifications.comments'] = comments;
    if (follows !== undefined) updateData['preferences.notifications.follows'] = follows;
    if (mentions !== undefined) updateData['preferences.notifications.mentions'] = mentions;
    if (messages !== undefined) updateData['preferences.notifications.messages'] = messages;
    if (tips !== undefined) updateData['preferences.notifications.tips'] = tips;
    
    if (emailLikes !== undefined) updateData['preferences.notifications.emailLikes'] = emailLikes;
    if (emailComments !== undefined) updateData['preferences.notifications.emailComments'] = emailComments;
    if (emailFollows !== undefined) updateData['preferences.notifications.emailFollows'] = emailFollows;
    if (emailMentions !== undefined) updateData['preferences.notifications.emailMentions'] = emailMentions;
    if (emailMessages !== undefined) updateData['preferences.notifications.emailMessages'] = emailMessages;
    if (emailDigest !== undefined) updateData['preferences.notifications.emailDigest'] = emailDigest;
    if (marketing !== undefined) updateData['preferences.notifications.marketing'] = marketing;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, select: 'preferences.notifications' }
    );
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    res.json({
      ok: true,
      message: 'Preferences updated',
      preferences: user.preferences?.notifications
    });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update preferences' });
  }
});

// ==========================================
// UNSUBSCRIBE FROM EMAILS (Public - via token)
// ==========================================

router.get('/unsubscribe/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { type } = req.query; // digest, marketing, all
    
    // Decode token (simple base64 encoded email)
    let email;
    try {
      email = Buffer.from(token, 'base64').toString('utf8');
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid token' });
    }
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    // Update preferences based on type
    const updateData = {};
    
    switch (type) {
      case 'digest':
        updateData['preferences.notifications.emailDigest'] = false;
        break;
      case 'marketing':
        updateData['preferences.notifications.marketing'] = false;
        break;
      case 'all':
        updateData['preferences.notifications.emailLikes'] = false;
        updateData['preferences.notifications.emailComments'] = false;
        updateData['preferences.notifications.emailFollows'] = false;
        updateData['preferences.notifications.emailMentions'] = false;
        updateData['preferences.notifications.emailMessages'] = false;
        updateData['preferences.notifications.emailDigest'] = false;
        updateData['preferences.notifications.marketing'] = false;
        break;
      default:
        // Unsubscribe from all by default
        updateData['preferences.notifications.emailDigest'] = false;
        updateData['preferences.notifications.marketing'] = false;
    }
    
    await User.findByIdAndUpdate(user._id, { $set: updateData });
    
    // Return success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed | CYBEV</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .card {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          h1 { color: #111827; margin-bottom: 10px; }
          p { color: #6b7280; line-height: 1.6; }
          .icon { font-size: 48px; margin-bottom: 20px; }
          a {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: linear-gradient(135deg, #9333ea, #ec4899);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>Unsubscribed</h1>
          <p>You've been unsubscribed from ${type === 'all' ? 'all email notifications' : type === 'digest' ? 'weekly digest emails' : 'marketing emails'}.</p>
          <p>You can manage your preferences anytime in settings.</p>
          <a href="${process.env.FRONTEND_URL || 'https://cybev.io'}/settings">Go to Settings</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).send('Something went wrong. Please try again.');
  }
});

// ==========================================
// GET EMAIL STATUS (Admin)
// ==========================================

router.get('/email-status', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user.id);
    if (user?.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    
    let emailStatus;
    try {
      const { getEmailStatus } = require('../utils/sendEmail');
      emailStatus = getEmailStatus();
    } catch {
      emailStatus = { enabled: false, provider: 'none', configured: false };
    }
    
    res.json({
      ok: true,
      email: emailStatus
    });
  } catch (error) {
    console.error('Get email status error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get status' });
  }
});

// ==========================================
// TEST EMAIL (Admin)
// ==========================================

router.post('/test-email', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user?.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    
    const { template = 'welcome' } = req.body;
    
    let emailService;
    try {
      emailService = require('../utils/email.service');
    } catch {
      return res.status(500).json({ ok: false, error: 'Email service not available' });
    }
    
    const result = await emailService.sendEmail(user.email, template, {
      name: user.name,
      verificationUrl: 'https://cybev.io/test',
      resetUrl: 'https://cybev.io/test',
      stats: { newFollowers: 5, totalLikes: 42, totalComments: 13, profileViews: 128 },
      weekRange: 'Dec 30 - Jan 6'
    });
    
    res.json({
      ok: true,
      message: 'Test email sent',
      result
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
