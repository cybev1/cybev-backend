// ============================================
// FILE: services/webrtc-rtmp.service.js
// WebRTC to RTMP Transcoding Service - FIXED v4
// IMPROVED: Better FFmpeg args, error handling, timeouts
// ============================================

const { spawn } = require('child_process');

// Get ffmpeg path - PREFER SYSTEM FFMPEG over ffmpeg-static
// ffmpeg-static can cause SIGSEGV crashes on some platforms
let ffmpegPath = 'ffmpeg';
let usingSystemFfmpeg = false;

// First, try to use system ffmpeg (more reliable)
try {
  const { execSync } = require('child_process');
  execSync('ffmpeg -version', { stdio: 'pipe' });
  ffmpegPath = 'ffmpeg';
  usingSystemFfmpeg = true;
  console.log('✅ Using system FFmpeg');
} catch (e) {
  // Fall back to ffmpeg-static
  try {
    ffmpegPath = require('ffmpeg-static');
    console.log('⚠️ System FFmpeg not found, using ffmpeg-static:', ffmpegPath);
    console.log('   Note: ffmpeg-static may crash with SIGSEGV on some platforms');
  } catch (e2) {
    console.error('❌ No FFmpeg available!');
  }
}

// Verify FFmpeg on startup
try {
  const { execSync } = require('child_process');
  const version = execSync(`${ffmpegPath} -version`, { stdio: 'pipe' }).toString().split('\n')[0];
  console.log('✅ FFmpeg version:', version);
} catch (e) {
  console.error('❌ FFmpeg verification failed:', e.message);
}

class WebRTCToRTMPService {
  constructor() {
    this.activeStreams = new Map();
    this.streamStats = new Map();
    console.log('✅ WebRTC-RTMP Service initialized');
  }

  startStream(streamId, rtmpUrl, socket) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 STARTING FFMPEG STREAM: ${streamId}`);
    console.log(`${'='.repeat(60)}`);
    
    if (this.activeStreams.has(streamId)) {
      console.log(`⚠️ Stream ${streamId} already active, stopping old one`);
      this.stopStream(streamId);
    }

    // Validate RTMP URL
    if (!rtmpUrl || rtmpUrl.includes('undefined')) {
      console.error('❌ Invalid RTMP URL:', rtmpUrl);
      return false;
    }

    console.log(`📡 RTMP URL: ${rtmpUrl.substring(0, 70)}...`);
    console.log(`🔧 FFmpeg: ${ffmpegPath} (${usingSystemFfmpeg ? 'system' : 'ffmpeg-static'})`);
    
    if (!usingSystemFfmpeg) {
      console.log(`⚠️ WARNING: ffmpeg-static may crash with SIGSEGV. Consider installing system FFmpeg.`);
    }

    // Initialize stats
    this.streamStats.set(streamId, {
      bytesReceived: 0,
      chunks: 0,
      errors: 0,
      startTime: Date.now(),
      ffmpegStarted: false,
      rtmpConnected: false,
      lastDataTime: Date.now()
    });

    // FFmpeg arguments - OPTIMIZED for quality and low latency
    // Higher bitrate + better preset = clearer video
    const ffmpegArgs = [
      '-y',
      '-hide_banner',
      '-loglevel', 'warning',
      
      // Input from stdin - WebM format
      '-f', 'webm',
      '-i', 'pipe:0',
      
      // Video: H.264 with BETTER quality settings
      '-c:v', 'libx264',
      '-preset', 'veryfast',        // Better quality than ultrafast
      '-tune', 'zerolatency',       // Low latency
      '-profile:v', 'high',         // Better quality profile
      '-level', '4.1',
      '-b:v', '3000k',              // Higher bitrate for clarity
      '-maxrate', '3500k',
      '-bufsize', '6000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',                   // Keyframe every 2 sec at 30fps
      '-keyint_min', '30',
      '-sc_threshold', '0',
      '-r', '30',
      
      // Audio: AAC 
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      
      // Output to RTMP
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      rtmpUrl
    ];

    console.log(`🔧 FFmpeg args: ${ffmpegArgs.slice(0, 15).join(' ')}...`);

    // Spawn FFmpeg
    let ffmpeg;
    try {
      ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      if (!ffmpeg.pid) {
        console.error('❌ FFmpeg failed to spawn - no PID');
        return false;
      }
      
      console.log(`✅ FFmpeg spawned with PID: ${ffmpeg.pid}`);
    } catch (error) {
      console.error(`❌ FFmpeg spawn error:`, error.message);
      if (socket) socket.emit('error', { message: 'Failed to start encoder: ' + error.message });
      return false;
    }

    // Store stream
    this.activeStreams.set(streamId, {
      ffmpeg,
      socket,
      rtmpUrl,
      startTime: Date.now(),
      isConnected: false,
      pid: ffmpeg.pid,
      dataTimeout: null
    });

    const stats = this.streamStats.get(streamId);
    stats.ffmpegStarted = true;

    // Handle stdout
    ffmpeg.stdout.on('data', (data) => {
      console.log(`📺 FFmpeg stdout [${streamId}]:`, data.toString().trim());
    });

    // Handle stderr (FFmpeg logs go here)
    let stderrBuffer = '';
    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString();
      stderrBuffer += msg;
      const stream = this.activeStreams.get(streamId);
      
      // Log ALL FFmpeg output for debugging
      const lines = msg.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        // Always log the line for debugging
        console.log(`📝 FFmpeg [${streamId}]: ${line.trim().substring(0, 150)}`);
        
        // Check for RTMP connection success
        if (line.includes('Output #0') || line.includes('mux.com') || line.includes('Video:') || line.includes('Stream mapping') || line.includes('Opening')) {
          if (stream && !stream.isConnected) {
            stream.isConnected = true;
            stats.rtmpConnected = true;
            console.log(`✅ Stream ${streamId} CONNECTED to Mux!`);
            if (socket && socket.connected) {
              socket.emit('rtmp-connected', { streamId, message: 'Connected to Mux' });
            }
          }
        }
        
        // Track errors
        if (line.toLowerCase().includes('error') || line.includes('failed') || line.includes('Invalid') || line.includes('cannot')) {
          console.error(`❌ FFmpeg ERROR [${streamId}]: ${line.trim()}`);
          stats.errors++;
        }
      });
    });

    // Handle FFmpeg close
    ffmpeg.on('close', (code, signal) => {
      console.log(`\n🔴 FFmpeg CLOSED [${streamId}]`);
      console.log(`   Exit code: ${code}`);
      console.log(`   Signal: ${signal}`);
      
      const stats = this.streamStats.get(streamId);
      if (stats) {
        const duration = (Date.now() - stats.startTime) / 1000;
        console.log(`   Duration: ${duration.toFixed(1)}s`);
        console.log(`   Chunks received: ${stats.chunks}`);
        console.log(`   Bytes received: ${(stats.bytesReceived / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Errors: ${stats.errors}`);
        console.log(`   RTMP connected: ${stats.rtmpConnected}`);
      }
      
      // Common exit codes
      if (code === 1) {
        console.log(`   ⚠️ Exit code 1: Generic error (check input format)`);
      } else if (code === 255 || code === -1) {
        console.log(`   ⚠️ Exit code ${code}: Likely killed or connection lost`);
      }
      
      // Notify client
      if (socket && socket.connected) {
        socket.emit('stream-ended', {
          streamId,
          code,
          signal,
          reason: code === 0 ? 'Stream ended normally' : `Stream interrupted (code: ${code}, signal: ${signal})`
        });
      }
      
      this.cleanup(streamId);
    });

    // Handle FFmpeg errors
    ffmpeg.on('error', (error) => {
      console.error(`❌ FFmpeg ERROR [${streamId}]:`, error.message);
      if (socket && socket.connected) {
        socket.emit('error', { streamId, error: error.message });
      }
      this.cleanup(streamId);
    });

    // Handle stdin errors
    ffmpeg.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') {
        console.error(`❌ FFmpeg stdin error [${streamId}]:`, error.message);
      }
    });

    // Set up data timeout - FFmpeg needs data within 30 seconds
    const stream = this.activeStreams.get(streamId);
    stream.dataTimeout = setTimeout(() => {
      const stats = this.streamStats.get(streamId);
      if (stats && stats.chunks === 0) {
        console.error(`❌ No data received for stream ${streamId} after 30s - stopping`);
        this.stopStream(streamId);
      }
    }, 30000);

    console.log(`✅ FFmpeg pipeline ready, waiting for video data...`);
    return true;
  }

  writeData(streamId, data) {
    const stream = this.activeStreams.get(streamId);
    
    if (!stream) {
      return false;
    }
    
    if (!stream.ffmpeg || !stream.ffmpeg.stdin) {
      return false;
    }
    
    if (!stream.ffmpeg.stdin.writable) {
      console.log(`⚠️ FFmpeg stdin not writable for ${streamId}`);
      return false;
    }

    try {
      // Clear data timeout on first data
      if (stream.dataTimeout) {
        clearTimeout(stream.dataTimeout);
        stream.dataTimeout = null;
      }

      const written = stream.ffmpeg.stdin.write(data);
      
      const stats = this.streamStats.get(streamId);
      if (stats) {
        stats.bytesReceived += data.length;
        stats.chunks++;
        stats.lastDataTime = Date.now();
        
        // Log first chunk
        if (stats.chunks === 1) {
          console.log(`📥 First data chunk received for ${streamId}: ${data.length} bytes`);
        }
        
        // Log progress every 100 chunks
        if (stats.chunks % 100 === 0) {
          console.log(`📊 Stream ${streamId}: chunk #${stats.chunks}, ${(stats.bytesReceived / 1024 / 1024).toFixed(2)} MB`);
        }
      }
      
      return written;
    } catch (error) {
      console.error(`❌ Write error [${streamId}]:`, error.message);
      return false;
    }
  }

  stopStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      console.log(`⚠️ Stream ${streamId} not found`);
      return false;
    }

    console.log(`\n🛑 STOPPING STREAM ${streamId} (PID: ${stream.pid})`);

    // Clear timeout
    if (stream.dataTimeout) {
      clearTimeout(stream.dataTimeout);
    }

    try {
      // Close stdin first
      if (stream.ffmpeg && stream.ffmpeg.stdin) {
        stream.ffmpeg.stdin.end();
      }

      // Give FFmpeg time to finish, then force kill
      setTimeout(() => {
        if (stream.ffmpeg && !stream.ffmpeg.killed) {
          console.log(`⏰ Force killing FFmpeg for ${streamId}`);
          stream.ffmpeg.kill('SIGKILL');
        }
      }, 5000);

    } catch (error) {
      console.error(`❌ Error stopping ${streamId}:`, error.message);
    }

    return true;
  }

  cleanup(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream && stream.dataTimeout) {
      clearTimeout(stream.dataTimeout);
    }
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

module.exports = new WebRTCToRTMPService();
