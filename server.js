// ============================================
// FILE: server.js
// PATH: cybev-backend/server.js
// PURPOSE: Main Express server with all routes
// VERSION: 7.4.0 - Fixed Analytics & Stats
// PREVIOUS: 7.3.0 - Church Registration Links
// FIXES:
//   - /api/users/me returns full stats
//   - /api/blogs/my inline handler (before blog.routes)
//   - /api/sites/my inline handler (before sites.routes)
//   - Stats check multiple field names
// ROLLBACK: If issues, revert to VERSION 7.3.0
// GITHUB: https://github.com/cybev1/cybev-backend
// UPDATED: 2026-01-25
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ==========================================
// SOCKET.IO SETUP (Includes wildcard subdomains)
// ==========================================

const io = socketIO(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || '*',
      'http://localhost:3000',
      'https://cybev.io',
      'https://www.cybev.io',
      /\.cybev\.io$/  // Allow ALL subdomains
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.set('io', io);
global.io = io;

// ==========================================
// CORS MIDDLEWARE (Includes wildcard subdomains)
// ==========================================

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost')) return callback(null, true);
    if (origin.includes('cybev.io')) return callback(null, true);
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

// ==========================================
// SUBDOMAIN MIDDLEWARE (EARLY - Before routes)
// ==========================================

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'app', 'admin', 'mail', 'smtp', 'pop', 'imap',
  'ftp', 'ssh', 'cdn', 'assets', 'static', 'media', 'img', 'images',
  'blog', 'shop', 'store', 'help', 'support', 'docs', 'status',
  'billing', 'dashboard', 'studio', 'dev', 'staging', 'test',
  'ns1', 'ns2', 'mx', 'webmail', 'cpanel', 'whm', 'autoconfig',
  'autodiscover', '_dmarc', '_domainkey', 'webdisk', 'cpcalendars', 'cpcontacts',
  'meet', 'social', 'campaigns', 'email'
];

app.use((req, res, next) => {
  const originalHost = req.headers['x-original-host'] || req.headers['x-forwarded-host'] || '';
  const directHost = req.headers.host || req.hostname || '';
  const host = originalHost || directHost;
  
  let subdomain = req.headers['x-subdomain'] || null;
  
  if (!subdomain && host.includes('cybev.io')) {
    const parts = host.split('.');
    if (parts.length >= 3 && !['www', 'api'].includes(parts[0])) {
      subdomain = parts[0].toLowerCase();
    }
  }
  
  if (!subdomain && host.includes('localhost')) {
    const parts = host.split('.');
    if (parts.length > 1 && !parts[0].includes('localhost')) {
      subdomain = parts[0].toLowerCase();
    }
  }
  
  req.subdomain = subdomain;
  req.originalHost = host;
  req.isSubdomainRequest = !!subdomain && !RESERVED_SUBDOMAINS.includes(subdomain);
  
  if (req.isSubdomainRequest) {
    console.log(`[Subdomain] ${subdomain}.cybev.io -> ${req.path}`);
  }
  
  next();
});

// ==========================================
// JSON MIDDLEWARE
// ==========================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}${req.subdomain ? ` [${req.subdomain}]` : ''}`);
  next();
});

// ==========================================
// DATABASE CONNECTION
// ==========================================

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set!');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connected');
      
      // Start automation processor
      if (process.env.ENABLE_AUTOMATION_PROCESSOR === 'true') {
        try {
          const automationProcessor = require('./cron/automation-processor');
          automationProcessor.start();
          console.log('✅ Automation processor started');
        } catch (err) {
          console.log('⚠️ Automation processor not started:', err.message);
        }
      }
    })
    .catch(err => console.error('❌ MongoDB error:', err.message));
}

// ==========================================
// AUTH MIDDLEWARE (Inline)
// ==========================================

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// ==========================================
// HELPER: Get model safely
// ==========================================
const getModel = (name) => {
  try {
    return mongoose.models[name] || null;
  } catch (e) {
    return null;
  }
};

// ==========================================
// HELPER: Count with multiple field names
// ==========================================
const countWithFields = async (Model, userId, fields) => {
  if (!Model || !userId) return 0;
  try {
    const orConditions = fields.map(f => ({ [f]: userId }));
    return await Model.countDocuments({ $or: orConditions });
  } catch (e) {
    return 0;
  }
};

// ==========================================
// HELPER: Get comprehensive user stats
// ==========================================
const getUserStats = async (userId) => {
  const Post = getModel('Post');
  const Follow = getModel('Follow');
  const Website = getModel('Website');
  const Site = getModel('Site');
  const Blog = getModel('Blog');
  const Vlog = getModel('Vlog');
  const Reward = getModel('Reward');

  // Count posts
  const postsCount = await countWithFields(Post, userId, ['author', 'user', 'userId', 'createdBy']);

  // Count followers
  const followersCount = await countWithFields(Follow, userId, ['following', 'followee', 'targetUser']);

  // Count following
  const followingCount = await countWithFields(Follow, userId, ['follower', 'user', 'sourceUser']);

  // Count websites (check both Website and Site models)
  let websitesCount = await countWithFields(Website, userId, ['owner', 'user', 'userId', 'author']);
  if (Site) {
    websitesCount += await countWithFields(Site, userId, ['owner', 'user', 'userId', 'author']);
  }
  
  // Also check native sites collection
  try {
    const sitesCollection = mongoose.connection.db.collection('sites');
    const nativeCount = await sitesCollection.countDocuments({ owner: new mongoose.Types.ObjectId(userId) });
    if (nativeCount > websitesCount) websitesCount = nativeCount;
  } catch (e) {}

  // Count blogs
  const blogsCount = await countWithFields(Blog, userId, ['author', 'user', 'userId', 'owner']);

  // Count vlogs
  const vlogsCount = await countWithFields(Vlog, userId, ['author', 'user', 'userId']);

  // Get total views
  let totalViews = 0;
  try {
    const objectId = new mongoose.Types.ObjectId(userId);
    if (Post) {
      const pv = await Post.aggregate([
        { $match: { $or: [{ author: objectId }, { user: objectId }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
      ]);
      totalViews += pv[0]?.total || 0;
    }
    if (Blog) {
      const bv = await Blog.aggregate([
        { $match: { $or: [{ author: objectId }, { user: objectId }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
      ]);
      totalViews += bv[0]?.total || 0;
    }
  } catch (e) {}

  // Get wallet balance
  let walletBalance = 0;
  if (Reward) {
    try {
      const rewards = await Reward.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      walletBalance = rewards[0]?.total || 0;
    } catch (e) {}
  }

  return {
    postsCount,
    followersCount,
    followingCount,
    websitesCount,
    blogsCount,
    vlogsCount,
    totalViews,
    walletBalance,
    // Aliases
    posts: postsCount,
    followers: followersCount,
    following: followingCount,
    websites: websitesCount,
    blogs: blogsCount,
    vlogs: vlogsCount,
    views: totalViews,
    balance: walletBalance
  };
};

// ==========================================
// INLINE PRIORITY ROUTES (MUST BE FIRST!)
// These handle /my endpoints before route files
// ==========================================

// GET /api/users/me - Full user with stats
app.get('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const User = mongoose.models.User || require('./models/user.model');
    const userId = req.user.userId || req.user.id || req.user._id;
    
    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    
    // Get comprehensive stats
    const stats = await getUserStats(userId);
    
    res.json({ 
      ok: true, 
      user: { 
        ...user.toObject(), 
        ...stats 
      } 
    });
  } catch (err) {
    console.error('❌ /api/users/me error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/users/me/stats - Stats only
app.get('/api/users/me/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const stats = await getUserStats(userId);
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/users/username/:username - User by username with stats
app.get('/api/users/username/:username', async (req, res) => {
  try {
    const User = mongoose.models.User || require('./models/user.model');
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${req.params.username}$`, 'i') } 
    }).select('-password');
    
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    
    const stats = await getUserStats(user._id);
    res.json({ ok: true, user: { ...user.toObject(), ...stats } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/blogs/my - User's blogs with stats (BEFORE blog.routes.js)
app.get('/api/blogs/my', authMiddleware, async (req, res) => {
  try {
    const Blog = getModel('Blog');
    if (!Blog) {
      return res.json({ ok: true, blogs: [], posts: [], count: 0, stats: { total: 0, published: 0, draft: 0, totalViews: 0 } });
    }
    
    const userId = req.user.userId || req.user.id || req.user._id;
    console.log(`📖 Fetching blogs for user: ${userId}`);
    
    const blogs = await Blog.find({ 
      $or: [{ author: userId }, { user: userId }, { userId: userId }] 
    }).sort({ updatedAt: -1 }).lean();
    
    // Calculate stats
    const stats = {
      total: blogs.length,
      published: blogs.filter(b => b.status === 'published' || b.isPublished).length,
      draft: blogs.filter(b => b.status !== 'published' && !b.isPublished).length,
      totalViews: blogs.reduce((sum, b) => sum + (b.views || 0), 0)
    };
    
    res.json({ 
      ok: true, 
      blogs, 
      posts: blogs, // Alias
      count: blogs.length,
      total: blogs.length,
      stats 
    });
  } catch (err) {
    console.error('❌ /api/blogs/my error:', err.message);
    res.status(500).json({ ok: false, error: err.message, blogs: [], posts: [] });
  }
});

// GET /api/blogs/stats - Blog stats only
app.get('/api/blogs/stats', authMiddleware, async (req, res) => {
  try {
    const Blog = getModel('Blog');
    if (!Blog) return res.json({ ok: true, stats: { total: 0, published: 0, draft: 0, totalViews: 0 } });
    
    const userId = req.user.userId || req.user.id || req.user._id;
    const blogs = await Blog.find({ 
      $or: [{ author: userId }, { user: userId }, { userId: userId }] 
    }).lean();
    
    res.json({ 
      ok: true, 
      stats: {
        total: blogs.length,
        published: blogs.filter(b => b.status === 'published' || b.isPublished).length,
        draft: blogs.filter(b => b.status !== 'published' && !b.isPublished).length,
        totalViews: blogs.reduce((sum, b) => sum + (b.views || 0), 0)
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/sites/my - User's sites with stats (BEFORE sites.routes.js)
app.get('/api/sites/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    console.log(`🌐 Fetching sites for user: ${userId}`);
    
    // Try native MongoDB collection first (sites.routes.js uses this)
    let sites = [];
    try {
      const sitesCollection = mongoose.connection.db.collection('sites');
      sites = await sitesCollection
        .find({ owner: new mongoose.Types.ObjectId(userId) })
        .sort({ updatedAt: -1 })
        .toArray();
    } catch (e) {
      // Fallback to mongoose model
      const Site = getModel('Site') || getModel('Website');
      if (Site) {
        sites = await Site.find({ 
          $or: [{ owner: userId }, { user: userId }, { userId: userId }] 
        }).sort({ updatedAt: -1 }).lean();
      }
    }
    
    // Calculate stats
    const stats = {
      total: sites.length,
      published: sites.filter(s => s.status === 'published').length,
      draft: sites.filter(s => s.status !== 'published').length,
      totalViews: sites.reduce((sum, s) => sum + (s.views || 0), 0)
    };
    
    res.json({ 
      ok: true, 
      sites, 
      websites: sites, // Alias
      count: sites.length,
      total: sites.length,
      stats 
    });
  } catch (err) {
    console.error('❌ /api/sites/my error:', err.message);
    res.status(500).json({ ok: false, error: err.message, sites: [], websites: [] });
  }
});

// GET /api/sites/stats - Sites stats only
app.get('/api/sites/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    
    let sites = [];
    try {
      const sitesCollection = mongoose.connection.db.collection('sites');
      sites = await sitesCollection.find({ owner: new mongoose.Types.ObjectId(userId) }).toArray();
    } catch (e) {
      const Site = getModel('Site') || getModel('Website');
      if (Site) {
        sites = await Site.find({ $or: [{ owner: userId }, { user: userId }] }).lean();
      }
    }
    
    res.json({ 
      ok: true, 
      stats: {
        total: sites.length,
        published: sites.filter(s => s.status === 'published').length,
        draft: sites.filter(s => s.status !== 'published').length,
        totalViews: sites.reduce((sum, s) => sum + (s.views || 0), 0)
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/vlogs/my - User's vlogs
app.get('/api/vlogs/my', authMiddleware, async (req, res) => {
  try {
    const Vlog = mongoose.models.Vlog || mongoose.model('Vlog', new mongoose.Schema({
      author: mongoose.Schema.Types.ObjectId,
      title: String,
      videoUrl: String,
      views: { type: Number, default: 0 },
      createdAt: { type: Date, default: Date.now }
    }));
    
    const userId = req.user.userId || req.user.id || req.user._id;
    const vlogs = await Vlog.find({ 
      $or: [{ author: userId }, { user: userId }, { userId: userId }] 
    }).sort({ createdAt: -1 }).lean();
    
    res.json({ ok: true, vlogs: vlogs || [], count: vlogs.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, vlogs: [] });
  }
});

// GET /api/rewards/wallet - Wallet balance and transactions
app.get('/api/rewards/wallet', authMiddleware, async (req, res) => {
  try {
    const Reward = getModel('Reward');
    const userId = req.user.userId || req.user.id || req.user._id;
    
    let balance = 0;
    let transactions = [];
    
    if (Reward) {
      // Get balance
      const balanceResult = await Reward.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      balance = balanceResult[0]?.total || 0;
      
      // Get transactions
      transactions = await Reward.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
    }
    
    res.json({
      ok: true,
      balance,
      currency: 'CYBEV',
      transactions: transactions.map(t => ({
        _id: t._id,
        type: t.type,
        amount: t.amount,
        description: t.reason || t.description || t.type,
        createdAt: t.createdAt
      })),
      earnMethods: [
        { id: 'create_content', title: 'Create Content', subtitle: 'Earn 50-200 CYBEV per post', reward: '50-200', icon: 'sparkles' },
        { id: 'daily_checkin', title: 'Daily Check-in', subtitle: 'Earn 10 CYBEV daily', reward: '10', icon: 'gift' },
        { id: 'refer_friends', title: 'Refer Friends', subtitle: 'Earn 100 CYBEV per referral', reward: '100', icon: 'users' }
      ]
    });
  } catch (err) {
    console.error('❌ /api/rewards/wallet error:', err.message);
    res.status(500).json({ ok: false, error: err.message, balance: 0, transactions: [] });
  }
});

// GET /api/rewards/balance - Quick balance check
app.get('/api/rewards/balance', authMiddleware, async (req, res) => {
  try {
    const Reward = getModel('Reward');
    const userId = req.user.userId || req.user.id || req.user._id;
    
    let balance = 0;
    if (Reward) {
      const result = await Reward.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      balance = result[0]?.total || 0;
    }
    
    res.json({ ok: true, balance, currency: 'CYBEV' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, balance: 0 });
  }
});

// ==========================================
// ALL ROUTES - v7.4.0 Fixed Analytics
// ==========================================

const routes = [
  // Core
  ['auth', '/api/auth', './routes/auth.routes'],
  ['users', '/api/users', './routes/user.routes'],
  ['user-analytics', '/api/user-analytics', './routes/user-analytics.routes'],
  ['posts', '/api/posts', './routes/post.routes'],
  ['comments', '/api/comments', './routes/comment.routes'],
  ['messages', '/api/messages', './routes/message.routes'],
  ['notifications', '/api/notifications', './routes/notification.routes'],
  ['follows', '/api/follows', './routes/follow.routes'],
  ['search', '/api/search', './routes/search.routes'],
  ['hashtags', '/api/hashtags', './routes/hashtag.routes'],
  ['bookmarks', '/api/bookmarks', './routes/bookmark.routes'],
  
  // Media & Content
  ['media', '/api/media', './routes/media.routes'],
  ['vlogs', '/api/vlogs', './routes/vlog.routes'],
  ['stories', '/api/stories', './routes/story.routes'],
  ['polls', '/api/polls', './routes/poll.routes'],
  ['reactions', '/api/reactions', './routes/reaction.routes'],
  ['reels', '/api/reels', './routes/reels.routes'],
  
  // Websites & Blogs - SITES ROUTES ADDED
  ['sites', '/api/sites', './routes/sites.routes'],
  ['websites', '/api/websites', './routes/website.routes'],
  ['blogs', '/api/blogs', './routes/blog.routes'],
  ['blog-templates', '/api/blog-templates', './routes/blog-templates.routes'],
  ['public-blog', '/api/public-blog', './routes/public-blog.routes'],
  ['web3-blog', '/api/web3-blog', './routes/web3-blog.routes'],
  
  // Web3 & NFT
  ['nft', '/api/nft', './routes/nft.routes'],
  ['tokens', '/api/tokens', './routes/token.routes'],
  ['wallet', '/api/wallet', './routes/wallet.routes'],
  
  // Admin
  ['admin-users', '/api/admin/users', './routes/admin-users.routes'],
  ['admin-charts', '/api/admin/charts', './routes/admin-charts.routes'],
  ['admin-summary', '/api/admin', './routes/admin-summary.routes'],
  ['admin-insight', '/api/admin', './routes/admin-insight.routes'],
  ['admin-analytics', '/api/admin-analytics', './routes/admin-analytics.routes'],
  ['admin', '/api/admin', './routes/admin.routes'],
  ['moderation', '/api/moderation', './routes/moderation.routes'],
  
  // Church
  ['foundation-school', '/api/church/foundation', './routes/foundation-school.routes'],
  ['bible', '/api/church/bible', './routes/bible.routes'],
  ['church', '/api/church', './routes/church.routes'],
  ['member-management', '/api/church/members', './routes/member-management.routes'],
  ['church-registration', '/api/church/register', './routes/church-registration.routes'],
  ['prayer', '/api/church/prayers', './routes/prayer.routes'],
  ['giving', '/api/church/giving', './routes/giving.routes'],
  ['cell-reports', '/api/church/cell-reports', './routes/cell-reports.routes'],
  ['whatsapp', '/api/church/whatsapp', './routes/whatsapp.routes'],
  
  // Forms
  ['forms', '/api/forms', './routes/forms.routes'],
  
  // Events & Marketplace
  ['events', '/api/events', './routes/events.routes'],
  ['marketplace', '/api/marketplace', './routes/marketplace.routes'],
  
  // Other
  ['reward', '/api/rewards', './routes/reward.routes'],
  ['leaderboard', '/api/leaderboard', './routes/leaderboard.routes'],
  ['i18n', '/api/i18n', './routes/i18n.routes'],
  ['push', '/api/push', './routes/push.routes'],
  ['upload', '/api/upload', './routes/upload.routes'],
  
  // Studio Features
  ['meet', '/api/meet', './routes/meet.routes'],
  ['social-tools', '/api/social-tools', './routes/social-tools.routes'],
  ['campaigns', '/api/campaigns', './routes/campaigns.routes'],
  ['contacts', '/api/contacts', './routes/contacts.routes'],
  ['ai-generate', '/api/ai-generate', './routes/ai-generate.routes'],
  ['content', '/api/content', './routes/content.routes'],
  
  // Email Platform
  ['email', '/api/email', './routes/email.routes'],
  ['sender-domains', '/api/sender-domains', './routes/sender-domains.routes'],
  ['campaigns-enhanced', '/api/campaigns-enhanced', './routes/campaigns-enhanced.routes'],
  ['email-webhooks', '/api/email-webhooks', './routes/email-webhooks.routes'],
  ['automation', '/api/automation', './routes/automation.routes'],
  ['email-subscription', '/api/email-subscription', './routes/email-subscription.routes'],
  
  // Premium Email
  ['campaigns-premium', '/api/campaigns-premium', './routes/campaigns-premium.routes']
  
  // NOTE: blogs-my.routes and sites-my.routes REMOVED - handled by inline routes above
];

// Load all routes with error handling
console.log('\n=== Loading Routes ===');
let loadedCount = 0;
let failedCount = 0;

routes.forEach(([name, path, file]) => {
  try {
    app.use(path, require(file));
    console.log(`✅ ${name}`);
    loadedCount++;
  } catch (err) {
    console.log(`⚠️ ${name}: ${err.message}`);
    failedCount++;
  }
});

console.log(`=== Routes: ${loadedCount} loaded, ${failedCount} skipped ===\n`);

// ==========================================
// INITIALIZE EMAIL PLANS ON STARTUP
// ==========================================

(async () => {
  try {
    const { EmailPlan } = require('./models/email-subscription.model');
    if (EmailPlan && EmailPlan.initializeDefaultPlans) {
      await EmailPlan.initializeDefaultPlans();
      console.log('✅ Email plans initialized');
    }
  } catch (err) {
    console.log('⚠️ Email plans initialization skipped:', err.message);
  }
})();

// ==========================================
// INITIALIZE PREMIUM SUBSCRIPTION PLANS
// ==========================================

(async () => {
  try {
    const { EmailSubscriptionPlan } = require('./models/campaign-premium.model');
    if (EmailSubscriptionPlan) {
      const existingPlans = await EmailSubscriptionPlan.countDocuments();
      if (existingPlans === 0) {
        await EmailSubscriptionPlan.insertMany([
          { name: 'free', displayName: 'Free', description: 'Get started with email marketing', price: { monthly: 0, yearly: 0 }, limits: { emailsPerMonth: 500, contacts: 500, lists: 3, automations: 1, abTesting: false, advancedSegmentation: false, sendTimeOptimization: false }, sortOrder: 1 },
          { name: 'starter', displayName: 'Starter', description: 'For growing creators', price: { monthly: 9.99, yearly: 99 }, limits: { emailsPerMonth: 10000, contacts: 5000, lists: 10, automations: 5, customDomains: 1, abTesting: true, advancedSegmentation: false }, sortOrder: 2 },
          { name: 'growth', displayName: 'Growth', description: 'For serious marketers', price: { monthly: 29.99, yearly: 299 }, limits: { emailsPerMonth: 50000, contacts: 25000, lists: 50, automations: 20, customDomains: 3, abTesting: true, advancedSegmentation: true, sendTimeOptimization: true, customBranding: true }, sortOrder: 3 },
          { name: 'pro', displayName: 'Pro', description: 'For power users', price: { monthly: 79.99, yearly: 799 }, limits: { emailsPerMonth: 150000, contacts: 100000, lists: -1, automations: -1, customDomains: 10, abTesting: true, advancedSegmentation: true, sendTimeOptimization: true, customBranding: true, apiAccess: true, webhooks: true, prioritySupport: true }, sortOrder: 4 }
        ]);
        console.log('✅ Premium email plans initialized');
      }
    }
  } catch (err) {
    console.log('⚠️ Premium plans initialization skipped:', err.message);
  }
})();

// ==========================================
// AWS SES STATUS CHECK
// ==========================================

(async () => {
  try {
    const sesService = require('./services/ses.service');
    const status = await sesService.getServiceStatus();
    if (status.enabled) {
      console.log(`✅ AWS SES ready | Region: ${status.region}`);
    } else {
      console.log('⚠️ AWS SES not configured - add AWS credentials to .env');
    }
  } catch (err) {
    console.log('⚠️ AWS SES check skipped:', err.message);
  }
})();

// ==========================================
// HEALTH CHECK & ROOT
// ==========================================

app.get('/api/health', async (req, res) => {
  let sesStatus = { enabled: false };
  try {
    const sesService = require('./services/ses.service');
    sesStatus = await sesService.getServiceStatus();
  } catch (err) {}
  
  res.json({
    ok: true,
    version: '7.4.0',
    timestamp: new Date().toISOString(),
    features: {
      meet: 'enabled',
      socialTools: 'enabled',
      campaigns: 'enabled',
      aiGeneration: 'enabled',
      aiImageGeneration: 'enabled',
      church: 'enabled',
      churchRegistration: 'enabled',
      forms: 'enabled',
      emailPlatform: sesStatus.enabled ? 'enabled' : 'not_configured',
      automation: process.env.ENABLE_AUTOMATION_PROCESSOR === 'true' ? 'enabled' : 'disabled',
      premiumEmail: 'enabled',
      abTesting: 'enabled',
      advancedSegmentation: 'enabled',
      sendTimeOptimization: 'enabled',
      automationWorkflows: 'enabled',
      // v7.4.0
      analyticsFixed: 'enabled'
    },
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    ses: {
      configured: sesStatus.enabled,
      region: sesStatus.region || 'not_set'
    },
    routes: { loaded: loadedCount, skipped: failedCount }
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'CYBEV API v7.4.0 - Analytics Fixed',
    docs: 'https://docs.cybev.io',
    health: '/api/health',
    features: [
      'meet', 'social-tools', 'campaigns', 'ai-generate', 'ai-image', 
      'church', 'church-registration', 'forms', 'email-platform', 'automation',
      'premium-email', 'ab-testing', 'advanced-segmentation', 
      'send-time-optimization', 'automation-workflows',
      'analytics-fixed'
    ]
  });
});

// ==========================================
// SOCKET.IO FOR REAL-TIME FEATURES
// ==========================================

io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(`user:${userId}`));
  socket.on('join-conversation', (id) => socket.join(`conversation:${id}`));
  socket.on('leave-conversation', (id) => socket.leave(`conversation:${id}`));
  
  socket.on('join-meeting', (roomId) => {
    socket.join(`meeting:${roomId}`);
    socket.to(`meeting:${roomId}`).emit('participant-joined', { socketId: socket.id });
  });
  socket.on('leave-meeting', (roomId) => {
    socket.leave(`meeting:${roomId}`);
    socket.to(`meeting:${roomId}`).emit('participant-left', { socketId: socket.id });
  });
  socket.on('meeting-signal', ({ roomId, signal }) => {
    socket.to(`meeting:${roomId}`).emit('meeting-signal', { socketId: socket.id, signal });
  });
  socket.on('meeting-chat', ({ roomId, message }) => {
    io.to(`meeting:${roomId}`).emit('meeting-chat', { socketId: socket.id, message, timestamp: new Date() });
  });
  
  socket.on('join-stream', (id) => socket.join(`stream:${id}`));
  socket.on('leave-stream', (id) => socket.leave(`stream:${id}`));
  socket.on('stream-chat', ({ streamId, message }) => {
    io.to(`stream:${streamId}`).emit('chat-message', message);
  });
  
  socket.on('join-campaign', (campaignId) => socket.join(`campaign:${campaignId}`));
  socket.on('leave-campaign', (campaignId) => socket.leave(`campaign:${campaignId}`));
  
  socket.on('join-automation', (automationId) => socket.join(`automation:${automationId}`));
  socket.on('leave-automation', (automationId) => socket.leave(`automation:${automationId}`));
});

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found', path: req.path });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
============================================
  CYBEV API Server v7.4.0
  Analytics Fixed + Church Registration
============================================
  Port: ${PORT}
  Database: ${MONGODB_URI ? 'Configured' : 'Not configured'}
  Socket.IO: Enabled
  
  v7.4.0 Analytics Fixes (INLINE ROUTES):
  ✅ /api/users/me - Full stats
  ✅ /api/blogs/my - Blogs with stats
  ✅ /api/sites/my - Sites with stats
  ✅ /api/rewards/wallet - Balance + transactions
  ✅ Multiple field name checking
  ✅ Native MongoDB sites collection
  
  v7.2.0 Church Features:
  ✅ Public Registration Links
  ✅ Auto CYBEV Account Creation
  ✅ QR Code Generation
  
  v7.0.0 Premium Email Features:
  ✅ A/B Testing
  ✅ Advanced Segmentation
  ✅ Send Time Optimization
  
  Routes: ${loadedCount} loaded, ${failedCount} skipped
  Time: ${new Date().toISOString()}
============================================
  `);
});

module.exports = { app, server, io };
