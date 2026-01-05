// ============================================
// FILE: services/mux.service.js
// Mux Live Streaming Service - OPTIMIZED
// VERSION: 4.0 - Low Latency + High Quality
// ============================================

const Mux = require('@mux/mux-node');

// Initialize Mux client
const muxClient = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET
});

const { Video } = muxClient;

// Log initialization
if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
  console.log('✅ Mux client initialized');
  console.log('🚀 Low Latency Mode: Enabled');
} else {
  console.log('⚠️ Mux credentials not configured');
}

/**
 * Create a new live stream with LOW LATENCY enabled
 * This reduces viewer delay from 20-30s to 5-10s
 */
async function createLiveStream(options = {}) {
  try {
    const {
      playbackPolicy = 'public',
      newAssetSettings = {},
      reconnectWindow = 60,
      maxContinuousDuration = 43200, // 12 hours
      reducedLatency = true,  // Enable for ~10s latency
      lowLatency = true       // Enable for ~5s latency (LL-HLS)
    } = options;

    console.log('🎬 Creating Mux live stream with Low Latency...');

    const stream = await Video.LiveStreams.create({
      // Playback settings
      playback_policy: [playbackPolicy],
      
      // LOW LATENCY MODE - Key setting!
      latency_mode: lowLatency ? 'low' : (reducedLatency ? 'reduced' : 'standard'),
      
      // Recording settings - create asset when stream ends
      new_asset_settings: {
        playback_policy: [playbackPolicy],
        ...newAssetSettings
      },
      
      // Reconnection settings
      reconnect_window: reconnectWindow,
      
      // Max duration (12 hours default)
      max_continuous_duration: maxContinuousDuration,
      
      // Enable MP4 support for recordings
      mp4_support: 'standard'
    });

    console.log('✅ Mux stream created:');
    console.log(`   Stream ID: ${stream.id}`);
    console.log(`   Stream Key: ${stream.stream_key?.substring(0, 10)}...`);
    console.log(`   Latency Mode: ${stream.latency_mode}`);
    console.log(`   Playback ID: ${stream.playback_ids?.[0]?.id}`);

    return {
      success: true,
      streamId: stream.id,
      streamKey: stream.stream_key,
      playbackId: stream.playback_ids?.[0]?.id,
      rtmpUrl: 'rtmps://global-live.mux.com:443/app',
      status: stream.status,
      latencyMode: stream.latency_mode
    };
  } catch (error) {
    console.error('❌ Mux createLiveStream error:', error.message);
    throw error;
  }
}

/**
 * Get live stream details
 */
async function getLiveStream(streamId) {
  try {
    const stream = await Video.LiveStreams.get(streamId);
    
    return {
      success: true,
      stream: {
        id: stream.id,
        status: stream.status,
        playbackId: stream.playback_ids?.[0]?.id,
        activeAssetId: stream.active_asset_id,
        recentAssetIds: stream.recent_asset_ids,
        latencyMode: stream.latency_mode,
        reconnectWindow: stream.reconnect_window,
        maxContinuousDuration: stream.max_continuous_duration
      }
    };
  } catch (error) {
    console.error('❌ Mux getLiveStream error:', error.message);
    throw error;
  }
}

/**
 * Get stream status and check if active
 */
async function getStreamStatus(streamId) {
  try {
    const stream = await Video.LiveStreams.get(streamId);
    
    return {
      success: true,
      status: stream.status,
      isActive: stream.status === 'active',
      isIdle: stream.status === 'idle',
      playbackId: stream.playback_ids?.[0]?.id,
      latencyMode: stream.latency_mode
    };
  } catch (error) {
    console.error('❌ Mux getStreamStatus error:', error.message);
    return {
      success: false,
      status: 'unknown',
      error: error.message
    };
  }
}

/**
 * Delete/disable a live stream
 */
async function deleteLiveStream(streamId) {
  try {
    await Video.LiveStreams.del(streamId);
    console.log(`🗑️ Mux stream ${streamId} deleted`);
    return { success: true };
  } catch (error) {
    console.error('❌ Mux deleteLiveStream error:', error.message);
    throw error;
  }
}

/**
 * Reset stream key (for security)
 */
async function resetStreamKey(streamId) {
  try {
    const result = await Video.LiveStreams.resetStreamKey(streamId);
    console.log(`🔄 Stream key reset for ${streamId}`);
    return {
      success: true,
      streamKey: result.stream_key
    };
  } catch (error) {
    console.error('❌ Mux resetStreamKey error:', error.message);
    throw error;
  }
}

/**
 * Get asset details (for recordings)
 */
async function getAsset(assetId) {
  try {
    const asset = await Video.Assets.get(assetId);
    
    return {
      success: true,
      asset: {
        id: asset.id,
        status: asset.status,
        playbackId: asset.playback_ids?.[0]?.id,
        duration: asset.duration,
        maxStoredResolution: asset.max_stored_resolution,
        maxStoredFrameRate: asset.max_stored_frame_rate,
        aspectRatio: asset.aspect_ratio,
        createdAt: asset.created_at
      }
    };
  } catch (error) {
    console.error('❌ Mux getAsset error:', error.message);
    throw error;
  }
}

/**
 * Create a playback ID for an asset
 */
async function createPlaybackId(assetId, policy = 'public') {
  try {
    const playbackId = await Video.Assets.createPlaybackId(assetId, {
      policy
    });
    
    return {
      success: true,
      playbackId: playbackId.id,
      policy: playbackId.policy
    };
  } catch (error) {
    console.error('❌ Mux createPlaybackId error:', error.message);
    throw error;
  }
}

/**
 * Generate playback URLs from a playback ID
 */
function getPlaybackUrls(playbackId) {
  if (!playbackId) return null;
  
  return {
    hls: `https://stream.mux.com/${playbackId}.m3u8`,
    thumbnail: `https://image.mux.com/${playbackId}/thumbnail.jpg`,
    thumbnailWebp: `https://image.mux.com/${playbackId}/thumbnail.webp`,
    gif: `https://image.mux.com/${playbackId}/animated.gif`,
    storyboard: `https://image.mux.com/${playbackId}/storyboard.vtt`,
    // For low latency playback
    llHls: `https://stream.mux.com/${playbackId}.m3u8?redundant_streams=true`
  };
}

/**
 * List recent live streams
 */
async function listLiveStreams(limit = 10) {
  try {
    const streams = await Video.LiveStreams.list({ limit });
    
    return {
      success: true,
      streams: streams.map(s => ({
        id: s.id,
        status: s.status,
        playbackId: s.playback_ids?.[0]?.id,
        latencyMode: s.latency_mode,
        createdAt: s.created_at
      }))
    };
  } catch (error) {
    console.error('❌ Mux listLiveStreams error:', error.message);
    throw error;
  }
}

module.exports = {
  createLiveStream,
  getLiveStream,
  getStreamStatus,
  deleteLiveStream,
  resetStreamKey,
  getAsset,
  createPlaybackId,
  getPlaybackUrls,
  listLiveStreams,
  muxClient,
  Video
};
