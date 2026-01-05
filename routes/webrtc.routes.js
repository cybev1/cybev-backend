// ============================================
// FILE: routes/webrtc.routes.js
// WebRTC Browser Streaming Routes
// Handles: Device camera streaming to Mux via WebSocket + FFmpeg
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Services
let webrtcRtmpService;
try {
  webrtcRtmpService = require('../services/webrtc-rtmp.service');
} catch (e) {
  console.log('⚠️ WebRTC-RTMP service not available:', e.message);
}

let muxService;
try {
  muxService = require('../services/mux.service');
} catch (e) {
  console.log('⚠️ Mux service not available');
}

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
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

// Get LiveStream model
let LiveStream;
try {
  LiveStream = require('../models/livestream.model');
} catch {
  LiveStream = mongoose.models.LiveStream;
}

// Store active WebSocket connections
const activeConnections = new Map();

// ==========================================
// GET /api/webrtc/status - Check service status
// ==========================================
router.get('/status', async (req, res) => {
  try {
    let webrtcStatus = { available: false };
    
    // Check FFmpeg availability
    const { execSync } = require('child_process');
    let ffmpegPath = 'ffmpeg';
    try {
      ffmpegPath = require('ffmpeg-static');
    } catch {}
    
    try {
      execSync(`${ffmpegPath} -version`, { stdio: 'pipe' });
      webrtcStatus = {
        available: true,
        ffmpeg: 'ready',
        activeStreams: webrtcRtmpService ? webrtcRtmpService.getActiveStreamCount() : 0
      };
      console.log('✅ FFmpeg is available');
    } catch (e) {
      webrtcStatus = { available: false, ffmpeg: 'not found', error: e.message };
    }

    // Check Mux availability
    let muxStatus = { available: false };
    try {
      if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
        muxStatus = { available: true };
      }
    } catch {}

    res.json({
      success: true,
      webrtc: webrtcStatus,
      mux: muxStatus
    });
  } catch (error) {
    console.error('WebRTC status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// POST /api/webrtc/start-stream - Start camera stream
// Creates Mux live stream and returns credentials
// ==========================================
router.post('/start-stream', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, privacy } = req.body;

    if (!muxService) {
      return res.status(500).json({ success: false, error: 'Mux service not available' });
    }

    // Check for existing active stream
    const existingStream = await LiveStream.findOne({
      streamer: userId,
      status: { $in: ['preparing', 'live'] },
      isActive: true
    });

    if (existingStream) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active stream',
        existingStreamId: existingStream._id
      });
    }

    // Create Mux live stream
    const muxStream = await muxService.createLiveStream({
      playback_policy: ['public'],
      new_asset_settings: { playback_policy: ['public'] },
      reduced_latency: true
    });

    // Create database record
    const stream = new LiveStream({
      streamer: userId,
      title: title || 'Live Stream',
      description,
      privacy: privacy || 'public',
      streamType: 'camera',
      status: 'preparing',
      isActive: true,
      muxStreamId: muxStream.id,
      muxStreamKey: muxStream.stream_key,
      muxPlaybackId: muxStream.playback_ids?.[0]?.id,
      muxRtmpUrl: 'rtmps://global-live.mux.com:443/app',
      playbackUrls: {
        hls: muxStream.playback_ids?.[0]?.id 
          ? `https://stream.mux.com/${muxStream.playback_ids[0].id}.m3u8`
          : null,
        thumbnail: muxStream.playback_ids?.[0]?.id
          ? `https://image.mux.com/${muxStream.playback_ids[0].id}/thumbnail.jpg`
          : null
      }
    });

    await stream.save();

    // Build full RTMP URL for FFmpeg
    const rtmpUrl = `rtmps://global-live.mux.com:443/app/${muxStream.stream_key}`;

    console.log(`✅ Created camera stream ${stream._id} for user ${userId}`);

    res.json({
      success: true,
      streamId: stream._id,
      muxStreamId: muxStream.id,
      playbackId: muxStream.playback_ids?.[0]?.id,
      rtmpUrl, // Full RTMP URL for FFmpeg
      playbackUrl: stream.playbackUrls.hls
    });

  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// POST /api/webrtc/stop-stream/:streamId - Stop camera stream
// ==========================================
router.post('/stop-stream/:streamId', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const userId = req.user.id;

    const stream = await LiveStream.findOne({
      _id: streamId,
      streamer: userId
    });

    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }

    // Stop FFmpeg stream
    if (webrtcRtmpService) {
      webrtcRtmpService.stopStream(streamId);
    }

    // Update database
    stream.status = 'ended';
    stream.isActive = false;
    stream.endedAt = new Date();
    if (stream.startedAt) {
      stream.duration = Math.floor((stream.endedAt - stream.startedAt) / 1000);
    }
    await stream.save();

    console.log(`✅ Stopped camera stream ${streamId}`);

    res.json({ success: true, message: 'Stream stopped' });

  } catch (error) {
    console.error('Stop stream error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// GET /api/webrtc/stream-stats/:streamId - Get stream statistics
// ==========================================
router.get('/stream-stats/:streamId', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    
    const stats = webrtcRtmpService ? webrtcRtmpService.getStreamStats(streamId) : null;
    const isActive = webrtcRtmpService ? webrtcRtmpService.isStreamActive(streamId) : false;

    res.json({
      success: true,
      streamId,
      isActive,
      stats
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// WebSocket Handler - Initialize in server.js
// ==========================================
function initializeWebSocket(io) {
  const webrtcNamespace = io.of('/webrtc');
  
  webrtcNamespace.on('connection', (socket) => {
    console.log(`🔌 WebRTC client connected: ${socket.id}`);
    
    let currentStreamId = null;
    let currentRtmpUrl = null;
    let isAuthenticated = false;
    let userId = null;

    // Authenticate
    socket.on('authenticate', async (data) => {
      try {
        const { token, streamId, rtmpUrl } = data;
        
        // Verify token
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
        userId = decoded.id;
        isAuthenticated = true;
        
        // Verify stream ownership
        const stream = await LiveStream.findOne({
          _id: streamId,
          streamer: userId
        });
        
        if (!stream) {
          socket.emit('error', { message: 'Stream not found or unauthorized' });
          return;
        }

        currentStreamId = streamId;
        currentRtmpUrl = rtmpUrl;
        
        // Store connection
        activeConnections.set(socket.id, {
          streamId,
          userId,
          connectedAt: Date.now()
        });

        socket.emit('authenticated', { 
          success: true, 
          streamId,
          message: 'Ready to receive video data'
        });
        
        console.log(`✅ WebRTC authenticated: user ${userId}, stream ${streamId}`);
        
      } catch (error) {
        console.error('WebRTC auth error:', error);
        socket.emit('error', { message: 'Authentication failed: ' + error.message });
      }
    });

    // Start streaming - Initialize FFmpeg
    socket.on('start-streaming', async (data) => {
      if (!isAuthenticated || !currentStreamId || !currentRtmpUrl) {
        socket.emit('error', { message: 'Not authenticated or missing stream info' });
        return;
      }

      try {
        // Start FFmpeg process
        if (webrtcRtmpService) {
          webrtcRtmpService.startStream(currentStreamId, currentRtmpUrl, socket);
          
          // Update database
          await LiveStream.findByIdAndUpdate(currentStreamId, {
            status: 'live',
            isActive: true,
            startedAt: new Date()
          });

          socket.emit('streaming-started', {
            success: true,
            streamId: currentStreamId,
            message: 'Streaming to Mux initiated'
          });
          
          console.log(`🎬 Started streaming for ${currentStreamId}`);
        } else {
          socket.emit('error', { message: 'WebRTC-RTMP service not available' });
        }
        
      } catch (error) {
        console.error('Start streaming error:', error);
        socket.emit('error', { message: 'Failed to start streaming: ' + error.message });
      }
    });

    // Receive video data chunks
    socket.on('video-data', (data) => {
      if (!isAuthenticated || !currentStreamId) {
        return;
      }

      try {
        // Data should be a Buffer or ArrayBuffer
        let buffer;
        if (data instanceof Buffer) {
          buffer = data;
        } else if (data instanceof ArrayBuffer) {
          buffer = Buffer.from(data);
        } else if (data.buffer) {
          buffer = Buffer.from(data.buffer);
        } else {
          buffer = Buffer.from(data);
        }

        // Write to FFmpeg
        if (webrtcRtmpService) {
          const success = webrtcRtmpService.writeData(currentStreamId, buffer);
          if (!success) {
            socket.emit('warning', { message: 'Failed to write video data' });
          }
        }
        
      } catch (error) {
        console.error('Video data error:', error);
      }
    });

    // Binary data handler (for raw binary frames)
    socket.on('binary-data', (data) => {
      if (!isAuthenticated || !currentStreamId) {
        return;
      }

      try {
        const buffer = Buffer.from(data);
        if (webrtcRtmpService) {
          webrtcRtmpService.writeData(currentStreamId, buffer);
        }
      } catch (error) {
        console.error('Binary data error:', error);
      }
    });

    // Stop streaming
    socket.on('stop-streaming', async () => {
      if (currentStreamId) {
        try {
          if (webrtcRtmpService) {
            webrtcRtmpService.stopStream(currentStreamId);
          }
          
          await LiveStream.findByIdAndUpdate(currentStreamId, {
            status: 'ended',
            isActive: false,
            endedAt: new Date()
          });

          socket.emit('streaming-stopped', { success: true });
          console.log(`🛑 Stopped streaming for ${currentStreamId}`);
          
        } catch (error) {
          console.error('Stop streaming error:', error);
        }
      }
    });

    // Get stats
    socket.on('get-stats', () => {
      if (currentStreamId && webrtcRtmpService) {
        const stats = webrtcRtmpService.getStreamStats(currentStreamId);
        socket.emit('stats', stats);
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`🔌 WebRTC client disconnected: ${socket.id}`);
      
      if (currentStreamId && webrtcRtmpService) {
        // Give a short delay before stopping (in case of reconnection)
        setTimeout(async () => {
          if (webrtcRtmpService.isStreamActive(currentStreamId)) {
            console.log(`⏰ Auto-stopping orphaned stream: ${currentStreamId}`);
            webrtcRtmpService.stopStream(currentStreamId);
            
            await LiveStream.findByIdAndUpdate(currentStreamId, {
              status: 'ended',
              isActive: false,
              endedAt: new Date()
            });
          }
        }, 10000); // 10 second grace period
      }
      
      activeConnections.delete(socket.id);
    });
  });

  console.log('✅ WebRTC WebSocket initialized');
  return webrtcNamespace;
}

// Export router and WebSocket initializer
module.exports = router;
module.exports.initializeWebSocket = initializeWebSocket;
