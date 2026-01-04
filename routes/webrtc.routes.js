// ============================================
// FILE: routes/webrtc.routes.js
// WebRTC Browser Streaming Routes
// Handles: Device camera streaming to RTMP via WebSocket
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
    
    if (webrtcRtmpService) {
      webrtcStatus = await webrtcRtmpService.getStatus();
    }
    
    // Check Mux availability safely (avoid circular reference)
    let muxAvailable = false;
    try {
      if (muxService && typeof muxService.isAvailable === 'function') {
        muxAvailable = muxService.isAvailable();
      } else if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
        muxAvailable = true;
      }
    } catch (e) {
      console.log('Mux check error:', e.message);
    }
    
    res.json({
      success: true,
      webrtc: {
        available: webrtcStatus.available || false,
        activeSessions: webrtcStatus.activeSessions || 0,
        ffmpeg: webrtcStatus.available ? 'ready' : 'not available'
      },
      mux: { available: muxAvailable }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// POST /api/webrtc/start-stream - Start browser streaming
// ==========================================
router.post('/start-stream', verifyToken, async (req, res) => {
  try {
    const { title, description, privacy, streamId } = req.body;
    const userId = req.user.id || req.user._id;
    
    // Check if WebRTC service is available
    if (!webrtcRtmpService) {
      return res.status(503).json({ 
        success: false, 
        error: 'Browser streaming not available. Please use OBS or streaming software.',
        fallback: 'obs'
      });
    }
    
    const status = await webrtcRtmpService.getStatus();
    if (!status.available) {
      return res.status(503).json({ 
        success: false, 
        error: 'FFmpeg not available on server. Browser streaming requires FFmpeg.',
        fallback: 'obs'
      });
    }
    
    // Find or create stream
    let stream;
    if (streamId) {
      stream = await LiveStream.findOne({ _id: streamId, streamer: userId });
    }
    
    if (!stream) {
      // Create Mux live stream
      let muxData = null;
      if (muxService && muxService.isAvailable()) {
        muxData = await muxService.createLiveStream({ lowLatency: true });
        if (!muxData.success) {
          return res.status(500).json({ success: false, error: 'Failed to create stream' });
        }
      } else {
        return res.status(500).json({ success: false, error: 'Streaming service not configured' });
      }
      
      // Create stream record
      stream = new LiveStream({
        streamer: userId,
        title: title || 'Live Stream',
        description,
        streamType: 'webrtc',
        status: 'preparing',
        privacy: privacy || 'public',
        muxStreamId: muxData.streamId,
        muxStreamKey: muxData.streamKey,
        muxPlaybackId: muxData.playbackId,
        muxRtmpUrl: muxData.rtmpUrl,
        isActive: true
      });
      
      await stream.save();
    }
    
    // Start FFmpeg session
    const rtmpUrl = stream.muxRtmpUrl || 'rtmps://global-live.mux.com:443/app';
    const sessionResult = await webrtcRtmpService.startSession(
      stream._id.toString(),
      rtmpUrl,
      stream.muxStreamKey,
      {
        width: 1280,
        height: 720,
        videoBitrate: '2500k',
        audioBitrate: '128k',
        preset: 'veryfast'
      }
    );
    
    if (!sessionResult.success) {
      return res.status(500).json({ success: false, error: sessionResult.error });
    }
    
    console.log(`🎥 WebRTC stream started: ${stream._id}`);
    
    res.json({
      success: true,
      streamId: stream._id,
      playbackId: stream.muxPlaybackId,
      playbackUrl: `https://stream.mux.com/${stream.muxPlaybackId}.m3u8`,
      wsEndpoint: `/api/webrtc/ws/${stream._id}`,
      message: 'Stream session started. Connect via WebSocket to send video data.'
    });
    
  } catch (error) {
    console.error('Start WebRTC stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to start stream' });
  }
});

// ==========================================
// POST /api/webrtc/stream-data/:streamId - Send video data (HTTP fallback)
// ==========================================
router.post('/stream-data/:streamId', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const userId = req.user.id || req.user._id;
    
    // Verify ownership
    const stream = await LiveStream.findOne({ _id: streamId, streamer: userId });
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    if (!webrtcRtmpService) {
      return res.status(503).json({ success: false, error: 'Service not available' });
    }
    
    // Get raw body data
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const data = Buffer.concat(chunks);
      const result = webrtcRtmpService.sendData(streamId, data);
      res.json(result);
    });
    
  } catch (error) {
    console.error('Stream data error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// POST /api/webrtc/stop-stream/:streamId - Stop browser streaming
// ==========================================
router.post('/stop-stream/:streamId', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const userId = req.user.id || req.user._id;
    
    // Verify ownership
    const stream = await LiveStream.findOne({ _id: streamId, streamer: userId });
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    // Stop FFmpeg session
    if (webrtcRtmpService) {
      webrtcRtmpService.stopSession(streamId);
    }
    
    // Update stream status
    stream.status = 'ended';
    stream.isActive = false;
    stream.endedAt = new Date();
    
    if (stream.startedAt) {
      stream.duration = Math.floor((stream.endedAt - stream.startedAt) / 1000);
    }
    
    await stream.save();
    
    console.log(`⏹️ WebRTC stream stopped: ${streamId}`);
    
    res.json({
      success: true,
      streamId,
      duration: stream.duration,
      message: 'Stream stopped successfully'
    });
    
  } catch (error) {
    console.error('Stop stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to stop stream' });
  }
});

// ==========================================
// GET /api/webrtc/session/:streamId - Get session status
// ==========================================
router.get('/session/:streamId', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    
    if (!webrtcRtmpService) {
      return res.json({ success: true, session: { exists: false } });
    }
    
    const status = webrtcRtmpService.getSessionStatus(streamId);
    
    res.json({
      success: true,
      session: status
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Initialize WebSocket for streaming
// ==========================================
function initializeWebRTC(io) {
  if (!io) {
    console.log('⚠️ Socket.IO not provided to WebRTC routes');
    return;
  }
  
  // Create namespace for WebRTC streaming
  const webrtcNamespace = io.of('/webrtc');
  
  webrtcNamespace.on('connection', (socket) => {
    console.log(`📡 WebRTC client connected: ${socket.id}`);
    
    let currentStreamId = null;
    let isAuthenticated = false;
    let userId = null;
    
    // Authenticate
    socket.on('authenticate', async (data) => {
      try {
        const { token, streamId } = data;
        
        if (!token || !streamId) {
          socket.emit('error', { message: 'Token and streamId required' });
          return;
        }
        
        // Verify token
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
        userId = decoded.id || decoded._id;
        
        // Verify stream ownership
        const stream = await LiveStream.findOne({ _id: streamId, streamer: userId });
        if (!stream) {
          socket.emit('error', { message: 'Stream not found or not authorized' });
          return;
        }
        
        currentStreamId = streamId;
        isAuthenticated = true;
        activeConnections.set(socket.id, { streamId, userId });
        
        socket.emit('authenticated', { 
          success: true, 
          streamId,
          message: 'Ready to receive video data'
        });
        
        console.log(`✅ WebRTC client authenticated for stream: ${streamId}`);
        
      } catch (error) {
        console.error('Authentication error:', error);
        socket.emit('error', { message: 'Authentication failed' });
      }
    });
    
    // Receive video data
    socket.on('video-data', (data) => {
      if (!isAuthenticated || !currentStreamId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      if (!webrtcRtmpService) {
        socket.emit('error', { message: 'Streaming service not available' });
        return;
      }
      
      // Send data to FFmpeg
      const result = webrtcRtmpService.sendData(currentStreamId, data);
      
      if (!result.success) {
        socket.emit('error', { message: result.error });
      }
    });
    
    // Start streaming
    socket.on('start-streaming', async (data) => {
      if (!isAuthenticated || !currentStreamId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      try {
        const stream = await LiveStream.findById(currentStreamId);
        if (!stream) {
          socket.emit('error', { message: 'Stream not found' });
          return;
        }
        
        // Update stream status
        stream.status = 'live';
        stream.startedAt = new Date();
        stream.isActive = true;
        await stream.save();
        
        socket.emit('streaming-started', { 
          success: true,
          streamId: currentStreamId,
          playbackUrl: `https://stream.mux.com/${stream.muxPlaybackId}.m3u8`
        });
        
        console.log(`🔴 WebRTC stream live: ${currentStreamId}`);
        
      } catch (error) {
        socket.emit('error', { message: 'Failed to start streaming' });
      }
    });
    
    // Stop streaming
    socket.on('stop-streaming', async () => {
      if (!currentStreamId) return;
      
      try {
        if (webrtcRtmpService) {
          webrtcRtmpService.stopSession(currentStreamId);
        }
        
        const stream = await LiveStream.findById(currentStreamId);
        if (stream) {
          stream.status = 'ended';
          stream.isActive = false;
          stream.endedAt = new Date();
          if (stream.startedAt) {
            stream.duration = Math.floor((stream.endedAt - stream.startedAt) / 1000);
          }
          await stream.save();
        }
        
        socket.emit('streaming-stopped', { success: true, streamId: currentStreamId });
        console.log(`⏹️ WebRTC stream stopped: ${currentStreamId}`);
        
      } catch (error) {
        socket.emit('error', { message: 'Failed to stop streaming' });
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`📴 WebRTC client disconnected: ${socket.id}`);
      
      if (currentStreamId && webrtcRtmpService) {
        // Stop FFmpeg session on disconnect
        webrtcRtmpService.stopSession(currentStreamId);
        
        // Mark stream as ended
        try {
          await LiveStream.findByIdAndUpdate(currentStreamId, {
            status: 'ended',
            isActive: false,
            endedAt: new Date()
          });
        } catch {}
      }
      
      activeConnections.delete(socket.id);
    });
  });
  
  console.log('✅ WebRTC WebSocket initialized');
}

// Export router and initializer
module.exports = {
  router,
  initializeWebRTC
};

console.log('✅ WebRTC routes loaded');
