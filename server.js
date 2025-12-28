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
      'auth', 'blogs', 'rewards', 'domains', 'comments', 
      'bookmarks', 'follow', 'notifications', 'ai-generation',
      'content-engine', 'seo-optimization', 'image-generation',
      'viral-hashtags', 'nft-minting', 'token-staking',
      'admin-dashboard', 'tipping', 'subscriptions', 'push-notifications'
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
    },
    blockchain: {
      enabled: !!process.env.CYBEV_TOKEN_ADDRESS,
      network: process.env.CHAIN_ID || 'not configured'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    ts: Date.now(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ---------- Routes ----------
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

console.log('📦 Loading routes...');

// ========== EXISTING ROUTES ==========

try {
  const blogRoutes = require('./routes/blog.routes');
  app.use('/blogs', blogRoutes);
  console.log('  ✅ blog.routes loaded');
} catch (error) {
  console.log('  ❌ blog.routes failed:', error.message);
}

try {
  const blogSiteRoutes = require('./routes/blogsite.routes');
  app.use('/sites', blogSiteRoutes);
  console.log('  ✅ blogsite.routes loaded');
} catch (error) {
  console.log('  ❌ blogsite.routes failed:', error.message);
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
}

try {
  const feedRoutes = require('./routes/feed.routes');
  app.use('/api/feed', feedRoutes);
  console.log('  ✅ feed.routes loaded');
} catch (error) {
  console.log('  ❌ feed.routes failed:', error.message);
}

try {
  const notificationRoutes = require('./routes/notifications.routes');
  app.use('/api/notifications', notificationRoutes);
  console.log('  ✅ notifications.routes loaded');
} catch (error) {
  console.log('  ❌ notifications.routes failed:', error.message);
}

try {
  const aiRoutes = require('./routes/ai.routes');
  app.use('/api/ai', aiRoutes);
  console.log('  ✅ ai.routes loaded');
} catch (error) {
  console.log('  ❌ ai.routes failed:', error.message);
}

try {
  const contentRoutes = require('./routes/content.routes');
  app.use('/api/content', contentRoutes);
  console.log('  ✅ content.routes loaded');
} catch (error) {
  console.log('  ❌ content.routes failed:', error.message);
}

try {
  const postsRoutes = require('./routes/posts.routes');
  app.use('/posts', postsRoutes);
  console.log('  ✅ posts.routes loaded');
} catch (error) {
  console.log('  ❌ posts.routes failed:', error.message);
}

try {
  const uploadRoutes = require('./routes/upload.routes');
  app.use('/api/upload', uploadRoutes);
  console.log('  ✅ upload.routes loaded');
} catch (error) {
  console.log('  ❌ upload.routes failed:', error.message);
}

// ========== NEW ROUTES (Admin, NFT, Staking, Tips, Subscriptions) ==========

console.log('  🆕 Loading NEW routes...');

try {
  const adminRoutes = require('./routes/admin.routes');
  app.use('/api/admin', adminRoutes);
  console.log('  ✅ admin.routes loaded');
} catch (error) {
  console.log('  ⚠️ admin.routes not found (optional):', error.message);
}

try {
  const nftRoutes = require('./routes/nft.routes');
  app.use('/api/nft', nftRoutes);
  console.log('  ✅ nft.routes loaded');
} catch (error) {
  console.log('  ⚠️ nft.routes not found (optional):', error.message);
}

try {
  const stakingRoutes = require('./routes/staking.routes');
  app.use('/api/staking', stakingRoutes);
  console.log('  ✅ staking.routes loaded');
} catch (error) {
  console.log('  ⚠️ staking.routes not found (optional):', error.message);
}

try {
  const tippingRoutes = require('./routes/tipping.routes');
  app.use('/api/tips', tippingRoutes);
  console.log('  ✅ tipping.routes loaded');
} catch (error) {
  console.log('  ⚠️ tipping.routes not found (optional):', error.message);
}

try {
  const subscriptionRoutes = require('./routes/subscription.routes');
  app.use('/api/subscriptions', subscriptionRoutes);
  console.log('  ✅ subscription.routes loaded');
} catch (error) {
  console.log('  ⚠️ subscription.routes not found (optional):', error.message);
}

try {
  const pushRoutes = require('./routes/push.routes');
  app.use('/api/push', pushRoutes);
  console.log('  ✅ push.routes loaded');
} catch (error) {
  console.log('  ⚠️ push.routes not found (optional):', error.message);
}

console.log('✅ Route loading complete!');

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
    error: err.message || 'Internal Server Error'
  });
});

// ---------- Mongo + Start ----------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ ERROR: MONGO_URI not found');
  process.exit(1);
}

console.log('\n🔑 API Keys Status:');
console.log('  MongoDB:', MONGO_URI ? '✅' : '❌');
console.log('  Claude AI:', process.env.ANTHROPIC_API_KEY ? '✅' : '❌');
console.log('  DeepSeek AI:', process.env.DEEPSEEK_API_KEY ? '✅' : '❌');
console.log('  Unsplash:', process.env.UNSPLASH_ACCESS_KEY ? '✅' : '⚠️');
console.log('  Cloudinary:', process.env.CLOUDINARY_CLOUD_NAME ? '✅' : '⚠️');

console.log('\n🔗 Blockchain Status:');
console.log('  Token Contract:', process.env.CYBEV_TOKEN_ADDRESS ? '✅' : '⚠️ Not deployed');
console.log('  NFT Contract:', process.env.CYBEV_NFT_ADDRESS ? '✅' : '⚠️ Not deployed');
console.log('  Staking Contract:', process.env.CYBEV_STAKING_ADDRESS ? '✅' : '⚠️ Not deployed');
console.log('  Chain ID:', process.env.CHAIN_ID || '⚠️ Not set');

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    server.listen(PORT, () => {
      console.log(`🚀 CYBEV Server running on PORT ${PORT}`);
      console.log('🎉 Server ready!');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  mongoose.connection.close();
  process.exit(0);
});
