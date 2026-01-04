// ============================================
// FILE: services/webrtc-rtmp.service.js
// WebRTC to RTMP Bridge Service
// Converts browser MediaRecorder output to RTMP for Mux
// ============================================

const { spawn } = require('child_process');
const path = require('path');

// Try to use ffmpeg-static if available, otherwise use system ffmpeg
let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = require('ffmpeg-static');
  console.log('✅ Using ffmpeg-static');
} catch {
  console.log('ℹ️ Using system FFmpeg');
}

class WebRTCtoRTMPService {
  constructor() {
    this.sessions = new Map(); // streamId -> session data
    this.ffmpegAvailable = null;
  }

  // ==========================================
  // Check if FFmpeg is available
  // ==========================================
  async checkFFmpeg() {
    if (this.ffmpegAvailable !== null) {
      return this.ffmpegAvailable;
    }

    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath, ['-version']);
      
      proc.on('error', () => {
        console.log('❌ FFmpeg not available');
        this.ffmpegAvailable = false;
        resolve(false);
      });
      
      proc.on('close', (code) => {
        this.ffmpegAvailable = code === 0;
        if (this.ffmpegAvailable) {
          console.log('✅ FFmpeg is available');
        }
        resolve(this.ffmpegAvailable);
      });
    });
  }

  // ==========================================
  // Start a new streaming session
  // ==========================================
  async startSession(streamId, rtmpUrl, streamKey, options = {}) {
    const available = await this.checkFFmpeg();
    if (!available) {
      throw new Error('FFmpeg is not available on this server');
    }

    // Check if session already exists
    if (this.sessions.has(streamId)) {
      console.log(`⚠️ Session ${streamId} already exists, stopping old session`);
      this.stopSession(streamId);
    }

    const fullRtmpUrl = `${rtmpUrl}/${streamKey}`;
    
    // FFmpeg arguments for WebRTC-like input (WebM/Matroska from MediaRecorder)
    const ffmpegArgs = [
      // Input settings
      '-f', 'webm',              // Input format (MediaRecorder outputs WebM)
      '-i', 'pipe:0',            // Read from stdin
      
      // Video encoding
      '-c:v', 'libx264',         // H.264 codec for RTMP compatibility
      '-preset', options.preset || 'veryfast',  // Encoding speed
      '-tune', 'zerolatency',    // Low latency
      '-profile:v', 'baseline',  // Baseline profile for compatibility
      '-level', '3.1',
      '-b:v', options.videoBitrate || '2500k',  // Video bitrate
      '-maxrate', options.videoBitrate || '2500k',
      '-bufsize', options.bufsize || '5000k',
      '-pix_fmt', 'yuv420p',     // Pixel format
      '-g', '60',                // Keyframe interval (2 seconds at 30fps)
      '-keyint_min', '60',
      
      // Video scaling (optional)
      '-vf', `scale=${options.width || 1280}:${options.height || 720}:force_original_aspect_ratio=decrease,pad=${options.width || 1280}:${options.height || 720}:(ow-iw)/2:(oh-ih)/2`,
      
      // Audio encoding
      '-c:a', 'aac',             // AAC codec for RTMP
      '-b:a', options.audioBitrate || '128k',   // Audio bitrate
      '-ar', '44100',            // Sample rate
      '-ac', '2',                // Stereo
      
      // Output settings
      '-f', 'flv',               // FLV format for RTMP
      '-flvflags', 'no_duration_filesize',
      
      // RTMP output
      fullRtmpUrl
    ];

    console.log(`🎬 Starting FFmpeg session for stream ${streamId}`);
    console.log(`   RTMP URL: ${rtmpUrl}/***`);
    
    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const session = {
      streamId,
      ffmpeg: ffmpegProcess,
      rtmpUrl: fullRtmpUrl,
      startedAt: new Date(),
      bytesReceived: 0,
      isActive: true,
      errors: []
    };

    // Handle FFmpeg stdout (progress info)
    ffmpegProcess.stdout.on('data', (data) => {
      // FFmpeg outputs progress to stderr, stdout is usually empty
    });

    // Handle FFmpeg stderr (logs and progress)
    ffmpegProcess.stderr.on('data', (data) => {
      const message = data.toString();
      // Only log important messages
      if (message.includes('Error') || message.includes('error')) {
        console.error(`FFmpeg [${streamId}]:`, message);
        session.errors.push(message);
      } else if (message.includes('frame=') && Math.random() < 0.01) {
        // Log occasional progress (1% of frames)
        console.log(`FFmpeg [${streamId}]: Streaming...`);
      }
    });

    // Handle FFmpeg exit
    ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg [${streamId}] exited with code ${code}`);
      session.isActive = false;
      session.endedAt = new Date();
      
      // Clean up after a delay
      setTimeout(() => {
        if (this.sessions.get(streamId) === session) {
          this.sessions.delete(streamId);
        }
      }, 5000);
    });

    // Handle FFmpeg errors
    ffmpegProcess.on('error', (err) => {
      console.error(`FFmpeg [${streamId}] error:`, err);
      session.isActive = false;
      session.errors.push(err.message);
    });

    this.sessions.set(streamId, session);
    
    return {
      success: true,
      streamId,
      message: 'Streaming session started'
    };
  }

  // ==========================================
  // Send media data to FFmpeg
  // ==========================================
  sendData(streamId, data) {
    const session = this.sessions.get(streamId);
    
    if (!session || !session.isActive) {
      return { success: false, error: 'Session not found or inactive' };
    }

    try {
      // Write data to FFmpeg stdin
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      session.ffmpeg.stdin.write(buffer);
      session.bytesReceived += buffer.length;
      
      return { success: true, bytesReceived: session.bytesReceived };
    } catch (error) {
      console.error(`Error sending data to FFmpeg [${streamId}]:`, error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // Stop a streaming session
  // ==========================================
  stopSession(streamId) {
    const session = this.sessions.get(streamId);
    
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    console.log(`⏹️ Stopping FFmpeg session for stream ${streamId}`);
    
    try {
      // Close stdin to signal end of input
      session.ffmpeg.stdin.end();
      
      // Give FFmpeg time to finish, then force kill if needed
      setTimeout(() => {
        if (session.isActive) {
          session.ffmpeg.kill('SIGTERM');
        }
      }, 5000);
      
      session.isActive = false;
      
      return {
        success: true,
        streamId,
        bytesReceived: session.bytesReceived,
        duration: session.startedAt ? Date.now() - session.startedAt : 0
      };
    } catch (error) {
      console.error(`Error stopping FFmpeg [${streamId}]:`, error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // Get session status
  // ==========================================
  getSessionStatus(streamId) {
    const session = this.sessions.get(streamId);
    
    if (!session) {
      return { exists: false };
    }

    return {
      exists: true,
      streamId: session.streamId,
      isActive: session.isActive,
      bytesReceived: session.bytesReceived,
      startedAt: session.startedAt,
      duration: session.startedAt ? Date.now() - session.startedAt : 0,
      errors: session.errors
    };
  }

  // ==========================================
  // Get all active sessions
  // ==========================================
  getActiveSessions() {
    const active = [];
    for (const [streamId, session] of this.sessions) {
      if (session.isActive) {
        active.push({
          streamId,
          bytesReceived: session.bytesReceived,
          startedAt: session.startedAt
        });
      }
    }
    return active;
  }

  // ==========================================
  // Check service status
  // ==========================================
  async getStatus() {
    const ffmpegAvailable = await this.checkFFmpeg();
    return {
      available: ffmpegAvailable,
      activeSessions: this.getActiveSessions().length,
      ffmpegPath
    };
  }
}

// Export singleton instance
const webrtcRtmpService = new WebRTCtoRTMPService();

module.exports = webrtcRtmpService;
