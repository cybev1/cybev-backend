// ============================================
// FILE: routes/live.routes.js
// PATH: cybev-backend/routes/live.routes.js
// PURPOSE: Live streaming backend routes
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// STREAM SCHEMA
// ==========================================

let Stream;

try {
  Stream = mongoose.model('Stream');
} catch {
  const streamSchema = new mongoose.Schema({
    streamer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: String,
    category: { type: String, default: 'Just Chatting' },
    thumbnail: String,
    streamKey: { type: String, unique: true },
    playbackUrl: String,
    status: { type: String, enum: ['idle', 'live', 'ended'], default: 'idle' },
    isPrivate: { type: Boolean, default: false },
    allowChat: { type: Boolean, default: true },
    allowTips: { type: Boolean, default: true },
    viewerCount: { type: Number, default: 0 },
    peakViewers: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    tips: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      amount: Number,
      message: String,
      createdAt: { type: Date, default: Date.now }
    }],
    totalTips: { type: Number, default: 0 },
    startedAt: Date,
    endedAt: Date,
    duration: Number, // in seconds
    chatMessages: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      text: String,
      createdAt: { type: Date, default: Date.now }
    }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }, { timestamps: true });

  streamSchema.index({ streamer: 1, status: 1 });
  streamSchema.index({ status: 1, startedAt: -1 });
  streamSchema.index({ category: 1 });
  
  Stream = mongoose.model('Stream', streamSchema);
}

// Generate unique stream key
const generateStreamKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'live_';
  for (let i = 0; i < 24; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
};

// ==========================================
// STREAM MANAGEMENT
// ==========================================

// GET /api/live/streams - Get all live streams
router.get('/streams', async (req, res) => {
  try {
    const { category, limit = 20, page = 1 } = req.query;

    const query = { status: 'live' };
    if (category && category !== 'all') {
      query.category = category;
    }

    const streams = await Stream.find(query)
      .populate('streamer', 'name username avatar followers')
      .sort({ viewerCount: -1, startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Stream.countDocuments(query);

    res.json({
      ok: true,
      streams,
      total,
      page: parseInt(page),
      hasMore: streams.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Get streams error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get streams' });
  }
});

// GET /api/live/featured - Get featured streams
router.get('/featured', async (req, res) => {
  try {
    const streams = await Stream.find({ status: 'live' })
      .populate('streamer', 'name username avatar followers')
      .sort({ viewerCount: -1 })
      .limit(5);

    res.json({ ok: true, streams });
  } catch (error) {
    console.error('Get featured error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get featured streams' });
  }
});

// GET /api/live/:streamId - Get single stream
router.get('/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;

    const stream = await Stream.findById(streamId)
      .populate('streamer', 'name username avatar followers bio')
      .populate('chatMessages.user', 'name username avatar');

    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Stream not found' });
    }

    // Increment view count
    stream.totalViews += 1;
    if (stream.status === 'live') {
      stream.viewerCount += 1;
      if (stream.viewerCount > stream.peakViewers) {
        stream.peakViewers = stream.viewerCount;
      }
    }
    await stream.save();

    res.json({ ok: true, stream });
  } catch (error) {
    console.error('Get stream error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get stream' });
  }
});

// POST /api/live/start - Start a new stream
router.post('/start', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, category, isPrivate, allowChat, allowTips } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Stream title required' });
    }

    // Check if user already has an active stream
    const existingStream = await Stream.findOne({
      streamer: userId,
      status: 'live'
    });

    if (existingStream) {
      return res.status(400).json({ 
        ok: false, 
        error: 'You already have an active stream',
        streamId: existingStream._id
      });
    }

    // Create new stream
    const streamKey = generateStreamKey();
    const stream = await Stream.create({
      streamer: userId,
      title,
      description: description || '',
      category: category || 'Just Chatting',
      streamKey,
      isPrivate: isPrivate || false,
      allowChat: allowChat !== false,
      allowTips: allowTips !== false,
      status: 'live',
      startedAt: new Date()
    });

    const populatedStream = await Stream.findById(stream._id)
      .populate('streamer', 'name username avatar');

    // Notify followers (in production)
    try {
      const User = mongoose.model('User');
      const streamer = await User.findById(userId).select('followers name');
      const Notification = mongoose.model('Notification');

      if (streamer?.followers?.length > 0) {
        // Create notifications for followers (limit to first 100)
        const notificationPromises = streamer.followers.slice(0, 100).map(followerId =>
          Notification.create({
            recipient: followerId,
            sender: userId,
            type: 'live',
            message: `${streamer.name} started a live stream!`,
            relatedStream: stream._id
          }).catch(() => null)
        );
        await Promise.all(notificationPromises);
      }
    } catch (notifError) {
      console.log('Notification creation failed:', notifError.message);
    }

    res.json({
      ok: true,
      stream: populatedStream,
      streamKey,
      streamId: stream._id
    });
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ ok: false, error: 'Failed to start stream' });
  }
});

// POST /api/live/:streamId/end - End a stream
router.post('/:streamId/end', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { streamId } = req.params;

    const stream = await Stream.findOne({
      _id: streamId,
      streamer: userId
    });

    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Stream not found or not authorized' });
    }

    if (stream.status !== 'live') {
      return res.status(400).json({ ok: false, error: 'Stream is not live' });
    }

    stream.status = 'ended';
    stream.endedAt = new Date();
    stream.duration = Math.floor((stream.endedAt - stream.startedAt) / 1000);
    stream.viewerCount = 0;
    await stream.save();

    res.json({
      ok: true,
      message: 'Stream ended',
      stats: {
        duration: stream.duration,
        peakViewers: stream.peakViewers,
        totalViews: stream.totalViews,
        totalTips: stream.totalTips,
        likes: stream.likes
      }
    });
  } catch (error) {
    console.error('End stream error:', error);
    res.status(500).json({ ok: false, error: 'Failed to end stream' });
  }
});

// PUT /api/live/:streamId - Update stream settings
router.put('/:streamId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { streamId } = req.params;
    const { title, description, category, isPrivate, allowChat, allowTips } = req.body;

    const stream = await Stream.findOne({
      _id: streamId,
      streamer: userId
    });

    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Stream not found or not authorized' });
    }

    if (title) stream.title = title;
    if (description !== undefined) stream.description = description;
    if (category) stream.category = category;
    if (isPrivate !== undefined) stream.isPrivate = isPrivate;
    if (allowChat !== undefined) stream.allowChat = allowChat;
    if (allowTips !== undefined) stream.allowTips = allowTips;

    await stream.save();

    res.json({ ok: true, stream });
  } catch (error) {
    console.error('Update stream error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update stream' });
  }
});

// ==========================================
// VIEWER INTERACTIONS
// ==========================================

// POST /api/live/:streamId/join - Join stream as viewer
router.post('/:streamId/join', async (req, res) => {
  try {
    const { streamId } = req.params;

    const stream = await Stream.findById(streamId);
    if (!stream || stream.status !== 'live') {
      return res.status(404).json({ ok: false, error: 'Stream not found or not live' });
    }

    stream.viewerCount += 1;
    if (stream.viewerCount > stream.peakViewers) {
      stream.peakViewers = stream.viewerCount;
    }
    await stream.save();

    // Emit viewer count update via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`stream_${streamId}`).emit('viewerCount', stream.viewerCount);
    }

    res.json({ ok: true, viewerCount: stream.viewerCount });
  } catch (error) {
    console.error('Join stream error:', error);
    res.status(500).json({ ok: false, error: 'Failed to join stream' });
  }
});

// POST /api/live/:streamId/leave - Leave stream
router.post('/:streamId/leave', async (req, res) => {
  try {
    const { streamId } = req.params;

    const stream = await Stream.findById(streamId);
    if (stream && stream.viewerCount > 0) {
      stream.viewerCount -= 1;
      await stream.save();

      // Emit viewer count update via socket
      const io = req.app.get('io');
      if (io) {
        io.to(`stream_${streamId}`).emit('viewerCount', stream.viewerCount);
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Leave stream error:', error);
    res.status(500).json({ ok: false, error: 'Failed to leave stream' });
  }
});

// POST /api/live/:streamId/like - Like a stream
router.post('/:streamId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { streamId } = req.params;

    const stream = await Stream.findById(streamId);
    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Stream not found' });
    }

    const hasLiked = stream.likedBy.includes(userId);
    
    if (hasLiked) {
      stream.likedBy = stream.likedBy.filter(id => id.toString() !== userId.toString());
      stream.likes = Math.max(0, stream.likes - 1);
    } else {
      stream.likedBy.push(userId);
      stream.likes += 1;
    }

    await stream.save();

    res.json({
      ok: true,
      liked: !hasLiked,
      likes: stream.likes
    });
  } catch (error) {
    console.error('Like stream error:', error);
    res.status(500).json({ ok: false, error: 'Failed to like stream' });
  }
});

// POST /api/live/:streamId/tip - Send tip to streamer
router.post('/:streamId/tip', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { streamId } = req.params;
    const { amount, message } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid tip amount' });
    }

    const stream = await Stream.findById(streamId);
    if (!stream || stream.status !== 'live') {
      return res.status(404).json({ ok: false, error: 'Stream not found or not live' });
    }

    if (!stream.allowTips) {
      return res.status(400).json({ ok: false, error: 'Tips are disabled for this stream' });
    }

    // Add tip to stream
    stream.tips.push({
      user: userId,
      amount,
      message: message || ''
    });
    stream.totalTips += amount;
    await stream.save();

    // Get user info for socket emission
    const User = mongoose.model('User');
    const tipper = await User.findById(userId).select('name username');

    // Emit tip event via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`stream_${streamId}`).emit('newTip', {
        user: tipper,
        amount,
        message
      });
    }

    // Transfer tokens (in production, integrate with blockchain)
    // await transferTokens(userId, stream.streamer, amount);

    res.json({
      ok: true,
      message: 'Tip sent successfully',
      totalTips: stream.totalTips
    });
  } catch (error) {
    console.error('Tip error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send tip' });
  }
});

// ==========================================
// CHAT
// ==========================================

// POST /api/live/:streamId/chat - Send chat message
router.post('/:streamId/chat', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { streamId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'Message text required' });
    }

    const stream = await Stream.findById(streamId);
    if (!stream || stream.status !== 'live') {
      return res.status(404).json({ ok: false, error: 'Stream not found or not live' });
    }

    if (!stream.allowChat) {
      return res.status(400).json({ ok: false, error: 'Chat is disabled for this stream' });
    }

    if (stream.blockedUsers.includes(userId)) {
      return res.status(403).json({ ok: false, error: 'You are blocked from this chat' });
    }

    // Add message
    const chatMessage = {
      user: userId,
      text: text.trim(),
      createdAt: new Date()
    };
    
    stream.chatMessages.push(chatMessage);
    
    // Keep only last 500 messages
    if (stream.chatMessages.length > 500) {
      stream.chatMessages = stream.chatMessages.slice(-500);
    }
    
    await stream.save();

    // Get user info
    const User = mongoose.model('User');
    const user = await User.findById(userId).select('name username avatar');

    // Emit chat message via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`stream_${streamId}`).emit('chatMessage', {
        ...chatMessage,
        user
      });
    }

    res.json({ ok: true, message: chatMessage });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send message' });
  }
});

// GET /api/live/:streamId/chat - Get chat history
router.get('/:streamId/chat', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { limit = 50 } = req.query;

    const stream = await Stream.findById(streamId)
      .select('chatMessages')
      .populate('chatMessages.user', 'name username avatar');

    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Stream not found' });
    }

    const messages = stream.chatMessages.slice(-parseInt(limit));

    res.json({ ok: true, messages });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get chat' });
  }
});

// ==========================================
// MODERATION
// ==========================================

// POST /api/live/:streamId/block - Block user from stream
router.post('/:streamId/block', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { streamId } = req.params;
    const { targetUserId } = req.body;

    const stream = await Stream.findOne({
      _id: streamId,
      $or: [
        { streamer: userId },
        { moderators: userId }
      ]
    });

    if (!stream) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    if (!stream.blockedUsers.includes(targetUserId)) {
      stream.blockedUsers.push(targetUserId);
      await stream.save();
    }

    res.json({ ok: true, message: 'User blocked' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ ok: false, error: 'Failed to block user' });
  }
});

// GET /api/live/user/:userId/history - Get user's stream history
router.get('/user/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, page = 1 } = req.query;

    const streams = await Stream.find({
      streamer: userId,
      status: 'ended'
    })
      .select('title category thumbnail duration peakViewers totalViews likes startedAt')
      .sort({ startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ ok: true, streams });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get stream history' });
  }
});

module.exports = router;
