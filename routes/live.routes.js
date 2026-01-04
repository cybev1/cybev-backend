// ============================================
// FILE: routes/live.routes.js
// Live Streaming API Routes
// Features: RTMP, embed, notifications, auto-save
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try { verifyToken = require('../middleware/auth'); } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
    } catch {}
  }
  next();
};

// Live Stream Schema
const liveStreamSchema = new mongoose.Schema({
  streamer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'Live Stream' },
  description: String,
  thumbnail: String,
  
  // Stream type
  streamType: { type: String, enum: ['camera', 'rtmp', 'embed'], default: 'camera' },
  rtmpUrl: String,
  rtmpKey: String,
  embedUrl: String, // For Facebook Live, YouTube Live, etc.
  embedPlatform: String, // 'facebook', 'youtube', 'twitch', etc.
  
  // Status
  status: { type: String, enum: ['preparing', 'live', 'ended', 'saved'], default: 'preparing' },
  startedAt: Date,
  endedAt: Date,
  
  // Viewers
  viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  peakViewers: { type: Number, default: 0 },
  totalViews: { type: Number, default: 0 },
  
  // Admin features
  isPinned: { type: Boolean, default: false },
  pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  pinnedAt: Date,
  
  // Recording
  recordingUrl: String,
  isRecordingEnabled: { type: Boolean, default: true },
  autoDeleteAfterDays: { type: Number, default: 30 },
  deleteScheduledAt: Date,
  
  // Feed post
  feedPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
  
  // Engagement
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    createdAt: { type: Date, default: Date.now }
  }],
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const LiveStream = mongoose.models.LiveStream || mongoose.model('LiveStream', liveStreamSchema);

// ==========================================
// POST /api/live/start - Start a live stream
// ==========================================
router.post('/start', verifyToken, async (req, res) => {
  try {
    const { title, description, streamType, rtmpUrl, embedUrl, embedPlatform, thumbnail } = req.body;
    
    // Check for existing live stream
    const existingStream = await LiveStream.findOne({ 
      streamer: req.user.id, 
      status: 'live' 
    });
    
    if (existingStream) {
      return res.status(400).json({ 
        success: false, 
        error: 'You already have an active stream' 
      });
    }
    
    // Generate RTMP key if using RTMP
    const rtmpKey = streamType === 'rtmp' ? `sk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null;
    
    // Create stream
    const stream = new LiveStream({
      streamer: req.user.id,
      title: title || 'Live Stream',
      description,
      thumbnail,
      streamType: streamType || 'camera',
      rtmpUrl: streamType === 'rtmp' ? (rtmpUrl || 'rtmp://live.cybev.io/live') : null,
      rtmpKey,
      embedUrl: streamType === 'embed' ? embedUrl : null,
      embedPlatform: streamType === 'embed' ? embedPlatform : null,
      status: 'live',
      startedAt: new Date(),
      deleteScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
    
    await stream.save();
    
    // Create feed post for the live stream
    try {
      let Blog;
      try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
      
      const feedPost = new Blog({
        author: req.user.id,
        title: `🔴 LIVE: ${title || 'Live Stream'}`,
        content: description || 'I am now live! Join me!',
        contentType: 'live',
        liveStreamId: stream._id,
        visibility: 'public',
        isLive: true
      });
      
      await feedPost.save();
      stream.feedPostId = feedPost._id;
      await stream.save();
      
      console.log(`📺 Live stream posted to feed: ${feedPost._id}`);
    } catch (postError) {
      console.log('Could not create feed post:', postError.message);
    }
    
    // Notify followers
    try {
      let User, Notification;
      try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
      try { Notification = require('../models/notification.model'); } catch { Notification = mongoose.model('Notification'); }
      
      // Get user with followers
      const user = await User.findById(req.user.id).select('followers name username');
      
      if (user?.followers?.length > 0) {
        // Create notifications for followers
        const notifications = user.followers.slice(0, 100).map(followerId => ({
          recipient: followerId,
          sender: req.user.id,
          type: 'live_started',
          message: `${user.name || user.username} started a live stream: ${title || 'Live Stream'}`,
          data: { streamId: stream._id },
          isRead: false
        }));
        
        await Notification.insertMany(notifications);
        console.log(`🔔 Notified ${notifications.length} followers about live stream`);
      }
    } catch (notifyError) {
      console.log('Could not notify followers:', notifyError.message);
    }
    
    await stream.populate('streamer', 'name username profilePicture');
    
    res.status(201).json({
      success: true,
      stream,
      rtmpKey,
      rtmpUrl: streamType === 'rtmp' ? 'rtmp://live.cybev.io/live' : null,
      message: 'Stream started successfully'
    });
    
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to start stream' });
  }
});

// ==========================================
// POST /api/live/:id/end - End a live stream
// ==========================================
router.post('/:id/end', verifyToken, async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    const userId = req.user.id || req.user._id;
    const streamerId = stream.streamer.toString();
    
    // Check if user is the streamer OR an admin
    let isAdmin = false;
    try {
      let User;
      try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
      const user = await User.findById(userId);
      isAdmin = user?.isAdmin || user?.role === 'admin';
    } catch {}
    
    if (streamerId !== userId.toString() && !isAdmin) {
      console.log(`❌ End stream denied: streamer=${streamerId}, user=${userId}`);
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    stream.status = 'saved';
    stream.endedAt = new Date();
    await stream.save();
    
    // Update feed post
    if (stream.feedPostId) {
      try {
        let Blog;
        try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
        await Blog.findByIdAndUpdate(stream.feedPostId, { isLive: false });
      } catch {}
    }
    
    console.log(`✅ Stream ended: ${stream._id} by user ${userId}`);
    
    res.json({
      success: true,
      stream,
      message: 'Stream ended and saved'
    });
    
  } catch (error) {
    console.error('End stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to end stream' });
  }
});

// ==========================================
// GET /api/live/active - Get active live streams
// ==========================================
router.get('/active', optionalAuth, async (req, res) => {
  try {
    const streams = await LiveStream.find({ 
      status: 'live',
      isActive: true 
    })
    .populate('streamer', 'name username profilePicture isAdmin role')
    .sort({ isPinned: -1, peakViewers: -1, startedAt: -1 })
    .lean();
    
    // Mark admin streams
    const processedStreams = streams.map(s => ({
      ...s,
      isAdminStream: s.streamer?.isAdmin || s.streamer?.role === 'admin',
      viewers: s.viewers?.length || 0
    }));
    
    res.json({ success: true, streams: processedStreams });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch streams' });
  }
});

// ==========================================
// GET /api/live/saved - Get saved streams (recordings)
// ==========================================
router.get('/saved', optionalAuth, async (req, res) => {
  try {
    const { userId, limit = 20, page = 1 } = req.query;
    
    const query = { status: 'saved', isActive: true };
    if (userId) query.streamer = userId;
    
    const streams = await LiveStream.find(query)
      .populate('streamer', 'name username profilePicture')
      .sort({ endedAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    res.json({ success: true, streams });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch recordings' });
  }
});

// ==========================================
// GET /api/live/:id - Get stream details
// ==========================================
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.id)
      .populate('streamer', 'name username profilePicture isAdmin')
      .populate('comments.user', 'name username profilePicture')
      .lean();
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    // Increment views
    await LiveStream.findByIdAndUpdate(req.params.id, { $inc: { totalViews: 1 } });
    
    res.json({ 
      success: true, 
      stream: {
        ...stream,
        viewers: stream.viewers?.length || 0,
        likesCount: stream.likes?.length || 0
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch stream' });
  }
});

// ==========================================
// POST /api/live/:id/join - Join as viewer
// ==========================================
router.post('/:id/join', optionalAuth, async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream || stream.status !== 'live') {
      return res.status(404).json({ success: false, error: 'Stream not available' });
    }
    
    if (req.user && !stream.viewers.includes(req.user.id)) {
      stream.viewers.push(req.user.id);
      stream.peakViewers = Math.max(stream.peakViewers, stream.viewers.length);
      await stream.save();
    }
    
    res.json({ success: true, viewerCount: stream.viewers.length });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to join stream' });
  }
});

// ==========================================
// POST /api/live/:id/leave - Leave as viewer
// ==========================================
router.post('/:id/leave', optionalAuth, async (req, res) => {
  try {
    if (req.user) {
      await LiveStream.findByIdAndUpdate(req.params.id, {
        $pull: { viewers: req.user.id }
      });
    }
    
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to leave stream' });
  }
});

// ==========================================
// POST /api/live/:id/pin - Pin/Unpin stream (Admin only)
// ==========================================
router.post('/:id/pin', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    let User;
    try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
    const user = await User.findById(req.user.id);
    
    if (!user?.isAdmin && user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    const { isPinned } = req.body;
    
    const stream = await LiveStream.findByIdAndUpdate(
      req.params.id,
      { 
        isPinned: isPinned !== undefined ? isPinned : true,
        pinnedBy: isPinned ? req.user.id : null,
        pinnedAt: isPinned ? new Date() : null
      },
      { new: true }
    ).populate('streamer', 'name username profilePicture');
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    res.json({
      success: true,
      stream,
      message: isPinned ? 'Stream pinned to top' : 'Stream unpinned'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update pin status' });
  }
});

// ==========================================
// PUT /api/live/:id - Edit stream (title, description)
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (stream.streamer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    const { title, description, thumbnail } = req.body;
    
    if (title) stream.title = title;
    if (description !== undefined) stream.description = description;
    if (thumbnail) stream.thumbnail = thumbnail;
    
    await stream.save();
    
    res.json({
      success: true,
      stream,
      message: 'Stream updated successfully'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update stream' });
  }
});

// ==========================================
// DELETE /api/live/:id - Delete stream recording
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (stream.streamer.toString() !== req.user.id) {
      // Check if admin
      let User;
      try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
      const user = await User.findById(req.user.id);
      
      if (!user?.isAdmin && user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Not authorized' });
      }
    }
    
    stream.isActive = false;
    await stream.save();
    
    // Also remove feed post if exists
    if (stream.feedPostId) {
      try {
        let Blog;
        try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
        await Blog.findByIdAndUpdate(stream.feedPostId, { isDeleted: true });
      } catch {}
    }
    
    res.json({
      success: true,
      message: 'Stream deleted successfully'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete stream' });
  }
});

// ==========================================
// POST /api/live/:id/comment - Add comment to stream
// ==========================================
router.post('/:id/comment', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Comment content required' });
    }
    
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    stream.comments.push({
      user: req.user.id,
      content: content.trim(),
      createdAt: new Date()
    });
    
    await stream.save();
    
    const populatedStream = await LiveStream.findById(req.params.id)
      .populate('comments.user', 'name username profilePicture');
    
    res.json({
      success: true,
      comment: populatedStream.comments[populatedStream.comments.length - 1]
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add comment' });
  }
});

console.log('✅ Live streaming routes loaded');

module.exports = router;
