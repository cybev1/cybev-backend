// ============================================
// FILE: streaming.service.js
// PATH: /services/streaming.service.js
// Multi-provider streaming: Mux primary → Livepeer fallback
// ============================================
const axios = require('axios');

// ─── Provider configs ───
const PROVIDERS = {
  mux: {
    name: 'Mux',
    configured: !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET),
    baseUrl: 'https://api.mux.com',
    auth: () => ({
      username: process.env.MUX_TOKEN_ID,
      password: process.env.MUX_TOKEN_SECRET
    }),
    rtmpUrl: 'rtmps://global-live.mux.com:443/app'
  },
  livepeer: {
    name: 'Livepeer',
    configured: !!process.env.LIVEPEER_API_KEY,
    baseUrl: 'https://livepeer.studio/api',
    apiKey: () => process.env.LIVEPEER_API_KEY,
    rtmpUrl: 'rtmp://rtmp.livepeer.studio/live'
  }
};

/**
 * Create a live stream — tries Mux first, falls back to Livepeer
 */
async function createLiveStream({ title = 'Live Stream', lowLatency = true } = {}) {
  // ─── Try Mux first ───
  if (PROVIDERS.mux.configured) {
    try {
      const result = await createMuxStream({ title, lowLatency });
      if (result.success) {
        console.log(`🎬 Stream created via Mux: ${result.streamKey?.substring(0, 8)}...`);
        return result;
      }
    } catch (err) {
      console.log(`⚠️ Mux failed: ${err.message} — falling back to Livepeer`);
    }
  }

  // ─── Try Livepeer fallback ───
  if (PROVIDERS.livepeer.configured) {
    try {
      const result = await createLivepeerStream({ title, lowLatency });
      if (result.success) {
        console.log(`🎬 Stream created via Livepeer: ${result.streamKey?.substring(0, 8)}...`);
        return result;
      }
    } catch (err) {
      console.log(`⚠️ Livepeer also failed: ${err.message}`);
    }
  }

  // ─── Both failed ───
  const configured = [];
  if (PROVIDERS.mux.configured) configured.push('Mux');
  if (PROVIDERS.livepeer.configured) configured.push('Livepeer');

  return {
    success: false,
    error: configured.length === 0
      ? 'No streaming provider configured. Add MUX_TOKEN_ID + MUX_TOKEN_SECRET or LIVEPEER_API_KEY to your environment.'
      : `All streaming providers failed (tried: ${configured.join(', ')})`
  };
}

/**
 * Get stream status
 */
async function getStreamStatus(provider, providerStreamId) {
  try {
    if (provider === 'mux' && PROVIDERS.mux.configured) {
      const res = await axios.get(`${PROVIDERS.mux.baseUrl}/video/v1/live-streams/${providerStreamId}`, {
        auth: PROVIDERS.mux.auth()
      });
      const stream = res.data.data;
      return {
        success: true,
        status: stream.status, // 'idle', 'active', 'disabled'
        isActive: stream.status === 'active',
        provider: 'mux'
      };
    }

    if (provider === 'livepeer' && PROVIDERS.livepeer.configured) {
      const res = await axios.get(`${PROVIDERS.livepeer.baseUrl}/stream/${providerStreamId}`, {
        headers: { Authorization: `Bearer ${PROVIDERS.livepeer.apiKey()}` }
      });
      return {
        success: true,
        status: res.data.isActive ? 'active' : 'idle',
        isActive: res.data.isActive,
        provider: 'livepeer'
      };
    }

    return { success: false, error: 'Provider not available' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get available providers
 */
function getProviderStatus() {
  return {
    mux: { configured: PROVIDERS.mux.configured, name: 'Mux' },
    livepeer: { configured: PROVIDERS.livepeer.configured, name: 'Livepeer' },
    anyAvailable: PROVIDERS.mux.configured || PROVIDERS.livepeer.configured
  };
}


// ═══════════════════════════════════════════
//  MUX IMPLEMENTATION
// ═══════════════════════════════════════════

async function createMuxStream({ title, lowLatency }) {
  const res = await axios.post(`${PROVIDERS.mux.baseUrl}/video/v1/live-streams`, {
    playback_policy: ['public'],
    new_asset_settings: { playback_policy: ['public'] },
    latency_mode: lowLatency ? 'low' : 'standard',
    reconnect_window: 60,
    max_continuous_duration: 43200 // 12 hours
  }, {
    auth: PROVIDERS.mux.auth(),
    headers: { 'Content-Type': 'application/json' }
  });

  const stream = res.data.data;
  if (!stream || !stream.stream_key) {
    throw new Error('Mux returned no stream key');
  }

  return {
    success: true,
    provider: 'mux',
    streamId: stream.id,
    streamKey: stream.stream_key,
    playbackId: stream.playback_ids?.[0]?.id,
    rtmpUrl: PROVIDERS.mux.rtmpUrl,
    playbackUrl: stream.playback_ids?.[0]?.id
      ? `https://stream.mux.com/${stream.playback_ids[0].id}.m3u8`
      : null
  };
}


// ═══════════════════════════════════════════
//  LIVEPEER IMPLEMENTATION
// ═══════════════════════════════════════════

async function createLivepeerStream({ title, lowLatency }) {
  const res = await axios.post(`${PROVIDERS.livepeer.baseUrl}/stream`, {
    name: title || `cybev-${Date.now()}`,
    profiles: [
      { name: '720p', bitrate: 2000000, fps: 30, width: 1280, height: 720 },
      { name: '480p', bitrate: 1000000, fps: 30, width: 854, height: 480 },
      { name: '360p', bitrate: 500000, fps: 30, width: 640, height: 360 }
    ],
    record: false
  }, {
    headers: {
      Authorization: `Bearer ${PROVIDERS.livepeer.apiKey()}`,
      'Content-Type': 'application/json'
    }
  });

  const stream = res.data;
  if (!stream || !stream.streamKey) {
    throw new Error('Livepeer returned no stream key');
  }

  return {
    success: true,
    provider: 'livepeer',
    streamId: stream.id,
    streamKey: stream.streamKey,
    playbackId: stream.playbackId,
    rtmpUrl: PROVIDERS.livepeer.rtmpUrl,
    playbackUrl: stream.playbackId
      ? `https://livepeercdn.studio/hls/${stream.playbackId}/index.m3u8`
      : null
  };
}


// ═══════════════════════════════════════════
//  INIT LOG
// ═══════════════════════════════════════════

const status = getProviderStatus();
console.log('📺 Streaming Service loaded:');
console.log(`   Mux: ${status.mux.configured ? '✅ Configured' : '❌ Not configured (add MUX_TOKEN_ID + MUX_TOKEN_SECRET)'}`);
console.log(`   Livepeer: ${status.livepeer.configured ? '✅ Configured' : '❌ Not configured (add LIVEPEER_API_KEY)'}`);
if (!status.anyAvailable) {
  console.log('   ⚠️ NO STREAMING PROVIDER AVAILABLE — Live streaming will not work');
}

module.exports = {
  createLiveStream,
  getStreamStatus,
  getProviderStatus,
  PROVIDERS
};
