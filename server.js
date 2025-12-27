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
// Increase limit for image uploads (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

console.log('📦 Loading routes...');

// Load each route individually with try-catch
// This way, one broken model won't crash everything!

try {
  const blogRoutes = require('./routes/blog.routes');
  app.use('/blogs', blogRoutes);  // Fixed: Removed /api prefix
app.use('/sites', blogSiteRoutes);
  console.log('  ✅ blog.routes loaded');
} catch (error) {
  console.log('  ❌ blog.routes failed:', error.message);
}

try {
  const rewardRoutes = require('./routes/reward.routes');
  app.use('/api/rewards', rewardRoutes);
  console.log('  ✅ reward.routes loaded');
} catch (error) {
  console.log('  ❌ reward.routes failed:', error.message);
}

try {
  const domainRoutes = require('./routes/domain.routes');
  app.use('/api/domain', domainRoutes);
  console.log('  ✅ domain.routes loaded');
} catch (error) {
  console.log('  ❌ domain.routes failed:', error.message);
}

try {
  const commentRoutes = require('./routes/comment.routes');
  app.use('/api/comments', commentRoutes);
  console.log('  ✅ comment.routes loaded');
} catch (error) {
  console.log('  ❌ comment.routes failed:', error.message);
}

try {
  const bookmarkRoutes = require('./routes/bookmark.routes');
  app.use('/api/bookmarks', bookmarkRoutes);
  console.log('  ✅ bookmark.routes loaded');
} catch (error) {
  console.log('  ❌ bookmark.routes failed:', error.message);
}

try {
  const followRoutes = require('./routes/follow.routes');
  app.use('/api/follow', followRoutes);
  console.log('  ✅ follow.routes loaded');
} catch (error) {
  console.log('  ❌ follow.routes failed:', error.message);
  console.log('  ⚠️ Follow routes skipped - model syntax error');
}

try {
  const feedRoutes = require('./routes/feed.routes');
  app.use('/api/feed', feedRoutes);
  console.log('  ✅ feed.routes loaded');
} catch (error) {
  console.log('  ❌ feed.routes failed:', error.message);
}

try {
  // NOTE: file name is plural (notifications.routes.js)
  const notificationRoutes = require('./routes/notifications.routes');
  app.use('/api/notifications', notificationRoutes);
  console.log('  ✅ notifications.routes loaded');
} catch (error) {
  console.log('  ❌ notifications.routes failed:', error.message);
  console.log('  ⚠️ Notification routes skipped');
}

// 🤖 AI & Content Engine Routes - CRITICAL!
console.log('  📡 Loading AI routes...');
try {
  const aiRoutes = require('./routes/ai.routes');
  app.use('/api/ai', aiRoutes);
  console.log('  ✅ ai.routes loaded');
} catch (error) {
  console.log('  ❌ ai.routes FAILED:', error.message);
  console.log('  📍 Stack:', error.stack);
}

console.log('  📡 Loading Content routes...');
try {
  const contentRoutes = require('./routes/content.routes');
  app.use('/api/content', contentRoutes);  // FIXED: Mount at /api/content
  console.log('  ✅ content.routes loaded');
} catch (error) {
  console.log('  ❌ content.routes FAILED:', error.message);
  console.log('  📍 Stack:', error.stack);
}

console.log('  📡 Loading Posts routes...');
try {
  const postsRoutes = require('./routes/posts.routes');
  app.use('/posts', postsRoutes);  // Fixed: Removed /api prefix
  console.log('  ✅ posts.routes loaded');
} catch (error) {
  console.log('  ❌ posts.routes failed:', error.message);
}

console.log('  📸 Loading Upload routes...');
try {
  const uploadRoutes = require('./routes/upload.routes');
const blogSiteRoutes = require('./routes/blogsite.routes');
  app.use('/api/upload', uploadRoutes);
  console.log('  ✅ upload.routes loaded');
} catch (error) {
  console.log('  ❌ upload.routes failed:', error.message);
  console.log('  ⚠️ Image upload will not work without upload.routes');
}

console.log('✅ Route loading complete!');
console.log('🤖 AI routes: /api/ai');
console.log('📝 Content routes: /api/content');
console.log('💬 Posts routes: /posts');  // Fixed: Updated path
console.log('📚 Blog routes: /blogs');    // Added blog routes
console.log('📸 Upload routes: /api/upload');

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
console.log('  Cloudinary Upload:', process.env.CLOUDINARY_CLOUD_NAME ? '✅' : '⚠️ (image upload disabled)');
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
