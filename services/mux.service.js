// ============================================
// FILE: services/mux.service.js
// Mux Live Streaming Service
// Compatible with @mux/mux-node v8.x
// ============================================

let mux;
let isConfigured = false;

// Initialize Mux client
try {
  const Mux = require('@mux/mux-node');
  
  if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
    mux = new Mux({
      tokenId: process.env.MUX_TOKEN_ID,
      tokenSecret: process.env.MUX_TOKEN_SECRET
    });
    isConfigured = true;
    console.log('✅ Mux client initialized');
  } else {
    console.log('⚠️ Mux credentials not configured');
  }
} catch (error) {
  console.error('❌ Failed to initialize Mux:', error.message);
}

/**
 * Check if Mux is configured
 */
function isAvailable() {
  return isConfigured && mux;
}

/**
 * Create a new live stream
 * @returns {Object} Stream details including stream key and playback IDs
 */
async function createLiveStream(options = {}) {
  if (!isAvailable()) {
    console.log('⚠️ Mux not configured, skipping stream creation');
    return { success: false, error: 'Mux not configured' };
  }

  try {
    console.log('📺 Creating Mux live stream...');
    
    // v8.x syntax: mux.video.liveStreams (lowercase)
    const stream = await mux.video.liveStreams.create({
      playback_policy: ['public'],
      new_asset_settings: {
        playback_policy: ['public']
      },
      // Reduce latency for more real-time experience
      latency_mode: options.lowLatency ? 'low' : 'standard',
      // Generate MP4 for replay
      mp4_support: 'standard'
    });

    console.log('✅ Mux live stream created:', stream.id);
    console.log('   Stream Key:', stream.stream_key?.substring(0, 8) + '...');
    console.log('   Playback ID:', stream.playback_ids?.[0]?.id);

    return {
      success: true,
      streamId: stream.id,
      streamKey: stream.stream_key,
      rtmpUrl: 'rtmps://global-live.mux.com:443/app',
      playbackId: stream.playback_ids?.[0]?.id,
      status: stream.status
    };
  } catch (error) {
    console.error('❌ Mux create stream error:', error.message);
    console.error('   Full error:', error);
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
  if (!isAvailable()) {
    return { success: false, error: 'Mux not configured' };
  }

  try {
    const stream = await mux.video.liveStreams.retrieve(streamId);
    
    return {
      success: true,
      status: stream.status, // 'idle', 'active', 'disabled'
      playbackId: stream.playback_ids?.[0]?.id,
      recentAssetIds: stream.recent_asset_ids,
      activeAssetId: stream.active_asset_id
    };
  } catch (error) {
    console.error('❌ Mux get stream error:', error.message);
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
  if (!isAvailable()) {
    return { success: false, error: 'Mux not configured' };
  }

  try {
    // Signal that the stream is complete
    await mux.video.liveStreams.complete(streamId);
    
    console.log('✅ Mux live stream ended:', streamId);
    
    return {
      success: true,
      message: 'Stream ended'
    };
  } catch (error) {
    console.error('❌ Mux end stream error:', error.message);
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
  if (!isAvailable()) {
    return { success: false, error: 'Mux not configured' };
  }

  try {
    await mux.video.liveStreams.delete(streamId);
    
    console.log('✅ Mux live stream deleted:', streamId);
    
    return {
      success: true,
      message: 'Stream deleted'
    };
  } catch (error) {
    console.error('❌ Mux delete stream error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get playback URL for a stream
 * @param {string} playbackId - Mux playback ID
 * @returns {Object} Various playback URLs
 */
function getPlaybackUrl(playbackId) {
  if (!playbackId) return null;
  
  return {
    hls: `https://stream.mux.com/${playbackId}.m3u8`,
    thumbnail: `https://image.mux.com/${playbackId}/thumbnail.jpg`,
    gif: `https://image.mux.com/${playbackId}/animated.gif`,
    storyboard: `https://image.mux.com/${playbackId}/storyboard.vtt`
  };
}

/**
 * Create a direct upload for video files
 * @returns {Object} Upload URL and asset ID
 */
async function createDirectUpload(options = {}) {
  if (!isAvailable()) {
    return { success: false, error: 'Mux not configured' };
  }

  try {
    const upload = await mux.video.uploads.create({
      cors_origin: options.corsOrigin || '*',
      new_asset_settings: {
        playback_policy: ['public'],
        mp4_support: 'standard'
      }
    });

    return {
      success: true,
      uploadId: upload.id,
      uploadUrl: upload.url,
      assetId: upload.asset_id
    };
  } catch (error) {
    console.error('❌ Mux upload creation error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get asset details
 * @param {string} assetId - Mux asset ID
 */
async function getAsset(assetId) {
  if (!isAvailable()) {
    return { success: false, error: 'Mux not configured' };
  }

  try {
    const asset = await mux.video.assets.retrieve(assetId);
    
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
    console.error('❌ Mux get asset error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a web input for browser-based streaming
 * This requires a Mux plan that supports web inputs
 */
async function createWebInput(liveStreamId) {
  if (!isAvailable()) {
    return { success: false, error: 'Mux not configured' };
  }

  try {
    const webInput = await mux.video.webInputs.create({
      live_stream_id: liveStreamId
    });

    return {
      success: true,
      webInputId: webInput.id,
      url: webInput.url
    };
  } catch (error) {
    console.error('❌ Mux web input error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * List all live streams
 */
async function listLiveStreams(options = {}) {
  if (!isAvailable()) {
    return { success: false, error: 'Mux not configured' };
  }

  try {
    const streams = await mux.video.liveStreams.list({
      limit: options.limit || 20
    });

    return {
      success: true,
      streams: streams.data || streams
    };
  } catch (error) {
    console.error('❌ Mux list streams error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  isAvailable,
  createLiveStream,
  getLiveStreamStatus,
  endLiveStream,
  deleteLiveStream,
  getPlaybackUrl,
  createDirectUpload,
  getAsset,
  createWebInput,
  listLiveStreams
};
