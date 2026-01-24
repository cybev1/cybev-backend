// ============================================
// FILE: server.js
// PATH: cybev-backend/server.js
// PURPOSE: Main Express server with all routes
// VERSION: 7.0.1 - Admin Analytics Routes Fix
// PREVIOUS: 6.9.2 - AI Image Generation Route
// ROLLBACK: If issues, revert to VERSION 6.9.2
// GITHUB: https://github.com/cybev1/cybev-backend
// UPDATED: 2026-01-24
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
  'meet', 'social', 'campaigns', 'email' // v6.9.0+
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
      
      // ==========================================
      // START AUTOMATION PROCESSOR (after DB connected)
      // ==========================================
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
// INLINE USER ROUTES FIX (Priority)
// ==========================================

app.get('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const User = mongoose.models.User || require('./models/user.model');
    const user = await User.findById(req.user.userId || req.user.id).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    
    const Post = mongoose.models.Post;
    const Follow = mongoose.models.Follow;
    let postCount = 0, followerCount = 0, followingCount = 0;
    
    if (Post) postCount = await Post.countDocuments({ author: req.user.userId || req.user.id });
    if (Follow) {
      followerCount = await Follow.countDocuments({ following: req.user.userId || req.user.id });
      followingCount = await Follow.countDocuments({ follower: req.user.userId || req.user.id });
    }
    
    res.json({ ok: true, user: { ...user.toObject(), postCount, followerCount, followingCount } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/users/username/:username', async (req, res) => {
  try {
    const User = mongoose.models.User || require('./models/user.model');
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${req.params.username}$`, 'i') } 
    }).select('-password');
    
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    
    const Post = mongoose.models.Post;
    const Follow = mongoose.models.Follow;
    let postCount = 0, followerCount = 0, followingCount = 0;
    
    if (Post) postCount = await Post.countDocuments({ author: user._id });
    if (Follow) {
      followerCount = await Follow.countDocuments({ following: user._id });
      followingCount = await Follow.countDocuments({ follower: user._id });
    }
    
    res.json({ ok: true, user: { ...user.toObject(), postCount, followerCount, followingCount } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/vlogs/my', authMiddleware, async (req, res) => {
  try {
    const Vlog = mongoose.models.Vlog || mongoose.model('Vlog', new mongoose.Schema({
      author: mongoose.Schema.Types.ObjectId,
      title: String,
      videoUrl: String,
      views: { type: Number, default: 0 },
      createdAt: { type: Date, default: Date.now }
    }));
    const vlogs = await Vlog.find({ author: req.user.userId || req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, vlogs: vlogs || [], count: vlogs.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, vlogs: [] });
  }
});

// ==========================================
// ALL ROUTES - v7.0.0 Premium Email Platform
// ==========================================

const routes = [
  // Core
  ['auth', '/api/auth', './routes/auth.routes'],
  ['users', '/api/users', './routes/user.routes'],
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
  
  // Websites & Blogs
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
  // Church management (order matters: mount sub-routers BEFORE /api/church)
  ['foundation-school', '/api/church/foundation', './routes/foundation-school.routes'],
  ['bible', '/api/church/bible', './routes/bible.routes'],
  ['church', '/api/church', './routes/church.routes'],
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
  
  // ==========================================
  // v6.8.1+ - Studio Features
  // ==========================================
  ['meet', '/api/meet', './routes/meet.routes'],
  ['social-tools', '/api/social-tools', './routes/social-tools.routes'],
  ['campaigns', '/api/campaigns', './routes/campaigns.routes'],
  ['contacts', '/api/contacts', './routes/contacts.routes'],
  ['ai-generate', '/api/ai-generate', './routes/ai-generate.routes'],
  ['content', '/api/content', './routes/content.routes'],
  
  // ==========================================
  // v6.9.0+ - Email Platform (Phase 6)
  // ==========================================
  ['email', '/api/email', './routes/email.routes'],
  ['sender-domains', '/api/sender-domains', './routes/sender-domains.routes'],
  ['campaigns-enhanced', '/api/campaigns-enhanced', './routes/campaigns-enhanced.routes'],
  ['email-webhooks', '/api/email-webhooks', './routes/email-webhooks.routes'],
  ['automation', '/api/automation', './routes/automation.routes'],
  ['email-subscription', '/api/email-subscription', './routes/email-subscription.routes'],
  
  // ==========================================
  // v7.0.0 - Premium Email Marketing Platform
  // World-Class Features: A/B Testing, Automation,
  // Advanced Segmentation, Send Time Optimization
  // ==========================================
  ['campaigns-premium', '/api/campaigns-premium', './routes/campaigns-premium.routes']
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
// INITIALIZE PREMIUM SUBSCRIPTION PLANS (v7.0.0)
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
// AWS SES STATUS CHECK (v6.9.1)
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
  // Check SES status
  let sesStatus = { enabled: false };
  try {
    const sesService = require('./services/ses.service');
    sesStatus = await sesService.getServiceStatus();
  } catch (err) {}
  
  res.json({
    ok: true,
    version: '7.0.0',
    timestamp: new Date().toISOString(),
    features: {
      meet: 'enabled',
      socialTools: 'enabled',
      campaigns: 'enabled',
      aiGeneration: 'enabled',
      aiImageGeneration: 'enabled',
      church: 'enabled',
      forms: 'enabled',
      emailPlatform: sesStatus.enabled ? 'enabled' : 'not_configured',
      automation: process.env.ENABLE_AUTOMATION_PROCESSOR === 'true' ? 'enabled' : 'disabled',
      // v7.0.0 Premium Features
      premiumEmail: 'enabled',
      abTesting: 'enabled',
      advancedSegmentation: 'enabled',
      sendTimeOptimization: 'enabled',
      automationWorkflows: 'enabled'
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
    message: 'CYBEV API v7.0.0 - Premium Email Marketing',
    docs: 'https://docs.cybev.io',
    health: '/api/health',
    features: [
      'meet', 'social-tools', 'campaigns', 'ai-generate', 'ai-image', 
      'church', 'forms', 'email-platform', 'automation',
      // v7.0.0 Premium
      'premium-email', 'ab-testing', 'advanced-segmentation', 
      'send-time-optimization', 'automation-workflows'
    ]
  });
});

// ==========================================
// SOCKET.IO FOR REAL-TIME FEATURES
// ==========================================

io.on('connection', (socket) => {
  // User rooms
  socket.on('join', (userId) => socket.join(`user:${userId}`));
  socket.on('join-conversation', (id) => socket.join(`conversation:${id}`));
  socket.on('leave-conversation', (id) => socket.leave(`conversation:${id}`));
  
  // Meeting events
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
  
  // Stream events
  socket.on('join-stream', (id) => socket.join(`stream:${id}`));
  socket.on('leave-stream', (id) => socket.leave(`stream:${id}`));
  socket.on('stream-chat', ({ streamId, message }) => {
    io.to(`stream:${streamId}`).emit('chat-message', message);
  });
  
  // Email campaign events (v6.9.1+)
  socket.on('join-campaign', (campaignId) => socket.join(`campaign:${campaignId}`));
  socket.on('leave-campaign', (campaignId) => socket.leave(`campaign:${campaignId}`));
  
  // Automation events (v7.0.0)
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
  CYBEV API Server v7.0.0
  Premium Email Marketing Platform
============================================
  Port: ${PORT}
  Database: ${MONGODB_URI ? 'Configured' : 'Not configured'}
  Socket.IO: Enabled
  
  v7.0.0 Premium Email Features:
  ✅ A/B Testing (Subject, Content, Sender)
  ✅ Advanced Segmentation (20+ operators)
  ✅ Send Time Optimization
  ✅ Automation Workflows
  ✅ Engagement Scoring
  ✅ Behavioral Targeting
  ✅ Template Library
  ✅ Subscription Tiers
  
  Previous Features (v6.9.x):
  ✅ AWS SES Email Integration
  ✅ Drag-Drop Campaign Editor
  ✅ Custom Domain Verification
  ✅ AI Image Generation
  
  Routes: ${loadedCount} loaded, ${failedCount} skipped
  Time: ${new Date().toISOString()}
============================================
  `);
});

module.exports = { app, server, io };
