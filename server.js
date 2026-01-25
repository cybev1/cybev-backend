// ============================================
// FILE: server.js
// PATH: cybev-backend/server.js
// PURPOSE: Main Express server with all routes
// VERSION: 7.6.0 - Pagination, Excerpts, Creator Studio Stats
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
// HELPER: Strip HTML and get excerpt
// ==========================================
const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

const getExcerpt = (content, maxLength = 150) => {
  const text = stripHtml(content);
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

// Add excerpt to posts/blogs
const addExcerpts = (items) => {
  return items.map(item => ({
    ...item,
    excerpt: item.excerpt || getExcerpt(item.content || item.body || item.text || ''),
    textContent: stripHtml(item.content || item.body || item.text || '')
  }));
};

// ==========================================
// HELPER: Get comprehensive user stats
// ==========================================
const getUserStats = async (userId) => {
  const User = getModel('User') || mongoose.models.User;
  const Post = getModel('Post');
  const Follow = getModel('Follow');
  const Website = getModel('Website');
  const Site = getModel('Site');
  const Blog = getModel('Blog');
  const Vlog = getModel('Vlog');
  const Reward = getModel('Reward');

  const objectId = new mongoose.Types.ObjectId(userId);

  // Count posts - also count blogs as posts if Post model is empty
  let postsCount = await countWithFields(Post, userId, ['author', 'user', 'userId', 'createdBy']);
  
  // If no posts found, count blogs as posts (they appear in feed)
  if (postsCount === 0 && Blog) {
    postsCount = await countWithFields(Blog, userId, ['author', 'user', 'userId', 'owner']);
  }

  // Count followers/following - try multiple methods
  let followersCount = 0;
  let followingCount = 0;
  
  // Method 1: Check User.followers/following arrays FIRST (most reliable)
  if (User) {
    try {
      const user = await User.findById(userId).select('followers following followersCount followingCount').lean();
      if (user) {
        followersCount = user.followersCount || user.followers?.length || 0;
        followingCount = user.followingCount || user.following?.length || 0;
      }
    } catch (e) {
      console.log('User followers check error:', e.message);
    }
  }
  
  // Method 2: Check Follow collection if User arrays are empty
  if ((followersCount === 0 || followingCount === 0) && Follow) {
    const fc = await Follow.countDocuments({ 
      $or: [
        { following: userId }, { following: objectId },
        { followee: userId }, { followee: objectId },
        { targetUser: userId }, { targetUser: objectId },
        { followedId: userId }, { followedId: objectId }
      ] 
    });
    const fgc = await Follow.countDocuments({ 
      $or: [
        { follower: userId }, { follower: objectId },
        { user: userId }, { user: objectId },
        { sourceUser: userId }, { sourceUser: objectId },
        { followerId: userId }, { followerId: objectId }
      ] 
    });
    if (followersCount === 0) followersCount = fc;
    if (followingCount === 0) followingCount = fgc;
  }
  
  // Method 3: Try native MongoDB follows collection
  if (followersCount === 0 || followingCount === 0) {
    try {
      const followsCollection = mongoose.connection.db.collection('follows');
      if (followersCount === 0) {
        followersCount = await followsCollection.countDocuments({ 
          $or: [
            { following: objectId }, { followee: objectId },
            { targetUser: objectId }, { followedId: objectId }
          ]
        });
      }
      if (followingCount === 0) {
        followingCount = await followsCollection.countDocuments({ 
          $or: [
            { follower: objectId }, { user: objectId },
            { sourceUser: objectId }, { followerId: objectId }
          ]
        });
      }
    } catch (e) {}
  }

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

// GET /api/vlogs/feed - Public vlogs feed
app.get('/api/vlogs/feed', async (req, res) => {
  try {
    const Vlog = mongoose.models.Vlog;
    const { limit = 20, page = 1, skip = 0 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skipNum = parseInt(skip) || ((pageNum - 1) * limitNum);
    
    let vlogs = [];
    let total = 0;
    
    if (Vlog) {
      total = await Vlog.countDocuments({ 
        $or: [
          { status: 'published' }, 
          { isPublished: true }, 
          { status: { $exists: false } }
        ]
      });
      
      vlogs = await Vlog.find({ 
        $or: [
          { status: 'published' }, 
          { isPublished: true }, 
          { status: { $exists: false } }
        ]
      })
        .sort({ createdAt: -1 })
        .skip(skipNum)
        .limit(limitNum)
        .populate('author', 'name username avatar')
        .lean();
    }
    
    const hasMore = (skipNum + vlogs.length) < total;
    
    res.json({ 
      ok: true, 
      vlogs, 
      feed: vlogs, 
      count: vlogs.length,
      total,
      page: pageNum,
      hasMore,
      nextPage: hasMore ? pageNum + 1 : null
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, vlogs: [], feed: [] });
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

// GET /api/user-analytics/creator-studio - Creator Studio dashboard stats
app.get('/api/user-analytics/creator-studio', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const stats = await getUserStats(userId);
    
    // Get recent websites and blogs
    let recentSites = [];
    let recentBlogs = [];
    
    try {
      const sitesCollection = mongoose.connection.db.collection('sites');
      recentSites = await sitesCollection
        .find({ owner: new mongoose.Types.ObjectId(userId) })
        .sort({ updatedAt: -1 })
        .limit(5)
        .toArray();
    } catch (e) {}
    
    const Blog = getModel('Blog');
    if (Blog) {
      recentBlogs = await Blog.find({
        $or: [{ author: userId }, { user: userId }]
      }).sort({ updatedAt: -1 }).limit(5).lean();
    }
    
    res.json({
      ok: true,
      stats: {
        websites: stats.websitesCount,
        websitesCount: stats.websitesCount,
        blogs: stats.blogsCount,
        blogsCount: stats.blogsCount,
        posts: stats.postsCount,
        postsCount: stats.postsCount,
        views: stats.totalViews,
        totalViews: stats.totalViews,
        followers: stats.followersCount,
        followersCount: stats.followersCount,
        following: stats.followingCount,
        followingCount: stats.followingCount,
        vlogs: stats.vlogsCount,
        vlogsCount: stats.vlogsCount,
        balance: stats.walletBalance
      },
      recentSites,
      recentBlogs: addExcerpts(recentBlogs)
    });
  } catch (err) {
    console.error('❌ /api/user-analytics/creator-studio error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/studio/stats - Alias for Creator Studio
app.get('/api/studio/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const stats = await getUserStats(userId);
    
    res.json({
      ok: true,
      websites: stats.websitesCount,
      blogs: stats.blogsCount,
      posts: stats.postsCount,
      views: stats.totalViews,
      followers: stats.followersCount,
      following: stats.followingCount,
      vlogs: stats.vlogsCount,
      balance: stats.walletBalance
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/posts/feed - Feed posts (combines posts + blogs)
app.get('/api/posts/feed', authMiddleware, async (req, res) => {
  try {
    const Post = getModel('Post');
    const Blog = getModel('Blog');
    const userId = req.user.userId || req.user.id || req.user._id;
    const { limit = 20, page = 1 } = req.query;
    
    let posts = [];
    
    // Get posts if model exists
    if (Post) {
      const postDocs = await Post.find({ status: { $ne: 'deleted' } })
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .populate('author', 'name username avatar')
        .lean();
      posts = postDocs.map(p => ({ ...p, type: 'post' }));
    }
    
    // If no posts, try blogs
    if (posts.length === 0 && Blog) {
      const blogDocs = await Blog.find({ 
        $or: [{ status: 'published' }, { isPublished: true }] 
      })
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .populate('author', 'name username avatar')
        .lean();
      posts = blogDocs.map(b => ({ ...b, type: 'blog' }));
    }
    
    res.json({ ok: true, posts, feed: posts, count: posts.length });
  } catch (err) {
    console.error('❌ /api/posts/feed error:', err.message);
    res.status(500).json({ ok: false, error: err.message, posts: [], feed: [] });
  }
});

// GET /api/feed - Alternative feed endpoint (PUBLIC - no auth required)
app.get('/api/feed', async (req, res) => {
  try {
    const Post = getModel('Post');
    const Blog = getModel('Blog');
    const { limit = 20, page = 1, skip = 0 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skipNum = parseInt(skip) || ((pageNum - 1) * limitNum);
    
    let posts = [];
    let total = 0;
    
    // Try Post model first
    if (Post) {
      total = await Post.countDocuments({ 
        $or: [
          { status: 'published' },
          { status: { $exists: false } },
          { isPublished: true }
        ]
      });
      console.log(`📰 Feed: Found ${total} total posts in Post collection`);
      
      if (total > 0) {
        posts = await Post.find({ 
          $or: [
            { status: 'published' },
            { status: { $exists: false } },
            { isPublished: true }
          ]
        })
          .sort({ createdAt: -1 })
          .skip(skipNum)
          .limit(limitNum)
          .populate('author', 'name username avatar')
          .lean();
      }
    }
    
    // If no posts, fall back to blogs
    if (posts.length === 0 && Blog) {
      total = await Blog.countDocuments({ 
        $or: [
          { status: 'published' }, 
          { isPublished: true },
          { status: { $exists: false } }
        ]
      });
      console.log(`📰 Feed: Found ${total} total blogs, using as feed`);
      
      posts = await Blog.find({ 
        $or: [
          { status: 'published' }, 
          { isPublished: true },
          { status: { $exists: false } }
        ]
      })
        .sort({ createdAt: -1 })
        .skip(skipNum)
        .limit(limitNum)
        .populate('author', 'name username avatar')
        .lean();
      
      posts = posts.map(b => ({ ...b, type: 'blog' }));
    }
    
    // Add excerpts for better display
    posts = addExcerpts(posts);
    
    const hasMore = (skipNum + posts.length) < total;
    
    console.log(`📰 Feed: Returning ${posts.length} items (page ${pageNum}, hasMore: ${hasMore})`);
    res.json({ 
      ok: true, 
      posts, 
      feed: posts, 
      count: posts.length,
      total,
      page: pageNum,
      hasMore,
      nextPage: hasMore ? pageNum + 1 : null
    });
  } catch (err) {
    console.error('❌ /api/feed error:', err.message);
    res.status(500).json({ ok: false, error: err.message, posts: [], feed: [] });
  }
});

// GET /api/posts/my - User's posts (combines posts + blogs)
app.get('/api/posts/my', authMiddleware, async (req, res) => {
  try {
    const Post = getModel('Post');
    const Blog = getModel('Blog');
    const userId = req.user.userId || req.user.id || req.user._id;
    
    let posts = [];
    
    if (Post) {
      posts = await Post.find({ 
        $or: [{ author: userId }, { user: userId }, { userId: userId }] 
      }).sort({ createdAt: -1 }).lean();
    }
    
    // Also include blogs as posts
    if (Blog) {
      const blogs = await Blog.find({ 
        $or: [{ author: userId }, { user: userId }, { userId: userId }] 
      }).sort({ createdAt: -1 }).lean();
      
      posts = [...posts, ...blogs.map(b => ({ ...b, type: 'blog' }))];
    }
    
    // Sort combined by createdAt
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ ok: true, posts, count: posts.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, posts: [] });
  }
});

// GET /api/follows/stats - Followers/following counts
app.get('/api/follows/stats', authMiddleware, async (req, res) => {
  try {
    const User = getModel('User') || mongoose.models.User;
    const Follow = getModel('Follow');
    const userId = req.user.userId || req.user.id || req.user._id;
    
    let followersCount = 0;
    let followingCount = 0;
    
    // Try Follow model first
    if (Follow) {
      followersCount = await Follow.countDocuments({ 
        $or: [{ following: userId }, { followee: userId }, { targetUser: userId }] 
      });
      followingCount = await Follow.countDocuments({ 
        $or: [{ follower: userId }, { user: userId }, { sourceUser: userId }] 
      });
    }
    
    // Fallback to User arrays
    if ((followersCount === 0 || followingCount === 0) && User) {
      const user = await User.findById(userId).select('followers following followersCount followingCount').lean();
      if (user) {
        followersCount = followersCount || user.followersCount || user.followers?.length || 0;
        followingCount = followingCount || user.followingCount || user.following?.length || 0;
      }
    }
    
    res.json({ ok: true, followersCount, followingCount, followers: followersCount, following: followingCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, followersCount: 0, followingCount: 0 });
  }
});

// GET /api/follow/stats - Alias (frontend uses /api/follow not /api/follows)
app.get('/api/follow/stats', authMiddleware, async (req, res) => {
  try {
    const User = getModel('User') || mongoose.models.User;
    const Follow = getModel('Follow');
    const userId = req.user.userId || req.user.id || req.user._id;
    
    let followersCount = 0;
    let followingCount = 0;
    
    if (Follow) {
      followersCount = await Follow.countDocuments({ 
        $or: [{ following: userId }, { followee: userId }, { targetUser: userId }] 
      });
      followingCount = await Follow.countDocuments({ 
        $or: [{ follower: userId }, { user: userId }, { sourceUser: userId }] 
      });
    }
    
    if ((followersCount === 0 || followingCount === 0) && User) {
      const user = await User.findById(userId).select('followers following followersCount followingCount').lean();
      if (user) {
        followersCount = followersCount || user.followersCount || user.followers?.length || 0;
        followingCount = followingCount || user.followingCount || user.following?.length || 0;
      }
    }
    
    res.json({ ok: true, followersCount, followingCount, followers: followersCount, following: followingCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, followersCount: 0, followingCount: 0 });
  }
});

// GET /api/posts/user/:userId - Get posts by user ID (for profile page)
app.get('/api/posts/user/:userId', async (req, res) => {
  try {
    const Post = getModel('Post');
    const Blog = getModel('Blog');
    const { userId } = req.params;
    const { limit = 20, page = 1, skip = 0 } = req.query;
    
    if (!userId || userId === 'undefined') {
      return res.json({ ok: true, posts: [], count: 0, total: 0 });
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skipNum = parseInt(skip) || ((pageNum - 1) * limitNum);
    
    let posts = [];
    let total = 0;
    
    // Build user query
    const userQuery = {
      $or: [
        { author: userId }, 
        { user: userId }, 
        { userId: userId },
        { creator: userId },
        { createdBy: userId }
      ]
    };
    
    // Try Post model with multiple field names
    if (Post) {
      total = await Post.countDocuments(userQuery);
      
      if (total > 0) {
        posts = await Post.find(userQuery)
          .sort({ createdAt: -1 })
          .skip(skipNum)
          .limit(limitNum)
          .populate('author', 'name username avatar')
          .lean();
      }
    }
    
    // If no posts found, check blogs
    if (posts.length === 0 && Blog) {
      const blogQuery = {
        $or: [
          { author: userId }, 
          { user: userId }, 
          { userId: userId },
          { owner: userId }
        ]
      };
      
      total = await Blog.countDocuments(blogQuery);
      
      const blogs = await Blog.find(blogQuery)
        .sort({ createdAt: -1 })
        .skip(skipNum)
        .limit(limitNum)
        .populate('author', 'name username avatar')
        .lean();
      
      posts = blogs.map(b => ({ ...b, type: 'blog' }));
    }
    
    // Add excerpts for better display
    posts = addExcerpts(posts);
    
    const hasMore = (skipNum + posts.length) < total;
    
    res.json({ 
      ok: true, 
      posts, 
      count: posts.length,
      total,
      page: pageNum,
      hasMore,
      nextPage: hasMore ? pageNum + 1 : null
    });
  } catch (err) {
    console.error('❌ /api/posts/user error:', err.message);
    res.status(500).json({ ok: false, error: err.message, posts: [] });
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
  ['follow', '/api/follow', './routes/follow.routes'],
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
  ['campaigns-premium', '/api/campaigns-premium', './routes/campaigns-premium.routes'],
  
  // Debug routes (TEMPORARY - remove after fixing)
  ['debug', '/api/debug', './routes/debug.routes']
  
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
    version: '7.6.0',
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
    message: 'CYBEV API v7.6.0 - Pagination + Excerpts + Creator Studio',
    docs: 'https://docs.cybev.io',
    health: '/api/health',
    features: [
      'feed-pagination', 'posts-excerpts', 'creator-studio-stats',
      'feed', 'posts', 'followers', 'vlogs',
      'meet', 'social-tools', 'campaigns', 'ai-generate', 'ai-image', 
      'church', 'church-registration', 'forms', 'email-platform', 'automation'
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
  CYBEV API Server v7.6.0
  Pagination + Excerpts + Creator Studio
============================================
  Port: ${PORT}
  Database: ${MONGODB_URI ? 'Configured' : 'Not configured'}
  Socket.IO: Enabled
  
  v7.6.0 Fixes:
  ✅ Feed pagination (hasMore, nextPage)
  ✅ Posts excerpts (stripped HTML)
  ✅ /api/user-analytics/creator-studio
  ✅ /api/studio/stats
  ✅ Follower counts from User model
  
  v7.5.0 Fixes:
  ✅ /api/feed - Returns posts/blogs
  ✅ /api/vlogs/feed - Returns vlogs
  ✅ /api/posts/user/:userId - Profile posts
  
  Routes: ${loadedCount} loaded, ${failedCount} skipped
  Time: ${new Date().toISOString()}
============================================
  `);
});

module.exports = { app, server, io };
