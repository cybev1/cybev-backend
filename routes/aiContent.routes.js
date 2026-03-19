// ============================================
// FILE: aiContent.routes.js
// PATH: /routes/aiContent.routes.js
// CYBEV AI Content Tools — PRODUCTION v2.0
// + Script Writer (DeepSeek AI → structured storyboards)
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
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

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
  script_write: 0,  // Script writing is FREE — only final generation costs
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


// ═══════════════════════════════════════════════════════
//  AI SCRIPT WRITER — DeepSeek generates structured scripts
//  FREE to use (only final generation costs credits)
// ═══════════════════════════════════════════════════════

// DeepSeek / OpenAI fallback for script generation
async function generateScript(systemPrompt, userPrompt) {
  const providers = [
    { name: 'deepseek', url: 'https://api.deepseek.com/v1/chat/completions', key: DEEPSEEK_API_KEY, model: 'deepseek-chat', supportsJson: true },
    { name: 'openai', url: 'https://api.openai.com/v1/chat/completions', key: OPENAI_API_KEY, model: 'gpt-4o-mini', supportsJson: true },
  ];

  const errors = [];

  for (const p of providers) {
    if (!p.key) {
      console.log(`⚠️ Script writer: ${p.name} skipped (no API key)`);
      continue;
    }
    try {
      console.log(`🎬 Script writer: trying ${p.name}...`);
      const body = {
        model: p.model,
        temperature: 0.8,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      };
      // Only add response_format if provider supports it — some DeepSeek versions reject it
      if (p.supportsJson) {
        try {
          body.response_format = { type: 'json_object' };
        } catch {}
      }

      const resp = await axios.post(p.url, body, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.key}` },
        timeout: 90000  // 90s — DeepSeek can be slow
      });

      const text = resp.data.choices?.[0]?.message?.content;
      if (!text) {
        errors.push(`${p.name}: empty response`);
        continue;
      }

      console.log(`✅ Script writer: ${p.name} responded (${text.length} chars)`);

      // Robust JSON extraction — handle markdown blocks, leading text, etc.
      let jsonStr = text;
      // Strip markdown code fences
      jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      // Try to find JSON object in response (some models add preamble)
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);
      console.log(`✅ Script writer: JSON parsed successfully from ${p.name}`);
      return parsed;

    } catch (err) {
      const detail = err.response?.data?.error?.message || err.response?.data?.error || err.message;
      console.error(`❌ Script writer: ${p.name} failed:`, detail);
      errors.push(`${p.name}: ${detail}`);

      // If it's a JSON mode error, retry WITHOUT response_format
      if (err.response?.status === 400 && p.supportsJson) {
        try {
          console.log(`🔄 Script writer: retrying ${p.name} without JSON mode...`);
          const retryResp = await axios.post(p.url, {
            model: p.model, temperature: 0.8, max_tokens: 4096,
            messages: [
              { role: 'system', content: systemPrompt + '\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no extra text.' },
              { role: 'user', content: userPrompt }
            ]
          }, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.key}` },
            timeout: 90000
          });
          const retryText = retryResp.data.choices?.[0]?.message?.content;
          if (retryText) {
            let rJson = retryText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
            const rMatch = rJson.match(/\{[\s\S]*\}/);
            if (rMatch) rJson = rMatch[0];
            const retryParsed = JSON.parse(rJson.trim());
            console.log(`✅ Script writer: retry without JSON mode succeeded for ${p.name}`);
            return retryParsed;
          }
        } catch (retryErr) {
          console.error(`❌ Script writer: ${p.name} retry also failed:`, retryErr.message);
          errors.push(`${p.name} retry: ${retryErr.message}`);
        }
      }
      continue;
    }
  }

  // If no providers had keys at all, give a clear message
  if (!DEEPSEEK_API_KEY && !OPENAI_API_KEY) {
    throw new Error('No AI provider configured. Add DEEPSEEK_API_KEY or OPENAI_API_KEY in Railway environment variables.');
  }

  throw new Error(`All AI providers failed: ${errors.join(' | ')}`);
}


// ─── VIDEO SCRIPT ───
router.post('/script/video', auth, async (req, res) => {
  try {
    const { idea, style, duration = 30, aspectRatio = '16:9' } = req.body;
    if (!idea || idea.trim().length < 3) return res.status(400).json({ error: 'Please provide a brief idea (at least 3 characters)' });

    const sceneDuration = 5;
    const sceneCount = Math.max(2, Math.min(24, Math.round(duration / sceneDuration)));

    const systemPrompt = `You are a professional video storyboard writer for CYBEV Studio. You create detailed scene-by-scene storyboards for AI video generation.

IMPORTANT: Respond with ONLY valid JSON matching this exact structure:
{
  "title": "string — catchy title for the video",
  "totalDuration": ${duration},
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": ${sceneDuration},
      "visual": "string — detailed visual description of what appears on screen (2-3 sentences). Include subjects, environment, lighting, colors.",
      "camera": "string — camera angle/movement (e.g. 'Wide establishing shot, slow pan right', 'Close-up, slight zoom in', 'Aerial drone, tracking forward')",
      "textOverlay": "string or empty — text/caption shown on screen if any",
      "narration": "string or empty — voiceover text if any",
      "transition": "string — transition to next scene (Cut, Fade, Dissolve, Wipe, Zoom)"
    }
  ],
  "musicSuggestion": "string — background music mood/style suggestion",
  "targetAudience": "string — who this video is for"
}

Generate exactly ${sceneCount} scenes. Each scene should be ${sceneDuration} seconds.
Make visuals extremely detailed and specific — these become AI generation prompts.
${style ? `Visual style: ${style}.` : ''}
Aspect ratio: ${aspectRatio}.`;

    const userPrompt = `Create a ${duration}-second video storyboard for this idea:\n\n"${idea.trim()}"`;

    const script = await generateScript(systemPrompt, userPrompt);

    // Validate structure
    if (!script.scenes || !Array.isArray(script.scenes) || script.scenes.length === 0) {
      throw new Error('Invalid script structure returned');
    }

    res.json({
      ok: true,
      script,
      meta: { sceneCount: script.scenes.length, totalDuration: duration, style, aspectRatio }
    });
  } catch (err) {
    console.error('Video script error:', err.message);
    res.status(500).json({ error: 'Failed to generate video script', details: err.message });
  }
});


// ─── MUSIC SCRIPT ───
router.post('/script/music', auth, async (req, res) => {
  try {
    const { idea, genre, mood, duration = 'short', instrumental = false } = req.body;
    if (!idea || idea.trim().length < 3) return res.status(400).json({ error: 'Please provide a brief idea (at least 3 characters)' });

    const isFullSong = duration === 'full';

    const systemPrompt = `You are a professional songwriter and music producer for CYBEV Studio. You write detailed song scripts for AI music generation.

IMPORTANT: Respond with ONLY valid JSON matching this exact structure:
{
  "title": "string — catchy song title",
  "genre": "${genre || 'Based on the idea'}",
  "mood": "${mood || 'Based on the idea'}",
  "tempo": "string — e.g. '120 BPM, medium-fast'",
  "key": "string — musical key e.g. 'C major' or 'A minor'",
  "instruments": ["string array — key instruments"],
  "sections": [
    {
      "type": "string — Intro/Verse 1/Pre-Chorus/Chorus/Verse 2/Bridge/Outro",
      "duration": "string — approximate length e.g. '8 bars' or '15 seconds'",
      ${instrumental ? '"instrumentalNotes": "string — what instruments do here, dynamics, feel"' : '"lyrics": "string — full lyrics for this section",\n      "vocalDirection": "string — how to sing it (e.g. soft and breathy, powerful belt, spoken word)"'},
      "productionNotes": "string — arrangement, effects, energy level"
    }
  ],
  "overallVibe": "string — 1-2 sentence summary of the song's feel and energy",
  "referenceArtists": ["string array — artists with similar style (for AI guidance)"]
}

${isFullSong ? 'Create a full song with Intro, Verse 1, Pre-Chorus, Chorus, Verse 2, Bridge, Final Chorus, Outro.' : 'Create a short piece with Intro, Verse, Chorus, Outro.'}
${genre ? `Genre: ${genre}.` : ''}
${mood ? `Mood: ${mood}.` : ''}
${instrumental ? 'This is an INSTRUMENTAL track — no vocals/lyrics. Focus on instrument descriptions and arrangement.' : 'Include full lyrics — make them creative, emotional, and singable.'}`;

    const userPrompt = `Write a ${isFullSong ? 'full' : 'short 30-second'} ${instrumental ? 'instrumental' : 'song'} script for this idea:\n\n"${idea.trim()}"`;

    const script = await generateScript(systemPrompt, userPrompt);

    if (!script.sections || !Array.isArray(script.sections) || script.sections.length === 0) {
      throw new Error('Invalid script structure returned');
    }

    res.json({
      ok: true,
      script,
      meta: { sectionCount: script.sections.length, duration, genre, mood, instrumental }
    });
  } catch (err) {
    console.error('Music script error:', err.message);
    res.status(500).json({ error: 'Failed to generate music script', details: err.message });
  }
});


// ─── GRAPHICS SCRIPT ───
router.post('/script/graphics', auth, async (req, res) => {
  try {
    const { idea, style, size = '1024x1024' } = req.body;
    if (!idea || idea.trim().length < 3) return res.status(400).json({ error: 'Please provide a brief idea (at least 3 characters)' });

    const systemPrompt = `You are a professional graphic designer and art director for CYBEV Studio. You create detailed visual briefs for AI image generation.

IMPORTANT: Respond with ONLY valid JSON matching this exact structure:
{
  "title": "string — descriptive title for the image",
  "prompt": "string — highly detailed AI image generation prompt (3-5 sentences). Include subject, environment, lighting, colors, textures, composition, mood. Be extremely specific.",
  "negativePrompt": "string — things to avoid (e.g. 'blurry, distorted, text artifacts, low quality')",
  "style": "${style || 'Based on the idea'}",
  "composition": {
    "layout": "string — e.g. 'Rule of thirds, subject centered', 'Golden ratio spiral', 'Symmetrical'",
    "foreground": "string — what's in the foreground",
    "midground": "string — main subject area",
    "background": "string — background elements",
    "focusPoint": "string — where the eye should go first"
  },
  "colorPalette": {
    "primary": "string — dominant color with hex",
    "secondary": "string — secondary color with hex",
    "accent": "string — accent color with hex",
    "mood": "string — overall color mood (warm, cool, vibrant, muted, etc.)"
  },
  "textElements": [
    {
      "text": "string — text to include (or empty array if no text)",
      "position": "string — where on the image",
      "style": "string — font style/weight"
    }
  ],
  "technicalNotes": "string — resolution notes, aspect ratio tips, rendering style details",
  "variations": ["string array — 2-3 alternative prompt angles the user could try"]
}

${style ? `Art style: ${style}.` : ''}
Size: ${size}.
Make the prompt extremely detailed — this goes directly to an AI image generator.`;

    const userPrompt = `Create a detailed visual brief for this graphic idea:\n\n"${idea.trim()}"`;

    const script = await generateScript(systemPrompt, userPrompt);

    if (!script.prompt) {
      throw new Error('Invalid script structure returned');
    }

    res.json({
      ok: true,
      script,
      meta: { style, size }
    });
  } catch (err) {
    console.error('Graphics script error:', err.message);
    res.status(500).json({ error: 'Failed to generate graphics script', details: err.message });
  }
});


// ═══════════════════════════════════════════
//  AI VIDEO GENERATION
// ═══════════════════════════════════════════

router.post('/video/generate', auth, async (req, res) => {
  try {
    const { prompt, duration = 'short', style, aspectRatio = '16:9', sourceImage, script } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = `video_${duration}`;
    const cost = TOKEN_COSTS[costKey] || TOKEN_COSTS.video_short;
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    // If a script was provided, compile scenes into a single rich prompt
    let fullPrompt;
    if (script && script.scenes && Array.isArray(script.scenes)) {
      const sceneDescs = script.scenes.map((s, i) =>
        `Scene ${i + 1}: ${s.visual}. Camera: ${s.camera || 'Standard'}.${s.textOverlay ? ` Text overlay: "${s.textOverlay}"` : ''}`
      ).join(' | ');
      fullPrompt = `${style ? `${style} style. ` : ''}${script.title || ''}: ${sceneDescs}`;
      // Truncate to 2000 chars for model limits
      if (fullPrompt.length > 2000) fullPrompt = fullPrompt.substring(0, 1997) + '...';
    } else {
      fullPrompt = style ? `${style} style. ${prompt}` : prompt;
    }

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
    const { prompt, genre, mood, duration = 'short', instrumental = false, lyrics, script } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = `music_${duration}`;
    const cost = TOKEN_COSTS[costKey] || TOKEN_COSTS.music_short;
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    // Build prompt from script if provided
    let fullPrompt;
    if (script && script.sections && Array.isArray(script.sections)) {
      const parts = [];
      if (script.genre) parts.push(`Genre: ${script.genre}`);
      if (script.mood) parts.push(`Mood: ${script.mood}`);
      if (script.tempo) parts.push(`Tempo: ${script.tempo}`);
      if (script.key) parts.push(`Key: ${script.key}`);
      if (script.instruments) parts.push(`Instruments: ${script.instruments.join(', ')}`);
      if (script.overallVibe) parts.push(script.overallVibe);

      // Compile lyrics/sections
      const sectionDescs = script.sections.map(s => {
        if (s.lyrics) return `[${s.type}] ${s.lyrics}`;
        if (s.instrumentalNotes) return `[${s.type}] ${s.instrumentalNotes}`;
        return `[${s.type}]`;
      }).join(' ');
      parts.push(sectionDescs);

      fullPrompt = parts.join('. ');
      if (fullPrompt.length > 2000) fullPrompt = fullPrompt.substring(0, 1997) + '...';
    } else {
      fullPrompt = prompt;
      if (genre) fullPrompt += `. Genre: ${genre}`;
      if (mood) fullPrompt += `. Mood: ${mood}`;
      if (instrumental) fullPrompt += '. Instrumental only, no vocals';
    }

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
        // Extract lyrics from script if available
        const scriptLyrics = script?.sections?.filter(s => s.lyrics).map(s => `[${s.type}]\n${s.lyrics}`).join('\n\n');
        const sunoRes = await axios.post(
          `${process.env.SUNO_API_BASE_URL || 'https://api.suno.ai/v1'}/generate`,
          { prompt: fullPrompt, make_instrumental: instrumental, custom_lyrics: scriptLyrics || lyrics || undefined },
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
      title: script?.title || `${genre || 'AI'} - ${prompt.substring(0, 40)}`,
      coverArt: null,
      genre: script?.genre || genre || 'Various',
      mood: script?.mood || mood || 'Mixed',
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
    const { prompt, style, size = '1024x1024', count = 1, quality = 'basic', script } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = count > 1 ? 'graphics_batch' : quality === 'hd' ? 'graphics_hd' : 'graphics_basic';
    const cost = TOKEN_COSTS[costKey];
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    // Build prompt from script if provided
    let fullPrompt;
    if (script && script.prompt) {
      fullPrompt = script.prompt;
      // Append composition details for richer prompt
      if (script.composition) {
        const comp = script.composition;
        fullPrompt += `. Composition: ${comp.layout || ''}. Foreground: ${comp.foreground || ''}. Background: ${comp.background || ''}.`;
      }
      if (script.colorPalette?.mood) {
        fullPrompt += ` Color mood: ${script.colorPalette.mood}.`;
      }
      if (script.negativePrompt) {
        fullPrompt += ` Avoid: ${script.negativePrompt}.`;
      }
      if (fullPrompt.length > 2000) fullPrompt = fullPrompt.substring(0, 1997) + '...';
    } else {
      fullPrompt = style ? `${style} style. ${prompt}` : prompt;
    }

    let images = [];
    let provider = 'replicate';

    try {
      // ─── PRIMARY: Replicate Flux ───
      const model = quality === 'hd' ? MODELS.image_quality : MODELS.image_fast;
      const [w, h] = size.split('x').map(Number);

      // Generate images (Flux fast supports batch)
      for (let i = 0; i < count; i++) {
        const prediction = await replicate.run(model, {
          input: {
            prompt: fullPrompt,
            ...(quality === 'hd' ? { width: w, height: h } : { aspect_ratio: w > h ? '16:9' : w < h ? '9:16' : '1:1' }),
            output_format: 'webp',
            output_quality: quality === 'hd' ? 95 : 80,
            num_inference_steps: quality === 'hd' ? 25 : 4,
            ...(script?.negativePrompt ? { negative_prompt: script.negativePrompt } : {})
          }
        });
        const url = extractUrl(prediction);
        if (url) images.push({ url, index: i + 1 });
      }

    } catch (primaryErr) {
      console.error('Replicate image failed, trying OpenAI DALL-E:', primaryErr.message);
      if (!OPENAI_API_KEY) throw primaryErr;
      provider = 'openai';

      // ─── FALLBACK: OpenAI DALL-E ───
      const dalleRes = await axios.post('https://api.openai.com/v1/images/generations', {
        model: 'dall-e-3',
        prompt: fullPrompt,
        n: 1,
        size: size === '1024x1024' ? '1024x1024' : size === '1792x1024' ? '1792x1024' : '1024x1792',
        quality: quality === 'hd' ? 'hd' : 'standard',
        response_format: 'url'
      }, {
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 60000
      });
      images = dalleRes.data.data.map((d, i) => ({ url: d.url, index: i + 1 }));
    }

    if (images.length === 0) throw new Error('No images generated');

    res.json({
      images,
      prompt: fullPrompt,
      style: script?.style || style,
      provider,
      tokensUsed: cost,
      remainingBalance: newBalance
    });
  } catch (err) {
    console.error('AI Graphics error:', err.message);
    if (err.message.includes('Insufficient tokens')) return res.status(402).json({ error: err.message });
    try {
      const costKey = (req.body.count || 1) > 1 ? 'graphics_batch' : (req.body.quality === 'hd' ? 'graphics_hd' : 'graphics_basic');
      await refundTokens(req.user.id, TOKEN_COSTS[costKey]);
    } catch {}
    res.status(500).json({ error: 'Image generation failed', details: err.message });
  }
});


// ═══════════════════════════════════════════
//  BALANCE & PROVIDERS
// ═══════════════════════════════════════════

router.get('/balance', auth, async (req, res) => {
  try {
    const userId = req.user.id;
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
    scriptWriter: {
      deepseek: { configured: !!DEEPSEEK_API_KEY },
      openai: { configured: !!OPENAI_API_KEY }
    },
    costs: TOKEN_COSTS
  });
});

// ─── Test AI providers are actually working ───
router.get('/test', auth, async (req, res) => {
  const results = {
    replicate: { configured: !!process.env.REPLICATE_API_TOKEN, working: false },
    deepseek: { configured: !!DEEPSEEK_API_KEY, working: false },
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

  // Test DeepSeek (for Script Writer)
  if (DEEPSEEK_API_KEY) {
    try {
      await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat', max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }]
      }, {
        headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 10000
      });
      results.deepseek.working = true;
    } catch (e) {
      results.deepseek.error = e.response?.data?.error?.message || e.message?.substring(0, 100);
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
  if (results.deepseek.working) summary.push('Script Writer ✅ (DeepSeek)');
  else if (results.openai.working) summary.push('Script Writer ✅ (OpenAI fallback)');
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
      deepseek: 'Get key at platform.deepseek.com → add DEEPSEEK_API_KEY to Railway (Script Writer)',
      openai: 'Get key at platform.openai.com/api-keys → add OPENAI_API_KEY to Railway (covers images via DALL-E + script fallback)',
      runway: 'Optional: runwayml.com → add RUNWAY_API_KEY (video fallback)',
      suno: 'Optional: suno.ai → add SUNO_API_KEY (music fallback)'
    } : undefined
  });
});

module.exports = router;
