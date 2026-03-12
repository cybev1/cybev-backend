// ============================================
// FILE: aiContent.routes.js
// PATH: /routes/aiContent.routes.js
// CYBEV AI Content Tools — Video, Music, Graphics
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/user.model');
const axios = require('axios');

// ─── AI Provider Config ───
// Set these in your .env file
const AI_CONFIG = {
  // Video generation (Runway ML, Pika, Kling, etc.)
  video: {
    provider: process.env.AI_VIDEO_PROVIDER || 'runway', // 'runway' | 'pika' | 'kling' | 'mock'
    apiKey: process.env.AI_VIDEO_API_KEY || '',
    baseUrl: process.env.AI_VIDEO_BASE_URL || 'https://api.dev.runwayml.com/v1'
  },
  // Music generation (Suno, Udio, etc.)
  music: {
    provider: process.env.AI_MUSIC_PROVIDER || 'suno', // 'suno' | 'udio' | 'mock'
    apiKey: process.env.AI_MUSIC_API_KEY || '',
    baseUrl: process.env.AI_MUSIC_BASE_URL || 'https://api.suno.ai/v1'
  },
  // Image/Graphics generation (DALL-E, Flux, Stable Diffusion, etc.)
  graphics: {
    provider: process.env.AI_GRAPHICS_PROVIDER || 'deepseek', // 'openai' | 'stability' | 'flux' | 'deepseek' | 'mock'
    apiKey: process.env.AI_GRAPHICS_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.AI_GRAPHICS_BASE_URL || ''
  }
};

// ─── Token costs ───
const TOKEN_COSTS = {
  video_short: 100,   // 5-sec clip
  video_medium: 200,  // 15-sec clip
  video_long: 500,    // 30-60 sec
  music_short: 50,    // 30-sec song
  music_full: 150,    // Full song (2-4 min)
  graphics_basic: 20, // Single image
  graphics_hd: 50,    // HD image
  graphics_batch: 80  // 4 images
};

// ─── Helper: Check token balance ───
async function checkAndDeductTokens(userId, cost) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if ((user.tokenBalance || 0) < cost) {
    throw new Error(`Insufficient tokens. Need ${cost}, have ${user.tokenBalance || 0}`);
  }
  user.tokenBalance = (user.tokenBalance || 0) - cost;
  await user.save();
  return user.tokenBalance;
}

// ─── Helper: Refund tokens on failure ───
async function refundTokens(userId, amount) {
  await User.findByIdAndUpdate(userId, { $inc: { tokenBalance: amount } });
}

// ═══════════════════════════════════════════
// AI VIDEO MAKER
// ═══════════════════════════════════════════

// POST /api/ai-content/video/generate
router.post('/video/generate', auth, async (req, res) => {
  try {
    const { prompt, duration = 'short', style, aspectRatio = '16:9', sourceImage } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = `video_${duration}`;
    const cost = TOKEN_COSTS[costKey] || TOKEN_COSTS.video_short;

    // Deduct tokens
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    let result;
    const provider = AI_CONFIG.video.provider;

    if (provider === 'runway') {
      // Runway ML Gen-3 API
      const response = await axios.post(`${AI_CONFIG.video.baseUrl}/image_to_video`, {
        model: 'gen3a_turbo',
        promptText: prompt,
        promptImage: sourceImage || undefined,
        watermark: false,
        duration: duration === 'short' ? 5 : duration === 'medium' ? 10 : 10,
        ratio: aspectRatio === '9:16' ? '768:1280' : '1280:768'
      }, {
        headers: {
          'Authorization': `Bearer ${AI_CONFIG.video.apiKey}`,
          'Content-Type': 'application/json',
          'X-Runway-Version': '2024-11-06'
        }
      });
      result = { taskId: response.data.id, status: 'processing', provider: 'runway' };

    } else if (provider === 'mock') {
      // Mock for development/testing
      result = {
        taskId: `mock_${Date.now()}`,
        status: 'completed',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400',
        provider: 'mock'
      };
    } else {
      // Generic API call for other providers
      result = { taskId: `gen_${Date.now()}`, status: 'processing', provider };
    }

    res.json({
      ...result,
      tokensUsed: cost,
      remainingBalance: newBalance,
      prompt,
      duration,
      style
    });

  } catch (err) {
    console.error('AI Video generation error:', err);
    if (err.message.includes('Insufficient tokens')) {
      return res.status(402).json({ error: err.message });
    }
    // Refund on API failure
    try { await refundTokens(req.user.id, TOKEN_COSTS[`video_${req.body.duration || 'short'}`] || 100); } catch {}
    res.status(500).json({ error: 'Video generation failed', details: err.message });
  }
});

// GET /api/ai-content/video/status/:taskId
router.get('/video/status/:taskId', auth, async (req, res) => {
  try {
    const { taskId } = req.params;

    if (taskId.startsWith('mock_')) {
      return res.json({
        taskId,
        status: 'completed',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400'
      });
    }

    if (AI_CONFIG.video.provider === 'runway') {
      const response = await axios.get(`${AI_CONFIG.video.baseUrl}/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${AI_CONFIG.video.apiKey}`,
          'X-Runway-Version': '2024-11-06'
        }
      });
      const task = response.data;
      res.json({
        taskId,
        status: task.status === 'SUCCEEDED' ? 'completed' : task.status === 'FAILED' ? 'failed' : 'processing',
        videoUrl: task.output?.[0] || null,
        progress: task.progress || 0
      });
    } else {
      res.json({ taskId, status: 'processing', progress: 50 });
    }
  } catch (err) {
    console.error('Video status error:', err);
    res.status(500).json({ error: 'Failed to check video status' });
  }
});

// ═══════════════════════════════════════════
// AI SONG COMPOSER
// ═══════════════════════════════════════════

// POST /api/ai-content/music/generate
router.post('/music/generate', auth, async (req, res) => {
  try {
    const { prompt, genre, mood, duration = 'short', instrumental = false, lyrics } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = `music_${duration}`;
    const cost = TOKEN_COSTS[costKey] || TOKEN_COSTS.music_short;

    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    let result;
    const provider = AI_CONFIG.music.provider;

    if (provider === 'suno') {
      const response = await axios.post(`${AI_CONFIG.music.baseUrl}/generate`, {
        prompt: `${prompt}${genre ? `. Genre: ${genre}` : ''}${mood ? `. Mood: ${mood}` : ''}`,
        make_instrumental: instrumental,
        custom_lyrics: lyrics || undefined,
        duration: duration === 'full' ? 240 : 60
      }, {
        headers: {
          'Authorization': `Bearer ${AI_CONFIG.music.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      result = { taskId: response.data.id || response.data.task_id, status: 'processing', provider: 'suno' };

    } else if (provider === 'mock') {
      result = {
        taskId: `mock_song_${Date.now()}`,
        status: 'completed',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        title: `AI Song: ${prompt.substring(0, 50)}`,
        coverArt: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400',
        genre: genre || 'Pop',
        duration: duration === 'full' ? 180 : 60,
        provider: 'mock'
      };
    } else {
      result = { taskId: `gen_${Date.now()}`, status: 'processing', provider };
    }

    res.json({
      ...result,
      tokensUsed: cost,
      remainingBalance: newBalance,
      prompt,
      genre,
      mood
    });

  } catch (err) {
    console.error('AI Music generation error:', err);
    if (err.message.includes('Insufficient tokens')) {
      return res.status(402).json({ error: err.message });
    }
    try { await refundTokens(req.user.id, TOKEN_COSTS[`music_${req.body.duration || 'short'}`] || 50); } catch {}
    res.status(500).json({ error: 'Music generation failed', details: err.message });
  }
});

// GET /api/ai-content/music/status/:taskId
router.get('/music/status/:taskId', auth, async (req, res) => {
  try {
    const { taskId } = req.params;

    if (taskId.startsWith('mock_')) {
      return res.json({
        taskId,
        status: 'completed',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        coverArt: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400'
      });
    }

    // Suno or other provider status check
    res.json({ taskId, status: 'processing', progress: 50 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check music status' });
  }
});

// ═══════════════════════════════════════════
// AI GRAPHICS GENERATOR
// ═══════════════════════════════════════════

// POST /api/ai-content/graphics/generate
router.post('/graphics/generate', auth, async (req, res) => {
  try {
    const { prompt, style, size = '1024x1024', count = 1, quality = 'basic' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = count > 1 ? 'graphics_batch' : quality === 'hd' ? 'graphics_hd' : 'graphics_basic';
    const cost = TOKEN_COSTS[costKey];

    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    let result;
    const provider = AI_CONFIG.graphics.provider;

    if (provider === 'openai') {
      const response = await axios.post('https://api.openai.com/v1/images/generations', {
        model: 'dall-e-3',
        prompt: `${style ? `${style} style: ` : ''}${prompt}`,
        n: Math.min(count, 4),
        size: size,
        quality: quality === 'hd' ? 'hd' : 'standard'
      }, {
        headers: {
          'Authorization': `Bearer ${AI_CONFIG.graphics.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      result = {
        status: 'completed',
        images: response.data.data.map(img => ({
          url: img.url,
          revisedPrompt: img.revised_prompt
        })),
        provider: 'openai'
      };

    } else if (provider === 'stability') {
      const response = await axios.post('https://api.stability.ai/v2beta/stable-image/generate/core', {
        prompt: `${style ? `${style} style: ` : ''}${prompt}`,
        output_format: 'png',
        aspect_ratio: size === '1024x1024' ? '1:1' : size === '1792x1024' ? '16:9' : '1:1'
      }, {
        headers: {
          'Authorization': `Bearer ${AI_CONFIG.graphics.apiKey}`,
          'Accept': 'application/json'
        }
      });
      result = {
        status: 'completed',
        images: [{ url: `data:image/png;base64,${response.data.image}` }],
        provider: 'stability'
      };

    } else if (provider === 'mock') {
      const mockImages = [
        'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1024',
        'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=1024',
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1024',
        'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1024',
      ];
      result = {
        status: 'completed',
        images: mockImages.slice(0, count).map(url => ({ url, revisedPrompt: prompt })),
        provider: 'mock'
      };
    } else {
      result = { status: 'completed', images: [], provider };
    }

    res.json({
      ...result,
      tokensUsed: cost,
      remainingBalance: newBalance,
      prompt,
      style,
      size
    });

  } catch (err) {
    console.error('AI Graphics generation error:', err);
    if (err.message.includes('Insufficient tokens')) {
      return res.status(402).json({ error: err.message });
    }
    try { await refundTokens(req.user.id, TOKEN_COSTS.graphics_basic); } catch {}
    res.status(500).json({ error: 'Graphics generation failed', details: err.message });
  }
});

// ═══════════════════════════════════════════
// TOKEN BALANCE
// ═══════════════════════════════════════════

// GET /api/ai-content/balance
router.get('/balance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('tokenBalance');
    res.json({
      balance: user?.tokenBalance || 0,
      costs: TOKEN_COSTS
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

module.exports = router;
