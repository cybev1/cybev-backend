// ============================================
// FILE: services/webrtc-rtmp.service.js
// WebRTC to RTMP Transcoding Service - FIXED v2
// Converts browser MediaRecorder stream to Mux RTMP
// IMPROVED: Better error handling, logging, and debugging
// ============================================

const { spawn } = require('child_process');
const path = require('path');

// Try to get ffmpeg path
let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = require('ffmpeg-static');
  console.log('✅ Using ffmpeg-static:', ffmpegPath);
} catch (e) {
  console.log('⚠️ ffmpeg-static not found, trying system ffmpeg');
  // Try to find system ffmpeg
  try {
    const { execSync } = require('child_process');
    execSync('which ffmpeg', { stdio: 'pipe' });
    ffmpegPath = 'ffmpeg';
    console.log('✅ Using system ffmpeg');
  } catch {
    console.error('❌ FFmpeg not available!');
  }
}

// Verify FFmpeg works
try {
  const { execSync } = require('child_process');
  const version = execSync(`${ffmpegPath} -version`, { stdio: 'pipe' }).toString().split('\n')[0];
  console.log('✅ FFmpeg version:', version);
} catch (e) {
  console.error('❌ FFmpeg verification failed:', e.message);
}

class WebRTCToRTMPService {
  constructor() {
    this.activeStreams = new Map(); // streamId -> { ffmpeg, socket, rtmpUrl, startTime }
    this.streamStats = new Map(); // streamId -> { bytesReceived, chunks, errors }
    console.log('✅ WebRTC-RTMP Service initialized');
  }

  /**
   * Start streaming to RTMP
   * @param {string} streamId - Database stream ID
   * @param {string} rtmpUrl - Full RTMP URL with stream key
   * @param {object} socket - Socket.IO socket connection
   */
  startStream(streamId, rtmpUrl, socket) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎬 STARTING STREAM: ${streamId}`);
    console.log(`${'='.repeat(50)}`);
    
    if (this.activeStreams.has(streamId)) {
      console.log(`⚠️ Stream ${streamId} already active, stopping old one first`);
      this.stopStream(streamId);
    }

    console.log(`📡 RTMP URL: ${rtmpUrl.substring(0, 50)}...`);
    console.log(`🔧 FFmpeg path: ${ffmpegPath}`);

    // Initialize stats
    this.streamStats.set(streamId, {
      bytesReceived: 0,
      chunks: 0,
      errors: 0,
      startTime: Date.now(),
      ffmpegStarted: false,
      rtmpConnected: false
    });

    // FFmpeg arguments - optimized for WebM input from MediaRecorder
    const ffmpegArgs = [
      // Global options
      '-hide_banner',
      '-loglevel', 'warning',
      
      // Input options - CRITICAL: must match MediaRecorder output
      '-f', 'webm',                      // Input format
      '-i', 'pipe:0',                    // Read from stdin
      
      // Video encoding
      '-c:v', 'libx264',                 // H.264 codec
      '-preset', 'ultrafast',            // Fastest encoding
      '-tune', 'zerolatency',            // Low latency
      '-profile:v', 'baseline',          // Max compatibility
      '-level', '3.0',                   
      '-b:v', '1500k',                   // Video bitrate
      '-maxrate', '1500k',
      '-bufsize', '3000k',
      '-pix_fmt', 'yuv420p',
      '-g', '30',                        // Keyframe every 1 second at 30fps
      '-keyint_min', '30',
      '-sc_threshold', '0',
      '-r', '30',                        // Output framerate
      
      // Scale to 720p max
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
      
      // Audio encoding
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      
      // Output options
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      
      // Output to RTMP
      rtmpUrl
    ];

    console.log(`🔧 FFmpeg command: ${ffmpegPath} ${ffmpegArgs.slice(0, 10).join(' ')}...`);

    // Spawn FFmpeg process
    let ffmpeg;
    try {
      ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log(`✅ FFmpeg process spawned with PID: ${ffmpeg.pid}`);
    } catch (spawnError) {
      console.error(`❌ Failed to spawn FFmpeg:`, spawnError.message);
      if (socket) {
        socket.emit('error', { message: 'Failed to start video encoder: ' + spawnError.message });
      }
      return false;
    }

    // Store stream info
    this.activeStreams.set(streamId, {
      ffmpeg,
      socket,
      rtmpUrl,
      startTime: Date.now(),
      isConnected: false,
      pid: ffmpeg.pid
    });

    // Handle FFmpeg stdout
    ffmpeg.stdout.on('data', (data) => {
      console.log(`📺 FFmpeg stdout [${streamId}]:`, data.toString().trim());
    });

    // Handle FFmpeg stderr (progress and errors)
    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString();
      const stats = this.streamStats.get(streamId);
      
      // Check for successful RTMP connection
      if (message.includes('Output #0') || message.includes('mux.com') || message.includes('Video:')) {
        const stream = this.activeStreams.get(streamId);
        if (stream && !stream.isConnected) {
          stream.isConnected = true;
          if (stats) stats.rtmpConnected = true;
          console.log(`✅ Stream ${streamId} CONNECTED to Mux RTMP!`);
          
          // Notify client
          if (socket && socket.connected) {
            socket.emit('rtmp-connected', {
              streamId,
              message: 'Connected to streaming server'
            });
          }
        }
      }
      
      // Log frame progress
      if (message.includes('frame=')) {
        const frameMatch = message.match(/frame=\s*(\d+)/);
        const fpsMatch = message.match(/fps=\s*(\d+)/);
        if (frameMatch) {
          const frames = parseInt(frameMatch[1]);
          if (frames % 150 === 0) { // Log every 5 seconds at 30fps
            console.log(`📊 Stream ${streamId}: ${message.trim().substring(0, 80)}`);
          }
        }
      }
      
      // Log errors
      if (message.toLowerCase().includes('error') || message.includes('failed') || message.includes('Invalid')) {
        console.error(`❌ FFmpeg error [${streamId}]: ${message.trim()}`);
        if (stats) stats.errors++;
        
        // Notify client of errors
        if (socket && socket.connected && message.includes('Connection refused')) {
          socket.emit('warning', { message: 'RTMP connection issue, retrying...' });
        }
      }
    });

    // Handle FFmpeg close
    ffmpeg.on('close', (code, signal) => {
      console.log(`🔴 FFmpeg closed [${streamId}]: code=${code}, signal=${signal}`);
      
      const stats = this.streamStats.get(streamId);
      if (stats) {
        const duration = (Date.now() - stats.startTime) / 1000;
        console.log(`📊 Final stats [${streamId}]: ${stats.chunks} chunks, ${(stats.bytesReceived / 1024 / 1024).toFixed(2)} MB, ${duration.toFixed(0)}s`);
      }
      
      // Notify client
      if (socket && socket.connected) {
        socket.emit('stream-ended', {
          streamId,
          code,
          reason: code === 0 ? 'Stream ended normally' : `Stream interrupted (code: ${code})`
        });
      }
      
      this.cleanup(streamId);
    });

    // Handle FFmpeg error
    ffmpeg.on('error', (error) => {
      console.error(`❌ FFmpeg process error [${streamId}]:`, error.message);
      
      if (socket && socket.connected) {
        socket.emit('error', {
          streamId,
          error: 'Streaming process failed: ' + error.message
        });
      }
      
      this.cleanup(streamId);
    });

    // Handle stdin errors (broken pipe, etc.)
    ffmpeg.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') {
        console.error(`❌ FFmpeg stdin error [${streamId}]:`, error.message);
      }
    });

    // Mark FFmpeg as started
    const stats = this.streamStats.get(streamId);
    if (stats) stats.ffmpegStarted = true;

    console.log(`✅ FFmpeg pipeline ready for stream ${streamId}`);
    return true;
  }

  /**
   * Write video data to FFmpeg stdin
   * @param {string} streamId - Stream ID
   * @param {Buffer} data - Video data chunk
   */
  writeData(streamId, data) {
    const stream = this.activeStreams.get(streamId);
    
    if (!stream) {
      console.log(`⚠️ No active stream found for ${streamId}`);
      return false;
    }
    
    if (!stream.ffmpeg) {
      console.log(`⚠️ No FFmpeg process for ${streamId}`);
      return false;
    }
    
    if (!stream.ffmpeg.stdin || !stream.ffmpeg.stdin.writable) {
      console.log(`⚠️ FFmpeg stdin not writable for ${streamId}`);
      return false;
    }

    try {
      const written = stream.ffmpeg.stdin.write(data);
      
      // Update stats
      const stats = this.streamStats.get(streamId);
      if (stats) {
        stats.bytesReceived += data.length;
        stats.chunks++;
        
        // Log every 100 chunks
        if (stats.chunks % 100 === 0) {
          console.log(`📝 Stream ${streamId}: chunk #${stats.chunks}, ${(stats.bytesReceived / 1024 / 1024).toFixed(2)} MB total`);
        }
      }
      
      return written;
    } catch (error) {
      console.error(`❌ Write error [${streamId}]:`, error.message);
      return false;
    }
  }

  /**
   * Stop a stream
   * @param {string} streamId - Stream ID
   */
  stopStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      console.log(`⚠️ Stream ${streamId} not found for stopping`);
      return false;
    }

    console.log(`🛑 Stopping stream ${streamId} (PID: ${stream.pid})`);

    try {
      // Close stdin to signal end of input
      if (stream.ffmpeg && stream.ffmpeg.stdin) {
        stream.ffmpeg.stdin.end();
        console.log(`✅ Closed stdin for ${streamId}`);
      }

      // Give FFmpeg time to finish, then kill if needed
      setTimeout(() => {
        if (stream.ffmpeg && !stream.ffmpeg.killed) {
          console.log(`⏰ Force killing FFmpeg for ${streamId}`);
          stream.ffmpeg.kill('SIGTERM');
        }
      }, 5000);

    } catch (error) {
      console.error(`❌ Error stopping stream ${streamId}:`, error.message);
    }

    // Log final stats
    const stats = this.streamStats.get(streamId);
    if (stats) {
      const duration = (Date.now() - stats.startTime) / 1000;
      console.log(`📊 Stream ${streamId} ended: ${stats.chunks} chunks, ${(stats.bytesReceived / 1024 / 1024).toFixed(2)} MB, ${duration.toFixed(0)}s duration`);
    }

    return true;
  }

  cleanup(streamId) {
    this.activeStreams.delete(streamId);
    this.streamStats.delete(streamId);
    console.log(`🧹 Cleaned up stream ${streamId}`);
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
      mbReceived: (stats.bytesReceived / 1024 / 1024).toFixed(2),
      pid: stream.pid
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

// Export singleton instance
const service = new WebRTCToRTMPService();
module.exports = service;
