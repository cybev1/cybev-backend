// ============================================
// FILE: server.js
// PATH: cybev-backend/server.js
// PURPOSE: Main Express server with all routes
// VERSION: 4.0.0 - January 5, 2026 Update
// ADDED: Mux Webhooks for Recording Capture
// ADDED: WebRTC Browser Streaming Support
// ADDED: WebRTC-to-RTMP Mobile Streaming
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Socket.IO setup with expanded CORS
const io = socketIO(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || '*',
      'http://localhost:3000',
      'https://cybev.io',
      'https://www.cybev.io'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);
global.io = io; // Also make globally available

// ==========================================
// CORS MIDDLEWARE (Before everything)
// ==========================================

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || '*',
    'http://localhost:3000',
    'https://cybev.io',
    'https://www.cybev.io'
  ],
  credentials: true
}));

// ==========================================
// CRITICAL: WEBHOOK ROUTES (BEFORE json middleware)
// Mux webhooks require raw body for signature verification
// ==========================================

app.use('/api/webhooks/mux', express.raw({ type: 'application/json' }));

try {
  const webhookRoutes = require('./routes/webhooks.routes');
  app.use('/api/webhooks', webhookRoutes);
  console.log('✅ Webhook routes loaded (Mux recording capture)');
} catch (err) {
  console.log('⚠️ Webhook routes not found:', err.message);
}

// ==========================================
// JSON MIDDLEWARE (After webhooks)
// ==========================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==========================================
// DATABASE CONNECTION
// ==========================================

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable not set!');
  console.log('⚠️ Server will start but database operations will fail');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => {
      console.error('❌ MongoDB connection error:', err.message);
      console.log('⚠️ Server will continue without database - some features unavailable');
    });
}

// Handle connection events
mongoose.connection.on('connected', () => console.log('📦 MongoDB connected'));
mongoose.connection.on('error', (err) => console.error('📦 MongoDB error:', err.message));
mongoose.connection.on('disconnected', () => console.log('📦 MongoDB disconnected'));

// ==========================================
// MUX CONFIGURATION CHECK
// ==========================================

const MUX_CONFIGURED = !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);
const MUX_WEBHOOK_CONFIGURED = !!process.env.MUX_WEBHOOK_SECRET;

if (MUX_CONFIGURED) {
  console.log('🎬 Mux Live Streaming: Configured');
} else {
  console.log('⚠️ Mux Live Streaming: Not configured (set MUX_TOKEN_ID and MUX_TOKEN_SECRET)');
}

if (MUX_WEBHOOK_CONFIGURED) {
  console.log('📼 Mux Recording Capture: Configured');
} else {
  console.log('⚠️ Mux Recording Capture: Not configured (set MUX_WEBHOOK_SECRET)');
}

// ==========================================
// ROUTES - AUTHENTICATION
// ==========================================

try {
  const authRoutes = require('./routes/auth.routes');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (err) {
  console.log('⚠️ Auth routes not found:', err.message);
}

// ==========================================
// ROUTES - USER
// ==========================================

try {
  const userRoutes = require('./routes/user.routes');
  app.use('/api/users', userRoutes);
  console.log('✅ User routes loaded');
} catch (err) {
  console.log('⚠️ User routes not found:', err.message);
}

// ==========================================
// ROUTES - BLOG
// ==========================================

try {
  const blogRoutes = require('./routes/blog.routes');
  app.use('/api/blogs', blogRoutes);
  app.use('/blogs', blogRoutes); // Also mount at /blogs for backward compatibility
  console.log('✅ Blog routes loaded');
} catch (err) {
  console.log('⚠️ Blog routes not found:', err.message);
}

// ==========================================
// ROUTES - CONTENT (AI BLOG GENERATION)
// ==========================================

try {
  const contentRoutes = require('./routes/content.routes');
  app.use('/api/content', contentRoutes);
  console.log('✅ Content routes loaded');
} catch (err) {
  console.log('⚠️ Content routes not found:', err.message);
}

// ==========================================
// ROUTES - POSTS (using posts.routes.js - the original)
// ==========================================

try {
  // Try posts.routes first (original file with authorId schema)
  const postsRoutes = require('./routes/posts.routes');
  app.use('/api/posts', postsRoutes);
  console.log('✅ Posts routes loaded');
} catch (err) {
  // Fallback to post.routes if posts.routes doesn't exist
  try {
    const postRoutes = require('./routes/post.routes');
    app.use('/api/posts', postRoutes);
    console.log('✅ Post routes loaded (fallback)');
  } catch (err2) {
    console.log('⚠️ Post routes not found:', err.message);
  }
}

// ==========================================
// ROUTES - FEED
// ==========================================

try {
  const feedRoutes = require('./routes/feed.routes');
  app.use('/api/feed', feedRoutes);
  console.log('✅ Feed routes loaded');
} catch (err) {
  console.log('⚠️ Feed routes not found:', err.message);
}

// ==========================================
// ROUTES - COMMENTS
// ==========================================

try {
  const commentRoutes = require('./routes/comment.routes');
  app.use('/api/comments', commentRoutes);
  console.log('✅ Comment routes loaded');
} catch (err) {
  console.log('⚠️ Comment routes not found:', err.message);
}

// ==========================================
// ROUTES - BOOKMARKS
// ==========================================

try {
  const bookmarkRoutes = require('./routes/bookmark.routes');
  app.use('/api/bookmarks', bookmarkRoutes);
  console.log('✅ Bookmark routes loaded');
} catch (err) {
  console.log('⚠️ Bookmark routes not found:', err.message);
}

// ==========================================
// ROUTES - NOTIFICATIONS
// ==========================================

try {
  const notificationRoutes = require('./routes/notification.routes');
  app.use('/api/notifications', notificationRoutes);
  console.log('✅ Notification routes loaded');
} catch (err) {
  console.log('⚠️ Notification routes not found:', err.message);
}

// ==========================================
// ROUTES - REACTIONS
// ==========================================

try {
  const reactionRoutes = require('./routes/reaction.routes');
  app.use('/api/reactions', reactionRoutes);
  console.log('✅ Reaction routes loaded');
} catch (err) {
  console.log('⚠️ Reaction routes not found:', err.message);
}

// ==========================================
// ROUTES - SHARE (Timeline Sharing)
// ==========================================

try {
  const shareRoutes = require('./routes/share.routes');
  app.use('/api/share', shareRoutes);
  console.log('✅ Share routes loaded');
} catch (err) {
  console.log('⚠️ Share routes not found:', err.message);
}

// ==========================================
// ROUTES - VLOGS (Video Stories)
// ==========================================

try {
  const vlogRoutes = require('./routes/vlog.routes');
  app.use('/api/vlogs', vlogRoutes);
  console.log('✅ Vlog routes loaded');
} catch (err) {
  console.log('⚠️ Vlog routes not found:', err.message);
}

// ==========================================
// ROUTES - MESSAGES
// ==========================================

try {
  const messageRoutes = require('./routes/message.routes');
  app.use('/api/messages', messageRoutes);
  console.log('✅ Message routes loaded');
} catch (err) {
  console.log('⚠️ Message routes not found:', err.message);
}

// ==========================================
// ROUTES - LIVE STREAMING (with Mux)
// ==========================================

try {
  const liveRoutes = require('./routes/live.routes');
  app.use('/api/live', liveRoutes);
  console.log('✅ Live streaming routes loaded');
} catch (err) {
  console.log('⚠️ Live routes not found:', err.message);
}

// ==========================================
// ROUTES - WEBRTC (Browser-based streaming)
// Mobile device camera to Mux RTMP via WebSocket + FFmpeg
// ==========================================

try {
  const webrtcRoutes = require('./routes/webrtc.routes');
  app.use('/api/webrtc', webrtcRoutes);
  
  // Initialize WebRTC WebSocket namespace for video streaming
  if (webrtcRoutes.initializeWebSocket) {
    webrtcRoutes.initializeWebSocket(io);
    console.log('✅ WebRTC WebSocket initialized');
  }
  
  console.log('✅ WebRTC routes loaded (browser streaming)');
} catch (err) {
  console.log('⚠️ WebRTC routes not found:', err.message);
}

// ==========================================
// ROUTES - NFT
// ==========================================

try {
  const nftRoutes = require('./routes/nft.routes');
  app.use('/api/nft', nftRoutes);
  console.log('✅ NFT routes loaded');
} catch (err) {
  console.log('⚠️ NFT routes not found:', err.message);
}

// ==========================================
// ROUTES - STAKING
// ==========================================

try {
  const stakingRoutes = require('./routes/staking.routes');
  app.use('/api/staking', stakingRoutes);
  console.log('✅ Staking routes loaded');
} catch (err) {
  console.log('⚠️ Staking routes not found:', err.message);
}

// ==========================================
// ROUTES - ADMIN
// ==========================================

try {
  const adminRoutes = require('./routes/admin.routes');
  app.use('/api/admin', adminRoutes);
  console.log('✅ Admin routes loaded');
} catch (err) {
  console.log('⚠️ Admin routes not found:', err.message);
}

// ==========================================
// ROUTES - PUSH NOTIFICATIONS
// ==========================================

try {
  const pushRoutes = require('./routes/push.routes');
  app.use('/api/push', pushRoutes);
  console.log('✅ Push notification routes loaded');
} catch (err) {
  console.log('⚠️ Push routes not found:', err.message);
}

// ==========================================
// ROUTES - MONETIZATION
// ==========================================

try {
  const monetizationRoutes = require('./routes/monetization.routes');
  app.use('/api/monetization', monetizationRoutes);
  console.log('✅ Monetization routes loaded');
} catch (err) {
  console.log('⚠️ Monetization routes not found:', err.message);
}

// ==========================================
// ROUTES - WALLET
// ==========================================

try {
  const walletRoutes = require('./routes/wallet.routes');
  app.use('/api/wallet', walletRoutes);
  console.log('✅ Wallet routes loaded');
} catch (err) {
  console.log('⚠️ Wallet routes not found:', err.message);
}

// ==========================================
// ROUTES - UPLOAD
// ==========================================

try {
  const uploadRoutes = require('./routes/upload.routes');
  app.use('/api/upload', uploadRoutes);
  console.log('✅ Upload routes loaded');
} catch (err) {
  console.log('⚠️ Upload routes not found:', err.message);
}

// ==========================================
// ROUTES - FOLLOW
// ==========================================

try {
  const followRoutes = require('./routes/follow.routes');
  app.use('/api/follow', followRoutes);
  console.log('✅ Follow routes loaded');
} catch (err) {
  console.log('⚠️ Follow routes not found:', err.message);
}

// ==========================================
// ROUTES - DOMAIN
// ==========================================

try {
  const domainRoutes = require('./routes/domain.routes');
  app.use('/api/domain', domainRoutes);
  console.log('✅ Domain routes loaded');
} catch (err) {
  console.log('⚠️ Domain routes not found:', err.message);
}

// ==========================================
// ROUTES - ANALYTICS
// ==========================================

try {
  const analyticsRoutes = require('./routes/analytics.routes');
  app.use('/api/analytics', analyticsRoutes);
  console.log('✅ Analytics routes loaded');
} catch (err) {
  console.log('⚠️ Analytics routes not found:', err.message);
}

// ==========================================
// ROUTES - GROUPS
// ==========================================

try {
  const groupRoutes = require('./routes/group.routes');
  app.use('/api/groups', groupRoutes);
  console.log('✅ Group routes loaded');
} catch (err) {
  console.log('⚠️ Group routes not found:', err.message);
}

// ==========================================
// ROUTES - MARKETPLACE
// ==========================================

try {
  const marketplaceRoutes = require('./routes/marketplace.routes');
  app.use('/api/marketplace', marketplaceRoutes);
  console.log('✅ Marketplace routes loaded');
} catch (err) {
  console.log('⚠️ Marketplace routes not found:', err.message);
}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    status: 'healthy',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    mux: MUX_CONFIGURED ? 'configured' : 'not configured',
    muxWebhooks: MUX_WEBHOOK_CONFIGURED ? 'configured' : 'not configured',
    features: [
      'auth', 'users', 'blogs', 'posts', 'feed',
      'comments', 'bookmarks', 'notifications',
      'reactions', 'messages', 'live-streaming',
      'nft', 'staking', 'admin', 'wallet', 'upload',
      'push-notifications', 'monetization', 'analytics',
      'content', 'ai-blog-generation', 'share-to-timeline',
      'vlogs', 'follow-system', 'token-wallet', 'groups',
      'marketplace', 'group-moderation', 'profile-editing',
      'mux-streaming', 'mux-recording-capture', 'webrtc-streaming',
      'mobile-camera-streaming'
    ]
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'CYBEV API Server v4.0.0',
    documentation: '/api/health',
    status: 'running',
    mux: MUX_CONFIGURED ? 'enabled' : 'disabled',
    webhooks: MUX_WEBHOOK_CONFIGURED ? 'enabled' : 'disabled'
  });
});

// ==========================================
// SOCKET.IO EVENTS
// ==========================================

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Join user's personal room
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  // Join conversation room
  socket.on('join-conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
  });

  // Leave conversation room
  socket.on('leave-conversation', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
  });

  // Typing indicator
  socket.on('typing', ({ conversationId, userId, isTyping }) => {
    socket.to(`conversation:${conversationId}`).emit('user-typing', { userId, isTyping });
  });

  // Join live stream
  socket.on('join-stream', (streamId) => {
    socket.join(`stream:${streamId}`);
    // Notify others in the stream
    socket.to(`stream:${streamId}`).emit('viewer-joined', { socketId: socket.id });
  });

  // Leave live stream
  socket.on('leave-stream', (streamId) => {
    socket.leave(`stream:${streamId}`);
    socket.to(`stream:${streamId}`).emit('viewer-left', { socketId: socket.id });
  });

  // Stream chat message
  socket.on('stream-chat', ({ streamId, message }) => {
    io.to(`stream:${streamId}`).emit('chat-message', message);
  });

  // Stream reaction
  socket.on('stream-reaction', ({ streamId, emoji, userId }) => {
    io.to(`stream:${streamId}`).emit('reaction', { emoji, userId });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// ==========================================
// ERROR HANDLING
// ==========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    ok: false, 
    error: 'Endpoint not found',
    path: req.path 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    ok: false, 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         CYBEV API Server v4.0.0           ║
╠═══════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}           ║
║  📦 MongoDB: ${MONGODB_URI ? 'Configured' : 'Not configured'}            ║
║  🔌 Socket.IO: Enabled                    ║
║  🤖 AI Blog: Enabled                      ║
║  📤 Share to Timeline: Enabled            ║
║  🎬 Mux Streaming: ${MUX_CONFIGURED ? 'Enabled' : 'Disabled'}              ║
║  📼 Mux Recording: ${MUX_WEBHOOK_CONFIGURED ? 'Enabled' : 'Disabled'}              ║
║  📱 Mobile Streaming: Enabled             ║
║  📅 ${new Date().toISOString()}  ║
╚═══════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
