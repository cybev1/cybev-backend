// ============================================
// FILE: server/server.js
// CYBEV Backend with AI Content Engine
// ============================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');

const app = express();
const server = http.createServer(app);

console.log('🔧 Starting CYBEV Backend...');

// Initialize Socket.io
const { initializeSocket } = require('./socket');
initializeSocket(server);

// ---------- CORS Configuration ----------
const allowedOrigins = [
  'http://localhost:3000',
  'https://cybev.io',
  'https://www.cybev.io',
  'https://api.cybev.io',
  /https:\/\/.*\.vercel\.app$/
];

app.use(cors({
  origin: function (origin, callback) {
    console.log('🌐 CORS Check - Origin:', origin);
    
    if (!origin) {
      console.log('✅ No origin - allowing');
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      console.log('✅ Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('❌ Origin blocked:', origin);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

app.use((err, req, res, next) => {
  if (err && /CORS/i.test(err.message)) {
    console.error('❌ CORS Error:', err.message);
    return res.status(403).json({ 
      ok: false, 
      error: 'CORS blocked', 
      detail: err.message 
    });
  }
  next(err);
});

// ---------- Body parsing ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ---------- Health checks ----------
app.get('/', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'CYBEV Backend is live ✅',
    timestamp: Date.now(),
    features: [
      'auth', 
      'blogs', 
      'rewards', 
      'domains', 
      'comments', 
      'bookmarks', 
      'follow', 
      'notifications',
      'ai-generation',
      'content-engine',
      'seo-optimization',
      'image-generation',
      'viral-hashtags',
      'nft-minting',
      'token-staking'
    ]
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    status: 'healthy',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    ai: {
      claude: !!process.env.ANTHROPIC_API_KEY,
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      unsplash: !!process.env.UNSPLASH_ACCESS_KEY,
      pexels: !!process.env.PEXELS_API_KEY
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    ts: Date.now(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    services: {
      ai: !!process.env.ANTHROPIC_API_KEY || !!process.env.DEEPSEEK_API_KEY,
      images: !!process.env.UNSPLASH_ACCESS_KEY || !!process.env.PEXELS_API_KEY
    }
  });
});

app.get('/check-cors', (req, res) => {
  const origin = req.headers.origin || 'no-origin';
  console.log('🔍 CORS Check endpoint hit from:', origin);
  res.json({ 
    ok: true, 
    message: 'CORS is working',
    origin: origin,
    allowedOrigins: allowedOrigins.map(o => o instanceof RegExp ? o.toString() : o)
  });
});

// ---------- Routes ----------
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

try {
  const blogRoutes = require('./routes/blog.routes');
  const rewardRoutes = require('./routes/reward.routes');
  const domainRoutes = require('./routes/domain.routes');
  const commentRoutes = require('./routes/comment.routes');
  const bookmarkRoutes = require('./routes/bookmark.routes');
  const followRoutes = require('./routes/follow.routes');
  const feedRoutes = require('./routes/feed.routes');
  const notificationRoutes = require('./routes/notification.routes');
  
  // 🤖 AI & Content Engine Routes
  const aiRoutes = require('./routes/ai.routes');
  const contentRoutes = require('./routes/content.routes');
  
  app.use('/api/blogs', blogRoutes);
  app.use('/api/rewards', rewardRoutes);
  app.use('/api/domain', domainRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/bookmarks', bookmarkRoutes);
  app.use('/api/follow', followRoutes);
  app.use('/api/feed', feedRoutes);
  app.use('/api/notifications', notificationRoutes);
  
  // 🚀 AI & Content Engine
  app.use('/api/ai', aiRoutes);
  app.use('/api/content', contentRoutes);
  
  console.log('✅ All routes loaded successfully!');
  console.log('🤖 AI routes: /api/ai');
  console.log('📝 Content routes: /api/content');
} catch (error) {
  console.log('⚠️ Some routes not loaded:', error.message);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    ok: false,
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('💥 Error:', err);
  res.status(err.status || 500).json({ 
    ok: false, 
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ---------- Mongo + Start ----------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ ERROR: MONGO_URI not found in environment variables');
  process.exit(1);
}

// Log API key status (without revealing keys)
console.log('\n🔑 API Keys Status:');
console.log('  MongoDB:', MONGO_URI ? '✅' : '❌');
console.log('  Claude AI:', process.env.ANTHROPIC_API_KEY ? '✅' : '❌');
console.log('  DeepSeek AI:', process.env.DEEPSEEK_API_KEY ? '✅' : '❌');
console.log('  Unsplash Images:', process.env.UNSPLASH_ACCESS_KEY ? '✅' : '⚠️ (using fallback)');
console.log('  Pexels Images:', process.env.PEXELS_API_KEY ? '✅' : '⚠️ (optional)');
console.log('');

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    server.listen(PORT, () => {
      console.log(`🚀 CYBEV Server running on PORT ${PORT}`);
      console.log('🌐 Allowed origins:', allowedOrigins.map(o => o instanceof RegExp ? o.toString() : o));
      console.log('✨ Content Engine Ready!');
      console.log('   🤖 AI Blog Generation: /api/content/create-blog');
      console.log('   🏗️ Website Templates: /api/content/create-template');
      console.log('   🔍 SEO Generation: /api/content/generate-seo');
      console.log('   🔥 Viral Hashtags: /api/content/generate-hashtags');
      console.log('   🖼️ Featured Images: /api/content/get-featured-image');
      console.log('   💎 NFT Minting: /api/content/mint-nft');
      console.log('   💰 Token Staking: /api/content/stake');
      console.log('');
      console.log('🎉 Server ready to create amazing content!');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  mongoose.connection.close();
  process.exit(0);
});
