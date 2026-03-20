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

CRITICAL RULES FOR VISUAL DESCRIPTIONS:
- The "visual" field is sent directly to an AI video generator that CANNOT render text.
- NEVER describe text, words, letters, titles, logos, captions, URLs, or written content in the "visual" field.
- NEVER write things like "text appears saying..." or "title card reads..." or "logo of..." in visuals.
- Instead, describe ONLY what the camera sees: people, environments, lighting, colors, actions, expressions.
- If text/titles are needed, put them in "textOverlay" (these get burned on separately by software).

IMPORTANT: Respond with ONLY valid JSON matching this exact structure:
{
  "title": "string — catchy title for the video",
  "totalDuration": ${duration},
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": ${sceneDuration},
      "visual": "string — PURE VISUAL description only (2-3 sentences). Describe people, places, lighting, colors, actions. NO text/words/logos/titles.",
      "camera": "string — camera angle/movement (e.g. 'Wide establishing shot, slow pan right', 'Close-up, slight zoom in', 'Aerial drone, tracking forward')",
      "textOverlay": "string or empty — clean text caption to burn on screen via software (short, max 8 words)",
      "narration": "string — voiceover script that a narrator will SPEAK ALOUD for this scene (1-2 sentences, natural speech)",
      "transition": "string — transition to next scene (Cut, Fade, Dissolve, Wipe, Zoom)"
    }
  ],
  "musicSuggestion": "string — background music mood/style suggestion",
  "targetAudience": "string — who this video is for"
}

Generate exactly ${sceneCount} scenes. Each scene should be ${sceneDuration} seconds.
Make visuals extremely detailed — describe the IMAGERY, not text. Every scene MUST have narration text (this becomes the spoken voiceover).
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
//  AI VIDEO GENERATION — Scene-by-scene
//  Each scene = separate 5s Replicate prediction
// ═══════════════════════════════════════════

router.post('/video/generate', auth, async (req, res) => {
  try {
    const { prompt, duration = 'short', style, aspectRatio = '16:9', sourceImage, script } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const costKey = `video_${duration}`;
    const cost = TOKEN_COSTS[costKey] || TOKEN_COSTS.video_short;
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    // ─── MULTI-SCENE: Generate each scene separately ───
    if (script && script.scenes && Array.isArray(script.scenes) && script.scenes.length > 1) {
      console.log(`🎬 Multi-scene generation: ${script.scenes.length} scenes for "${script.title || prompt}"`);
      const tasks = [];
      let provider = 'replicate';

      for (let i = 0; i < script.scenes.length; i++) {
        const scene = script.scenes[i];
        const scenePrompt = `${style ? `${style} style. ` : ''}${scene.visual}${scene.camera ? `. Camera: ${scene.camera}` : ''}. Photorealistic quality. IMPORTANT: Do not render any text, words, letters, titles, captions, watermarks, logos, or written content anywhere in the frame. Pure visual imagery only.`;

        // Wait 11s between predictions (Replicate: 6 requests/min, burst of 1)
        if (i > 0) {
          console.log(`  ⏳ Waiting 11s before scene ${i + 1} (rate limit: 6/min)...`);
          await new Promise(r => setTimeout(r, 11000));
        }

        try {
          const modelId = MODELS.video;
          const prediction = await replicate.predictions.create({
            model: sourceImage ? MODELS.video_i2v : modelId,
            input: {
              prompt: scenePrompt.substring(0, 2000),
              num_frames: 81,
              ...(sourceImage && i === 0 ? { image: sourceImage } : {})
            }
          });
          tasks.push({
            taskId: prediction.id,
            sceneNumber: i + 1,
            status: prediction.status === 'succeeded' ? 'completed' : 'processing',
            videoUrl: extractUrl(prediction.output),
            prompt: scenePrompt.substring(0, 200)
          });
          console.log(`  📹 Scene ${i + 1}/${script.scenes.length}: prediction ${prediction.id} created`);
        } catch (sceneErr) {
          console.error(`  ❌ Scene ${i + 1} failed:`, sceneErr.message);

          // Parse retry_after from Replicate's 429 response
          let retryWait = 12000; // default 12s
          const retryMatch = sceneErr.message?.match(/resets in ~(\d+)s/);
          if (retryMatch) retryWait = (parseInt(retryMatch[1]) + 2) * 1000; // add 2s buffer

          if (sceneErr.message?.includes('429') || sceneErr.message?.includes('rate') || sceneErr.message?.includes('throttled')) {
            console.log(`  ⏳ Rate limited, waiting ${retryWait / 1000}s then retrying scene ${i + 1}...`);
            await new Promise(r => setTimeout(r, retryWait));
            try {
              const retryPred = await replicate.predictions.create({
                model: MODELS.video,
                input: { prompt: scenePrompt.substring(0, 2000), num_frames: 81 }
              });
              tasks.push({
                taskId: retryPred.id,
                sceneNumber: i + 1,
                status: 'processing',
                videoUrl: null,
                prompt: scenePrompt.substring(0, 200)
              });
              console.log(`  📹 Scene ${i + 1} retry succeeded: ${retryPred.id}`);
              continue;
            } catch (retryErr) {
              console.error(`  ❌ Scene ${i + 1} retry also failed:`, retryErr.message);
            }
          }
          tasks.push({
            taskId: null,
            sceneNumber: i + 1,
            status: 'failed',
            videoUrl: null,
            error: sceneErr.message
          });
        }
      }

      return res.json({
        mode: 'multi',
        tasks,
        totalScenes: script.scenes.length,
        title: script.title || prompt,
        provider,
        tokensUsed: cost,
        remainingBalance: newBalance
      });
    }

    // ─── SINGLE SCENE: Standard generation ───
    let fullPrompt = style ? `${style} style. ${prompt}` : prompt;
    let prediction;
    let provider = 'replicate';

    try {
      const modelId = duration === 'long' ? MODELS.video_hq : MODELS.video;
      const targetModel = sourceImage ? MODELS.video_i2v : modelId;
      const input = { prompt: fullPrompt };
      if (sourceImage) input.image = sourceImage;
      input.num_frames = duration === 'short' ? 81 : 161;

      prediction = await replicate.predictions.create({ model: targetModel, input });
    } catch (primaryErr) {
      console.error('Replicate video failed, trying Runway:', primaryErr.message);
      if (!RUNWAY_API_KEY) throw primaryErr;
      provider = 'runway';

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
      mode: 'single',
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

// ─── BATCH STATUS: Check multiple scene predictions at once ───
router.post('/video/status/batch', auth, async (req, res) => {
  try {
    const { taskIds, provider = 'replicate' } = req.body;
    if (!taskIds || !Array.isArray(taskIds)) return res.status(400).json({ error: 'taskIds array required' });

    const results = [];
    for (const taskId of taskIds) {
      if (!taskId) { results.push({ taskId, status: 'failed' }); continue; }
      try {
        if (provider === 'runway' && RUNWAY_API_KEY) {
          const r = await axios.get(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${RUNWAY_API_KEY}`, 'X-Runway-Version': '2024-11-06' }
          });
          results.push({
            taskId,
            status: r.data.status === 'SUCCEEDED' ? 'completed' : r.data.status === 'FAILED' ? 'failed' : 'processing',
            videoUrl: r.data.output?.[0] || null
          });
        } else {
          const prediction = await replicate.predictions.get(taskId);
          results.push({
            taskId,
            status: prediction.status === 'succeeded' ? 'completed'
              : (prediction.status === 'failed' || prediction.status === 'canceled') ? 'failed'
              : 'processing',
            videoUrl: prediction.status === 'succeeded' ? extractUrl(prediction.output) : null
          });
        }
      } catch (e) {
        results.push({ taskId, status: 'failed', error: e.message });
      }
    }

    const completed = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const total = results.length;

    res.json({
      results,
      summary: { total, completed, failed, processing: total - completed - failed },
      allDone: completed + failed === total,
      progress: Math.round((completed / total) * 100)
    });
  } catch (err) {
    console.error('Batch status error:', err.message);
    res.status(500).json({ error: 'Failed to check batch status' });
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
//  VIDEO MERGE + VOICEOVER
//  Concatenate scene clips + optional TTS narration
//  Uses ffmpeg + OpenAI TTS + Cloudinary
// ═══════════════════════════════════════════

// Generate TTS audio from text using OpenAI
// NOTE: accentHint is ONLY used in voice previews, NOT here.
// OpenAI TTS literally reads all input text — it doesn't interpret instructions.
async function generateTTS(text, voiceId = 'nova', tmpDir) {
  if (!OPENAI_API_KEY || !text?.trim()) return null;
  const fs = require('fs');
  const path = require('path');
  const config = VOICE_CONFIG[voiceId] || VOICE_CONFIG['nova'];
  try {
    const resp = await axios.post('https://api.openai.com/v1/audio/speech', {
      model: 'tts-1-hd',
      voice: config.voice,
      input: text.trim(),
      response_format: 'mp3',
      speed: config.speed || 1.0
    }, {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: 30000
    });
    const audioPath = path.join(tmpDir, `tts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`);
    fs.writeFileSync(audioPath, resp.data);
    return audioPath;
  } catch (e) {
    console.error('  ❌ TTS failed:', e.response?.data ? Buffer.from(e.response.data).toString() : e.message);
    return null;
  }
}

router.post('/video/merge', auth, async (req, res) => {
  try {
    const {
      videoUrls, title = 'CYBEV-video', narrations, textOverlays,
      voice = 'nova', addVoiceover = false,
      autoCaptions = false, textStyle = 'dynamic',
      logoUrl, logoPosition = 'top-right', logoSize = 80, logoOpacity = 0.8,
      introImageUrl, outroImageUrl, introDuration = 3, outroDuration = 3
    } = req.body;
    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length < 2) {
      return res.status(400).json({ error: 'At least 2 video URLs required' });
    }

    console.log(`🎬 Merging ${videoUrls.length} clips for "${title}"${addVoiceover ? ` with ${voice} voiceover` : ''}`);
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');

    try { execSync('ffmpeg -version', { stdio: 'ignore' }); } catch {
      return res.status(500).json({ error: 'ffmpeg not available on server. Contact admin.' });
    }

    const tmpDir = path.join('/tmp', `merge-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. Download all clips
    const clipPaths = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];
      if (!url) continue;
      const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
      try {
        const resp = await axios({ url, responseType: 'arraybuffer', timeout: 60000 });
        fs.writeFileSync(clipPath, resp.data);
        clipPaths.push(clipPath);
        console.log(`  📥 Downloaded clip ${i + 1}/${videoUrls.length}`);
      } catch (e) {
        console.error(`  ❌ Failed to download clip ${i + 1}:`, e.message);
      }
    }

    if (clipPaths.length < 1) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res.status(400).json({ error: 'No clips could be downloaded' });
    }

    // 2. Generate TTS for each scene's narration (if voiceover enabled)
    let ttsAudioPaths = [];
    if (addVoiceover && narrations && Array.isArray(narrations)) {
      console.log(`  🎤 Generating ${voice} voiceover for ${narrations.filter(n => n?.trim()).length} narrations...`);
      for (let i = 0; i < narrations.length; i++) {
        const narrationText = narrations[i];
        if (narrationText?.trim()) {
          const audioPath = await generateTTS(narrationText, voice, tmpDir);
          ttsAudioPaths.push(audioPath);
          if (audioPath) console.log(`  🎤 TTS scene ${i + 1}: "${narrationText.substring(0, 60)}..."`);
        } else {
          ttsAudioPaths.push(null); // no narration for this scene
        }
      }
    }

    // 3. Re-encode clips + overlay TTS per-scene
    //    KEY FIX: AI-generated videos have NO audio track, so we can't amix — just add TTS as the audio
    const normalizedPaths = [];
    for (let i = 0; i < clipPaths.length; i++) {
      const outPath = path.join(tmpDir, `norm-${i}.ts`);
      const ttsPath = ttsAudioPaths[i];
      const scaleFilter = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2';

      // Check if source video has an audio track
      let hasAudioTrack = false;
      try {
        const probeResult = execSync(
          `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${clipPaths[i]}"`,
          { timeout: 10000 }
        ).toString().trim();
        hasAudioTrack = probeResult.includes('audio');
      } catch {}

      try {
        if (ttsPath && fs.existsSync(ttsPath)) {
          if (hasAudioTrack) {
            // Source has audio — mix TTS with original (original at 15% volume)
            execSync(
              `ffmpeg -y -i "${clipPaths[i]}" -i "${ttsPath}" -filter_complex "[0:a]volume=0.15[bg];[1:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v libx264 -preset fast -crf 23 -r 16 -vf "${scaleFilter}" -c:a aac -ar 44100 -ac 2 -b:a 128k -f mpegts "${outPath}"`,
              { stdio: 'ignore', timeout: 120000 }
            );
          } else {
            // Source has NO audio — use TTS as sole audio track (most common for AI video)
            execSync(
              `ffmpeg -y -i "${clipPaths[i]}" -i "${ttsPath}" -map 0:v -map 1:a -c:v libx264 -preset fast -crf 23 -r 16 -vf "${scaleFilter}" -c:a aac -ar 44100 -ac 2 -b:a 128k -shortest -f mpegts "${outPath}"`,
              { stdio: 'ignore', timeout: 120000 }
            );
          }
          console.log(`  ✅ Clip ${i + 1}: video + voiceover`);
        } else {
          // No TTS for this scene — add silent audio track so concat works
          execSync(
            `ffmpeg -y -i "${clipPaths[i]}" -f lavfi -i anullsrc=r=44100:cl=stereo -map 0:v -map 1:a -c:v libx264 -preset fast -crf 23 -r 16 -vf "${scaleFilter}" -c:a aac -ar 44100 -ac 2 -b:a 128k -shortest -f mpegts "${outPath}"`,
            { stdio: 'ignore', timeout: 120000 }
          );
          console.log(`  ✅ Clip ${i + 1}: video + silence`);
        }
        normalizedPaths.push(outPath);
      } catch (e) {
        console.error(`  ❌ Failed to process clip ${i + 1}:`, e.message?.substring(0, 200));
        // Last resort fallback — just encode video with silent audio
        try {
          execSync(
            `ffmpeg -y -i "${clipPaths[i]}" -f lavfi -i anullsrc=r=44100:cl=stereo -map 0:v -map 1:a -c:v libx264 -preset fast -crf 23 -r 16 -vf "${scaleFilter}" -c:a aac -shortest -f mpegts "${outPath}"`,
            { stdio: 'ignore', timeout: 120000 }
          );
          normalizedPaths.push(outPath);
          console.log(`  ⚠️ Clip ${i + 1}: fallback (video + silence)`);
        } catch (e2) {
          console.error(`  ❌ Clip ${i + 1} total failure:`, e2.message?.substring(0, 100));
        }
      }
    }

    if (normalizedPaths.length < 1) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Failed to process video clips' });
    }

    // 4. Concatenate
    const mergedPath = path.join(tmpDir, 'merged.mp4');
    const concatInput = normalizedPaths.join('|');
    try {
      execSync(
        `ffmpeg -y -i "concat:${concatInput}" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart "${mergedPath}"`,
        { stdio: 'ignore', timeout: 300000 }
      );
    } catch (e) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Failed to merge video clips', details: e.message });
    }

    const mergedStats = fs.statSync(mergedPath);
    console.log(`  ✅ Merged video: ${(mergedStats.size / 1024 / 1024).toFixed(1)}MB${addVoiceover ? ' (with voiceover)' : ''}`);

    // 5. Dynamic text overlays + auto-captions via ffmpeg drawtext
    let finalVideoPath = mergedPath;
    const sceneDuration = 5;
    const allFilters = [];

    // ─── DYNAMIC TEXT OVERLAYS (titles/highlights per scene) ───
    if (textOverlays && Array.isArray(textOverlays) && textOverlays.some(t => t?.trim())) {
      // Cycle through different visual styles per scene for variety
      const styles = [
        // Style 0: Center bold with dark background box — impact title
        (text, start, end) => `drawtext=text='${text}':fontsize=52:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=20:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${start + 0.3},${end - 0.3})'`,
        // Style 1: Top-left accent bar — news-style lower third
        (text, start, end) => `drawtext=text='${text}':fontsize=40:fontcolor=white:box=1:boxcolor=0x7C3AED@0.85:boxborderw=15:x=40:y=h-120:enable='between(t,${start + 0.2},${end - 0.2})'`,
        // Style 2: Bottom center with gradient-like double box
        (text, start, end) => `drawtext=text='${text}':fontsize=44:fontcolor=white:box=1:boxcolor=0xE11D48@0.80:boxborderw=18:x=(w-text_w)/2:y=h-100:enable='between(t,${start + 0.3},${end - 0.3})'`,
        // Style 3: Top banner — full width feel
        (text, start, end) => `drawtext=text='${text}':fontsize=38:fontcolor=white:box=1:boxcolor=0x1E40AF@0.85:boxborderw=16:x=(w-text_w)/2:y=30:enable='between(t,${start + 0.2},${end - 0.3})'`,
        // Style 4: Center large — cinematic
        (text, start, end) => `drawtext=text='${text}':fontsize=56:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-20:enable='between(t,${start + 0.5},${end - 0.5})'`,
        // Style 5: Bottom-left with orange accent
        (text, start, end) => `drawtext=text='${text}':fontsize=42:fontcolor=white:box=1:boxcolor=0xEA580C@0.80:boxborderw=16:x=30:y=h-90:enable='between(t,${start + 0.3},${end - 0.2})'`,
      ];

      textOverlays.forEach((text, i) => {
        if (!text?.trim()) return;
        const escaped = text.trim().replace(/'/g, "\u2019").replace(/:/g, '\\:').replace(/\\/g, '\\\\');
        const startT = i * sceneDuration;
        const endT = startT + sceneDuration;
        const styleFn = styles[i % styles.length];
        allFilters.push(styleFn(escaped, startT, endT));
      });
    }

    // ─── AUTO-CAPTIONS (narration text as synced subtitles) ───
    if (autoCaptions && narrations && Array.isArray(narrations)) {
      narrations.forEach((narration, i) => {
        if (!narration?.trim()) return;
        const startT = i * sceneDuration;
        // Split narration into chunks of ~6-8 words for readable captions
        const words = narration.trim().split(/\s+/);
        const chunks = [];
        for (let w = 0; w < words.length; w += 7) {
          chunks.push(words.slice(w, w + 7).join(' '));
        }
        // Distribute chunks evenly across scene duration
        const chunkDuration = sceneDuration / chunks.length;
        chunks.forEach((chunk, ci) => {
          const escaped = chunk.replace(/'/g, "\u2019").replace(/:/g, '\\:').replace(/\\/g, '\\\\');
          const cStart = startT + (ci * chunkDuration);
          const cEnd = cStart + chunkDuration;
          // Caption style: bottom center, white text on dark semi-transparent bar
          allFilters.push(
            `drawtext=text='${escaped}':fontsize=30:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=h-70:enable='between(t,${cStart.toFixed(2)},${cEnd.toFixed(2)})'`
          );
        });
      });
      console.log(`  💬 Auto-captions added for ${narrations.filter(n => n?.trim()).length} scenes`);
    }

    // Apply all text filters in one pass
    if (allFilters.length > 0) {
      const overlaidPath = path.join(tmpDir, 'overlaid.mp4');
      try {
        const filterStr = allFilters.join(',');
        execSync(
          `ffmpeg -y -i "${mergedPath}" -vf "${filterStr}" -c:v libx264 -preset fast -crf 23 -c:a copy -movflags +faststart "${overlaidPath}"`,
          { stdio: 'ignore', timeout: 300000 }
        );
        finalVideoPath = overlaidPath;
        console.log(`  📝 Text effects applied: ${allFilters.length} layers`);
      } catch (e) {
        console.log(`  ⚠️ Text overlay burn failed:`, e.message?.substring(0, 150));
        // Try with fewer filters (sometimes too many causes issues)
        if (allFilters.length > 10) {
          try {
            const simpleFilters = allFilters.slice(0, 10).join(',');
            execSync(
              `ffmpeg -y -i "${mergedPath}" -vf "${simpleFilters}" -c:v libx264 -preset fast -crf 23 -c:a copy -movflags +faststart "${overlaidPath}"`,
              { stdio: 'ignore', timeout: 300000 }
            );
            finalVideoPath = overlaidPath;
            console.log(`  📝 Reduced text effects applied (${10} layers)`);
          } catch {}
        }
      }
    }

    // 5b. Logo watermark overlay
    if (logoUrl) {
      const logoPath = path.join(tmpDir, 'logo.png');
      try {
        const logoResp = await axios({ url: logoUrl, responseType: 'arraybuffer', timeout: 30000 });
        fs.writeFileSync(logoPath, logoResp.data);
        const logoOverlaidPath = path.join(tmpDir, 'logo-overlaid.mp4');
        // Position mapping
        const positions = {
          'top-left': `x=20:y=20`,
          'top-right': `x=main_w-overlay_w-20:y=20`,
          'bottom-left': `x=20:y=main_h-overlay_h-20`,
          'bottom-right': `x=main_w-overlay_w-20:y=main_h-overlay_h-20`,
          'center': `x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2`
        };
        const pos = positions[logoPosition] || positions['top-right'];
        const opacity = Math.min(1, Math.max(0.1, logoOpacity));
        execSync(
          `ffmpeg -y -i "${finalVideoPath}" -i "${logoPath}" -filter_complex "[1:v]scale=${logoSize}:-1,format=rgba,colorchannelmixer=aa=${opacity}[logo];[0:v][logo]overlay=${pos}" -c:v libx264 -preset fast -crf 23 -c:a copy -movflags +faststart "${logoOverlaidPath}"`,
          { stdio: 'ignore', timeout: 300000 }
        );
        finalVideoPath = logoOverlaidPath;
        console.log(`  🏷️ Logo watermark added (${logoPosition}, ${logoSize}px, ${opacity * 100}% opacity)`);
      } catch (e) {
        console.log(`  ⚠️ Logo overlay failed:`, e.message?.substring(0, 100));
      }
    }

    // 5c. Intro/Outro image slides (if provided)
    if (introImageUrl || outroImageUrl) {
      const parts = [];

      // Build intro clip from image
      if (introImageUrl) {
        const introImgPath = path.join(tmpDir, 'intro-img.jpg');
        const introClipPath = path.join(tmpDir, 'intro-clip.ts');
        try {
          const iResp = await axios({ url: introImageUrl, responseType: 'arraybuffer', timeout: 30000 });
          fs.writeFileSync(introImgPath, iResp.data);
          execSync(
            `ffmpeg -y -loop 1 -i "${introImgPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -preset fast -crf 23 -r 16 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:a aac -t ${introDuration} -shortest -f mpegts "${introClipPath}"`,
            { stdio: 'ignore', timeout: 60000 }
          );
          parts.push(introClipPath);
          console.log(`  🎬 Intro image slide added (${introDuration}s)`);
        } catch (e) { console.log(`  ⚠️ Intro image failed:`, e.message?.substring(0, 80)); }
      }

      // Re-encode main video to .ts for concat
      const mainTsPath = path.join(tmpDir, 'main-for-concat.ts');
      try {
        execSync(
          `ffmpeg -y -i "${finalVideoPath}" -c:v libx264 -preset fast -crf 23 -r 16 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:a aac -ar 44100 -ac 2 -f mpegts "${mainTsPath}"`,
          { stdio: 'ignore', timeout: 300000 }
        );
        parts.push(mainTsPath);
      } catch {
        parts.push(null); // will skip concat
      }

      // Build outro clip from image
      if (outroImageUrl) {
        const outroImgPath = path.join(tmpDir, 'outro-img.jpg');
        const outroClipPath = path.join(tmpDir, 'outro-clip.ts');
        try {
          const oResp = await axios({ url: outroImageUrl, responseType: 'arraybuffer', timeout: 30000 });
          fs.writeFileSync(outroImgPath, oResp.data);
          execSync(
            `ffmpeg -y -loop 1 -i "${outroImgPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -preset fast -crf 23 -r 16 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:a aac -t ${outroDuration} -shortest -f mpegts "${outroClipPath}"`,
            { stdio: 'ignore', timeout: 60000 }
          );
          parts.push(outroClipPath);
          console.log(`  🎬 Outro image slide added (${outroDuration}s)`);
        } catch (e) { console.log(`  ⚠️ Outro image failed:`, e.message?.substring(0, 80)); }
      }

      // Concat intro + main + outro
      const validParts = parts.filter(Boolean);
      if (validParts.length > 1) {
        const withIntroOutroPath = path.join(tmpDir, 'with-intro-outro.mp4');
        try {
          execSync(
            `ffmpeg -y -i "concat:${validParts.join('|')}" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart "${withIntroOutroPath}"`,
            { stdio: 'ignore', timeout: 300000 }
          );
          finalVideoPath = withIntroOutroPath;
        } catch {}
      }
    }

    // 6. Generate thumbnails at multiple timestamps
    const thumbnails = [];
    try {
      // Get video duration
      const durationStr = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${finalVideoPath}"`,
        { timeout: 10000 }
      ).toString().trim();
      const totalDuration = parseFloat(durationStr) || 30;
      // Generate 4 thumbnails at 10%, 30%, 50%, 70% of video
      const timestamps = [0.1, 0.3, 0.5, 0.7].map(p => Math.max(1, Math.floor(totalDuration * p)));

      const cloudinary = require('cloudinary').v2;
      for (let ti = 0; ti < timestamps.length; ti++) {
        const thumbPath = path.join(tmpDir, `thumb-${ti}.jpg`);
        try {
          execSync(
            `ffmpeg -y -ss ${timestamps[ti]} -i "${finalVideoPath}" -vframes 1 -q:v 2 -vf "scale=640:-1" "${thumbPath}"`,
            { stdio: 'ignore', timeout: 15000 }
          );
          // Upload thumbnail to Cloudinary
          const thumbResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload(thumbPath, {
              folder: 'cybev/ai-studio/thumbnails',
              public_id: `thumb-${title.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 30)}-${ti}-${Date.now()}`,
            }, (err, result) => err ? reject(err) : resolve(result));
          });
          thumbnails.push({ url: thumbResult.secure_url, timestamp: timestamps[ti] });
        } catch {}
      }
      if (thumbnails.length) console.log(`  🖼️ Generated ${thumbnails.length} thumbnails`);
    } catch (e) {
      console.log(`  ⚠️ Thumbnail generation skipped:`, e.message?.substring(0, 80));
    }

    // 7. Upload final video to Cloudinary
    let cloudinaryUrl = null;
    try {
      const cloudinary = require('cloudinary').v2;
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload(finalVideoPath, {
          resource_type: 'video',
          folder: 'cybev/ai-studio/merged',
          public_id: `${title.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50)}-${Date.now()}`,
          overwrite: true,
        }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      cloudinaryUrl = uploadResult.secure_url;
      console.log(`  ☁️ Uploaded to Cloudinary: ${cloudinaryUrl}`);
    } catch (uploadErr) {
      console.error('  ❌ Cloudinary upload failed:', uploadErr.message);
    }

    // 8. Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (!cloudinaryUrl) {
      return res.status(500).json({ error: 'Failed to upload merged video. Check Cloudinary configuration.' });
    }

    res.json({
      ok: true,
      mergedUrl: cloudinaryUrl,
      clipCount: normalizedPaths.length,
      hasVoiceover: addVoiceover && ttsAudioPaths.some(p => p),
      voice: addVoiceover ? voice : null,
      thumbnails,
      title
    });
  } catch (err) {
    console.error('Video merge error:', err.message);
    try { require('fs').rmSync(`/tmp/merge-${Date.now()}`, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: 'Video merge failed', details: err.message });
  }
});


// ═══════════════════════════════════════════
//  VOICE PREVIEW & AVAILABLE VOICES
// ═══════════════════════════════════════════

// Voice configs — OpenAI voices + accent simulation via text wrapping
const VOICE_CONFIG = {
  // OpenAI native voices
  'nova':     { provider: 'openai', voice: 'nova',    label: 'Nova',    accent: 'American',     gender: 'Female' },
  'shimmer':  { provider: 'openai', voice: 'shimmer', label: 'Shimmer', accent: 'American',     gender: 'Female' },
  'alloy':    { provider: 'openai', voice: 'alloy',   label: 'Alloy',   accent: 'Neutral',      gender: 'Neutral' },
  'echo':     { provider: 'openai', voice: 'echo',    label: 'Echo',    accent: 'American',     gender: 'Male' },
  'onyx':     { provider: 'openai', voice: 'onyx',    label: 'Onyx',    accent: 'Deep',         gender: 'Male' },
  'fable':    { provider: 'openai', voice: 'fable',   label: 'Fable',   accent: 'British',      gender: 'Male' },
  // Accent-simulated voices (wraps text with dialect context for subtle accent shift)
  'nova-ng':      { provider: 'openai', voice: 'nova',    label: 'Amara',    accent: 'Nigerian',      gender: 'Female', accentHint: 'Speak with a warm Nigerian English accent and natural Nigerian intonation patterns. ' },
  'echo-ng':      { provider: 'openai', voice: 'echo',    label: 'Emeka',    accent: 'Nigerian',      gender: 'Male',   accentHint: 'Speak with a confident Nigerian English accent and Igbo-influenced intonation. ' },
  'onyx-ng':      { provider: 'openai', voice: 'onyx',    label: 'Tunde',    accent: 'Nigerian',      gender: 'Male',   accentHint: 'Speak with a deep Nigerian English accent and Yoruba-influenced rhythm. ' },
  'nova-gh':      { provider: 'openai', voice: 'nova',    label: 'Ama',      accent: 'Ghanaian',      gender: 'Female', accentHint: 'Speak with a warm Ghanaian English accent and Akan-influenced intonation. ' },
  'echo-gh':      { provider: 'openai', voice: 'echo',    label: 'Kwame',    accent: 'Ghanaian',      gender: 'Male',   accentHint: 'Speak with a friendly Ghanaian English accent and natural Ghanaian rhythm. ' },
  'nova-za':      { provider: 'openai', voice: 'nova',    label: 'Naledi',   accent: 'South African',  gender: 'Female', accentHint: 'Speak with a South African English accent and natural Johannesburg intonation. ' },
  'onyx-za':      { provider: 'openai', voice: 'onyx',    label: 'Sipho',    accent: 'South African',  gender: 'Male',   accentHint: 'Speak with a deep South African English accent and Zulu-influenced resonance. ' },
  'shimmer-ke':   { provider: 'openai', voice: 'shimmer', label: 'Wanjiku',  accent: 'Kenyan',        gender: 'Female', accentHint: 'Speak with a warm Kenyan English accent and Swahili-influenced rhythm. ' },
  'echo-ke':      { provider: 'openai', voice: 'echo',    label: 'Otieno',   accent: 'Kenyan',        gender: 'Male',   accentHint: 'Speak with a Kenyan English accent and East African intonation. ' },
  'nova-tz':      { provider: 'openai', voice: 'nova',    label: 'Amina',    accent: 'Tanzanian',     gender: 'Female', accentHint: 'Speak with a Tanzanian English accent and Swahili-influenced warmth. ' },
  'echo-et':      { provider: 'openai', voice: 'echo',    label: 'Dawit',    accent: 'Ethiopian',     gender: 'Male',   accentHint: 'Speak with an Ethiopian English accent and Amharic-influenced intonation. ' },
  'shimmer-cm':   { provider: 'openai', voice: 'shimmer', label: 'Ngozi',    accent: 'Cameroonian',   gender: 'Female', accentHint: 'Speak with a Cameroonian English accent and French-influenced cadence. ' },
  'onyx-eg':      { provider: 'openai', voice: 'onyx',    label: 'Ahmed',    accent: 'Egyptian',      gender: 'Male',   accentHint: 'Speak with an Egyptian English accent and Arabic-influenced intonation. ' },
  // Other international accents
  'fable-uk':     { provider: 'openai', voice: 'fable',   label: 'James',    accent: 'British',       gender: 'Male',   accentHint: 'Speak with a refined British RP accent. ' },
  'shimmer-uk':   { provider: 'openai', voice: 'shimmer', label: 'Charlotte',accent: 'British',       gender: 'Female', accentHint: 'Speak with a warm British accent. ' },
  'nova-in':      { provider: 'openai', voice: 'nova',    label: 'Priya',    accent: 'Indian',        gender: 'Female', accentHint: 'Speak with an Indian English accent and Hindi-influenced intonation. ' },
  'echo-fr':      { provider: 'openai', voice: 'echo',    label: 'Pierre',   accent: 'French',        gender: 'Male',   accentHint: 'Speak with a French English accent. ' },
  'shimmer-br':   { provider: 'openai', voice: 'shimmer', label: 'Ana',      accent: 'Brazilian',     gender: 'Female', accentHint: 'Speak with a Brazilian English accent and Portuguese-influenced warmth. ' },
  'echo-jm':      { provider: 'openai', voice: 'echo',    label: 'Marcus',   accent: 'Jamaican',      gender: 'Male',   accentHint: 'Speak with a Jamaican English accent and Caribbean rhythm. ' },
  'nova-au':      { provider: 'openai', voice: 'nova',    label: 'Sophie',   accent: 'Australian',    gender: 'Female', accentHint: 'Speak with an Australian English accent. ' },
  // Deep narrator & documentary voices
  'onyx-narrator':  { provider: 'openai', voice: 'onyx',    label: 'Morgan',   accent: 'Cinematic',     gender: 'Male',   accentHint: 'Speak in a slow, deep, authoritative cinematic narrator voice like a documentary film. Pause between phrases for dramatic effect. ' },
  'onyx-doc':       { provider: 'openai', voice: 'onyx',    label: 'Atlas',    accent: 'Documentary',   gender: 'Male',   accentHint: 'Speak in a measured, deep, resonant documentary narrator voice. Calm, wise, and authoritative like a nature documentary. ' },
  'echo-narrator':  { provider: 'openai', voice: 'echo',    label: 'David',    accent: 'Narrator',      gender: 'Male',   accentHint: 'Speak in a warm, rich baritone narrator voice suitable for storytelling and documentaries. Clear enunciation, steady pace. ' },
  'fable-narrator': { provider: 'openai', voice: 'fable',   label: 'Benedict',  accent: 'British Deep',  gender: 'Male',   accentHint: 'Speak in a deep, elegant British narrator voice like a BBC documentary presenter. Authoritative and captivating. ' },
  'nova-narrator':  { provider: 'openai', voice: 'nova',    label: 'Maya',     accent: 'Narrator',      gender: 'Female', accentHint: 'Speak in a calm, clear, authoritative female narrator voice suitable for documentaries. Measured pace, warm but professional. ' },
  'shimmer-narrator':{ provider: 'openai', voice: 'shimmer', label: 'Elena',   accent: 'Narrator',      gender: 'Female', accentHint: 'Speak in a soft, intimate, reflective female narrator voice. Like a meditation or introspective documentary. Gentle pace. ' },
  'onyx-epic':      { provider: 'openai', voice: 'onyx',    label: 'Titan',    accent: 'Epic',          gender: 'Male',   accentHint: 'Speak in a thunderous, epic, dramatic movie trailer narrator voice. Deep, powerful, commanding attention. Short punchy phrases. ' },
  'onyx-ng-deep':   { provider: 'openai', voice: 'onyx',    label: 'Obinna',   accent: 'Nigerian Deep', gender: 'Male',   accentHint: 'Speak in a deep, authoritative Nigerian English narrator voice with Igbo-influenced gravitas. Documentary style, commanding. ' },
  'onyx-za-deep':   { provider: 'openai', voice: 'onyx',    label: 'Mandla',   accent: 'SA Deep',       gender: 'Male',   accentHint: 'Speak in a deep, resonant South African English narrator voice with Zulu-influenced depth. Like a wildlife documentary. ' },
  // Children's voices
  'shimmer-child':  { provider: 'openai', voice: 'shimmer', label: 'Lily',     accent: 'Child',         gender: 'Girl',   accentHint: 'Speak in a cheerful, bright, young girl voice full of excitement and wonder. Like a 9 year old telling a story. ', speed: 1.1 },
  'nova-child':     { provider: 'openai', voice: 'nova',    label: 'Zara',     accent: 'Child',         gender: 'Girl',   accentHint: 'Speak in a sweet, curious, enthusiastic young girl voice. Like an animated cartoon character. Energetic and fun. ', speed: 1.1 },
  'alloy-child':    { provider: 'openai', voice: 'alloy',   label: 'Sam',      accent: 'Child',         gender: 'Neutral', accentHint: 'Speak in a playful, youthful, energetic kid voice. Like a young explorer discovering something amazing. ', speed: 1.15 },
  'echo-child':     { provider: 'openai', voice: 'echo',    label: 'Max',      accent: 'Child',         gender: 'Boy',    accentHint: 'Speak in a bright, enthusiastic young boy voice full of energy. Like a kid telling his friends about an adventure. ', speed: 1.1 },
  'fable-child':    { provider: 'openai', voice: 'fable',   label: 'Oliver',   accent: 'Child British', gender: 'Boy',    accentHint: 'Speak in a polite, curious young British boy voice. Like a child narrator in a storybook. ', speed: 1.1 },
  'nova-child-ng':  { provider: 'openai', voice: 'nova',    label: 'Amaka',    accent: 'Child Nigerian', gender: 'Girl',  accentHint: 'Speak in a cheerful young Nigerian girl voice with natural warmth and excitement. ', speed: 1.1 },
  'echo-child-gh':  { provider: 'openai', voice: 'echo',    label: 'Kofi',     accent: 'Child Ghanaian', gender: 'Boy',   accentHint: 'Speak in a bright, happy young Ghanaian boy voice full of curiosity. ', speed: 1.1 },
  // Enthusiastic & Happy voices
  'nova-happy':     { provider: 'openai', voice: 'nova',    label: 'Joy',      accent: 'Happy',         gender: 'Female', accentHint: 'Speak with infectious enthusiasm, bright energy, and a big smile in your voice! Upbeat and exciting! ', speed: 1.05 },
  'shimmer-happy':  { provider: 'openai', voice: 'shimmer', label: 'Sunny',    accent: 'Cheerful',      gender: 'Female', accentHint: 'Speak with warm cheerful energy, like sharing the best news ever! Light and joyful! ', speed: 1.05 },
  'echo-happy':     { provider: 'openai', voice: 'echo',    label: 'Blaze',    accent: 'Energetic',     gender: 'Male',   accentHint: 'Speak with high energy and enthusiasm like a sports commentator celebrating a goal! Pumped up! ', speed: 1.08 },
  'alloy-happy':    { provider: 'openai', voice: 'alloy',   label: 'Spark',    accent: 'Upbeat',        gender: 'Neutral', accentHint: 'Speak with bright positive energy, like a motivational speaker at their peak! Inspiring! ', speed: 1.05 },
  'fable-happy':    { provider: 'openai', voice: 'fable',   label: 'Winston',  accent: 'British Happy', gender: 'Male',   accentHint: 'Speak with charming British enthusiasm, witty and delightfully energetic! ', speed: 1.05 },
  'nova-hype':      { provider: 'openai', voice: 'nova',    label: 'Hype',     accent: 'Hype',          gender: 'Female', accentHint: 'Speak like an excited product launch host! Maximum energy, every word matters! ', speed: 1.1 },
  'echo-motivate':  { provider: 'openai', voice: 'echo',    label: 'Coach',    accent: 'Motivational',  gender: 'Male',   accentHint: 'Speak like a passionate life coach delivering a breakthrough moment! Powerful and uplifting! ', speed: 1.03 },
  'nova-ng-happy':  { provider: 'openai', voice: 'nova',    label: 'Chioma',   accent: 'Nigerian Happy', gender: 'Female', accentHint: 'Speak with joyful Nigerian energy and warm Igbo-influenced excitement! ', speed: 1.05 },
  'echo-gh-happy':  { provider: 'openai', voice: 'echo',    label: 'Yaw',      accent: 'Ghanaian Happy', gender: 'Male',   accentHint: 'Speak with enthusiastic Ghanaian energy and vibrant Akan-influenced warmth! ', speed: 1.05 },
};

// Preview cache (in-memory, cleared on restart)
const previewCache = {};

// Get list of all available voices
router.get('/voices', auth, async (req, res) => {
  const voices = Object.entries(VOICE_CONFIG).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    accent: cfg.accent,
    gender: cfg.gender,
    provider: cfg.provider
  }));
  res.json({ voices });
});

// Generate a short voice preview
router.post('/voice/preview', auth, async (req, res) => {
  try {
    const { voiceId = 'nova' } = req.body;
    const config = VOICE_CONFIG[voiceId];
    if (!config) return res.status(400).json({ error: 'Unknown voice ID' });
    if (!OPENAI_API_KEY) return res.status(400).json({ error: 'OpenAI API key not configured' });

    // Check cache
    if (previewCache[voiceId]) {
      return res.json({ audioBase64: previewCache[voiceId], voiceId, cached: true });
    }

    const sampleText = config.accentHint
      ? `${config.accentHint}Hello! I'm ${config.label}. Welcome to CYBEV Studio, where your ideas become reality. Let's create something amazing together.`
      : `Hello! I'm ${config.label}. Welcome to CYBEV Studio, where your ideas become reality. Let's create something amazing together.`;

    const resp = await axios.post('https://api.openai.com/v1/audio/speech', {
      model: 'tts-1',
      voice: config.voice,
      input: sampleText,
      response_format: 'mp3',
      speed: 1.0
    }, {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: 15000
    });

    const base64 = Buffer.from(resp.data).toString('base64');
    previewCache[voiceId] = base64; // Cache it
    console.log(`🎤 Voice preview generated: ${voiceId} (${config.label}, ${config.accent})`);

    res.json({ audioBase64: base64, voiceId, cached: false });
  } catch (err) {
    console.error('Voice preview error:', err.response?.data ? Buffer.from(err.response.data).toString() : err.message);
    res.status(500).json({ error: 'Failed to generate voice preview' });
  }
});


// ═══════════════════════════════════════════
//  AI DUB — Upload video → Transcribe → Re-voice
//  Whisper (transcribe) → DeepSeek (translate) → TTS (re-voice) → ffmpeg (replace audio)
// ═══════════════════════════════════════════

router.post('/dub/process', auth, async (req, res) => {
  try {
    const { videoUrl, voiceId = 'nova', targetLang = 'en', customScript, useRecordedVoice, recordedAudioUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ error: 'videoUrl required' });

    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');

    const tmpDir = path.join('/tmp', `dub-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    console.log(`🎙️ DUB: Starting dub process. Voice: ${voiceId}, Lang: ${targetLang}`);

    // 1. Download source video
    const videoPath = path.join(tmpDir, 'source.mp4');
    const resp = await axios({ url: videoUrl, responseType: 'arraybuffer', timeout: 120000 });
    fs.writeFileSync(videoPath, resp.data);
    console.log(`  📥 Downloaded source video (${(resp.data.length / 1024 / 1024).toFixed(1)}MB)`);

    // 2. Extract audio from video
    const audioPath = path.join(tmpDir, 'audio.mp3');
    try {
      execSync(`ffmpeg -y -i "${videoPath}" -vn -acodec mp3 -ar 16000 -ac 1 "${audioPath}"`, { stdio: 'ignore', timeout: 60000 });
    } catch {
      // Video might not have audio — that's OK
      console.log('  ℹ️ No audio track found in video');
    }

    let transcript = '';
    // 3. If user provided custom script, use that. Otherwise transcribe.
    if (customScript?.trim()) {
      transcript = customScript.trim();
      console.log(`  📝 Using custom script (${transcript.length} chars)`);
    } else if (useRecordedVoice && recordedAudioUrl) {
      // Download recorded audio and transcribe it
      const recPath = path.join(tmpDir, 'recorded.mp3');
      const recResp = await axios({ url: recordedAudioUrl, responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(recPath, recResp.data);
      transcript = await transcribeAudio(recPath);
      console.log(`  🎤 Transcribed recorded voice: "${transcript.substring(0, 100)}..."`);
    } else if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) {
      // Transcribe original audio with Whisper
      transcript = await transcribeAudio(audioPath);
      console.log(`  📝 Transcribed original audio: "${transcript.substring(0, 100)}..."`);
    }

    if (!transcript) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res.status(400).json({ error: 'No audio to transcribe. Provide a custom script or upload a video with audio.' });
    }

    // 4. Translate if target language is different (optional)
    let finalText = transcript;
    if (targetLang && targetLang !== 'en' && targetLang !== 'original') {
      const langNames = { es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', sw: 'Swahili', yo: 'Yoruba', ig: 'Igbo', ha: 'Hausa', zu: 'Zulu', am: 'Amharic', tw: 'Twi', ja: 'Japanese', ko: 'Korean', it: 'Italian', ru: 'Russian', tr: 'Turkish' };
      const langName = langNames[targetLang] || targetLang;
      try {
        const translated = await generateScript(
          `You are a professional translator. Translate the following text to ${langName}. Keep it natural, conversational, and roughly the same length. Respond with ONLY JSON: {"translated": "the translated text"}`,
          `Translate this: "${finalText}"`
        );
        if (translated?.translated) {
          finalText = translated.translated;
          console.log(`  🌐 Translated to ${langName}: "${finalText.substring(0, 100)}..."`);
        }
      } catch (e) {
        console.log(`  ⚠️ Translation failed, using original: ${e.message}`);
      }
    }

    // 5. Generate TTS with chosen voice
    const ttsPath = await generateTTS(finalText, voiceId, tmpDir);
    if (!ttsPath) {
      // If TTS fails but we have recorded audio, use that instead
      if (useRecordedVoice && recordedAudioUrl) {
        console.log('  ℹ️ TTS failed, using recorded audio directly');
      } else {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return res.status(500).json({ error: 'Failed to generate voiceover audio' });
      }
    }

    // 6. Replace audio in video with TTS (or recorded voice)
    const dubAudioPath = ttsPath || path.join(tmpDir, 'recorded.mp3');
    const outputPath = path.join(tmpDir, 'dubbed.mp4');
    try {
      execSync(
        `ffmpeg -y -i "${videoPath}" -i "${dubAudioPath}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`,
        { stdio: 'ignore', timeout: 120000 }
      );
    } catch {
      // If that fails, try re-encoding
      execSync(
        `ffmpeg -y -i "${videoPath}" -i "${dubAudioPath}" -c:v libx264 -preset fast -crf 23 -map 0:v:0 -map 1:a:0 -c:a aac -shortest "${outputPath}"`,
        { stdio: 'ignore', timeout: 180000 }
      );
    }
    console.log(`  ✅ Dubbed video created`);

    // 7. Upload to Cloudinary
    let cloudinaryUrl = null;
    try {
      const cloudinary = require('cloudinary').v2;
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload(outputPath, {
          resource_type: 'video',
          folder: 'cybev/ai-studio/dubbed',
          public_id: `dub-${voiceId}-${Date.now()}`,
          overwrite: true,
        }, (err, result) => err ? reject(err) : resolve(result));
      });
      cloudinaryUrl = uploadResult.secure_url;
      console.log(`  ☁️ Uploaded dubbed video: ${cloudinaryUrl}`);
    } catch (e) {
      console.error('  ❌ Cloudinary upload failed:', e.message);
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (!cloudinaryUrl) return res.status(500).json({ error: 'Failed to upload dubbed video' });

    res.json({
      ok: true,
      dubbedUrl: cloudinaryUrl,
      voiceId,
      targetLang,
      transcript: finalText.substring(0, 500),
    });
  } catch (err) {
    console.error('DUB error:', err.message);
    try { require('fs').rmSync(`/tmp/dub-${Date.now()}`, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: 'Dubbing failed', details: err.message });
  }
});

// Whisper transcription helper
async function transcribeAudio(audioPath) {
  if (!OPENAI_API_KEY) return '';
  const fs = require('fs');
  const FormData = require('form-data') || (() => { const f = new (require('stream').Readable)(); return f; });
  try {
    // Use axios with multipart
    const fileData = fs.readFileSync(audioPath);
    const boundary = `----FormBoundary${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}--\r\n`)
    ]);
    const resp = await axios.post('https://api.openai.com/v1/audio/transcriptions', body, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      timeout: 60000
    });
    return resp.data.text || '';
  } catch (e) {
    console.error('  ❌ Whisper transcription failed:', e.response?.data || e.message);
    return '';
  }
}


// ═══════════════════════════════════════════
//  AI CHARACTER — Generate video from face image
//  Uses Replicate image-to-video with face reference
// ═══════════════════════════════════════════

router.post('/character/generate', auth, async (req, res) => {
  try {
    const { imageUrl, prompt, style, duration = 'short' } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Image URL required (upload a face photo first)' });
    if (!prompt) return res.status(400).json({ error: 'Prompt required — describe what the character should do' });

    const costKey = `video_${duration}`;
    const cost = TOKEN_COSTS[costKey] || TOKEN_COSTS.video_short;
    const newBalance = await checkAndDeductTokens(req.user.id, cost);

    console.log(`🎭 Character generation: "${prompt.substring(0, 80)}..." with face image`);

    const fullPrompt = `${style ? `${style} style. ` : ''}${prompt}`;

    // Use image-to-video model with the face as source
    let prediction;
    let provider = 'replicate';
    try {
      prediction = await replicate.predictions.create({
        model: MODELS.video_i2v,
        input: {
          image: imageUrl,
          prompt: fullPrompt.substring(0, 2000),
          num_frames: duration === 'short' ? 81 : 161,
        }
      });
    } catch (primaryErr) {
      console.error('Character generation failed:', primaryErr.message);
      if (RUNWAY_API_KEY) {
        provider = 'runway';
        const runwayRes = await axios.post('https://api.dev.runwayml.com/v1/image_to_video', {
          model: 'gen3a_turbo', promptText: fullPrompt, promptImage: imageUrl,
          watermark: false, duration: duration === 'short' ? 5 : 10, ratio: '1280:768'
        }, {
          headers: { 'Authorization': `Bearer ${RUNWAY_API_KEY}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' }
        });
        prediction = { id: runwayRes.data.id, status: 'processing' };
      } else {
        throw primaryErr;
      }
    }

    res.json({
      mode: 'single',
      taskId: prediction.id,
      status: prediction.status === 'succeeded' ? 'completed' : 'processing',
      videoUrl: extractUrl(prediction.output),
      provider,
      tokensUsed: cost,
      remainingBalance: newBalance,
      prompt: fullPrompt
    });
  } catch (err) {
    console.error('Character error:', err.message);
    if (err.message.includes('Insufficient')) return res.status(402).json({ error: err.message });
    try { await refundTokens(req.user.id, TOKEN_COSTS[`video_${req.body.duration || 'short'}`] || 100); } catch {}
    res.status(500).json({ error: 'Character generation failed', details: err.message });
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
