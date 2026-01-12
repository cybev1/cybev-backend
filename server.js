// ============================================
// FILE: server.js
// PATH: cybev-backend/server.js
// PURPOSE: Main Express server with all routes
// VERSION: 6.8.1 - Meet, Social Tools, Campaigns, AI
// GITHUB: https://github.com/cybev1/cybev-backend
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

const io = socketIO(server, {
  cors: {
    origin: [process.env.FRONTEND_URL || '*', 'http://localhost:3000', 'https://cybev.io', 'https://www.cybev.io', /\.cybev\.io$/],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.set('io', io);
global.io = io;

// CORS
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost') || origin.includes('cybev.io')) return callback(null, true);
    return callback(null, true);
  },
  credentials: true
}));

// Subdomain handling
const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'cdn', 'static', 'meet', 'social', 'campaigns'];

app.use((req, res, next) => {
  const host = req.headers['x-original-host'] || req.headers['x-forwarded-host'] || req.headers.host || '';
  let subdomain = req.headers['x-subdomain'] || null;
  if (!subdomain && host.includes('cybev.io')) {
    const parts = host.split('.');
    if (parts.length >= 3 && !['www', 'api'].includes(parts[0])) subdomain = parts[0].toLowerCase();
  }
  req.subdomain = subdomain;
  req.isSubdomainRequest = !!subdomain && !RESERVED.includes(subdomain);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cybev')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Auth middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// Inline user routes fix
app.get('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const User = mongoose.models.User || require('./models/User.model');
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    const Post = mongoose.models.Post;
    const Follow = mongoose.models.Follow;
    let postCount = 0, followerCount = 0, followingCount = 0;
    if (Post) postCount = await Post.countDocuments({ author: req.user.id });
    if (Follow) {
      followerCount = await Follow.countDocuments({ following: req.user.id });
      followingCount = await Follow.countDocuments({ follower: req.user.id });
    }
    res.json({ ok: true, user: { ...user.toObject(), postCount, followerCount, followingCount } });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/users/username/:username', async (req, res) => {
  try {
    const User = mongoose.models.User || require('./models/User.model');
    const user = await User.findOne({ username: { $regex: new RegExp(`^${req.params.username}$`, 'i') } }).select('-password');
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
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/vlogs/my', authMiddleware, async (req, res) => {
  try {
    const Vlog = mongoose.models.Vlog || mongoose.model('Vlog', new mongoose.Schema({
      author: mongoose.Schema.Types.ObjectId, title: String, videoUrl: String, views: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }
    }));
    const vlogs = await Vlog.find({ author: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, vlogs: vlogs || [], count: vlogs.length });
  } catch (err) { res.status(500).json({ ok: false, error: err.message, vlogs: [] }); }
});

// All routes
const routes = [
  ['auth', '/api/auth', './routes/auth.routes'],
  ['oauth', '/api/auth', './routes/oauth.routes'],
  ['user', '/api/users', './routes/user.routes'],
  ['user-alt', '/api/user', './routes/user.routes'],
  ['user-profile', '/api/users', './routes/user-profile.routes'],
  ['notification-prefs', '/api/notifications', './routes/notification.preferences.routes'],
  ['blogs-my', '/api/blogs', './routes/blogs-my.routes'],
  ['blog', '/api/blogs', './routes/blog.routes'],
  ['blogsite', '/api/blogsites', './routes/blogsite.routes'],
  ['posts', '/api/posts', './routes/posts.routes'],
  ['feed', '/api/feed', './routes/feed.routes'],
  ['comments', '/api/comments', './routes/comment.routes'],
  ['bookmarks', '/api/bookmarks', './routes/bookmark.routes'],
  ['notifications', '/api/notifications', './routes/notification.routes'],
  ['notifications-adv', '/api/notifications', './routes/notifications-advanced.routes'],
  ['reactions', '/api/reactions', './routes/reaction.routes'],
  ['messages', '/api/messages', './routes/message.routes'],
  ['live', '/api/live', './routes/live.routes'],
  ['webrtc', '/api/webrtc', './routes/webrtc.routes'],
  ['stream-schedule', '/api/streams', './routes/stream-schedule.routes'],
  ['nft', '/api/nft', './routes/nft.routes'],
  ['mint', '/api/mint', './routes/mint.routes'],
  ['mint-badge', '/api/mint-badge', './routes/mint-badge.routes'],
  ['staking', '/api/staking', './routes/staking.routes'],
  ['admin', '/api/admin', './routes/admin.routes'],
  ['admin-charts', '/api/admin/charts', './routes/admin-charts.routes'],
  ['admin-summary', '/api/admin', './routes/admin-summary.routes'],
  ['admin-insight', '/api/admin', './routes/admin-insight.routes'],
  ['push', '/api/push', './routes/push.routes'],
  ['mobile', '/api/mobile', './routes/mobile.routes'],
  ['vlog', '/api/vlogs', './routes/vlog.routes'],
  ['tipping', '/api/tips', './routes/tipping.routes'],
  ['subscription', '/api/subscriptions', './routes/subscription.routes'],
  ['earnings', '/api/earnings', './routes/earnings.routes'],
  ['content', '/api/content', './routes/content.routes'],
  ['ai', '/api/ai', './routes/ai.routes'],
  ['ai-site', '/api/ai', './routes/ai-site.routes'],
  ['share', '/api/share', './routes/share.routes'],
  ['reward', '/api/rewards', './routes/reward.routes'],
  ['leaderboard', '/api/leaderboard', './routes/leaderboard.routes'],
  ['story', '/api/stories', './routes/story.routes'],
  ['monetization', '/api/monetization', './routes/monetization.routes'],
  ['sites-my', '/api/sites', './routes/sites-my.routes'],
  ['sites', '/api/sites', './routes/sites.routes'],
  ['seo', '/api/seo', './routes/seo.routes'],
  ['events', '/api/events', './routes/events.routes'],
  ['group-enhanced', '/api/groups', './routes/group-enhanced.routes'],
  ['moderation', '/api/moderation', './routes/moderation.routes'],
  ['analytics-enhanced', '/api/analytics', './routes/analytics-enhanced.routes'],
  ['i18n', '/api/i18n', './routes/i18n.routes'],
  ['hashtag', '/api/hashtags', './routes/hashtag.routes'],
  ['search', '/api/search', './routes/search.routes'],
  ['payments', '/api/payments', './routes/payments.routes'],
  ['wallet', '/api/wallet', './routes/wallet.routes'],
  ['upload', '/api/upload', './routes/upload.routes'],
  ['follow-check', '/api/follow', './routes/follow-check.routes'],
  ['follow', '/api/follow', './routes/follow.routes'],
  ['domain', '/api/domain', './routes/domain.routes'],
  ['analytics', '/api/analytics', './routes/analytics.routes'],
  ['creator-analytics', '/api/creator-analytics', './routes/creator-analytics.routes'],
  ['group', '/api/groups', './routes/group.routes'],
  ['marketplace', '/api/marketplace', './routes/marketplace.routes'],
  ['church', '/api/church', './routes/church.routes'],
  ['prayer', '/api/church/prayers', './routes/prayer.routes'],
  ['giving', '/api/church/giving', './routes/giving.routes'],
  ['cell-reports', '/api/church/cell-reports', './routes/cell-reports.routes'],
  ['whatsapp', '/api/church/whatsapp', './routes/whatsapp.routes'],
  ['forms', '/api/forms', './routes/forms.routes'],
  // NEW v6.8.1 - Studio Features
  ['meet', '/api/meet', './routes/meet.routes'],
  ['social-tools', '/api/social-tools', './routes/social-tools.routes'],
  ['campaigns', '/api/campaigns', './routes/campaigns.routes'],
  ['contacts', '/api/contacts', './routes/contacts.routes'],
  ['ai-generate', '/api/ai-generate', './routes/ai-generate.routes']
];

routes.forEach(([name, path, file]) => {
  try { app.use(path, require(file)); console.log(`✅ ${name}`); }
  catch (err) { console.log(`⚠️ ${name}: ${err.message}`); }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true, version: '6.8.1',
    features: { meet: 'enabled', socialTools: 'enabled', campaigns: 'enabled', aiGeneration: 'enabled' },
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/', (req, res) => res.json({ message: 'CYBEV API v6.8.1', features: ['meet', 'social-tools', 'campaigns', 'ai-generate'] }));

// Socket.IO for meetings and real-time features
io.on('connection', (socket) => {
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
  socket.on('stream-chat', ({ streamId, message }) => io.to(`stream:${streamId}`).emit('chat-message', message));
});

// Error handling
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ ok: false, error: 'Server error' }); });
app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 CYBEV API v6.8.1 on port ${PORT}`));

module.exports = { app, server, io };
