// ============================================
// FILE: services/mux.service.js
// Mux Live Streaming Service
// ============================================

const Mux = require('@mux/mux-node');

// Initialize Mux client
const muxClient = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET
});

const { Video, Data } = muxClient;

/**
 * Create a new live stream
 * @returns {Object} Stream details including stream key and playback IDs
 */
async function createLiveStream(options = {}) {
  try {
    const stream = await Video.LiveStreams.create({
      playback_policy: ['public'],
      new_asset_settings: {
        playback_policy: ['public']
      },
      // Reduce latency for more real-time experience
      latency_mode: options.lowLatency ? 'low' : 'standard',
      // Generate MP4 for replay
      mp4_support: 'standard',
      // Test mode for development
      test: process.env.NODE_ENV !== 'production'
    });

    console.log('✅ Mux live stream created:', stream.id);

    return {
      success: true,
      streamId: stream.id,
      streamKey: stream.stream_key,
      rtmpUrl: 'rtmps://global-live.mux.com:443/app',
      playbackId: stream.playback_ids?.[0]?.id,
      status: stream.status
    };
  } catch (error) {
    console.error('❌ Mux create stream error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get live stream status
 * @param {string} streamId - Mux stream ID
 */
async function getLiveStreamStatus(streamId) {
  try {
    const stream = await Video.LiveStreams.get(streamId);
    
    return {
      success: true,
      status: stream.status, // 'idle', 'active', 'disabled'
      playbackId: stream.playback_ids?.[0]?.id,
      recentAssetIds: stream.recent_asset_ids,
      activeAssetId: stream.active_asset_id
    };
  } catch (error) {
    console.error('❌ Mux get stream error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * End/disable a live stream
 * @param {string} streamId - Mux stream ID
 */
async function endLiveStream(streamId) {
  try {
    // Signal that the stream is complete
    await Video.LiveStreams.signalComplete(streamId);
    
    console.log('✅ Mux live stream ended:', streamId);
    
    return {
      success: true,
      message: 'Stream ended'
    };
  } catch (error) {
    console.error('❌ Mux end stream error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a live stream
 * @param {string} streamId - Mux stream ID
 */
async function deleteLiveStream(streamId) {
  try {
    await Video.LiveStreams.del(streamId);
    
    console.log('✅ Mux live stream deleted:', streamId);
    
    return {
      success: true,
      message: 'Stream deleted'
    };
  } catch (error) {
    console.error('❌ Mux delete stream error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get playback URL for a stream
 * @param {string} playbackId - Mux playback ID
 */
function getPlaybackUrl(playbackId) {
  if (!playbackId) return null;
  
  return {
    // HLS stream URL
    hls: `https://stream.mux.com/${playbackId}.m3u8`,
    // Thumbnail
    thumbnail: `https://image.mux.com/${playbackId}/thumbnail.jpg`,
    // Animated GIF preview
    gif: `https://image.mux.com/${playbackId}/animated.gif`,
    // Storyboard for scrubbing
    storyboard: `https://image.mux.com/${playbackId}/storyboard.vtt`
  };
}

/**
 * Create a direct upload URL for video files
 * @returns {Object} Upload URL and asset details
 */
async function createDirectUpload() {
  try {
    const upload = await Video.Uploads.create({
      cors_origin: '*',
      new_asset_settings: {
        playback_policy: ['public'],
        mp4_support: 'standard'
      }
    });

    return {
      success: true,
      uploadUrl: upload.url,
      uploadId: upload.id
    };
  } catch (error) {
    console.error('❌ Mux create upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get asset details (for uploaded videos)
 * @param {string} assetId - Mux asset ID
 */
async function getAsset(assetId) {
  try {
    const asset = await Video.Assets.get(assetId);
    
    return {
      success: true,
      asset: {
        id: asset.id,
        status: asset.status,
        duration: asset.duration,
        playbackId: asset.playback_ids?.[0]?.id,
        aspectRatio: asset.aspect_ratio,
        resolution: asset.resolution_tier
      }
    };
  } catch (error) {
    console.error('❌ Mux get asset error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a Web Input for browser-based streaming
 * This allows streaming directly from browser without OBS
 */
async function createWebInput(liveStreamId) {
  try {
    // Note: Web Inputs is a Mux feature that may require specific plan
    const webInput = await Video.WebInputs.create({
      live_stream_id: liveStreamId
    });

    return {
      success: true,
      webInputId: webInput.id,
      url: webInput.url
    };
  } catch (error) {
    console.error('❌ Mux create web input error:', error);
    // Web inputs may not be available on all plans
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createLiveStream,
  getLiveStreamStatus,
  endLiveStream,
  deleteLiveStream,
  getPlaybackUrl,
  createDirectUpload,
  getAsset,
  createWebInput,
  muxClient
};
