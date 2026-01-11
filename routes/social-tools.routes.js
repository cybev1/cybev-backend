// ============================================
// FILE: routes/social.routes.js
// PURPOSE: Social Media Management & Automation
// Server-side automation using job queues
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// ==========================================
// MODELS
// ==========================================

// Social Account Schema
const socialAccountSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube'], required: true },
  accountId: { type: String },
  accountName: { type: String, required: true },
  username: { type: String },
  profileUrl: { type: String },
  avatar: { type: String },
  accessToken: { type: String }, // Encrypted
  refreshToken: { type: String },
  cookies: { type: String }, // Encrypted session cookies for browser automation
  status: { type: String, enum: ['active', 'paused', 'disconnected', 'error'], default: 'active' },
  lastError: { type: String },
  settings: {
    autoEngage: { type: Boolean, default: false },
    maxActionsPerHour: { type: Number, default: 20 },
    humanDelay: { type: Number, default: 3 }, // seconds
    activeHours: { start: Number, end: Number } // 0-23
  },
  stats: {
    followers: { type: Number, default: 0 },
    following: { type: Number, default: 0 },
    posts: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 },
    lastUpdated: Date
  },
  lastSync: Date,
  createdAt: { type: Date, default: Date.now }
});

// Scheduled Post Schema
const scheduledPostSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accounts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' }],
  platforms: [String],
  content: {
    text: { type: String, required: true },
    media: [{ url: String, type: String }],
    link: String
  },
  scheduledFor: { type: Date, required: true },
  timezone: { type: String, default: 'UTC' },
  status: { type: String, enum: ['pending', 'publishing', 'published', 'failed', 'cancelled'], default: 'pending' },
  results: [{
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' },
    platform: String,
    postId: String,
    postUrl: String,
    success: Boolean,
    error: String,
    publishedAt: Date
  }],
  createdAt: { type: Date, default: Date.now }
});

// Automation Rule Schema
const automationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true },
  type: { 
    type: String, 
    enum: ['auto_like', 'auto_comment', 'auto_follow', 'auto_message', 'auto_accept', 'engagement_boost'],
    required: true 
  },
  trigger: {
    type: { type: String, enum: ['hashtag', 'keyword', 'competitor', 'new_follower', 'schedule'] },
    value: String,
    schedule: String // cron expression
  },
  action: {
    template: String, // For comments/messages - pipe separated for random selection
    maxPerHour: { type: Number, default: 10 },
    maxPerDay: { type: Number, default: 100 }
  },
  filters: {
    minFollowers: Number,
    maxFollowers: Number,
    hasProfilePic: Boolean,
    accountAge: Number // days
  },
  stats: {
    executed: { type: Number, default: 0 },
    success: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    lastRun: Date
  },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Activity Log Schema
const activityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' },
  platform: String,
  type: { type: String, enum: [
    'post_published', 'post_failed', 'like_sent', 'comment_sent', 'follow_sent',
    'message_sent', 'like_received', 'comment_received', 'follow_received',
    'automation_action', 'error'
  ]},
  message: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

// Rate Limit Tracker
const rateLimitSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true },
  actionType: String,
  hourKey: String, // YYYY-MM-DD-HH
  dayKey: String,  // YYYY-MM-DD
  hourCount: { type: Number, default: 0 },
  dayCount: { type: Number, default: 0 },
  lastAction: Date
});

const SocialAccount = mongoose.models.SocialAccount || mongoose.model('SocialAccount', socialAccountSchema);
const ScheduledPost = mongoose.models.ScheduledPost || mongoose.model('ScheduledPost', scheduledPostSchema);
const Automation = mongoose.models.Automation || mongoose.model('Automation', automationSchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);
const RateLimit = mongoose.models.RateLimit || mongoose.model('RateLimit', rateLimitSchema);

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Check rate limits
async function checkRateLimit(accountId, actionType, maxPerHour = 30, maxPerDay = 200) {
  const now = new Date();
  const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  let rateLimit = await RateLimit.findOne({ account: accountId, actionType });
  
  if (!rateLimit) {
    rateLimit = new RateLimit({ account: accountId, actionType, hourKey, dayKey });
  }

  // Reset hour count if new hour
  if (rateLimit.hourKey !== hourKey) {
    rateLimit.hourKey = hourKey;
    rateLimit.hourCount = 0;
  }

  // Reset day count if new day
  if (rateLimit.dayKey !== dayKey) {
    rateLimit.dayKey = dayKey;
    rateLimit.dayCount = 0;
  }

  // Check limits
  if (rateLimit.hourCount >= maxPerHour) {
    return { allowed: false, reason: 'Hourly limit reached', resetIn: 60 - now.getMinutes() };
  }
  if (rateLimit.dayCount >= maxPerDay) {
    return { allowed: false, reason: 'Daily limit reached', resetIn: 24 - now.getHours() };
  }

  return { allowed: true, rateLimit };
}

// Increment rate limit
async function incrementRateLimit(accountId, actionType) {
  const now = new Date();
  const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  await RateLimit.findOneAndUpdate(
    { account: accountId, actionType },
    { 
      $inc: { hourCount: 1, dayCount: 1 },
      $set: { hourKey, dayKey, lastAction: now }
    },
    { upsert: true }
  );
}

// Log activity
async function logActivity(userId, accountId, platform, type, message, details = {}) {
  try {
    await ActivityLog.create({
      user: userId,
      account: accountId,
      platform,
      type,
      message,
      details
    });
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}

// ==========================================
// ACCOUNT ROUTES
// ==========================================

// GET /api/social/accounts - Get user's connected accounts
router.get('/accounts', auth, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ user: req.user.id })
      .select('-cookies -accessToken -refreshToken')
      .sort({ createdAt: -1 });

    res.json({ ok: true, accounts });
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social/accounts/connect - Connect new account
router.post('/accounts/connect', auth, async (req, res) => {
  try {
    const { platform, accountName, username, cookies, accessToken } = req.body;

    if (!platform || !accountName) {
      return res.status(400).json({ ok: false, error: 'Platform and account name required' });
    }

    // Check if account already exists
    const existing = await SocialAccount.findOne({
      user: req.user.id,
      platform,
      $or: [
        { accountName },
        { username }
      ]
    });

    if (existing) {
      return res.status(400).json({ ok: false, error: 'Account already connected' });
    }

    // Encrypt sensitive data
    const encryptedCookies = cookies ? encryptData(cookies) : null;
    const encryptedToken = accessToken ? encryptData(accessToken) : null;

    const account = new SocialAccount({
      user: req.user.id,
      platform,
      accountName,
      username,
      cookies: encryptedCookies,
      accessToken: encryptedToken,
      status: 'active'
    });

    await account.save();

    // Return account without sensitive data
    const response = account.toObject();
    delete response.cookies;
    delete response.accessToken;

    res.json({ ok: true, account: response });
  } catch (err) {
    console.error('Connect account error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social/accounts/:id/login - Login to account (for browser automation)
router.post('/accounts/:id/login', auth, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Account not found' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password required' });
    }

    // Queue login job for worker
    // In production, this would use Bull/Redis queue
    const jobId = crypto.randomBytes(8).toString('hex');
    
    // For now, we'll mark the account as pending login
    account.status = 'connecting';
    await account.save();

    // TODO: Queue actual login job
    // await loginQueue.add({ accountId: account._id, email, password, jobId });

    res.json({ 
      ok: true, 
      message: 'Login initiated',
      jobId,
      status: 'connecting'
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/social/accounts/:id - Disconnect account
router.delete('/accounts/:id', auth, async (req, res) => {
  try {
    const account = await SocialAccount.findOneAndDelete({ 
      _id: req.params.id, 
      user: req.user.id 
    });
    
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Account not found' });
    }

    // Delete related automations
    await Automation.deleteMany({ account: account._id });

    res.json({ ok: true, message: 'Account disconnected' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// STATS ROUTES
// ==========================================

// GET /api/social/stats - Get overall stats
router.get('/stats', auth, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ user: req.user.id });
    
    const totalFollowers = accounts.reduce((sum, a) => sum + (a.stats?.followers || 0), 0);
    const totalEngagements = accounts.reduce((sum, a) => sum + (a.stats?.engagement || 0), 0);

    // Get activity counts
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activityCounts = await ActivityLog.aggregate([
      { 
        $match: { 
          user: mongoose.Types.ObjectId(req.user.id),
          timestamp: { $gte: today }
        }
      },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const stats = {
      totalFollowers,
      totalEngagements,
      totalImpressions: 0, // Would need platform API
      followersChange: 0,
      engagementsChange: 0,
      impressionsChange: 0
    };

    res.json({ ok: true, stats });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// SCHEDULED POSTS ROUTES
// ==========================================

// GET /api/social/posts/scheduled - Get scheduled posts
router.get('/posts/scheduled', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const posts = await ScheduledPost.find({
      user: req.user.id,
      status: 'pending',
      scheduledFor: { $gte: new Date() }
    })
    .sort({ scheduledFor: 1 })
    .limit(limit)
    .populate('accounts', 'accountName platform');

    res.json({ ok: true, posts });
  } catch (err) {
    console.error('Get scheduled posts error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social/posts/schedule - Schedule a post
router.post('/posts/schedule', auth, async (req, res) => {
  try {
    const { accounts, platforms, content, scheduledFor, timezone } = req.body;

    if (!content?.text) {
      return res.status(400).json({ ok: false, error: 'Content text is required' });
    }

    if (!scheduledFor) {
      return res.status(400).json({ ok: false, error: 'Schedule time is required' });
    }

    const post = new ScheduledPost({
      user: req.user.id,
      accounts,
      platforms,
      content,
      scheduledFor: new Date(scheduledFor),
      timezone: timezone || 'UTC'
    });

    await post.save();

    res.json({ ok: true, post });
  } catch (err) {
    console.error('Schedule post error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social/posts/publish-now - Publish immediately
router.post('/posts/publish-now', auth, async (req, res) => {
  try {
    const { accounts, platforms, content } = req.body;

    if (!content?.text) {
      return res.status(400).json({ ok: false, error: 'Content text is required' });
    }

    // Create post record
    const post = new ScheduledPost({
      user: req.user.id,
      accounts,
      platforms,
      content,
      scheduledFor: new Date(),
      status: 'publishing'
    });

    await post.save();

    // TODO: Queue publish job
    // In production, this would trigger the worker

    res.json({ ok: true, post, message: 'Post queued for publishing' });
  } catch (err) {
    console.error('Publish post error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// AUTOMATION ROUTES
// ==========================================

// GET /api/social/automations - Get automations
router.get('/automations', auth, async (req, res) => {
  try {
    const automations = await Automation.find({ user: req.user.id })
      .populate('account', 'accountName platform')
      .sort({ createdAt: -1 });

    res.json({ ok: true, automations });
  } catch (err) {
    console.error('Get automations error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social/automations - Create automation
router.post('/automations', auth, async (req, res) => {
  try {
    const { account, type, trigger, action, filters, enabled } = req.body;

    // Verify account belongs to user
    const socialAccount = await SocialAccount.findOne({ _id: account, user: req.user.id });
    if (!socialAccount) {
      return res.status(404).json({ ok: false, error: 'Account not found' });
    }

    const automation = new Automation({
      user: req.user.id,
      account,
      type,
      trigger,
      action: {
        template: action?.template,
        maxPerHour: Math.min(action?.maxPerHour || 10, 30), // Cap at 30
        maxPerDay: Math.min(action?.maxPerDay || 100, 200) // Cap at 200
      },
      filters,
      enabled: enabled !== false
    });

    await automation.save();

    res.json({ ok: true, automation });
  } catch (err) {
    console.error('Create automation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social/automations/:id/toggle - Toggle automation
router.post('/automations/:id/toggle', auth, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!automation) {
      return res.status(404).json({ ok: false, error: 'Automation not found' });
    }

    automation.enabled = req.body.enabled !== undefined ? req.body.enabled : !automation.enabled;
    await automation.save();

    res.json({ ok: true, automation });
  } catch (err) {
    console.error('Toggle automation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/social/automations/:id - Delete automation
router.delete('/automations/:id', auth, async (req, res) => {
  try {
    const automation = await Automation.findOneAndDelete({ 
      _id: req.params.id, 
      user: req.user.id 
    });
    
    if (!automation) {
      return res.status(404).json({ ok: false, error: 'Automation not found' });
    }

    res.json({ ok: true, message: 'Automation deleted' });
  } catch (err) {
    console.error('Delete automation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/social/automations/stats - Get automation stats
router.get('/automations/stats', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activityCounts = await ActivityLog.aggregate([
      { 
        $match: { 
          user: mongoose.Types.ObjectId(req.user.id),
          timestamp: { $gte: today },
          type: { $in: ['like_sent', 'comment_sent', 'follow_sent', 'message_sent'] }
        }
      },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const stats = {
      actionsToday: activityCounts.reduce((sum, a) => sum + a.count, 0),
      likesToday: activityCounts.find(a => a._id === 'like_sent')?.count || 0,
      commentsToday: activityCounts.find(a => a._id === 'comment_sent')?.count || 0,
      followsToday: activityCounts.find(a => a._id === 'follow_sent')?.count || 0,
      messagesToday: activityCounts.find(a => a._id === 'message_sent')?.count || 0
    };

    res.json({ ok: true, stats });
  } catch (err) {
    console.error('Get automation stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ACTIVITY ROUTES
// ==========================================

// GET /api/social/activity - Get activity log
router.get('/activity', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;

    const activity = await ActivityLog.find({ user: req.user.id })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('account', 'accountName platform');

    res.json({ ok: true, activity });
  } catch (err) {
    console.error('Get activity error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// AUDIENCE DATA ROUTES
// ==========================================

// GET /api/social/audience/:accountId - Get scraped audience data
router.get('/audience/:accountId', auth, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({ 
      _id: req.params.accountId, 
      user: req.user.id 
    });
    
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Account not found' });
    }

    // Get audience data from separate collection if exists
    const AudienceData = mongoose.models.AudienceData || mongoose.model('AudienceData', new mongoose.Schema({
      account: mongoose.Schema.Types.ObjectId,
      profileId: String,
      name: String,
      profileUrl: String,
      avatar: String,
      mutualFriends: Number,
      location: String,
      work: String,
      education: String,
      scrapedAt: Date
    }));

    const audience = await AudienceData.find({ account: req.params.accountId })
      .sort({ scrapedAt: -1 })
      .limit(100);

    res.json({ ok: true, audience, total: await AudienceData.countDocuments({ account: req.params.accountId }) });
  } catch (err) {
    console.error('Get audience error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social/scrape/followers - Queue follower scrape
router.post('/scrape/followers', auth, async (req, res) => {
  try {
    const { accountId, targetProfile } = req.body;

    const account = await SocialAccount.findOne({ _id: accountId, user: req.user.id });
    if (!account) {
      return res.status(404).json({ ok: false, error: 'Account not found' });
    }

    // Queue scrape job
    const jobId = crypto.randomBytes(8).toString('hex');

    // TODO: Add to job queue
    // await scrapeQueue.add({ type: 'followers', accountId, targetProfile, jobId });

    res.json({ 
      ok: true, 
      message: 'Scraping started',
      jobId
    });
  } catch (err) {
    console.error('Scrape followers error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ENCRYPTION HELPERS
// ==========================================

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cybev-default-encryption-key-32c';
const IV_LENGTH = 16;

function encryptData(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptData(text) {
  if (!text) return null;
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = router;
