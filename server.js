// ============================================
// FILE: server.js
// PATH: cybev-backend/server.js
// PURPOSE: Main Express server with all routes
// VERSION: 6.9.0 - Added Email Platform Routes
// PREVIOUS: 6.8.3 - Admin Analytics, Meet, Social Tools
// ROLLBACK: If issues, revert to VERSION 6.8.3
// GITHUB: https://github.com/cybev1/cybev-backend
// UPDATED: 2026-01-16
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
  'meet', 'social', 'campaigns', 'email' // NEW v6.9.0
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
    .then(() => console.log('✅ MongoDB connected'))
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
// ALL ROUTES - Auto-loading with error handling
// ==========================================

const routes = [
  // Auth & Users
  ['auth', '/api/auth', './routes/auth.routes'],
  ['oauth', '/api/auth', './routes/oauth.routes'],
  ['user', '/api/users', './routes/user.routes'],
  ['profile', '/api/profile', './routes/profile.routes'],
  ['settings', '/api/settings', './routes/settings.routes'],
  ['verification', '/api/verification', './routes/verification.routes'],
  
  // Content
  ['blog', '/api/blogs', './routes/blog.routes'],
  ['blogsite', '/api/blogsites', './routes/blogsite.routes'],
  ['posts', '/api/posts', './routes/posts.routes'],
  ['feed', '/api/feed', './routes/feed.routes'],
  ['comments', '/api/comments', './routes/comment.routes'],
  ['bookmarks', '/api/bookmarks', './routes/bookmark.routes'],
  ['vlog', '/api/vlogs', './routes/vlog.routes'],
  ['content', '/api/content', './routes/content.routes'],
  
  // Notifications & Messages
  ['notifications', '/api/notifications', './routes/notification.routes'],
  ['notifications-adv', '/api/notifications', './routes/notifications-advanced.routes'],
  ['messages', '/api/messages', './routes/message.routes'],
  
  // Social
  ['reactions', '/api/reactions', './routes/reaction.routes'],
  ['follow-check', '/api/follow', './routes/follow-check.routes'],
  ['follow', '/api/follow', './routes/follow.routes'],
  ['story', '/api/stories', './routes/story.routes'],
  ['share', '/api/share', './routes/share.routes'],
  ['hashtag', '/api/hashtags', './routes/hashtag.routes'],
  ['search', '/api/search', './routes/search.routes'],
  ['group-enhanced', '/api/groups', './routes/group-enhanced.routes'],
  ['group', '/api/groups', './routes/group.routes'],
  
  // Live & Streaming
  ['live', '/api/live', './routes/live.routes'],
  ['webrtc', '/api/webrtc', './routes/webrtc.routes'],
  ['stream-schedule', '/api/streams', './routes/stream-schedule.routes'],
  
  // Web3 & NFT
  ['nft', '/api/nft', './routes/nft.routes'],
  ['mint', '/api/mint', './routes/mint.routes'],
  ['mint-badge', '/api/mint-badge', './routes/mint-badge.routes'],
  ['staking', '/api/staking', './routes/staking.routes'],
  ['wallet', '/api/wallet', './routes/wallet.routes'],
  
  // Monetization
  ['tipping', '/api/tips', './routes/tipping.routes'],
  ['subscription', '/api/subscriptions', './routes/subscription.routes'],
  ['earnings', '/api/earnings', './routes/earnings.routes'],
  ['monetization', '/api/monetization', './routes/monetization.routes'],
  ['payments', '/api/payments', './routes/payments.routes'],
  
  // Sites & Domains
  ['sites-my', '/api/sites', './routes/sites-my.routes'],
  ['sites', '/api/sites', './routes/sites.routes'],
  ['domain', '/api/domain', './routes/domain.routes'],
  ['seo', '/api/seo', './routes/seo.routes'],
  
  // AI
  ['ai', '/api/ai', './routes/ai.routes'],
  ['ai-site', '/api/ai', './routes/ai-site.routes'],
  
  // Analytics
  ['analytics-enhanced', '/api/analytics', './routes/analytics-enhanced.routes'],
  ['analytics', '/api/analytics', './routes/analytics.routes'],
  ['creator-analytics', '/api/creator-analytics', './routes/creator-analytics.routes'],
  
  // Admin
  ['admin', '/api/admin', './routes/admin.routes'],
  ['admin-analytics', '/api/admin-analytics', './routes/admin-analytics.routes'],
  ['admin-charts', '/api/admin/charts', './routes/admin-charts.routes'],
  ['admin-summary', '/api/admin', './routes/admin-summary.routes'],
  ['admin-insight', '/api/admin', './routes/admin-insight.routes'],
  ['moderation', '/api/moderation', './routes/moderation.routes'],
  
  // Church
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
  ['mobile', '/api/mobile', './routes/mobile.routes'],
  ['upload', '/api/upload', './routes/upload.routes'],
  
  // ==========================================
  // v6.8.1+ - Studio Features
  // ==========================================
  ['meet', '/api/meet', './routes/meet.routes'],
  ['social-tools', '/api/social-tools', './routes/social-tools.routes'],
  ['campaigns', '/api/campaigns', './routes/campaigns.routes'],
  ['contacts', '/api/contacts', './routes/contacts.routes'],
  ['ai-generate', '/api/ai-generate', './routes/ai-generate.routes'],
  
  // ==========================================
  // v6.9.0 - Email Platform (NEW)
  // ==========================================
  ['email', '/api/email', './routes/email.routes'],
  ['sender-domains', '/api/sender-domains', './routes/sender-domains.routes'],
  ['campaigns-enhanced', '/api/campaigns-enhanced', './routes/campaigns-enhanced.routes'],
  ['email-webhooks', '/api/email-webhooks', './routes/email-webhooks.routes'],
  ['automation', '/api/automation', './routes/automation.routes'],
  ['email-subscription', '/api/email-subscription', './routes/email-subscription.routes']
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
    await EmailPlan.initializeDefaultPlans();
  } catch (err) {
    console.log('⚠️ Email plans initialization skipped:', err.message);
  }
})();

// ==========================================
// START AUTOMATION PROCESSOR (if enabled)
// ==========================================

if (process.env.ENABLE_AUTOMATION_PROCESSOR !== 'false') {
  try {
    const automationProcessor = require('./cron/automation-processor');
    automationProcessor.start();
  } catch (err) {
    console.log('⚠️ Automation processor not started:', err.message);
  }
}

// ==========================================
// HEALTH CHECK & ROOT
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: '6.9.0',
    timestamp: new Date().toISOString(),
    features: {
      meet: 'enabled',
      socialTools: 'enabled',
      campaigns: 'enabled',
      aiGeneration: 'enabled',
      church: 'enabled',
      forms: 'enabled',
      emailPlatform: 'enabled',  // NEW v6.9.0
      automation: 'enabled'      // NEW v6.9.0
    },
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    routes: { loaded: loadedCount, skipped: failedCount }
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'CYBEV API v6.9.0',
    docs: 'https://docs.cybev.io',
    health: '/api/health',
    features: ['meet', 'social-tools', 'campaigns', 'ai-generate', 'church', 'forms', 'email-platform', 'automation']
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
  CYBEV API Server v6.9.0
============================================
  Port: ${PORT}
  Database: ${MONGODB_URI ? 'Configured' : 'Not configured'}
  Socket.IO: Enabled
  
  NEW Features v6.9.0:
  ✅ Email Platform (Send/Receive)
  ✅ Custom Domain Verification
  ✅ Campaign Management
  ✅ Automation Workflows
  ✅ Subscription Tiers
  
  Previous v6.8.x Features:
  ✅ Meet (Video Conferencing)
  ✅ Social Tools (Automation)
  ✅ Campaigns (Marketing)
  ✅ AI Generation
  ✅ Forms Builder
  
  Routes: ${loadedCount} loaded, ${failedCount} skipped
  Time: ${new Date().toISOString()}
============================================
  `);
});

module.exports = { app, server, io };
