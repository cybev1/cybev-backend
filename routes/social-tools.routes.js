/**
 * Social Tools Routes - Facebook Automation
 * CYBEV Studio v2.0
 * GitHub: https://github.com/cybev1/cybev-backend/routes/social-tools.routes.js
 * 
 * Features:
 * - Account management (with encrypted credentials)
 * - Data scraping (search, followers, friends, groups)
 * - Auto engagement (like, comment, follow, friend request)
 * - Messaging (individual and bulk)
 * - Audience management
 * - Analytics
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

// ============================================
// ENCRYPTION CONFIGURATION
// ============================================
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cYb3v2026S3cur3K3y@Fb4ut0m4t10n!';
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  try {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

// ============================================
// SCHEMAS
// ============================================

// Social Account Schema
const socialAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, enum: ['facebook', 'instagram', 'twitter', 'linkedin'], default: 'facebook' },
  email: { type: String, required: true },
  encryptedPassword: String,
  encryptedCookies: String,
  encryptedToken: String,
  profileName: String,
  profileUrl: String,
  profilePicture: String,
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  lastUsed: Date,
  stats: {
    friendsSent: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
    postsLiked: { type: Number, default: 0 },
    commentsPosted: { type: Number, default: 0 },
    profilesScraped: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

// Audience Schema
const audienceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' },
  platform: { type: String, default: 'facebook' },
  profileId: String,
  name: String,
  profileUrl: String,
  profilePicture: String,
  email: String,
  phone: String,
  location: String,
  bio: String,
  occupation: String,
  isFriend: { type: Boolean, default: false },
  isFollower: { type: Boolean, default: false },
  isFollowing: { type: Boolean, default: false },
  mutualFriends: { type: Number, default: 0 },
  tags: [String],
  source: String, // 'search', 'followers', 'friends', 'group', etc.
  sourceDetails: String,
  lastInteraction: Date,
  createdAt: { type: Date, default: Date.now }
});

// Automation Schema
const automationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true },
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['auto_like', 'auto_comment', 'auto_follow', 'auto_friend_request', 'auto_message'],
    required: true 
  },
  trigger: {
    type: { type: String, enum: ['audience', 'hashtag', 'new_follower', 'schedule'] },
    value: String,
    filters: {
      location: String,
      isFriend: Boolean,
      isFollower: Boolean,
      mutualFriendsMin: Number
    }
  },
  action: {
    templates: [String], // Comment/message templates
    delay: { min: Number, max: Number } // Random delay in seconds
  },
  limits: {
    perHour: { type: Number, default: 20 },
    perDay: { type: Number, default: 100 }
  },
  stats: {
    executed: { type: Number, default: 0 },
    successful: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: true },
  lastRun: Date,
  nextRun: Date,
  createdAt: { type: Date, default: Date.now }
});

// Job Schema
const socialJobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true },
  type: { type: String, required: true },
  data: { type: Object, default: {} },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'], default: 'pending' },
  result: Object,
  error: String,
  attempts: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  startedAt: Date,
  completedAt: Date
});

// Activity Log Schema
const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' },
  action: { type: String, required: true },
  target: String,
  targetUrl: String,
  status: { type: String, enum: ['success', 'failed'], default: 'success' },
  error: String,
  metadata: Object,
  createdAt: { type: Date, default: Date.now, expires: 604800 } // Auto-delete after 7 days
});

// Rate Limit Schema
const rateLimitSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true },
  action: { type: String, required: true },
  hourlyCount: { type: Number, default: 0 },
  dailyCount: { type: Number, default: 0 },
  hourlyReset: Date,
  dailyReset: Date
});

const SocialAccount = mongoose.models.SocialAccount || mongoose.model('SocialAccount', socialAccountSchema);
const Audience = mongoose.models.Audience || mongoose.model('Audience', audienceSchema);
const Automation = mongoose.models.Automation || mongoose.model('Automation', automationSchema);
const SocialJob = mongoose.models.SocialJob || mongoose.model('SocialJob', socialJobSchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);
const RateLimit = mongoose.models.RateLimit || mongoose.model('RateLimit', rateLimitSchema);

// ============================================
// RATE LIMITS
// ============================================
const RATE_LIMITS = {
  like: { perHour: 30, perDay: 200 },
  comment: { perHour: 20, perDay: 100 },
  follow: { perHour: 20, perDay: 50 },
  friend_request: { perHour: 15, perDay: 30 },
  message: { perHour: 15, perDay: 50 }
};

// ============================================
// ACCOUNT ROUTES
// ============================================

// Get all accounts for user
router.get('/accounts', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    
    const accounts = await SocialAccount.find({ userId })
      .select('-encryptedPassword -encryptedCookies -encryptedToken')
      .sort({ createdAt: -1 });

    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new account
router.post('/accounts', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { email, password, cookies, platform = 'facebook' } = req.body;

    const account = new SocialAccount({
      userId,
      platform,
      email,
      encryptedPassword: password ? encrypt(password) : undefined,
      encryptedCookies: cookies ? encrypt(JSON.stringify(cookies)) : undefined
    });

    await account.save();

    // Create a job to verify the account
    const job = new SocialJob({
      userId,
      accountId: account._id,
      type: 'verify_account',
      data: {}
    });
    await job.save();

    res.json({ 
      account: {
        _id: account._id,
        email: account.email,
        platform: account.platform,
        isActive: account.isActive
      },
      message: 'Account added. Verification in progress...'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update account
router.put('/accounts/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;
    const { cookies, isActive } = req.body;

    const account = await SocialAccount.findOne({ _id: id, userId });
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (cookies) {
      account.encryptedCookies = encrypt(JSON.stringify(cookies));
    }
    if (typeof isActive === 'boolean') {
      account.isActive = isActive;
    }

    await account.save();

    res.json({ message: 'Account updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete account
router.delete('/accounts/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;

    await SocialAccount.deleteOne({ _id: id, userId });
    await Automation.deleteMany({ accountId: id });
    await SocialJob.deleteMany({ accountId: id });

    res.json({ message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCRAPING ROUTES
// ============================================

// Search people
router.post('/scrape/search', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { accountId, query, filters = {}, maxResults = 50 } = req.body;

    const job = new SocialJob({
      userId,
      accountId,
      type: 'scrape_search',
      data: { query, filters, maxResults }
    });
    await job.save();

    res.json({ 
      jobId: job._id,
      message: 'Search job created',
      status: 'pending'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scrape followers/friends
router.post('/scrape/:type', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { type } = req.params;
    const { accountId, profileUrl, maxResults = 100 } = req.body;

    const validTypes = ['followers', 'friends', 'suggestions', 'post_engagers', 'group_members'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid scrape type' });
    }

    const job = new SocialJob({
      userId,
      accountId,
      type: `scrape_${type}`,
      data: { profileUrl, maxResults }
    });
    await job.save();

    res.json({ 
      jobId: job._id,
      message: `${type} scrape job created`,
      status: 'pending'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENGAGEMENT ROUTES
// ============================================

// Like a post
router.post('/engage/like', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { accountId, postUrl } = req.body;

    const job = new SocialJob({
      userId,
      accountId,
      type: 'auto_like',
      data: { postUrl }
    });
    await job.save();

    res.json({ jobId: job._id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Comment on a post
router.post('/engage/comment', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { accountId, postUrl, comment } = req.body;

    const job = new SocialJob({
      userId,
      accountId,
      type: 'auto_comment',
      data: { postUrl, comment }
    });
    await job.save();

    res.json({ jobId: job._id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send friend request
router.post('/engage/friend-request', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { accountId, profileUrl } = req.body;

    const job = new SocialJob({
      userId,
      accountId,
      type: 'send_friend_request',
      data: { profileUrl }
    });
    await job.save();

    res.json({ jobId: job._id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Follow a profile
router.post('/engage/follow', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { accountId, profileUrl } = req.body;

    const job = new SocialJob({
      userId,
      accountId,
      type: 'auto_follow',
      data: { profileUrl }
    });
    await job.save();

    res.json({ jobId: job._id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MESSAGING ROUTES
// ============================================

// Send message
router.post('/message/send', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { accountId, profileUrl, message } = req.body;

    const job = new SocialJob({
      userId,
      accountId,
      type: 'send_message',
      data: { profileUrl, message }
    });
    await job.save();

    res.json({ jobId: job._id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk message
router.post('/message/bulk', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { accountId, audienceIds, messageTemplate } = req.body;

    const jobs = await Promise.all(
      audienceIds.map(async (audienceId) => {
        const audience = await Audience.findById(audienceId);
        if (!audience) return null;

        const job = new SocialJob({
          userId,
          accountId,
          type: 'send_message',
          data: { 
            profileUrl: audience.profileUrl, 
            message: messageTemplate.replace('{name}', audience.name || 'Friend')
          }
        });
        await job.save();
        return job._id;
      })
    );

    res.json({ 
      jobIds: jobs.filter(Boolean),
      total: jobs.filter(Boolean).length,
      status: 'pending'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUTOMATION ROUTES
// ============================================

// Get automations
router.get('/automations', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    
    const automations = await Automation.find({ userId })
      .populate('accountId', 'email profileName')
      .sort({ createdAt: -1 });

    res.json({ automations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create automation
router.post('/automations', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { accountId, name, type, trigger, action, limits } = req.body;

    const automation = new Automation({
      userId,
      accountId,
      name,
      type,
      trigger,
      action,
      limits
    });

    await automation.save();

    res.json({ automation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update automation
router.put('/automations/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;
    const updates = req.body;

    const automation = await Automation.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    );

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    res.json({ automation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete automation
router.delete('/automations/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;

    await Automation.deleteOne({ _id: id, userId });

    res.json({ message: 'Automation deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUDIENCE ROUTES
// ============================================

// Get audience
router.get('/audience', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { page = 1, limit = 50, search, source, tags } = req.query;

    const query = { userId };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (source) query.source = source;
    if (tags) query.tags = { $in: tags.split(',') };

    const total = await Audience.countDocuments(query);
    const audience = await Audience.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ 
      audience,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export audience to CSV
router.get('/audience/export', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    
    const audience = await Audience.find({ userId });
    
    const csv = [
      'Name,Profile URL,Email,Phone,Location,Source,Tags,Created At',
      ...audience.map(a => 
        `"${a.name || ''}","${a.profileUrl || ''}","${a.email || ''}","${a.phone || ''}","${a.location || ''}","${a.source || ''}","${(a.tags || []).join(';')}","${a.createdAt}"`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audience.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// JOB ROUTES
// ============================================

// Get jobs
router.get('/jobs', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { status, limit = 20 } = req.query;

    const query = { userId };
    if (status) query.status = status;

    const jobs = await SocialJob.find(query)
      .populate('accountId', 'email profileName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get job status
router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const job = await SocialJob.findById(id)
      .populate('accountId', 'email profileName');

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel job
router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;

    const job = await SocialJob.findOneAndUpdate(
      { _id: id, userId, status: 'pending' },
      { status: 'cancelled' },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found or already processing' });
    }

    res.json({ job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ANALYTICS ROUTES
// ============================================

// Get analytics
router.get('/analytics', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { period = '7d' } = req.query;

    // Calculate date range
    const days = period === '30d' ? 30 : period === '24h' ? 1 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get account stats
    const accounts = await SocialAccount.find({ userId });
    const totalStats = accounts.reduce((acc, a) => ({
      friendsSent: acc.friendsSent + (a.stats?.friendsSent || 0),
      messagesSent: acc.messagesSent + (a.stats?.messagesSent || 0),
      postsLiked: acc.postsLiked + (a.stats?.postsLiked || 0),
      commentsPosted: acc.commentsPosted + (a.stats?.commentsPosted || 0),
      profilesScraped: acc.profilesScraped + (a.stats?.profilesScraped || 0)
    }), { friendsSent: 0, messagesSent: 0, postsLiked: 0, commentsPosted: 0, profilesScraped: 0 });

    // Get audience count
    const audienceCount = await Audience.countDocuments({ userId });

    // Get recent activity
    const recentActivity = await ActivityLog.find({ userId, createdAt: { $gte: startDate } })
      .sort({ createdAt: -1 })
      .limit(50);

    // Get job stats
    const jobStats = await SocialJob.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), createdAt: { $gte: startDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      stats: totalStats,
      audienceCount,
      recentActivity,
      jobStats: jobStats.reduce((acc, j) => ({ ...acc, [j._id]: j.count }), {}),
      period
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get activity log
router.get('/activity', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { limit = 50, accountId } = req.query;

    const query = { userId };
    if (accountId) query.accountId = accountId;

    const activity = await ActivityLog.find(query)
      .populate('accountId', 'email profileName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ activity });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
