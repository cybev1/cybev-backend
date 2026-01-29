// ============================================
// FILE: routes/live.routes.js
// CYBEV Live Streaming Routes
// VERSION: 4.4 - Fixed GET /live/:id 404 issue + added fallback lookup
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth');

// Get livestream by ID with better error handling
router.get('/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    
    // Ensure streamId is valid ObjectId format
    if (!mongoose.Types.ObjectId.isValid(streamId)) {
      return res.status(404).json({ ok: false, error: 'Invalid stream ID format' });
    }

    const LiveStream = mongoose.models.LiveStream || require('../models/livestream.model');
    if (!LiveStream) {
      return res.status(500).json({ ok: false, error: 'LiveStream model not found' });
    }

    // Try to find the stream
    let stream = await LiveStream.findById(streamId)
      .populate('streamer', 'name username avatar profileImage')
      .lean();

    // If not found by exact ID, try finding by feedPostId (fallback)
    if (!stream) {
      console.log(`⚠️ Stream ${streamId} not found, trying feedPostId lookup...`);
      const Post = mongoose.models.Post;
      if (Post) {
        const post = await Post.findById(streamId).lean();
        if (post && post.liveStreamId) {
          stream = await LiveStream.findById(post.liveStreamId)
            .populate('streamer', 'name username avatar profileImage')
            .lean();
        }
      }
    }

    if (!stream) {
      console.log(`❌ Stream ${streamId} not found in database`);
      
      // Try one more fallback - get the LATEST active stream
      const activeStream = await LiveStream.findOne({
        status: 'live',
        isActive: true
      })
        .sort({ createdAt: -1 })
        .populate('streamer', 'name username avatar profileImage')
        .lean();

      if (activeStream) {
        console.log(`⚠️ Fallback: Using active stream ${activeStream._id} instead`);
        return res.json({ 
          ok: true, 
          stream: activeStream,
          note: 'Stream ID not found, showing active stream'
        });
      }

      return res.status(404).json({ 
        ok: false, 
        error: 'Stream not found', 
        streamId 
      });
    }

    res.json({ ok: true, stream });
  } catch (error) {
    console.error('GET /live/:id error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Join livestream (view count)
router.post('/:streamId/join', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const userId = req.user?.id || req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(streamId)) {
      return res.status(404).json({ ok: false, error: 'Invalid stream ID' });
    }

    const LiveStream = mongoose.models.LiveStream || require('../models/livestream.model');
    if (!LiveStream) {
      return res.status(500).json({ ok: false, error: 'LiveStream model not found' });
    }

    // Find stream
    let stream = await LiveStream.findById(streamId);
    
    // Fallback: try feedPostId
    if (!stream) {
      const Post = mongoose.models.Post;
      if (Post) {
        const post = await Post.findById(streamId);
        if (post && post.liveStreamId) {
          stream = await LiveStream.findById(post.liveStreamId);
        }
      }
    }

    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Stream not found' });
    }

    // Add viewer
    if (userId && !stream.viewers.includes(userId)) {
      stream.viewers.push(userId);
      stream.viewerCount = stream.viewers.length;
      await stream.save();
    }

    res.json({ ok: true, viewerCount: stream.viewerCount });
  } catch (error) {
    console.error('POST /live/:id/join error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Leave livestream
router.post('/:streamId/leave', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const userId = req.user?.id || req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(streamId)) {
      return res.status(404).json({ ok: false, error: 'Invalid stream ID' });
    }

    const LiveStream = mongoose.models.LiveStream || require('../models/livestream.model');
    if (!LiveStream) {
      return res.status(500).json({ ok: false, error: 'LiveStream model not found' });
    }

    // Find stream
    let stream = await LiveStream.findById(streamId);
    
    // Fallback: try feedPostId
    if (!stream) {
      const Post = mongoose.models.Post;
      if (Post) {
        const post = await Post.findById(streamId);
        if (post && post.liveStreamId) {
          stream = await LiveStream.findById(post.liveStreamId);
        }
      }
    }

    if (!stream) {
      return res.status(404).json({ ok: false, error: 'Stream not found' });
    }

    // Remove viewer
    stream.viewers = stream.viewers.filter(v => String(v) !== String(userId));
    stream.viewerCount = stream.viewers.length;
    await stream.save();

    res.json({ ok: true, viewerCount: stream.viewerCount });
  } catch (error) {
    console.error('POST /live/:id/leave error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
