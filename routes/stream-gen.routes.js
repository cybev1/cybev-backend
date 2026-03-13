// ============================================
// FILE: stream-gen.routes.js
// PATH: /routes/stream-gen.routes.js
// Stream key generation with Mux → Livepeer fallback
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
let verifyToken;
try { verifyToken = require('../middleware/verifyToken'); } catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try {
      const m = require('../middleware/auth');
      verifyToken = m.authenticateToken || m;
    } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          req.user.id = req.user.userId || req.user.id;
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

// Streaming service
let streamingService;
try { streamingService = require('../services/streaming.service'); } catch (e) {
  console.log('⚠️ stream-gen: streaming.service not found');
}

// LiveStream model (optional — saves stream to DB for tracking)
let LiveStream;
try { LiveStream = require('../models/livestream.model'); } catch (e) {
  try { LiveStream = mongoose.model('LiveStream'); } catch (e2) {}
}

console.log('🔑 Stream Generation routes loaded — Mux → Livepeer fallback');

// ═══════════════════════════════════════════
// POST /api/stream-gen/create — Generate stream credentials
// Used by Watch Party and Go Live pages
// ═══════════════════════════════════════════
router.post('/create', verifyToken, async (req, res) => {
  try {
    const { title = 'Live Stream', lowLatency = true } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!streamingService) {
      return res.status(503).json({ success: false, error: 'Streaming service not available' });
    }

    // Check if user already has a preparing stream
    if (LiveStream) {
      const existing = await LiveStream.findOne({
        streamer: userId,
        status: 'preparing',
        streamProvider: { $exists: true }
      }).sort({ createdAt: -1 });

      if (existing && existing.providerStreamKey) {
        return res.json({
          success: true,
          streamKey: existing.providerStreamKey || existing.muxStreamKey,
          rtmpUrl: existing.providerRtmpUrl || existing.muxRtmpUrl || 'rtmps://global-live.mux.com:443/app',
          playbackId: existing.providerPlaybackId || existing.muxPlaybackId,
          playbackUrl: existing.providerPlaybackUrl,
          streamId: existing._id,
          provider: existing.streamProvider || 'mux',
          message: 'Existing stream credentials returned'
        });
      }
    }

    // Create new stream via multi-provider service
    const result = await streamingService.createLiveStream({ title, lowLatency });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    // Save to DB if LiveStream model is available
    let savedStream = null;
    if (LiveStream) {
      try {
        savedStream = new LiveStream({
          streamer: userId,
          title,
          streamType: result.provider,
          status: 'preparing',
          isActive: true,
          streamProvider: result.provider,
          providerStreamId: result.streamId,
          providerStreamKey: result.streamKey,
          providerPlaybackId: result.playbackId,
          providerRtmpUrl: result.rtmpUrl,
          providerPlaybackUrl: result.playbackUrl,
          // Legacy Mux fields for backward compatibility
          muxStreamId: result.provider === 'mux' ? result.streamId : undefined,
          muxStreamKey: result.provider === 'mux' ? result.streamKey : undefined,
          muxPlaybackId: result.provider === 'mux' ? result.playbackId : undefined,
          muxRtmpUrl: result.provider === 'mux' ? result.rtmpUrl : undefined
        });
        await savedStream.save();
        console.log(`🔑 Stream saved: ${savedStream._id} via ${result.provider}`);
      } catch (saveErr) {
        // Schema might not have the new fields — that's OK, stream still works
        console.log('⚠️ Could not save stream to DB:', saveErr.message);
      }
    }

    res.json({
      success: true,
      streamKey: result.streamKey,
      rtmpUrl: result.rtmpUrl,
      playbackId: result.playbackId,
      playbackUrl: result.playbackUrl,
      streamId: savedStream?._id || result.streamId,
      providerStreamId: result.streamId,
      provider: result.provider,
      message: `Stream created via ${result.provider}`
    });

  } catch (err) {
    console.error('Stream generation error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate stream: ' + err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/stream-gen/status/:id — Check stream status
// ═══════════════════════════════════════════
router.get('/status/:id', async (req, res) => {
  try {
    if (!streamingService) return res.json({ success: false, error: 'Service unavailable' });

    // Try DB first
    if (LiveStream) {
      const stream = await LiveStream.findById(req.params.id);
      if (stream) {
        const provider = stream.streamProvider || 'mux';
        const providerStreamId = stream.providerStreamId || stream.muxStreamId;
        if (providerStreamId) {
          const status = await streamingService.getStreamStatus(provider, providerStreamId);
          return res.json(status);
        }
      }
    }

    res.json({ success: false, error: 'Stream not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/stream-gen/providers — Check which providers are available
// ═══════════════════════════════════════════
router.get('/providers', (req, res) => {
  if (!streamingService) return res.json({ anyAvailable: false });
  res.json(streamingService.getProviderStatus());
});

module.exports = router;
