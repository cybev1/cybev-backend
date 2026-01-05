// ============================================
// FILE: routes/live.routes.js
// Live Streaming API Routes with Mux Integration
// Features: RTMP, thumbnails, auto-feed posting, notifications
// IMPORTANT: Route order matters! Specific routes before :id routes
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
  
  streamType: { type: String, enum: ['camera', 'rtmp', 'embed', 'mux'], default: 'mux' },
  rtmpUrl: String,
  rtmpKey: String,
  embedUrl: String,
  embedPlatform: String,
  
  muxStreamId: String,
  muxStreamKey: String,
  muxPlaybackId: String,
  muxRtmpUrl: String,
  
  status: { type: String, enum: ['preparing', 'live', 'ended', 'saved'], default: 'preparing' },
  startedAt: Date,
  endedAt: Date,
  duration: Number,
  
  viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  peakViewers: { type: Number, default: 0 },
  totalViews: { type: Number, default: 0 },
  
  isPinned: { type: Boolean, default: false },
  pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  pinnedAt: Date,
  
  recordingUrl: String,
  isRecordingEnabled: { type: Boolean, default: true },
  autoDeleteAfterDays: { type: Number, default: 30 },
  deleteScheduledAt: Date,
  
  isPersistentKey: { type: Boolean, default: false },
  privacy: { type: String, enum: ['public', 'followers', 'private'], default: 'public' },
  
  feedPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
  
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
// Helper: Create Feed Post for Live Stream
// ==========================================
async function createLiveFeedPost(stream, userId) {
  try {
    let Blog, User;
    try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
    try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
    
    const user = await User.findById(userId).select('name username profilePicture');
    const authorName = user?.name || user?.username || 'Anonymous';
    
    const feedPost = new Blog({
      author: userId,
      authorId: userId,
      authorName: authorName,
      authorProfilePicture: user?.profilePicture,
      title: `🔴 LIVE: ${stream.title}`,
      content: stream.description || `${authorName} is now live! Join the stream.`,
      contentType: 'live',
      type: 'live',
      liveStreamId: stream._id,
      visibility: stream.privacy || 'public',
      isLive: true,
      thumbnail: stream.thumbnail,
      featuredImage: stream.thumbnail,
      coverImage: stream.thumbnail,
      media: stream.thumbnail ? [{
        url: stream.thumbnail,
        type: 'image',
        isLiveThumbnail: true
      }] : [],
      streamData: {
        streamId: stream._id,
        playbackId: stream.muxPlaybackId,
        viewerCount: 0,
        isLive: true
      }
    });
    
    await feedPost.save();
    console.log(`📺 Live stream posted to feed: ${feedPost._id}`);
    return feedPost;
  } catch (error) {
    console.log('Could not create feed post:', error.message);
    return null;
  }
}

// ==========================================
// Helper: Notify Followers
// ==========================================
async function notifyFollowers(stream, userId) {
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
        data: { streamId: stream._id, thumbnail: stream.thumbnail },
        isRead: false
      }));
      
      await Notification.insertMany(notifications);
      console.log(`🔔 Notified ${notifications.length} followers about live stream`);
      return notifications.length;
    }
    return 0;
  } catch (error) {
    console.log('Could not notify followers:', error.message);
    return 0;
  }
}

// ==========================================
// ==========================================
// SECTION 1: SPECIFIC ROUTES (no :id params)
// These MUST come before any /:id routes!
// ==========================================
// ==========================================

// ==========================================
// GET /api/live - Get all live streams
// ==========================================
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'live' } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (status === 'live') query.isActive = true;
    
    const streams = await LiveStream.find(query)
      .populate('streamer', 'name username profilePicture isAdmin')
      .sort({ isPinned: -1, startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await LiveStream.countDocuments(query);
    
    res.json({
      success: true,
      streams,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch streams error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch streams', details: error.message });
  }
});

// ==========================================
// GET /api/live/streams - Get all live streams (alias)
// ==========================================
router.get('/streams', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'live' } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (status === 'live') query.isActive = true;
    
    const streams = await LiveStream.find(query)
      .populate('streamer', 'name username profilePicture isAdmin')
      .sort({ isPinned: -1, startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await LiveStream.countDocuments(query);
    
    res.json({
      success: true,
      streams,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch streams error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch streams', details: error.message });
  }
});

// ==========================================
// GET /api/live/active - Get active live streams
// ==========================================
router.get('/active', optionalAuth, async (req, res) => {
  try {
    // Debug: Log the query
    console.log('📺 Fetching active streams...');
    
    const streams = await LiveStream.find({
      status: 'live',
      isActive: true
    })
      .populate('streamer', 'name username profilePicture isAdmin')
      .sort({ isPinned: -1, startedAt: -1 })
      .limit(50);
    
    // Debug: Log results
    console.log(`📺 Found ${streams.length} active streams`);
    if (streams.length > 0) {
      streams.forEach(s => {
        console.log(`   - ${s._id}: "${s.title}" by ${s.streamer?.username || 'unknown'}, status=${s.status}, isActive=${s.isActive}`);
      });
    }
    
    res.json({
      success: true,
      streams,
      count: streams.length
    });
  } catch (error) {
    console.error('Fetch active streams error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch active streams', details: error.message });
  }
});

// ==========================================
// GET /api/live/debug/:streamId - Debug stream data
// ==========================================
router.get('/debug/:streamId', async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.streamId)
      .populate('streamer', 'name username');
    
    if (!stream) {
      return res.json({ success: false, error: 'Stream not found' });
    }
    
    res.json({
      success: true,
      stream: {
        _id: stream._id,
        title: stream.title,
        status: stream.status,
        isActive: stream.isActive,
        streamType: stream.streamType,
        muxStreamId: stream.muxStreamId,
        muxPlaybackId: stream.muxPlaybackId,
        playbackUrls: stream.playbackUrls,
        startedAt: stream.startedAt,
        streamer: stream.streamer
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// GET /api/live/stream-key - Get user's stream key
// ==========================================
router.get('/stream-key', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
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
    console.error('Get stream key error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stream key' });
  }
});

// ==========================================
// GET /api/live/my-stream - Get user's active stream
// ==========================================
router.get('/my-stream', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const stream = await LiveStream.findOne({
      streamer: userId,
      status: { $in: ['live', 'preparing'] }
    }).populate('streamer', 'name username profilePicture');
    
    if (stream) {
      res.json({ success: true, hasActiveStream: true, stream });
    } else {
      res.json({ success: true, hasActiveStream: false });
    }
  } catch (error) {
    console.error('Get my stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to check stream' });
  }
});

// ==========================================
// POST /api/live/generate-key - Generate stream credentials
// ==========================================
router.post('/generate-key', verifyToken, async (req, res) => {
  try {
    const { keyType, title } = req.body;
    const userId = req.user.id || req.user._id;
    
    let existingStream = await LiveStream.findOne({
      streamer: userId,
      status: 'preparing'
    });
    
    if (existingStream && existingStream.muxStreamKey) {
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
    
    const stream = new LiveStream({
      streamer: userId,
      title: title || 'My Stream',
      streamType: 'mux',
      status: 'preparing',
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
// POST /api/live/start - Start a new stream (camera mode)
// ==========================================
router.post('/start', verifyToken, async (req, res) => {
  try {
    const { title, description, streamType, privacy, lowLatency, thumbnail, postToFeed } = req.body;
    const userId = req.user.id || req.user._id;
    
    const existingActive = await LiveStream.findOne({
      streamer: userId,
      status: 'live'
    });
    
    if (existingActive) {
      return res.status(400).json({ 
        success: false, 
        error: 'You already have an active stream. End it first.' 
      });
    }
    
    let muxData = null;
    if (muxService && muxService.isAvailable()) {
      muxData = await muxService.createLiveStream({ lowLatency: lowLatency !== false });
      if (!muxData.success) {
        console.log('⚠️ Mux stream creation failed:', muxData.error);
      }
    }
    
    const stream = new LiveStream({
      streamer: userId,
      title: title || 'Live Stream',
      description,
      streamType: muxData ? 'mux' : (streamType || 'camera'),
      status: 'live',
      startedAt: new Date(),
      privacy: privacy || 'public',
      muxStreamId: muxData?.streamId,
      muxStreamKey: muxData?.streamKey,
      muxPlaybackId: muxData?.playbackId,
      muxRtmpUrl: muxData?.rtmpUrl,
      isActive: true
    });
    
    if (thumbnail) {
      stream.thumbnail = thumbnail;
    } else if (muxData?.playbackId) {
      stream.thumbnail = `https://image.mux.com/${muxData.playbackId}/thumbnail.jpg?time=5&width=640&height=360`;
    }
    
    await stream.save();
    
    let feedPost = null;
    if (postToFeed !== false) {
      feedPost = await createLiveFeedPost(stream, userId);
      if (feedPost) {
        stream.feedPostId = feedPost._id;
        await stream.save();
      }
    }
    
    const notifiedCount = await notifyFollowers(stream, userId);
    await stream.populate('streamer', 'name username profilePicture');
    
    console.log(`🔴 Stream started: ${stream._id} - ${stream.title}`);
    
    res.json({
      success: true,
      stream,
      streamId: stream._id,
      mux: muxData ? {
        streamKey: muxData.streamKey,
        rtmpUrl: muxData.rtmpUrl,
        playbackId: muxData.playbackId
      } : null,
      feedPosted: !!feedPost,
      feedPostId: feedPost?._id,
      notifiedFollowers: notifiedCount,
      message: 'Stream started and posted to feed!'
    });
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to start stream' });
  }
});

// ==========================================
// POST /api/live/cleanup - Cleanup user's streams
// ==========================================
router.post('/cleanup', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const streams = await LiveStream.find({
      streamer: userId,
      status: { $in: ['live', 'preparing'] }
    });
    
    for (const stream of streams) {
      stream.status = 'ended';
      stream.endedAt = new Date();
      stream.isActive = false;
      
      if (stream.muxStreamId && muxService && muxService.isAvailable()) {
        try {
          await muxService.disableLiveStream(stream.muxStreamId);
        } catch (e) {}
      }
      
      await stream.save();
    }
    
    console.log(`🧹 Cleaned up ${streams.length} streams for user ${userId}`);
    
    res.json({
      success: true,
      cleaned: streams.length,
      message: `Cleaned up ${streams.length} stream(s)`
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ success: false, error: 'Failed to cleanup streams' });
  }
});

// ==========================================
// ==========================================
// SECTION 2: ROUTES WITH :muxStreamId PARAM
// ==========================================
// ==========================================

// ==========================================
// GET /api/live/check-connection/:muxStreamId
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
// GET /api/live/check-stream/:muxStreamId
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
        status: status.status,
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
// ==========================================
// SECTION 3: ROUTES WITH :id PARAM (LAST!)
// These MUST be last to avoid catching specific routes
// ==========================================
// ==========================================

// ==========================================
// GET /api/live/:id - Get single stream
// ==========================================
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    // Skip if id matches known routes (safety check)
    const knownRoutes = ['streams', 'active', 'stream-key', 'my-stream', 'cleanup'];
    if (knownRoutes.includes(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Invalid route' });
    }
    
    const stream = await LiveStream.findById(req.params.id)
      .populate('streamer', 'name username profilePicture isAdmin bio followers')
      .populate('comments.user', 'name username profilePicture');
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (req.user?.id && !stream.viewers.includes(req.user.id)) {
      stream.viewers.push(req.user.id);
      stream.totalViews = (stream.totalViews || 0) + 1;
      if (stream.viewers.length > stream.peakViewers) {
        stream.peakViewers = stream.viewers.length;
      }
      await stream.save();
    }
    
    const playbackUrls = {};
    if (stream.muxPlaybackId) {
      playbackUrls.hls = `https://stream.mux.com/${stream.muxPlaybackId}.m3u8`;
      playbackUrls.thumbnail = stream.thumbnail || `https://image.mux.com/${stream.muxPlaybackId}/thumbnail.jpg`;
    }
    
    res.json({
      success: true,
      stream: {
        ...stream.toObject(),
        playbackUrls,
        viewers: stream.viewers?.length || 0
      }
    });
  } catch (error) {
    console.error('Get stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stream' });
  }
});

// ==========================================
// POST /api/live/:id/activate - Make stream live (OBS mode)
// ==========================================
router.post('/:id/activate', verifyToken, async (req, res) => {
  try {
    const { title, description, privacy, thumbnail, postToFeed } = req.body;
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
    
    stream.status = 'live';
    stream.startedAt = new Date();
    if (title) stream.title = title;
    if (description !== undefined) stream.description = description;
    if (privacy) stream.privacy = privacy;
    
    if (thumbnail) {
      stream.thumbnail = thumbnail;
    } else if (stream.muxPlaybackId) {
      stream.thumbnail = `https://image.mux.com/${stream.muxPlaybackId}/thumbnail.jpg?time=5&width=640&height=360`;
    }
    
    await stream.save();
    
    let feedPost = null;
    if (postToFeed !== false) {
      feedPost = await createLiveFeedPost(stream, userId);
      if (feedPost) {
        stream.feedPostId = feedPost._id;
        await stream.save();
      }
    }
    
    const notifiedCount = await notifyFollowers(stream, userId);
    await stream.populate('streamer', 'name username profilePicture');
    
    console.log(`🔴 Stream activated: ${stream._id} - ${stream.title}`);
    
    res.json({
      success: true,
      stream,
      feedPosted: !!feedPost,
      feedPostId: feedPost?._id,
      notifiedFollowers: notifiedCount,
      message: 'Stream is now live and posted to feed!'
    });
  } catch (error) {
    console.error('Activate stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to activate stream' });
  }
});

// ==========================================
// POST /api/live/:id/end - End a live stream
// ==========================================
router.post('/:id/end', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (stream.streamer.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    stream.status = 'ended';
    stream.endedAt = new Date();
    stream.isActive = false;
    
    if (stream.startedAt) {
      const durationMs = stream.endedAt - stream.startedAt;
      stream.duration = Math.floor(durationMs / 1000);
    }
    
    if (stream.muxStreamId && muxService && muxService.isAvailable()) {
      try {
        await muxService.disableLiveStream(stream.muxStreamId);
      } catch (e) {
        console.log('Could not disable Mux stream:', e.message);
      }
    }
    
    await stream.save();
    
    if (stream.feedPostId) {
      try {
        let Blog;
        try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
        
        await Blog.findByIdAndUpdate(stream.feedPostId, {
          isLive: false,
          title: `📹 ${stream.title} (Ended)`,
          'streamData.isLive': false
        });
      } catch (e) {
        console.log('Could not update feed post:', e.message);
      }
    }
    
    console.log(`⏹️ Stream ended: ${stream._id}`);
    
    res.json({
      success: true,
      stream,
      message: 'Stream ended successfully'
    });
  } catch (error) {
    console.error('End stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to end stream' });
  }
});

// ==========================================
// POST /api/live/:id/comment - Add comment
// ==========================================
router.post('/:id/comment', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;
    const userId = req.user.id || req.user._id;
    
    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Comment cannot be empty' });
    }
    
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    stream.comments.push({
      user: userId,
      content: content.trim(),
      createdAt: new Date()
    });
    
    await stream.save();
    await stream.populate('comments.user', 'name username profilePicture');
    
    const newComment = stream.comments[stream.comments.length - 1];
    
    res.json({ success: true, comment: newComment });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ success: false, error: 'Failed to add comment' });
  }
});

// ==========================================
// POST /api/live/:id/like - Like/unlike stream
// ==========================================
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    const likeIndex = stream.likes.indexOf(userId);
    
    if (likeIndex > -1) {
      stream.likes.splice(likeIndex, 1);
    } else {
      stream.likes.push(userId);
    }
    
    await stream.save();
    
    res.json({
      success: true,
      liked: likeIndex === -1,
      likeCount: stream.likes.length
    });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ success: false, error: 'Failed to update like' });
  }
});

// ==========================================
// POST /api/live/:id/join - Join as viewer
// ==========================================
router.post('/:id/join', optionalAuth, async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.id);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    // Add viewer if authenticated and not already in list
    if (req.user?.id && !stream.viewers.includes(req.user.id)) {
      stream.viewers.push(req.user.id);
      stream.totalViews = (stream.totalViews || 0) + 1;
      if (stream.viewers.length > stream.peakViewers) {
        stream.peakViewers = stream.viewers.length;
      }
      await stream.save();
    }
    
    res.json({
      success: true,
      viewerCount: stream.viewers.length
    });
  } catch (error) {
    res.json({ success: true, viewerCount: 0 });
  }
});

// ==========================================
// POST /api/live/:id/leave - Leave as viewer
// ==========================================
router.post('/:id/leave', optionalAuth, async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.id);
    if (!stream) {
      return res.json({ success: true });
    }
    
    // Remove viewer if authenticated
    if (req.user?.id) {
      const index = stream.viewers.indexOf(req.user.id);
      if (index > -1) {
        stream.viewers.splice(index, 1);
        await stream.save();
      }
    }
    
    res.json({
      success: true,
      viewerCount: stream.viewers.length
    });
  } catch (error) {
    res.json({ success: true });
  }
});

// ==========================================
// POST /api/live/:id/pin - Pin stream (admin only)
// ==========================================
router.post('/:id/pin', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    let User;
    try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }
    const user = await User.findById(userId);
    
    if (!user?.isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    const stream = await LiveStream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    stream.isPinned = !stream.isPinned;
    if (stream.isPinned) {
      stream.pinnedBy = userId;
      stream.pinnedAt = new Date();
    } else {
      stream.pinnedBy = null;
      stream.pinnedAt = null;
    }
    
    await stream.save();
    
    res.json({
      success: true,
      isPinned: stream.isPinned,
      message: stream.isPinned ? 'Stream pinned' : 'Stream unpinned'
    });
  } catch (error) {
    console.error('Pin error:', error);
    res.status(500).json({ success: false, error: 'Failed to pin stream' });
  }
});

// ==========================================
// POST /api/live/:id/reaction - Send reaction
// ==========================================
router.post('/:id/reaction', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid stream ID' });
    }
    
    const stream = await LiveStream.findById(id);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    // Increment reaction count
    if (!stream.analytics) {
      stream.analytics = { reactions: 0, chatMessages: 0, shares: 0 };
    }
    stream.analytics.reactions = (stream.analytics.reactions || 0) + 1;
    await stream.save();
    
    // Emit via Socket.IO if available
    if (req.app.get('io')) {
      req.app.get('io').to(`stream:${id}`).emit('reaction', {
        emoji,
        oderId: req.user?.id,
        timestamp: new Date()
      });
    }
    
    res.json({ success: true, emoji });
  } catch (error) {
    console.error('Reaction error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reaction' });
  }
});

// ==========================================
// POST /api/live/:id/like - Like stream
// ==========================================
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const stream = await LiveStream.findById(id);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (!stream.likes) stream.likes = [];
    const likeIndex = stream.likes.indexOf(userId);
    let liked = false;
    
    if (likeIndex === -1) {
      stream.likes.push(userId);
      liked = true;
    } else {
      stream.likes.splice(likeIndex, 1);
    }
    
    await stream.save();
    res.json({ success: true, liked, likeCount: stream.likes.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update like' });
  }
});

console.log('✅ Live routes loaded (with /streams, /active, thumbnail & feed support)');

module.exports = router;
