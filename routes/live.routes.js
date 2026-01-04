// ============================================
// FILE: routes/live.routes.js
// Live Streaming API Routes with Mux Integration
// Features: RTMP, embed, notifications, auto-save
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Mux service
let muxService;
try {
  muxService = require('../services/mux.service');
  console.log('✅ Mux service loaded');
} catch (e) {
  console.log('⚠️ Mux service not available:', e.message);
}

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
  streamType: { type: String, enum: ['camera', 'rtmp', 'embed', 'mux'], default: 'mux' },
  rtmpUrl: String,
  rtmpKey: String,
  embedUrl: String,
  embedPlatform: String,
  
  // Mux integration
  muxStreamId: String,
  muxStreamKey: String,
  muxPlaybackId: String,
  muxRtmpUrl: String,
  
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
  
  // Persistent key support
  isPersistentKey: { type: Boolean, default: false },
  privacy: { type: String, enum: ['public', 'followers', 'private'], default: 'public' },
  
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
// POST /api/live/create-stream-key - Create stream key without going live
// ==========================================
router.post('/create-stream-key', verifyToken, async (req, res) => {
  try {
    const { persistent, title, description } = req.body;
    const userId = req.user.id || req.user._id;
    
    // Check for existing preparing stream
    const existingPreparing = await LiveStream.findOne({
      streamer: userId,
      status: 'preparing'
    });
    
    if (existingPreparing) {
      // Return existing stream key
      return res.json({
        success: true,
        streamKey: existingPreparing.muxStreamKey,
        rtmpUrl: existingPreparing.muxRtmpUrl || 'rtmps://global-live.mux.com:443/app',
        playbackId: existingPreparing.muxPlaybackId,
        muxStreamId: existingPreparing.muxStreamId,
        streamId: existingPreparing._id,
        message: 'Using existing stream key'
      });
    }
    
    // Create Mux live stream
    let muxData = null;
    if (muxService && muxService.isAvailable()) {
      muxData = await muxService.createLiveStream({ lowLatency: true });
      if (!muxData.success) {
        console.log('⚠️ Mux stream creation failed:', muxData.error);
        return res.status(500).json({ success: false, error: 'Failed to create stream key' });
      }
    } else {
      return res.status(500).json({ success: false, error: 'Streaming service not configured' });
    }
    
    // Create stream record in "preparing" status
    const stream = new LiveStream({
      streamer: userId,
      title: title || 'Untitled Stream',
      description,
      streamType: 'mux',
      
      // Mux details
      muxStreamId: muxData.streamId,
      muxStreamKey: muxData.streamKey,
      muxPlaybackId: muxData.playbackId,
      muxRtmpUrl: muxData.rtmpUrl,
      
      status: 'preparing',
      isPersistentKey: persistent || false
    });
    
    await stream.save();
    
    console.log(`🔑 Stream key created for user ${userId}: ${stream._id}`);
    
    res.json({
      success: true,
      streamKey: muxData.streamKey,
      rtmpUrl: muxData.rtmpUrl,
      playbackId: muxData.playbackId,
      muxStreamId: muxData.streamId,
      streamId: stream._id,
      message: 'Stream key generated successfully'
    });
    
  } catch (error) {
    console.error('Create stream key error:', error);
    res.status(500).json({ success: false, error: 'Failed to create stream key' });
  }
});

// ==========================================
// GET /api/live/stream-key - Get user's persistent stream key
// ==========================================
router.get('/stream-key', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    // Find persistent key or most recent preparing stream
    const stream = await LiveStream.findOne({
      streamer: userId,
      $or: [
        { isPersistentKey: true },
        { status: 'preparing' }
      ]
    }).sort({ createdAt: -1 });
    
    if (stream && stream.muxStreamKey) {
      res.json({
        success: true,
        streamKey: stream.muxStreamKey,
        rtmpUrl: stream.muxRtmpUrl || 'rtmps://global-live.mux.com:443/app',
        playbackId: stream.muxPlaybackId,
        muxStreamId: stream.muxStreamId,
        streamId: stream._id,
        isPersistent: stream.isPersistentKey
      });
    } else {
      res.json({ success: false, message: 'No stream key found' });
    }
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get stream key' });
  }
});

// ==========================================
// GET /api/live/check-stream/:muxStreamId - Check if OBS is streaming
// ==========================================
router.get('/check-stream/:muxStreamId', verifyToken, async (req, res) => {
  try {
    const { muxStreamId } = req.params;
    
    if (!muxService || !muxService.isAvailable()) {
      return res.json({ success: false, status: 'unknown', error: 'Mux not configured' });
    }
    
    const status = await muxService.getLiveStreamStatus(muxStreamId);
    
    if (status.success) {
      res.json({
        success: true,
        status: status.status, // 'idle', 'active', 'disabled'
        isStreaming: status.status === 'active',
        playbackId: status.playbackId
      });
    } else {
      res.json({ success: false, status: 'unknown', error: status.error });
    }
    
  } catch (error) {
    console.error('Check stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to check stream status' });
  }
});

// ==========================================
// POST /api/live/:id/go-live - Activate a preparing stream
// ==========================================
router.post('/:id/go-live', verifyToken, async (req, res) => {
  try {
    const { title, description, privacy } = req.body;
    const userId = req.user.id || req.user._id;
    
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (stream.streamer.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    if (stream.status !== 'preparing') {
      return res.status(400).json({ success: false, error: 'Stream is not in preparing state' });
    }
    
    // Update stream to live
    stream.status = 'live';
    stream.startedAt = new Date();
    stream.title = title || stream.title;
    stream.description = description || stream.description;
    stream.privacy = privacy || 'public';
    
    await stream.save();
    
    // Create feed post for the live stream
    try {
      let Blog, User;
      try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
      try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
      
      const user = await User.findById(userId).select('name username');
      const authorName = user?.name || user?.username || 'Anonymous';
      
      const feedPost = new Blog({
        author: userId,
        authorId: userId,
        authorName: authorName,
        title: `🔴 LIVE: ${stream.title}`,
        content: stream.description || 'I am now live! Join me!',
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
      
      const user = await User.findById(userId).select('followers name username');
      
      if (user?.followers?.length > 0) {
        const notifications = user.followers.slice(0, 100).map(followerId => ({
          recipient: followerId,
          sender: userId,
          type: 'live_started',
          message: `${user.name || user.username} started a live stream: ${stream.title}`,
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
    
    console.log(`🔴 Stream went live: ${stream._id}`);
    
    res.json({
      success: true,
      stream,
      message: 'You are now LIVE!'
    });
    
  } catch (error) {
    console.error('Go live error:', error);
    res.status(500).json({ success: false, error: 'Failed to go live' });
  }
});

// ==========================================
// POST /api/live/:id/cancel - Cancel a preparing stream
// ==========================================
router.post('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (stream.streamer.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    // Delete Mux stream if exists
    if (stream.muxStreamId && muxService && muxService.isAvailable()) {
      try {
        await muxService.deleteLiveStream(stream.muxStreamId);
      } catch (e) {
        console.log('Could not delete Mux stream:', e.message);
      }
    }
    
    // Remove the stream record
    await LiveStream.findByIdAndDelete(req.params.id);
    
    console.log(`🗑️ Stream cancelled: ${req.params.id}`);
    
    res.json({
      success: true,
      message: 'Stream cancelled'
    });
    
  } catch (error) {
    console.error('Cancel stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel stream' });
  }
});

// ==========================================
// POST /api/live/start - Start a live stream with Mux
// ==========================================
router.post('/start', verifyToken, async (req, res) => {
  try {
    const { title, description, streamType, rtmpUrl, embedUrl, embedPlatform, thumbnail, lowLatency } = req.body;
    
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
    
    // Create Mux live stream
    let muxData = null;
    if (muxService && process.env.MUX_TOKEN_ID) {
      muxData = await muxService.createLiveStream({ lowLatency: lowLatency !== false });
      if (!muxData.success) {
        console.log('⚠️ Mux stream creation failed:', muxData.error);
      }
    }
    
    // Create stream record
    const stream = new LiveStream({
      streamer: req.user.id,
      title: title || 'Live Stream',
      description,
      thumbnail,
      streamType: muxData?.success ? 'mux' : (streamType || 'camera'),
      
      // Mux details
      muxStreamId: muxData?.streamId,
      muxStreamKey: muxData?.streamKey,
      muxPlaybackId: muxData?.playbackId,
      muxRtmpUrl: muxData?.rtmpUrl,
      
      // Legacy RTMP support
      rtmpUrl: streamType === 'rtmp' ? (rtmpUrl || 'rtmp://live.cybev.io/live') : null,
      rtmpKey: streamType === 'rtmp' ? `sk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null,
      
      // Embed support
      embedUrl: streamType === 'embed' ? embedUrl : null,
      embedPlatform: streamType === 'embed' ? embedPlatform : null,
      
      status: 'live',
      startedAt: new Date(),
      deleteScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    await stream.save();
    
    // Create feed post for the live stream
    try {
      let Blog, User;
      try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
      try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
      
      const user = await User.findById(req.user.id).select('name username');
      const authorName = user?.name || user?.username || 'Anonymous';
      
      const feedPost = new Blog({
        author: req.user.id,
        authorId: req.user.id,
        authorName: authorName,
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
      
      const user = await User.findById(req.user.id).select('followers name username');
      
      if (user?.followers?.length > 0) {
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
    
    // Build playback URLs if Mux is available
    let playbackUrls = null;
    if (muxData?.playbackId && muxService) {
      playbackUrls = muxService.getPlaybackUrl(muxData.playbackId);
    }
    
    res.status(201).json({
      success: true,
      stream,
      // Mux streaming details
      mux: muxData?.success ? {
        streamKey: muxData.streamKey,
        rtmpUrl: muxData.rtmpUrl,
        playbackId: muxData.playbackId,
        playbackUrls
      } : null,
      // Legacy RTMP details
      rtmpKey: stream.rtmpKey,
      rtmpUrl: stream.rtmpUrl,
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
    
    // End Mux stream if exists
    if (stream.muxStreamId && muxService) {
      try {
        await muxService.endLiveStream(stream.muxStreamId);
        console.log(`✅ Mux stream ended: ${stream.muxStreamId}`);
      } catch (muxError) {
        console.log('⚠️ Could not end Mux stream:', muxError.message);
      }
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
// POST /api/live/cleanup - End all user's active streams
// ==========================================
router.post('/cleanup', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    // Find and end all active streams for this user
    const result = await LiveStream.updateMany(
      { streamer: userId, status: 'live' },
      { status: 'saved', endedAt: new Date() }
    );
    
    // Also update any feed posts
    try {
      let Blog;
      try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
      await Blog.updateMany(
        { author: userId, isLive: true },
        { isLive: false }
      );
    } catch {}
    
    console.log(`🧹 Cleaned up ${result.modifiedCount} streams for user ${userId}`);
    
    res.json({
      success: true,
      cleaned: result.modifiedCount,
      message: `Ended ${result.modifiedCount} active streams`
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ success: false, error: 'Failed to cleanup streams' });
  }
});

// ==========================================
// GET /api/live/my-stream - Get user's current active stream
// ==========================================
router.get('/my-stream', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const stream = await LiveStream.findOne({
      streamer: userId,
      status: 'live'
    }).populate('streamer', 'name username profilePicture');
    
    res.json({
      success: true,
      stream,
      hasActiveStream: !!stream
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch stream' });
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
    
    // Get playback URLs if Mux stream
    let playbackUrls = null;
    if (stream.muxPlaybackId && muxService) {
      playbackUrls = muxService.getPlaybackUrl(stream.muxPlaybackId);
    }
    
    res.json({ 
      success: true, 
      stream: {
        ...stream,
        viewers: stream.viewers?.length || 0,
        likesCount: stream.likes?.length || 0,
        playbackUrls
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

// ==========================================
// POST /api/live/generate-key - Generate stream credentials for OBS
// Creates Mux stream but doesn't make it public yet
// ==========================================
router.post('/generate-key', verifyToken, async (req, res) => {
  try {
    const { keyType, title } = req.body;
    const userId = req.user.id || req.user._id;
    
    // Check for existing preparing stream
    let existingStream = await LiveStream.findOne({
      streamer: userId,
      status: 'preparing'
    });
    
    if (existingStream && existingStream.muxStreamKey) {
      // Return existing credentials
      return res.json({
        success: true,
        streamKey: existingStream.muxStreamKey,
        rtmpUrl: existingStream.muxRtmpUrl || 'rtmps://global-live.mux.com:443/app',
        playbackId: existingStream.muxPlaybackId,
        muxStreamId: existingStream.muxStreamId,
        streamId: existingStream._id,
        message: 'Existing credentials returned'
      });
    }
    
    // Create Mux live stream
    let muxData = null;
    if (muxService && muxService.isAvailable()) {
      muxData = await muxService.createLiveStream({ lowLatency: true });
      if (!muxData.success) {
        console.log('⚠️ Mux stream creation failed:', muxData.error);
        return res.status(500).json({ success: false, error: 'Failed to create stream credentials' });
      }
    } else {
      return res.status(500).json({ success: false, error: 'Streaming service not configured' });
    }
    
    // Create stream record in "preparing" status
    const stream = new LiveStream({
      streamer: userId,
      title: title || 'My Stream',
      streamType: 'mux',
      status: 'preparing', // Not live yet
      
      // Mux details
      muxStreamId: muxData.streamId,
      muxStreamKey: muxData.streamKey,
      muxPlaybackId: muxData.playbackId,
      muxRtmpUrl: muxData.rtmpUrl,
      
      isActive: true
    });
    
    await stream.save();
    
    console.log(`🔑 Stream credentials generated for user ${userId}: ${stream._id}`);
    
    res.json({
      success: true,
      streamKey: muxData.streamKey,
      rtmpUrl: muxData.rtmpUrl,
      playbackId: muxData.playbackId,
      muxStreamId: muxData.streamId,
      streamId: stream._id,
      message: 'Stream credentials generated'
    });
    
  } catch (error) {
    console.error('Generate key error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate stream credentials' });
  }
});

// ==========================================
// GET /api/live/check-connection/:muxStreamId - Check if OBS is connected
// ==========================================
router.get('/check-connection/:muxStreamId', verifyToken, async (req, res) => {
  try {
    const { muxStreamId } = req.params;
    
    if (!muxService || !muxService.isAvailable()) {
      return res.status(500).json({ success: false, error: 'Streaming service not available' });
    }
    
    const statusResult = await muxService.getLiveStreamStatus(muxStreamId);
    
    if (!statusResult.success) {
      return res.json({ 
        success: true, 
        connected: false, 
        status: 'idle',
        message: 'Could not check status'
      });
    }
    
    // Mux stream status: 'idle' (not receiving), 'active' (receiving data), 'disabled'
    const isConnected = statusResult.status === 'active';
    
    console.log(`📡 Connection check for ${muxStreamId}: ${statusResult.status}`);
    
    res.json({
      success: true,
      connected: isConnected,
      status: statusResult.status,
      playbackId: statusResult.playbackId
    });
    
  } catch (error) {
    console.error('Check connection error:', error);
    res.json({ success: true, connected: false, status: 'error' });
  }
});

// ==========================================
// POST /api/live/:id/activate - Activate stream (make public)
// Called after OBS is connected and user clicks "Go Live"
// ==========================================
router.post('/:id/activate', verifyToken, async (req, res) => {
  try {
    const { title, description, privacy } = req.body;
    const userId = req.user.id || req.user._id;
    
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (stream.streamer.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    if (stream.status === 'live') {
      return res.json({ success: true, stream, message: 'Stream already live' });
    }
    
    // Update stream to live
    stream.status = 'live';
    stream.startedAt = new Date();
    if (title) stream.title = title;
    if (description !== undefined) stream.description = description;
    if (privacy) stream.privacy = privacy;
    
    await stream.save();
    
    // Create feed post for the live stream
    try {
      let Blog, User;
      try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
      try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
      
      const user = await User.findById(userId).select('name username');
      const authorName = user?.name || user?.username || 'Anonymous';
      
      const feedPost = new Blog({
        author: userId,
        authorId: userId,
        authorName: authorName,
        title: `🔴 LIVE: ${stream.title}`,
        content: stream.description || 'I am now live! Join me!',
        contentType: 'live',
        liveStreamId: stream._id,
        visibility: privacy || 'public',
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
      
      const user = await User.findById(userId).select('followers name username');
      
      if (user?.followers?.length > 0) {
        const notifications = user.followers.slice(0, 100).map(followerId => ({
          recipient: followerId,
          sender: userId,
          type: 'live_started',
          message: `${user.name || user.username} started a live stream: ${stream.title}`,
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
    
    console.log(`🔴 Stream activated: ${stream._id} - ${stream.title}`);
    
    res.json({
      success: true,
      stream,
      message: 'Stream is now live!'
    });
    
  } catch (error) {
    console.error('Activate stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to activate stream' });
  }
});

// ==========================================
// GET /api/live/stream-key - Get persistent stream key
// ==========================================
router.get('/stream-key', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    // Find preparing stream with credentials
    const stream = await LiveStream.findOne({
      streamer: userId,
      status: 'preparing',
      muxStreamKey: { $exists: true, $ne: null }
    });
    
    if (!stream) {
      return res.json({ success: true, credentials: null });
    }
    
    res.json({
      success: true,
      credentials: {
        streamKey: stream.muxStreamKey,
        rtmpUrl: stream.muxRtmpUrl || 'rtmps://global-live.mux.com:443/app',
        playbackId: stream.muxPlaybackId,
        muxStreamId: stream.muxStreamId,
        streamId: stream._id
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch stream key' });
  }
});

console.log('✅ Live streaming routes loaded');

module.exports = router;
