// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
console.log('🔧 Starting CYBEV Backend...');

// ---------- CORS Configuration ----------
const allowedOrigins = [
  'http://localhost:3000',
  'https://cybev.io',
  'https://www.cybev.io',
  'https://api.cybev.io',
  /https:\/\/.*\.vercel\.app$/  // Allow all Vercel preview deployments
];

app.use(cors({
  origin: function (origin, callback) {
    console.log('🌐 CORS Check - Origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      console.log('✅ No origin - allowing');
      return callback(null, true);
    }

    // Check if origin is in allowed list or matches Vercel pattern
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

// CORS error handler
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

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ---------- Diagnostics ----------
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

// Root + health
app.get('/', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'CYBEV Backend is live ✅',
    timestamp: Date.now(),
    features: ['auth', 'blogs', 'rewards', 'domains']
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    status: 'healthy',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
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
const blogRoutes = require('./routes/blog.routes');
const rewardRoutes = require('./routes/reward.routes');
const domainRoutes = require('./routes/domain.routes');

app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/domain', domainRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    ok: false,
    error: 'Route not found',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      '/api/auth',
      '/api/blogs',
      '/api/rewards',
      '/api/domain',
      '/health'
    ]
  });
});

// ---------- Error Handler ----------
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

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════════════╗
  ║   🚀 CYBEV Server Running               ║
  ║                                          ║
  ║   Port: ${PORT}                         ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}              ║
  ║   MongoDB: Connected                     ║
  ║                                          ║
  ║   API Endpoints:                         ║
  ║   • Auth: /api/auth                      ║
  ║   • Blogs: /api/blogs                    ║
  ║   • Rewards: /api/rewards                ║
  ║   • Domain: /api/domain                  ║
  ║                                          ║
  ║   Ready to accept requests! ✨           ║
  ╚══════════════════════════════════════════╝
      `);
      console.log('🌐 Allowed origins:', allowedOrigins.map(o => o instanceof RegExp ? o.toString() : o));
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  mongoose.connection.close();
  process.exit(0);
});
