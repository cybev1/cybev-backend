// ============================================
// FILE: routes/webrtc.routes.js
// WebRTC Browser Streaming Routes - FIXED v4.4
// VERSION: 4.4 - Fixed feed post (use imageUrl for Post model)
// PREVIOUS: 4.3 - Fixed RTMP URL + added feed posting
// CRITICAL: Database update for status=live, isActive=true
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Log version on load
console.log('🔄 WebRTC Routes v4.4 loaded - fixed feed post thumbnail');

// Services
let webrtcRtmpService;
try {
  webrtcRtmpService = require('../services/webrtc-rtmp.service');
  console.log('✅ WebRTC-RTMP service loaded');
} catch (e) {
  console.error('❌ WebRTC-RTMP service failed to load:', e.message);
}

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

// Get LiveStream model - MUST use the same model as live.routes.js
let LiveStream;
try {
  LiveStream = require('../models/livestream.model');
  console.log('✅ WebRTC: LiveStream model loaded from models/livestream.model.js');
} catch (e) {
  console.log('⚠️ WebRTC: Model file not found, trying mongoose.models...');
  LiveStream = mongoose.models.LiveStream;
  if (!LiveStream) {
    console.error('❌ WebRTC: No LiveStream model available! Database updates will fail.');
  }
}

// Helper to get LiveStream model
const getLiveStreamModel = () => {
  if (LiveStream) return LiveStream;
  // Try mongoose.models as fallback
  return mongoose.models.LiveStream || null;
};

// Store active WebSocket connections
const activeConnections = new Map();
let wsInitialized = false;

// ==========================================
// GET /api/webrtc/status - Check service status
// ==========================================
router.get('/status', async (req, res) => {
  try {
    let ffmpegStatus = { available: false };
    
    const { execSync } = require('child_process');
    let ffmpegPath = 'ffmpeg';
    try {
      ffmpegPath = require('ffmpeg-static');
    } catch {}
    
    try {
      const version = execSync(`${ffmpegPath} -version`, { stdio: 'pipe' }).toString().split('\n')[0];
      ffmpegStatus = {
        available: true,
        path: ffmpegPath,
        version: version.substring(0, 50)
      };
    } catch (e) {
      ffmpegStatus = { available: false, error: e.message };
    }

    const muxStatus = {
      available: !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET)
    };

    const serviceStatus = {
      loaded: !!webrtcRtmpService,
      activeStreams: webrtcRtmpService ? webrtcRtmpService.getActiveStreamCount() : 0
    };

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      websocket: {
        initialized: wsInitialized,
        activeConnections: activeConnections.size
      },
      ffmpeg: ffmpegStatus,
      mux: muxStatus,
      service: serviceStatus
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// GET /api/webrtc/test - Test endpoint
// ==========================================
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'WebRTC routes are working',
    wsInitialized,
    serviceLoaded: !!webrtcRtmpService,
    muxLoaded: !!muxService,
    activeConnections: activeConnections.size,
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// POST /api/webrtc/cleanup - Clean up stuck streams
// ==========================================
router.post('/cleanup', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const Model = getLiveStreamModel();
    
    if (!Model) {
      return res.status(500).json({ success: false, error: 'Model not available' });
    }

    // End all active streams for this user
    const result = await Model.updateMany(
      { 
        streamer: userId, 
        status: { $in: ['preparing', 'live'] },
        isActive: true 
      },
      { 
        $set: { 
          status: 'ended', 
          isActive: false, 
          endedAt: new Date(),
          endReason: 'manual-cleanup'
        } 
      }
    );

    console.log(`🧹 Cleaned up ${result.modifiedCount} streams for user ${userId}`);

    res.json({
      success: true,
      cleanedUp: result.modifiedCount,
      message: `Cleaned up ${result.modifiedCount} stream(s). You can now start a new stream.`
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// POST /api/webrtc/start-stream - Start camera stream
// FIXED: Auto-cleanup stuck streams before creating new one
// ==========================================
router.post('/start-stream', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, privacy, forceNew } = req.body;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📱 START STREAM REQUEST from user ${userId}`);
    console.log(`${'='.repeat(50)}`);

    if (!muxService) {
      console.error('❌ Mux service not available');
      return res.status(500).json({ success: false, error: 'Mux service not available' });
    }

    const Model = getLiveStreamModel();
    if (!Model) {
      console.error('❌ LiveStream model not available');
      return res.status(500).json({ success: false, error: 'Database model not available' });
    }

    // Auto-cleanup: End any stuck streams older than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const cleanupResult = await Model.updateMany(
      {
        streamer: userId,
        status: { $in: ['preparing', 'live'] },
        isActive: true,
        $or: [
          { createdAt: { $lt: thirtyMinutesAgo } },
          { startedAt: { $lt: thirtyMinutesAgo } }
        ]
      },
      {
        $set: { 
          status: 'ended', 
          isActive: false, 
          endedAt: new Date(),
          endReason: 'auto-cleanup-stuck'
        }
      }
    );
    
    if (cleanupResult.modifiedCount > 0) {
      console.log(`🧹 Auto-cleaned ${cleanupResult.modifiedCount} stuck stream(s)`);
    }

    // If forceNew is true, end ALL existing streams for this user
    if (forceNew) {
      await Model.updateMany(
        { streamer: userId, status: { $in: ['preparing', 'live'] }, isActive: true },
        { $set: { status: 'ended', isActive: false, endedAt: new Date(), endReason: 'force-new' } }
      );
      console.log('🔄 Force-ended previous streams');
    }

    // Check for existing active stream (after cleanup)
    const existingStream = await Model.findOne({
      streamer: userId,
      status: { $in: ['preparing', 'live'] },
      isActive: true
    });

    if (existingStream) {
      console.log(`⚠️ User ${userId} already has active stream: ${existingStream._id}`);
      // Return the existing stream info so frontend can use it
      return res.status(400).json({
        success: false,
        error: 'You already have an active stream. End it first or wait 30 minutes for auto-cleanup.',
        existingStreamId: existingStream._id,
        streamAge: Math.round((Date.now() - new Date(existingStream.createdAt).getTime()) / 60000) + ' minutes'
      });
    }

    // Create Mux live stream
    console.log('🎬 Creating Mux live stream...');
    const muxResult = await muxService.createLiveStream({
      lowLatency: false
    });

    // FIXED: Handle mux.service.js response format
    if (!muxResult.success) {
      console.error('❌ Mux stream creation failed:', muxResult.error);
      return res.status(500).json({ success: false, error: muxResult.error || 'Failed to create Mux stream' });
    }

    console.log(`✅ Mux stream created:`);
    console.log(`   Stream ID: ${muxResult.streamId}`);
    console.log(`   Stream Key: ${muxResult.streamKey?.substring(0, 10)}...`);
    console.log(`   Playback ID: ${muxResult.playbackId}`);

    // Validate stream key exists
    if (!muxResult.streamKey) {
      console.error('❌ Mux did not return a stream key!');
      return res.status(500).json({ success: false, error: 'Failed to get stream key from Mux' });
    }

    // Create database record
    const stream = new Model({
      streamer: userId,
      title: title || 'Live Stream',
      description,
      privacy: privacy || 'public',
      streamType: 'camera',
      status: 'preparing',
      isActive: true,
      muxStreamId: muxResult.streamId,
      muxStreamKey: muxResult.streamKey,
      muxPlaybackId: muxResult.playbackId,
      muxRtmpUrl: muxResult.rtmpUrl || 'rtmps://global-live.mux.com:443/app',
      playbackUrls: {
        hls: muxResult.playbackId 
          ? `https://stream.mux.com/${muxResult.playbackId}.m3u8`
          : null,
        thumbnail: muxResult.playbackId
          ? `https://image.mux.com/${muxResult.playbackId}/thumbnail.jpg`
          : null
      }
    });

    await stream.save();

    // Build full RTMP URL for FFmpeg
    const rtmpUrl = `rtmps://global-live.mux.com:443/app/${muxResult.streamKey}`;

    console.log(`✅ Stream record created: ${stream._id}`);
    console.log(`📡 Full RTMP URL: ${rtmpUrl.substring(0, 60)}...`);

    res.json({
      success: true,
      streamId: stream._id,
      muxStreamId: muxResult.streamId,
      playbackId: muxResult.playbackId,
      rtmpUrl, // Full RTMP URL including stream key
      playbackUrl: stream.playbackUrls.hls
    });

  } catch (error) {
    console.error('❌ Start stream error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// POST /api/webrtc/stop-stream/:streamId
// ==========================================
router.post('/stop-stream/:streamId', verifyToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const userId = req.user.id;

    console.log(`🛑 Stop stream request: ${streamId}`);

    const Model = getLiveStreamModel();
    const stream = await Model?.findOne({
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

    console.log(`✅ Stream ${streamId} stopped`);

    res.json({ success: true, message: 'Stream stopped' });

  } catch (error) {
    console.error('Stop stream error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// GET /api/webrtc/stream-stats/:streamId
// ==========================================
router.get('/stream-stats/:streamId', async (req, res) => {
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
// GET /api/webrtc/debug - Debug info
// ==========================================
router.get('/debug', (req, res) => {
  res.json({
    wsInitialized,
    serviceLoaded: !!webrtcRtmpService,
    muxLoaded: !!muxService,
    serviceStatus: webrtcRtmpService ? webrtcRtmpService.getStatus() : null,
    connections: Array.from(activeConnections.entries()).map(([id, info]) => ({
      socketId: id,
      ...info
    }))
  });
});

// ==========================================
// WebSocket Handler
// ==========================================
function initializeWebSocket(io) {
  console.log(`\n${'='.repeat(50)}`);
  console.log('🔌 INITIALIZING WebRTC WebSocket Namespace');
  console.log(`${'='.repeat(50)}`);
  
  const webrtcNamespace = io.of('/webrtc');
  
  webrtcNamespace.on('connection', (socket) => {
    console.log(`\n🔌 WebRTC client connected: ${socket.id}`);
    
    let currentStreamId = null;
    let currentRtmpUrl = null;
    let isAuthenticated = false;
    let userId = null;
    let streamingActive = false;
    let bytesReceived = 0;
    let chunksReceived = 0;

    activeConnections.set(socket.id, {
      connectedAt: Date.now(),
      authenticated: false,
      streaming: false
    });

    socket.emit('welcome', { 
      message: 'Connected to WebRTC server',
      socketId: socket.id 
    });

    // AUTHENTICATE
    socket.on('authenticate', async (data) => {
      console.log(`\n🔐 AUTH REQUEST from ${socket.id}`);
      
      try {
        const { token, streamId, rtmpUrl } = data;
        
        // Only token and streamId are required - rtmpUrl will be fetched from DB
        if (!token || !streamId) {
          console.log('❌ Missing auth data:', { hasToken: !!token, hasStreamId: !!streamId });
          socket.emit('error', { message: 'Missing token or streamId' });
          return;
        }
        
        console.log(`   Stream ID: ${streamId}`);
        
        // Verify token
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
        userId = decoded.id;
        
        console.log(`   User ID: ${userId}`);
        
        // Verify stream ownership AND get RTMP URL from database
        const Model = getLiveStreamModel();
        if (Model) {
          const stream = await Model.findOne({
            _id: streamId,
            streamer: userId
          });
          
          if (!stream) {
            console.log(`❌ Stream not found or unauthorized`);
            socket.emit('error', { message: 'Stream not found or unauthorized' });
            return;
          }
          console.log(`   Stream found: ${stream.title}`);
          
          // FIXED: Construct full RTMP URL with stream key
          // Priority: 1) Construct from muxStreamKey, 2) Use muxRtmpUrl if it has key, 3) Frontend rtmpUrl
          if (stream.muxStreamKey) {
            currentRtmpUrl = `rtmps://global-live.mux.com:443/app/${stream.muxStreamKey}`;
          } else if (stream.muxRtmpUrl && stream.muxRtmpUrl.includes('/app/')) {
            // muxRtmpUrl might already include the key
            currentRtmpUrl = stream.muxRtmpUrl;
          } else if (rtmpUrl) {
            currentRtmpUrl = rtmpUrl;
          } else {
            console.log('❌ No stream key or RTMP URL available');
            socket.emit('error', { message: 'Stream has no RTMP configuration' });
            return;
          }
          
          console.log(`   RTMP URL: ${currentRtmpUrl.substring(0, 60)}...`);
        }

        currentStreamId = streamId;
        // Keep the RTMP URL we computed from the database (don't overwrite with undefined)
        // currentRtmpUrl was already set above from stream.muxRtmpUrl or stream.muxStreamKey
        isAuthenticated = true;
        
        activeConnections.set(socket.id, {
          ...activeConnections.get(socket.id),
          authenticated: true,
          userId,
          streamId,
          rtmpUrl: currentRtmpUrl  // Store for debugging
        });

        socket.emit('authenticated', { 
          success: true, 
          streamId,
          message: 'Ready to stream'
        });
        
        console.log(`✅ AUTHENTICATED: user=${userId}, stream=${streamId}`);
        
      } catch (error) {
        console.error('❌ Auth error:', error.message);
        socket.emit('error', { message: 'Authentication failed: ' + error.message });
      }
    });

    // START STREAMING - Mark ready, FFmpeg starts on first data
    socket.on('start-streaming', async () => {
      console.log(`\n🎬 START STREAMING REQUEST from ${socket.id}`);
      console.log(`   isAuthenticated: ${isAuthenticated}`);
      console.log(`   currentStreamId: ${currentStreamId}`);
      console.log(`   currentRtmpUrl: ${currentRtmpUrl?.substring(0, 60)}...`);
      
      if (!isAuthenticated) {
        console.log('❌ Not authenticated');
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      if (!currentStreamId || !currentRtmpUrl) {
        console.log('❌ Missing stream info');
        socket.emit('error', { message: 'Missing stream info' });
        return;
      }

      // Check if RTMP URL contains undefined
      if (currentRtmpUrl.includes('undefined')) {
        console.log('❌ Invalid RTMP URL - contains undefined');
        socket.emit('error', { message: 'Invalid RTMP URL - stream key missing' });
        return;
      }
      
      if (streamingActive) {
        console.log('⚠️ Already streaming');
        socket.emit('warning', { message: 'Already streaming' });
        return;
      }

      if (!webrtcRtmpService) {
        console.log('❌ WebRTC-RTMP service not available');
        socket.emit('error', { message: 'Streaming service not available' });
        return;
      }

      // Mark as ready - FFmpeg will start when first data arrives
      streamingActive = true;
      
      activeConnections.set(socket.id, {
        ...activeConnections.get(socket.id),
        streaming: true,
        streamStarted: Date.now(),
        ffmpegStarted: false  // Will be true after first data
      });
      
      // CRITICAL: Update database to set status='live' and isActive=true
      console.log(`📝 Updating database for stream ${currentStreamId}...`);
      
      try {
        const Model = getLiveStreamModel();
        console.log(`   Model available: ${!!Model}`);
        
        if (Model) {
          const updateResult = await Model.findByIdAndUpdate(
            currentStreamId, 
            {
              status: 'live',
              isActive: true,
              startedAt: new Date()
            }, 
            { new: true }
          ).populate('streamer', 'name username');
          
          if (updateResult) {
            console.log(`✅ DATABASE UPDATED SUCCESSFULLY:`);
            console.log(`   Stream ID: ${updateResult._id}`);
            console.log(`   Status: ${updateResult.status}`);
            console.log(`   isActive: ${updateResult.isActive}`);
            console.log(`   startedAt: ${updateResult.startedAt}`);
            
            // POST TO FEED - Make stream visible to followers
            try {
              const Post = mongoose.models.Post || require('../models/post.model');
              if (Post) {
                // Generate Mux thumbnail URL
                const muxThumbnail = updateResult.muxPlaybackId 
                  ? `https://image.mux.com/${updateResult.muxPlaybackId}/thumbnail.jpg?time=0`
                  : null;
                
                const thumbnailUrl = updateResult.thumbnail || muxThumbnail;
                
                const feedPost = new Post({
                  author: updateResult.streamer._id || userId,
                  authorId: updateResult.streamer._id || userId,
                  content: `🔴 LIVE NOW: ${updateResult.title || 'Live Stream'}`,
                  postType: 'live',
                  type: 'livestream',
                  isLiveStream: true,
                  liveStreamId: updateResult._id,
                  // Use imageUrl for Post model (not featuredImage)
                  imageUrl: thumbnailUrl,
                  media: thumbnailUrl ? [{
                    url: thumbnailUrl,
                    type: 'image',
                    isLiveThumbnail: true,
                    playbackId: updateResult.muxPlaybackId
                  }] : [],
                  streamData: {
                    streamId: updateResult._id,
                    playbackId: updateResult.muxPlaybackId,
                    playbackUrl: updateResult.muxPlaybackId 
                      ? `https://stream.mux.com/${updateResult.muxPlaybackId}.m3u8`
                      : null,
                    thumbnailUrl: muxThumbnail,
                    viewerCount: 0,
                    isLive: true
                  },
                  visibility: 'public',
                  isPublished: true
                });
                await feedPost.save();
                
                // Update stream with feed post reference
                updateResult.feedPostId = feedPost._id;
                await updateResult.save();
                
                console.log(`📺 Live stream posted to feed: ${feedPost._id}`);
              }
            } catch (feedErr) {
              console.log('⚠️ Could not post to feed:', feedErr.message);
            }
          } else {
            console.log(`⚠️ Stream ${currentStreamId} not found in database!`);
          }
        } else {
          console.log(`❌ LiveStream model not available!`);
          console.log(`   mongoose.models available: ${Object.keys(mongoose.models).join(', ')}`);
        }
      } catch (dbError) {
        console.error(`❌ DATABASE UPDATE FAILED:`, dbError.message);
        console.error(dbError.stack);
      }

      socket.emit('streaming-started', {
        success: true,
        streamId: currentStreamId,
        message: 'FFmpeg started - send video data now'
      });
      
      console.log(`✅ READY TO STREAM for ${currentStreamId} - waiting for first data chunk`);
    });

    // VIDEO DATA - Start FFmpeg on first chunk, then pipe data
    socket.on('video-data', (data) => {
      if (!isAuthenticated || !streamingActive || !currentStreamId) {
        return;
      }

      try {
        let buffer;
        
        if (Buffer.isBuffer(data)) {
          buffer = data;
        } else if (data instanceof ArrayBuffer) {
          buffer = Buffer.from(data);
        } else if (data instanceof Uint8Array) {
          buffer = Buffer.from(data);
        } else if (data && data.type === 'Buffer' && Array.isArray(data.data)) {
          buffer = Buffer.from(data.data);
        } else if (typeof data === 'string') {
          buffer = Buffer.from(data, 'base64');
        } else if (data && typeof data === 'object') {
          buffer = Buffer.from(Object.values(data));
        } else {
          return;
        }

        if (buffer.length === 0) {
          return;
        }

        // Start FFmpeg on first data chunk
        const conn = activeConnections.get(socket.id);
        if (conn && !conn.ffmpegStarted) {
          console.log(`📥 First data chunk received (${buffer.length} bytes), starting FFmpeg...`);
          
          if (webrtcRtmpService) {
            const started = webrtcRtmpService.startStream(currentStreamId, currentRtmpUrl, socket);
            if (started) {
              conn.ffmpegStarted = true;
              activeConnections.set(socket.id, conn);
              console.log(`✅ FFmpeg started on first data for ${currentStreamId}`);
            } else {
              console.error('❌ Failed to start FFmpeg on first data');
              socket.emit('error', { message: 'Failed to start encoder' });
              return;
            }
          }
        }

        chunksReceived++;
        bytesReceived += buffer.length;

        if (webrtcRtmpService) {
          webrtcRtmpService.writeData(currentStreamId, buffer);
        }
        
        // Log progress every 50 chunks
        if (chunksReceived % 50 === 0) {
          console.log(`📊 ${currentStreamId}: ${chunksReceived} chunks, ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
        }
        
      } catch (error) {
        console.error('❌ Video data error:', error.message);
      }
    });

    // STOP STREAMING
    socket.on('stop-streaming', async () => {
      console.log(`\n🛑 STOP STREAMING from ${socket.id}`);
      
      const conn = activeConnections.get(socket.id);
      
      if (currentStreamId) {
        // Only stop FFmpeg if it was actually started
        if (conn && conn.ffmpegStarted && webrtcRtmpService) {
          webrtcRtmpService.stopStream(currentStreamId);
        }
        
        const Model = getLiveStreamModel();
        if (Model) {
          await Model.findByIdAndUpdate(currentStreamId, {
            status: 'ended',
            isActive: false,
            endedAt: new Date()
          });
        }
      }
      
      streamingActive = false;
      socket.emit('streaming-stopped', { success: true });
      console.log(`✅ Streaming stopped for ${currentStreamId}`);
    });

    // PING/PONG
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now(), bytesReceived, chunksReceived });
    });

    // DISCONNECT
    socket.on('disconnect', async (reason) => {
      console.log(`\n🔌 DISCONNECT: ${socket.id}, reason: ${reason}`);
      console.log(`   Stats: ${chunksReceived} chunks, ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
      
      const conn = activeConnections.get(socket.id);
      
      if (currentStreamId && streamingActive && conn && conn.ffmpegStarted) {
        setTimeout(async () => {
          if (webrtcRtmpService && webrtcRtmpService.isStreamActive(currentStreamId)) {
            console.log(`⏰ Auto-stopping orphaned stream: ${currentStreamId}`);
            webrtcRtmpService.stopStream(currentStreamId);
            
            const Model = getLiveStreamModel();
            if (Model) {
              await Model.findByIdAndUpdate(currentStreamId, {
                status: 'ended',
                isActive: false,
                endedAt: new Date()
              });
            }
          }
        }, 15000);
      }
      
      activeConnections.delete(socket.id);
    });
  });

  wsInitialized = true;
  console.log('✅ WebRTC WebSocket namespace initialized');
  console.log(`${'='.repeat(50)}\n`);
  
  return webrtcNamespace;
}

module.exports = router;
module.exports.initializeWebSocket = initializeWebSocket;
