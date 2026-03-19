// ============================================
// FILE: aiContent.routes.js
// PATH: /routes/aiContent.routes.js
// CYBEV AI Content Tools — PRODUCTION
// Primary: Replicate (video, music, images)
// Fallback: Runway ML (video), OpenAI DALL-E (images)
// ============================================
const express = require('express');
const router = express.Router();
// Auth middleware - resilient import matching project pattern
let auth;
try {
  auth = require('../middleware/verifyToken');
} catch (e) {
  try { auth = require('../middleware/auth.middleware'); } catch (e2) {
    try {
      const authModule = require('../middleware/auth');
      auth = authModule.authenticateToken || authModule;
    } catch (e3) {
      auth = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          req.user.id = req.user.userId || req.user.id;
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}
const User = require('../models/user.model');
const Replicate = require('replicate');
const axios = require('axios');
const mongoose = require('mongoose');

// ─── Initialize Replicate client ───
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

// ─── Fallback API keys ───
const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const SUNO_API_KEY = process.env.SUNO_API_KEY || '';

// ─── Replicate model IDs (updated March 2026) ───
const MODELS = {
  video: 'wan-video/wan-2.2-t2v-fast',
  video_hq: 'wan-video/wan-2.5-t2v-fast',
  video_i2v: 'wan-video/wan-2.2-i2v-fast',
  music: 'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedbb',
  image_fast: 'black-forest-labs/flux-schnell',
  image_quality: 'black-forest-labs/flux-1.1-pro',
};

// ─── Token costs ───
const TOKEN_COSTS = {
  video_short: 100,
  video_medium: 200,
  video_long: 500,
  music_short: 50,
  music_full: 150,
  graphics_basic: 20,
  graphics_hd: 50,
  graphics_batch: 80,
};

// ─── Helpers ───
let Wallet;
try { Wallet = require('../models/wallet.model'); } catch (e) { Wallet = mongoose.model('Wallet'); }

async function checkAndDeductTokens(userId, cost) {
  // Admin bypass — admins generate for free (for testing & CYBEV marketing)
  try {
    const user = await User.findById(userId).select('role isAdmin');
    if (user && (user.role === 'admin' || user.isAdmin)) {
      console.log(`🎟️ Admin bypass: skipping ${cost} credit charge for user ${userId}`);
      return 999999;
    }
  } catch {}

  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId, credits: 0, balance: 0 });
  if ((wallet.credits || wallet.balance || 0) < cost) {
    throw new Error(`Insufficient credits. Need ${cost} credits, you have ${wallet.credits || wallet.balance || 0}`);
  }
  await wallet.deductCredits(cost, 'AI_VIDEO', `AI generation: ${cost} credits`);
  return wallet.credits || wallet.balance || 0;
}

async function refundTokens(userId, amount) {
  let wallet = await Wallet.findOne({ user: userId });
  if (wallet) {
    await wallet.addCredits(amount, 'REFUND', `Refund: ${amount} credits (generation failed)`);
  }
}

// Safely extract URL from Replicate output (handles FileOutput, arrays, strings)
function extractUrl(output) {
  if (!output) return null;
  let val = Array.isArray(output) ? output[0] : output;
  if (val && typeof val === 'object') {
    if (typeof val.url === 'function') return val.url();
    if (val.url) return val.url;
  }
  return typeof val === 'string' ? val : String(val);
}


// ═══════════════════════════════════════════
//  AI VIDEO GENERATION
// ═══════════════════════════════════════════

router.post('/video/generate', auth, async (req, res) => {
  try {
    const { prompt, duration = 'short', style, aspectRatio = '16:9', sourceImage } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = `video_${duration}`;
    const cost = TOKEN_COSTS[costKey] || TOKEN_COSTS.video_short;
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    const fullPrompt = style ? `${style} style. ${prompt}` : prompt;
    let prediction;
    let provider = 'replicate';

    try {
      // ─── PRIMARY: Replicate Wan video ───
      const modelId = duration === 'long' ? MODELS.video_hq : MODELS.video;
      const targetModel = sourceImage ? MODELS.video_i2v : modelId;
      const input = { prompt: fullPrompt };
      if (sourceImage) input.image = sourceImage;
      // ~81 frames = 5s at 16fps, ~161 frames = 10s
      input.num_frames = duration === 'short' ? 81 : 161;

      prediction = await replicate.predictions.create({ model: targetModel, input });

    } catch (primaryErr) {
      console.error('Replicate video failed, trying Runway:', primaryErr.message);
      if (!RUNWAY_API_KEY) throw primaryErr;
      provider = 'runway';

      // ─── FALLBACK: Runway ML ───
      const runwayRes = await axios.post('https://api.dev.runwayml.com/v1/image_to_video', {
        model: 'gen3a_turbo',
        promptText: fullPrompt,
        promptImage: sourceImage || undefined,
        watermark: false,
        duration: duration === 'short' ? 5 : 10,
        ratio: aspectRatio === '9:16' ? '768:1280' : '1280:768'
      }, {
        headers: {
          'Authorization': `Bearer ${RUNWAY_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Runway-Version': '2024-11-06'
        }
      });
      prediction = { id: runwayRes.data.id, status: 'processing' };
    }

    res.json({
      taskId: prediction.id,
      status: prediction.status === 'succeeded' ? 'completed' : 'processing',
      videoUrl: extractUrl(prediction.output),
      provider,
      tokensUsed: cost,
      remainingBalance: newBalance,
      prompt: fullPrompt,
      duration
    });
  } catch (err) {
    console.error('AI Video error:', err.message);
    if (err.message.includes('Insufficient tokens')) return res.status(402).json({ error: err.message });
    try { await refundTokens(req.user.id, TOKEN_COSTS[`video_${req.body.duration || 'short'}`] || 100); } catch {}
    res.status(500).json({ error: 'Video generation failed', details: err.message });
  }
});

router.get('/video/status/:taskId', auth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { provider = 'replicate' } = req.query;

    if (provider === 'runway' && RUNWAY_API_KEY) {
      const r = await axios.get(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${RUNWAY_API_KEY}`, 'X-Runway-Version': '2024-11-06' }
      });
      return res.json({
        taskId,
        status: r.data.status === 'SUCCEEDED' ? 'completed' : r.data.status === 'FAILED' ? 'failed' : 'processing',
        videoUrl: r.data.output?.[0] || null,
        progress: r.data.progress || 0,
        provider: 'runway'
      });
    }

    const prediction = await replicate.predictions.get(taskId);
    res.json({
      taskId,
      status: prediction.status === 'succeeded' ? 'completed'
        : (prediction.status === 'failed' || prediction.status === 'canceled') ? 'failed'
        : 'processing',
      videoUrl: prediction.status === 'succeeded' ? extractUrl(prediction.output) : null,
      progress: prediction.status === 'processing' ? 50 : prediction.status === 'succeeded' ? 100 : 0,
      provider: 'replicate'
    });
  } catch (err) {
    console.error('Video status error:', err.message);
    res.status(500).json({ error: 'Failed to check video status' });
  }
});


// ═══════════════════════════════════════════
//  AI MUSIC GENERATION
// ═══════════════════════════════════════════

router.post('/music/generate', auth, async (req, res) => {
  try {
    const { prompt, genre, mood, duration = 'short', instrumental = false, lyrics } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = `music_${duration}`;
    const cost = TOKEN_COSTS[costKey] || TOKEN_COSTS.music_short;
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    let fullPrompt = prompt;
    if (genre) fullPrompt += `. Genre: ${genre}`;
    if (mood) fullPrompt += `. Mood: ${mood}`;
    if (instrumental) fullPrompt += '. Instrumental only, no vocals';

    let prediction;
    let provider = 'replicate';

    try {
      // ─── PRIMARY: Replicate MusicGen ───
      prediction = await replicate.predictions.create({
        version: MODELS.music.split(':')[1],
        input: {
          prompt: fullPrompt,
          model_version: 'stereo-large',
          output_format: 'mp3',
          duration: duration === 'full' ? 30 : 15,
          normalization_strategy: 'peak',
          top_k: 250,
          top_p: 0,
          temperature: 1,
          classifier_free_guidance: 3
        }
      });
    } catch (primaryErr) {
      console.error('Replicate music failed:', primaryErr.message);
      if (SUNO_API_KEY) {
        provider = 'suno';
        const sunoRes = await axios.post(
          `${process.env.SUNO_API_BASE_URL || 'https://api.suno.ai/v1'}/generate`,
          { prompt: fullPrompt, make_instrumental: instrumental, custom_lyrics: lyrics || undefined },
          { headers: { 'Authorization': `Bearer ${SUNO_API_KEY}` }, timeout: 30000 }
        );
        prediction = { id: sunoRes.data.id || sunoRes.data.task_id, status: 'processing' };
      } else {
        throw primaryErr;
      }
    }

    res.json({
      taskId: prediction.id,
      status: prediction.status === 'succeeded' ? 'completed' : 'processing',
      audioUrl: extractUrl(prediction.output),
      title: `${genre || 'AI'} - ${prompt.substring(0, 40)}`,
      coverArt: null,
      genre: genre || 'Various',
      mood: mood || 'Mixed',
      provider,
      tokensUsed: cost,
      remainingBalance: newBalance,
      prompt: fullPrompt
    });
  } catch (err) {
    console.error('AI Music error:', err.message);
    if (err.message.includes('Insufficient tokens')) return res.status(402).json({ error: err.message });
    try { await refundTokens(req.user.id, TOKEN_COSTS[`music_${req.body.duration || 'short'}`] || 50); } catch {}
    res.status(500).json({ error: 'Music generation failed', details: err.message });
  }
});

router.get('/music/status/:taskId', auth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { provider = 'replicate' } = req.query;

    if (provider === 'suno' && SUNO_API_KEY) {
      try {
        const r = await axios.get(
          `${process.env.SUNO_API_BASE_URL || 'https://api.suno.ai/v1'}/status/${taskId}`,
          { headers: { 'Authorization': `Bearer ${SUNO_API_KEY}` } }
        );
        return res.json({
          taskId,
          status: r.data.status === 'complete' ? 'completed' : r.data.status === 'error' ? 'failed' : 'processing',
          audioUrl: r.data.audio_url || null,
          coverArt: r.data.image_url || null,
          title: r.data.title || null,
          provider: 'suno'
        });
      } catch {}
    }

    const prediction = await replicate.predictions.get(taskId);
    res.json({
      taskId,
      status: prediction.status === 'succeeded' ? 'completed'
        : (prediction.status === 'failed' || prediction.status === 'canceled') ? 'failed'
        : 'processing',
      audioUrl: prediction.status === 'succeeded' ? extractUrl(prediction.output) : null,
      progress: prediction.status === 'processing' ? 50 : prediction.status === 'succeeded' ? 100 : 0,
      provider: 'replicate'
    });
  } catch (err) {
    console.error('Music status error:', err.message);
    res.status(500).json({ error: 'Failed to check music status' });
  }
});


// ═══════════════════════════════════════════
//  AI GRAPHICS GENERATION
// ═══════════════════════════════════════════

router.post('/graphics/generate', auth, async (req, res) => {
  try {
    const { prompt, style, size = '1024x1024', count = 1, quality = 'basic' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = count > 1 ? 'graphics_batch' : quality === 'hd' ? 'graphics_hd' : 'graphics_basic';
    const cost = TOKEN_COSTS[costKey];
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    const fullPrompt = style ? `${style} style: ${prompt}` : prompt;
    const aspectMap = { '1024x1024': '1:1', '1792x1024': '16:9', '1024x1792': '9:16' };
    const aspect_ratio = aspectMap[size] || '1:1';

    let images = [];
    let provider = 'replicate';

    try {
      // ─── PRIMARY: Replicate Flux ───
      const modelId = quality === 'hd' ? MODELS.image_quality : MODELS.image_fast;
      const numImages = Math.min(count, 4);

      // Run images in parallel
      const promises = Array.from({ length: numImages }, () =>
        replicate.run(modelId, {
          input: {
            prompt: fullPrompt,
            aspect_ratio,
            num_outputs: 1,
            output_format: 'webp',
            output_quality: quality === 'hd' ? 95 : 80
          }
        })
      );

      const results = await Promise.allSettled(promises);
      images = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => ({ url: extractUrl(r.value) }));

    } catch (primaryErr) {
      console.error('Replicate images failed, trying OpenAI:', primaryErr.message);
      if (!OPENAI_API_KEY) throw primaryErr;
      provider = 'openai';

      // ─── FALLBACK: OpenAI DALL-E 3 ───
      const dalleRes = await axios.post('https://api.openai.com/v1/images/generations', {
        model: 'dall-e-3',
        prompt: fullPrompt,
        n: 1,
        size: ['1792x1024', '1024x1792'].includes(size) ? size : '1024x1024',
        quality: quality === 'hd' ? 'hd' : 'standard'
      }, {
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }
      });
      images = dalleRes.data.data.map(img => ({ url: img.url, revisedPrompt: img.revised_prompt }));
    }

    if (images.length === 0) {
      await refundTokens(req.user.id, cost);
      return res.status(500).json({ error: 'No images were generated' });
    }

    res.json({
      status: 'completed',
      images,
      provider,
      tokensUsed: cost,
      remainingBalance: newBalance,
      prompt: fullPrompt,
      style,
      size
    });
  } catch (err) {
    console.error('AI Graphics error:', err.message);
    if (err.message.includes('Insufficient tokens')) return res.status(402).json({ error: err.message });
    try { await refundTokens(req.user.id, TOKEN_COSTS.graphics_basic); } catch {}
    res.status(500).json({ error: 'Graphics generation failed', details: err.message });
  }
});


// ═══════════════════════════════════════════
//  BALANCE & PROVIDER STATUS
// ═══════════════════════════════════════════

router.get('/balance', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    let wallet;
    try { wallet = await Wallet.findOne({ user: userId }); } catch {}
    res.json({ balance: wallet?.credits || wallet?.balance || 0, costs: TOKEN_COSTS });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

router.get('/providers', auth, async (req, res) => {
  res.json({
    primary: {
      name: 'Replicate',
      configured: !!process.env.REPLICATE_API_TOKEN,
      models: { video: MODELS.video, music: 'meta/musicgen', images: MODELS.image_fast }
    },
    fallbacks: {
      runway: { configured: !!RUNWAY_API_KEY, covers: ['video'] },
      openai: { configured: !!OPENAI_API_KEY, covers: ['images'] },
      suno: { configured: !!SUNO_API_KEY, covers: ['music'] }
    },
    costs: TOKEN_COSTS
  });
});

// ─── Test AI providers are actually working ───
router.get('/test', auth, async (req, res) => {
  const results = {
    replicate: { configured: !!process.env.REPLICATE_API_TOKEN, working: false },
    runway: { configured: !!RUNWAY_API_KEY, working: false },
    openai: { configured: !!OPENAI_API_KEY, working: false },
    suno: { configured: !!SUNO_API_KEY, working: false }
  };

  // Test Replicate
  if (process.env.REPLICATE_API_TOKEN) {
    try {
      const r = await replicate.predictions.list();
      results.replicate.working = true;
      results.replicate.recentJobs = r?.results?.length || 0;
    } catch (e) {
      results.replicate.error = e.message?.substring(0, 100);
    }
  }

  // Test OpenAI (for DALL-E)
  if (OPENAI_API_KEY) {
    try {
      await axios.get('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }, timeout: 10000
      });
      results.openai.working = true;
    } catch (e) {
      results.openai.error = e.response?.data?.error?.message || e.message?.substring(0, 100);
    }
  }

  const anyWorking = Object.values(results).some(r => r.working);
  const summary = [];
  if (results.replicate.working) summary.push('Video ✅ Music ✅ Images ✅ (Replicate)');
  else if (results.openai.working) summary.push('Images ✅ (OpenAI DALL-E)');
  if (!anyWorking) summary.push('⚠️ No providers working — add REPLICATE_API_TOKEN to Railway env vars');

  // Check admin status
  let isAdmin = false;
  try { const u = await User.findById(req.user.id).select('role isAdmin'); isAdmin = u?.role === 'admin' || u?.isAdmin; } catch {}

  res.json({
    ok: true,
    anyWorking,
    isAdmin,
    adminBypass: isAdmin ? 'Credits bypassed — you generate for free' : 'Normal billing applies',
    summary: summary.join(', '),
    providers: results,
    costs: TOKEN_COSTS,
    setupGuide: !anyWorking ? {
      replicate: 'Get token at replicate.com/account/api-tokens → add REPLICATE_API_TOKEN to Railway',
      openai: 'Get key at platform.openai.com/api-keys → add OPENAI_API_KEY to Railway (covers images via DALL-E)',
      runway: 'Optional: runwayml.com → add RUNWAY_API_KEY (video fallback)',
      suno: 'Optional: suno.ai → add SUNO_API_KEY (music fallback)'
    } : undefined
  });
});

module.exports = router;
