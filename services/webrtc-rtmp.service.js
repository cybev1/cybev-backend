// ============================================
// FILE: services/webrtc-rtmp.service.js
// WebRTC to RTMP Transcoding Service
// Converts browser MediaRecorder stream to Mux RTMP
// ============================================

const { spawn } = require('child_process');
const path = require('path');

// Try to get ffmpeg path
let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = require('ffmpeg-static');
  console.log('✅ Using ffmpeg-static:', ffmpegPath);
} catch (e) {
  console.log('⚠️ ffmpeg-static not found, using system ffmpeg');
}

class WebRTCToRTMPService {
  constructor() {
    this.activeStreams = new Map(); // streamId -> { ffmpeg, socket, rtmpUrl, startTime }
    this.streamStats = new Map(); // streamId -> { bytesReceived, chunks, errors }
  }

  /**
   * Start streaming to RTMP
   * @param {string} streamId - Database stream ID
   * @param {string} rtmpUrl - Full RTMP URL with stream key
   * @param {WebSocket} socket - WebSocket connection
   */
  startStream(streamId, rtmpUrl, socket) {
    if (this.activeStreams.has(streamId)) {
      console.log(`⚠️ Stream ${streamId} already active, stopping old one`);
      this.stopStream(streamId);
    }

    console.log(`🎬 Starting WebRTC-to-RTMP stream: ${streamId}`);
    console.log(`📡 RTMP URL: ${rtmpUrl.substring(0, 50)}...`);

    // Initialize stats
    this.streamStats.set(streamId, {
      bytesReceived: 0,
      chunks: 0,
      errors: 0,
      startTime: Date.now()
    });

    // FFmpeg arguments for WebM/MediaRecorder input to RTMP output
    const ffmpegArgs = [
      // Input options
      '-i', 'pipe:0',                    // Read from stdin
      
      // Video encoding
      '-c:v', 'libx264',                 // H.264 video codec
      '-preset', 'veryfast',             // Fast encoding for live
      '-tune', 'zerolatency',            // Low latency tuning
      '-profile:v', 'baseline',          // Baseline profile for compatibility
      '-level', '3.1',                   // Level for mobile compatibility
      '-b:v', '2500k',                   // Video bitrate
      '-maxrate', '2500k',               // Max bitrate
      '-bufsize', '5000k',               // Buffer size
      '-pix_fmt', 'yuv420p',             // Pixel format
      '-g', '60',                        // Keyframe interval (2 seconds at 30fps)
      '-keyint_min', '60',               // Min keyframe interval
      '-sc_threshold', '0',              // Disable scene change detection
      
      // Video scaling (ensure 720p max)
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
      
      // Audio encoding
      '-c:a', 'aac',                     // AAC audio codec
      '-b:a', '128k',                    // Audio bitrate
      '-ar', '44100',                    // Sample rate
      '-ac', '2',                        // Stereo
      
      // Output options
      '-f', 'flv',                       // FLV format for RTMP
      '-flvflags', 'no_duration_filesize', // Don't write duration
      
      // Output to RTMP
      rtmpUrl
    ];

    // Spawn FFmpeg process
    const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Store stream info
    this.activeStreams.set(streamId, {
      ffmpeg,
      socket,
      rtmpUrl,
      startTime: Date.now(),
      isConnected: false
    });

    // Handle FFmpeg stderr (progress and errors)
    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString();
      
      // Check for successful RTMP connection
      if (message.includes('Output #0') || message.includes('mux.com')) {
        const stream = this.activeStreams.get(streamId);
        if (stream && !stream.isConnected) {
          stream.isConnected = true;
          console.log(`✅ Stream ${streamId} connected to Mux RTMP`);
          
          // Notify client
          if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify({
              type: 'rtmp-connected',
              streamId,
              message: 'Connected to streaming server'
            }));
          }
        }
      }
      
      // Log errors
      if (message.includes('error') || message.includes('Error') || message.includes('failed')) {
        console.error(`❌ FFmpeg error for ${streamId}:`, message.trim());
        const stats = this.streamStats.get(streamId);
        if (stats) stats.errors++;
      }
      
      // Log frame info periodically
      if (message.includes('frame=') && message.includes('fps=')) {
        const frameMatch = message.match(/frame=\s*(\d+)/);
        if (frameMatch && parseInt(frameMatch[1]) % 300 === 0) {
          console.log(`📊 Stream ${streamId}: ${message.trim().substring(0, 100)}`);
        }
      }
    });

    // Handle FFmpeg close
    ffmpeg.on('close', (code) => {
      console.log(`🔴 FFmpeg closed for stream ${streamId} with code ${code}`);
      this.cleanup(streamId);
      
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'stream-ended',
          streamId,
          code,
          reason: code === 0 ? 'Stream ended normally' : 'Stream interrupted'
        }));
      }
    });

    // Handle FFmpeg error
    ffmpeg.on('error', (error) => {
      console.error(`❌ FFmpeg error for ${streamId}:`, error.message);
      this.cleanup(streamId);
      
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'error',
          streamId,
          error: 'Streaming process failed: ' + error.message
        }));
      }
    });

    // Handle stdin errors
    ffmpeg.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') {
        console.error(`❌ FFmpeg stdin error for ${streamId}:`, error.message);
      }
    });

    return true;
  }

  /**
   * Write video data to FFmpeg stdin
   */
  writeData(streamId, data) {
    const stream = this.activeStreams.get(streamId);
    if (!stream || !stream.ffmpeg || !stream.ffmpeg.stdin.writable) {
      return false;
    }

    try {
      stream.ffmpeg.stdin.write(data);
      
      const stats = this.streamStats.get(streamId);
      if (stats) {
        stats.bytesReceived += data.length;
        stats.chunks++;
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Write error for ${streamId}:`, error.message);
      return false;
    }
  }

  /**
   * Stop a stream
   */
  stopStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      console.log(`⚠️ Stream ${streamId} not found for stopping`);
      return false;
    }

    console.log(`🛑 Stopping stream ${streamId}`);

    try {
      if (stream.ffmpeg && stream.ffmpeg.stdin) {
        stream.ffmpeg.stdin.end();
      }

      setTimeout(() => {
        if (stream.ffmpeg && !stream.ffmpeg.killed) {
          stream.ffmpeg.kill('SIGTERM');
        }
      }, 3000);

    } catch (error) {
      console.error(`❌ Error stopping stream ${streamId}:`, error.message);
    }

    const stats = this.streamStats.get(streamId);
    if (stats) {
      const duration = (Date.now() - stats.startTime) / 1000;
      console.log(`📊 Stream ${streamId} stats: ${stats.chunks} chunks, ${(stats.bytesReceived / 1024 / 1024).toFixed(2)} MB, ${duration.toFixed(0)}s duration`);
    }

    this.cleanup(streamId);
    return true;
  }

  cleanup(streamId) {
    this.activeStreams.delete(streamId);
    this.streamStats.delete(streamId);
  }

  isStreamActive(streamId) {
    return this.activeStreams.has(streamId);
  }

  getStreamStats(streamId) {
    const stats = this.streamStats.get(streamId);
    const stream = this.activeStreams.get(streamId);
    
    if (!stats || !stream) return null;
    
    return {
      ...stats,
      duration: (Date.now() - stats.startTime) / 1000,
      isConnected: stream.isConnected || false,
      mbReceived: (stats.bytesReceived / 1024 / 1024).toFixed(2)
    };
  }

  getActiveStreamCount() {
    return this.activeStreams.size;
  }

  getStatus() {
    return {
      activeStreams: this.activeStreams.size,
      ffmpegPath,
      streams: Array.from(this.activeStreams.keys()).map(id => ({
        id,
        stats: this.getStreamStats(id)
      }))
    };
  }
}

module.exports = new WebRTCToRTMPService();
