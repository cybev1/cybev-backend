// ============================================
// FILE: movieProject.routes.js
// PATH: /routes/movieProject.routes.js
// CYBEV AI Movie/Series Production System
// Create → Cast Characters → Write Episodes → Generate → Merge
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const Replicate = require('replicate');

// Auth
let auth;
try { auth = require('../middleware/verifyToken'); } catch {
  try { auth = require('../middleware/auth.middleware'); } catch {
    try { const a = require('../middleware/auth'); auth = a.authenticateToken || a; } catch {
      auth = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try { const jwt = require('jsonwebtoken'); req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024'); req.user.id = req.user.userId || req.user.id; next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

const MovieProject = require('../models/movieProject.model');
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const MODELS = {
  video: 'wan-video/wan-2.2-t2v-fast',
  video_i2v: 'wan-video/wan-2.2-i2v-fast',
};

// ─── AI Helper (reuse from aiContent pattern) ───
async function aiGenerate(systemPrompt, userPrompt) {
  const providers = [
    { name: 'deepseek', url: 'https://api.deepseek.com/v1/chat/completions', key: DEEPSEEK_API_KEY, model: 'deepseek-chat' },
    { name: 'openai', url: 'https://api.openai.com/v1/chat/completions', key: OPENAI_API_KEY, model: 'gpt-4o-mini' },
  ];
  for (const p of providers) {
    if (!p.key) continue;
    try {
      const resp = await axios.post(p.url, {
        model: p.model, temperature: 0.85, max_tokens: 8192,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
      }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.key}` }, timeout: 120000 });
      const text = resp.data.choices?.[0]?.message?.content;
      if (!text) continue;
      let json = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      const match = json.match(/\{[\s\S]*\}/);
      if (match) json = match[0];
      return JSON.parse(json.trim());
    } catch (e) { console.error(`Movie AI (${p.name}):`, e.message); continue; }
  }
  throw new Error('All AI providers failed');
}

// Safely extract URL from Replicate output
function extractUrl(output) {
  if (!output) return null;
  let val = Array.isArray(output) ? output[0] : output;
  if (val && typeof val === 'object') { if (typeof val.url === 'function') return val.url(); if (val.url) return val.url; }
  return typeof val === 'string' ? val : String(val);
}

console.log('🎬 Movie Production routes loaded');


// ═══════════════════════════════════════════
//  PROJECT CRUD
// ═══════════════════════════════════════════

// Create project
router.post('/', auth, async (req, res) => {
  try {
    const { title, type = 'short', genre = 'drama', logline, synopsis, style, targetAudience, language = 'en' } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const project = await MovieProject.create({
      user: req.user.id, title, type, genre, logline, synopsis, style, targetAudience, language,
      episodes: type === 'movie' ? [{ episodeNumber: 1, title: 'Full Movie', duration: 300 }] : []
    });
    console.log(`🎬 Project created: "${title}" (${type}) by user ${req.user.id}`);
    res.json({ ok: true, project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List user's projects
router.get('/', auth, async (req, res) => {
  try {
    const projects = await MovieProject.find({ user: req.user.id }).sort({ updatedAt: -1 }).select('-episodes.scenes').lean();
    res.json({ projects, total: projects.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get single project (full)
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update project
router.put('/:id', auth, async (req, res) => {
  try {
    const allowed = ['title', 'type', 'genre', 'logline', 'synopsis', 'style', 'targetAudience', 'language', 'logoUrl', 'introImageUrl', 'outroImageUrl', 'coverImageUrl', 'defaultVoiceId', 'autoCaptions', 'aspectRatio', 'status', 'seasons', 'currentSeason'];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    update.updatedAt = new Date();
    const project = await MovieProject.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { $set: update }, { new: true });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ ok: true, project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete project
router.delete('/:id', auth, async (req, res) => {
  try {
    const r = await MovieProject.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════
//  CHARACTERS — Cast & manage
// ═══════════════════════════════════════════

router.post('/:id/characters', auth, async (req, res) => {
  try {
    const { name, role = 'main', description, faceImageUrl, voiceId, referenceImages, referenceVideoUrl } = req.body;
    if (!name) return res.status(400).json({ error: 'Character name required' });
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    project.characters.push({ name, role, description, faceImageUrl, voiceId: voiceId || project.defaultVoiceId, referenceImages: referenceImages || [], referenceVideoUrl });
    await project.save();
    console.log(`🎭 Character added: "${name}" (${role}) to "${project.title}"`);
    res.json({ ok: true, character: project.characters[project.characters.length - 1], characters: project.characters });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/characters/:charId', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const char = project.characters.id(req.params.charId);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const allowed = ['name', 'role', 'description', 'faceImageUrl', 'voiceId', 'referenceImages', 'referenceVideoUrl'];
    for (const k of allowed) { if (req.body[k] !== undefined) char[k] = req.body[k]; }
    await project.save();
    res.json({ ok: true, character: char });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/characters/:charId', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.characters.pull(req.params.charId);
    await project.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════
//  EPISODES — Create, script, manage
// ═══════════════════════════════════════════

router.post('/:id/episodes', auth, async (req, res) => {
  try {
    const { title, synopsis, duration = 60 } = req.body;
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const epNum = project.episodes.length + 1;
    project.episodes.push({ episodeNumber: epNum, title: title || `Episode ${epNum}`, synopsis, duration, status: 'draft' });
    project.totalEpisodes = project.episodes.length;
    await project.save();
    res.json({ ok: true, episode: project.episodes[project.episodes.length - 1] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update episode
router.put('/:id/episodes/:epId', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const ep = project.episodes.id(req.params.epId);
    if (!ep) return res.status(404).json({ error: 'Episode not found' });
    const allowed = ['title', 'synopsis', 'duration', 'status', 'voiceId', 'musicSuggestion', 'thumbnailUrl', 'scenes'];
    for (const k of allowed) { if (req.body[k] !== undefined) ep[k] = req.body[k]; }
    ep.updatedAt = new Date();
    await project.save();
    res.json({ ok: true, episode: ep });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete episode
router.delete('/:id/episodes/:epId', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.episodes.pull(req.params.epId);
    project.totalEpisodes = project.episodes.length;
    await project.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════
//  AI SCRIPT WRITER — Generate episode scripts
// ═══════════════════════════════════════════

router.post('/:id/episodes/:epId/write-script', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const ep = project.episodes.id(req.params.epId);
    if (!ep) return res.status(404).json({ error: 'Episode not found' });

    const { customInstructions } = req.body;
    const sceneDuration = 5;
    const sceneCount = Math.max(2, Math.min(30, Math.round(ep.duration / sceneDuration)));

    // Build character descriptions for AI
    const charDescs = project.characters.map(c =>
      `- ${c.name} (${c.role}): ${c.description || 'No description'}`
    ).join('\n');

    // Build context from previous episodes
    const prevEps = project.episodes
      .filter(e => e.episodeNumber < ep.episodeNumber && e.synopsis)
      .map(e => `Ep ${e.episodeNumber} "${e.title}": ${e.synopsis}`)
      .join('\n');

    const systemPrompt = `You are a professional screenwriter for CYBEV Movie Studio. You write scene-by-scene scripts for AI-generated ${project.type === 'series' ? 'TV series episodes' : project.type === 'movie' ? 'movies' : 'short films'}.

PROJECT: "${project.title}"
GENRE: ${project.genre}
STYLE: ${project.style || 'Cinematic'}
LOGLINE: ${project.logline || 'Not specified'}
TARGET AUDIENCE: ${project.targetAudience || 'General'}

CHARACTERS:
${charDescs || '(No characters defined — create generic characters)'}

${prevEps ? `PREVIOUS EPISODES:\n${prevEps}\n\nContinue the story arc naturally.` : ''}

${customInstructions ? `DIRECTOR'S NOTES: ${customInstructions}` : ''}

CRITICAL RULES FOR VISUAL DESCRIPTIONS:
- "visual" fields are sent to an AI video generator that CANNOT render text.
- NEVER include text, words, letters, logos, titles in visual descriptions.
- Describe ONLY imagery: people, settings, lighting, actions, expressions, costumes.
- Reference characters BY NAME in the dialogue/narration fields, not in visuals.
- For character scenes: describe the person's appearance, actions, and emotions.

Respond with ONLY valid JSON:
{
  "title": "${ep.title}",
  "synopsis": "string — 2-3 sentence summary of this episode's plot",
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": ${sceneDuration},
      "visual": "PURE VISUAL description — people, setting, lighting, actions. NO TEXT.",
      "camera": "camera movement/angle",
      "characters": ["character names appearing in this scene"],
      "dialogue": [{"character": "Name", "line": "What they say"}],
      "narration": "Narrator voiceover for this scene (1-2 natural sentences)",
      "textOverlay": "Short on-screen text if needed (max 6 words)",
      "mood": "emotional tone of the scene",
      "transition": "Cut/Fade/Dissolve"
    }
  ],
  "musicSuggestion": "background music mood/style",
  "cliffhanger": "string — teaser for next episode (for series only)"
}

Generate exactly ${sceneCount} scenes (${ep.duration}s total). Make it compelling with character development, conflict, and resolution.`;

    const userPrompt = `Write Episode ${ep.episodeNumber}: "${ep.title}"${ep.synopsis ? `\nSynopsis hint: ${ep.synopsis}` : ''}\n${sceneCount} scenes, ${ep.duration} seconds total.`;

    console.log(`🎬 Writing script for "${project.title}" Ep ${ep.episodeNumber}...`);
    const script = await aiGenerate(systemPrompt, userPrompt);

    if (!script.scenes || !Array.isArray(script.scenes)) {
      throw new Error('Invalid script structure');
    }

    // Map script scenes to episode scenes — use atomic update to avoid version conflicts
    const newScenes = script.scenes.map((s, i) => ({
      sceneNumber: i + 1,
      duration: s.duration || sceneDuration,
      visual: s.visual || '',
      camera: s.camera || '',
      textOverlay: s.textOverlay || '',
      narration: s.narration || '',
      dialogue: s.dialogue || [],
      mood: s.mood || '',
      transition: s.transition || 'Cut',
      status: 'draft'
    }));

    // Use findOneAndUpdate for atomic episode update
    const updated = await MovieProject.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, 'episodes._id': req.params.epId },
      {
        $set: {
          'episodes.$.scenes': newScenes,
          'episodes.$.synopsis': script.synopsis || ep.synopsis,
          'episodes.$.musicSuggestion': script.musicSuggestion || '',
          'episodes.$.status': 'scripted',
          'episodes.$.updatedAt': new Date()
        }
      },
      { new: true }
    );

    const updatedEp = updated?.episodes?.id(req.params.epId);
    console.log(`  ✅ Script written: ${newScenes.length} scenes`);
    res.json({ ok: true, episode: updatedEp, script });
  } catch (e) {
    console.error('Script write error:', e.message);
    res.status(500).json({ error: 'Failed to write script', details: e.message });
  }
});


// ═══════════════════════════════════════════
//  GENERATE EPISODE — Scene-by-scene video generation
// ═══════════════════════════════════════════

router.post('/:id/episodes/:epId/generate', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const ep = project.episodes.id(req.params.epId);
    if (!ep) return res.status(404).json({ error: 'Episode not found' });
    if (!ep.scenes || ep.scenes.length === 0) return res.status(400).json({ error: 'No scenes. Write the script first.' });

    console.log(`🎬 Generating "${project.title}" Ep ${ep.episodeNumber}: ${ep.scenes.length} scenes`);
    ep.status = 'generating';

    const tasks = [];
    for (let i = 0; i < ep.scenes.length; i++) {
      const scene = ep.scenes[i];

      // Wait for rate limit
      if (i > 0) {
        console.log(`  ⏳ Waiting 11s before scene ${i + 1}...`);
        await new Promise(r => setTimeout(r, 11000));
      }

      // Build prompt — check if character has face image for i2v
      const charNames = scene.dialogue?.map(d => d.character) || [];
      const sceneChars = project.characters.filter(c => charNames.includes(c.name) || (scene.visual && scene.visual.toLowerCase().includes(c.name.toLowerCase())));
      const charWithFace = sceneChars.find(c => c.faceImageUrl);

      const stylePrefix = project.style ? `${project.style} style. ` : '';
      const scenePrompt = `${stylePrefix}${scene.visual}${scene.camera ? `. Camera: ${scene.camera}` : ''}. Photorealistic quality. IMPORTANT: Do not render any text, words, letters, titles, captions, watermarks, logos in the frame.`;

      try {
        let prediction;
        if (charWithFace) {
          // Use image-to-video with character face
          prediction = await replicate.predictions.create({
            model: MODELS.video_i2v,
            input: { image: charWithFace.faceImageUrl, prompt: scenePrompt.substring(0, 2000), num_frames: 81 }
          });
          console.log(`  📹 Scene ${i + 1}: i2v with ${charWithFace.name}'s face → ${prediction.id}`);
        } else {
          // Standard text-to-video
          prediction = await replicate.predictions.create({
            model: MODELS.video,
            input: { prompt: scenePrompt.substring(0, 2000), num_frames: 81 }
          });
          console.log(`  📹 Scene ${i + 1}: t2v → ${prediction.id}`);
        }

        scene.taskId = prediction.id;
        scene.status = 'generating';
        tasks.push({ taskId: prediction.id, sceneNumber: i + 1, status: 'generating' });
      } catch (sceneErr) {
        console.error(`  ❌ Scene ${i + 1}:`, sceneErr.message?.substring(0, 100));
        // Retry on rate limit
        if (sceneErr.message?.includes('429') || sceneErr.message?.includes('throttled')) {
          const retryMatch = sceneErr.message.match(/resets in ~(\d+)s/);
          const wait = retryMatch ? (parseInt(retryMatch[1]) + 2) * 1000 : 12000;
          await new Promise(r => setTimeout(r, wait));
          try {
            const retryPred = await replicate.predictions.create({
              model: charWithFace ? MODELS.video_i2v : MODELS.video,
              input: { prompt: scenePrompt.substring(0, 2000), num_frames: 81, ...(charWithFace ? { image: charWithFace.faceImageUrl } : {}) }
            });
            scene.taskId = retryPred.id;
            scene.status = 'generating';
            tasks.push({ taskId: retryPred.id, sceneNumber: i + 1, status: 'generating' });
            console.log(`  📹 Scene ${i + 1} retry → ${retryPred.id}`);
            continue;
          } catch {}
        }
        scene.status = 'failed';
        tasks.push({ taskId: null, sceneNumber: i + 1, status: 'failed' });
      }
    }

    await project.save();

    res.json({
      ok: true,
      projectId: project._id,
      episodeId: ep._id,
      tasks,
      totalScenes: ep.scenes.length
    });
  } catch (e) {
    console.error('Episode generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════
//  EPISODE STATUS — Check all scene generation progress
// ═══════════════════════════════════════════

router.get('/:id/episodes/:epId/status', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const ep = project.episodes.id(req.params.epId);
    if (!ep) return res.status(404).json({ error: 'Episode not found' });

    let updated = false;
    for (const scene of ep.scenes) {
      if (scene.status === 'generating' && scene.taskId) {
        try {
          const prediction = await replicate.predictions.get(scene.taskId);
          if (prediction.status === 'succeeded') {
            scene.videoUrl = extractUrl(prediction.output);
            scene.status = 'completed';
            updated = true;
          } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
            scene.status = 'failed';
            updated = true;
          }
        } catch {}
      }
    }

    if (updated) await project.save();

    const completed = ep.scenes.filter(s => s.status === 'completed').length;
    const failed = ep.scenes.filter(s => s.status === 'failed').length;
    const generating = ep.scenes.filter(s => s.status === 'generating').length;
    const allDone = generating === 0;

    if (allDone && completed > 0 && ep.status === 'generating') {
      ep.status = 'rendered';
      await project.save();
    }

    res.json({
      scenes: ep.scenes.map(s => ({ sceneNumber: s.sceneNumber, status: s.status, videoUrl: s.videoUrl || null })),
      summary: { total: ep.scenes.length, completed, failed, generating },
      allDone,
      progress: Math.round((completed / ep.scenes.length) * 100)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// Delete ALL episodes from a project
router.delete('/:id/episodes', auth, async (req, res) => {
  try {
    const updated = await MovieProject.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { $set: { episodes: [], totalEpisodes: 0, updatedAt: new Date() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    console.log(`🗑️ All episodes deleted from "${updated.title}"`);
    res.json({ ok: true, message: 'All episodes deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Re-script an episode (rewrite script from scratch)
router.post('/:id/episodes/:epId/re-script', auth, async (req, res) => {
  try {
    const updated = await MovieProject.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, 'episodes._id': req.params.epId },
      {
        $set: {
          'episodes.$.scenes': [],
          'episodes.$.status': 'draft',
          'episodes.$.mergedVideoUrl': '',
          'episodes.$.updatedAt': new Date()
        }
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    const ep = updated.episodes.id(req.params.epId);
    console.log(`🔄 Episode "${ep?.title}" reset to draft for re-scripting`);
    res.json({ ok: true, episode: ep });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update a single scene within an episode
router.put('/:id/episodes/:epId/scenes/:sceneIdx', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const ep = project.episodes.id(req.params.epId);
    if (!ep) return res.status(404).json({ error: 'Episode not found' });
    const idx = parseInt(req.params.sceneIdx);
    if (isNaN(idx) || idx < 0 || idx >= ep.scenes.length) return res.status(404).json({ error: 'Scene not found' });

    const allowed = ['visual', 'camera', 'textOverlay', 'narration', 'mood', 'transition', 'dialogue', 'duration'];
    for (const k of allowed) { if (req.body[k] !== undefined) ep.scenes[idx][k] = req.body[k]; }
    await project.save();
    res.json({ ok: true, scene: ep.scenes[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a single scene from an episode
router.delete('/:id/episodes/:epId/scenes/:sceneIdx', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const ep = project.episodes.id(req.params.epId);
    if (!ep) return res.status(404).json({ error: 'Episode not found' });
    const idx = parseInt(req.params.sceneIdx);
    if (isNaN(idx) || idx < 0 || idx >= ep.scenes.length) return res.status(404).json({ error: 'Scene not found' });

    ep.scenes.splice(idx, 1);
    // Renumber remaining scenes
    ep.scenes.forEach((s, i) => { s.sceneNumber = i + 1; });
    await project.save();
    res.json({ ok: true, scenesRemaining: ep.scenes.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete all scenes from an episode (reset to scripted-empty)
router.delete('/:id/episodes/:epId/scenes', auth, async (req, res) => {
  try {
    const updated = await MovieProject.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, 'episodes._id': req.params.epId },
      { $set: { 'episodes.$.scenes': [], 'episodes.$.status': 'draft', 'episodes.$.mergedVideoUrl': '' } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════
//  AI SERIES PLANNER — Generate episode outlines for entire season
// ═══════════════════════════════════════════

router.post('/:id/plan-season', auth, async (req, res) => {
  try {
    const project = await MovieProject.findOne({ _id: req.params.id, user: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { episodeCount = 6, episodeDuration = 60 } = req.body;
    const totalCount = Math.min(episodeCount, 200);
    const batchSize = 10;

    const charDescs = project.characters.map(c => `- ${c.name} (${c.role}): ${c.description || ''}`).join('\n');
    const existingCount = project.episodes?.length || 0;

    console.log(`🎬 Planning season for "${project.title}" (${totalCount} episodes in batches of ${batchSize})...`);

    let totalCreated = 0;
    let batchNum = 0;
    let lastFiveEpisodes = []; // context for continuity

    for (let planned = 0; planned < totalCount; planned += batchSize) {
      batchNum++;
      const thisBatch = Math.min(batchSize, totalCount - planned);
      const startNum = existingCount + planned + 1;

      const previousPlanned = lastFiveEpisodes.slice(-5).map(e => `Ep ${e.episodeNumber}: "${e.title}" — ${e.synopsis}`).join('\n');

      const systemPrompt = `You are a professional TV series showrunner for CYBEV Studio.

SHOW: "${project.title}"
GENRE: ${Array.isArray(project.genre) ? project.genre.join(', ') : project.genre}
LOGLINE: ${project.logline || 'Not specified'}
CHARACTERS:\n${charDescs || '(Create compelling characters)'}
${previousPlanned ? `\nPREVIOUS EPISODES PLANNED:\n${previousPlanned}\n\nContinue the story from here.` : ''}

Respond with ONLY valid JSON:
{
  "episodes": [
    {
      "episodeNumber": ${startNum},
      "title": "string — creative episode title",
      "synopsis": "string — 1-2 sentence plot summary",
      "endHook": "string — cliffhanger"
    }
  ]
}

Plan exactly ${thisBatch} episodes starting from episode ${startNum}. Keep synopses to 1 sentence.`;

      try {
        const plan = await aiGenerate(systemPrompt, `Plan episodes ${startNum}-${startNum + thisBatch - 1} of "${project.title}".`);
        if (plan.episodes && Array.isArray(plan.episodes)) {
          const batchEpisodes = plan.episodes.map((ep, i) => ({
            episodeNumber: startNum + i,
            title: ep.title || `Episode ${startNum + i}`,
            synopsis: ep.synopsis || '',
            duration: episodeDuration,
            status: 'draft'
          }));

          // SAVE IMMEDIATELY after each batch — so episodes persist even if later batches fail
          await MovieProject.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            {
              $push: { episodes: { $each: batchEpisodes } },
              $set: { status: 'in-production', updatedAt: new Date() },
              $inc: { totalEpisodes: batchEpisodes.length }
            }
          );

          totalCreated += batchEpisodes.length;
          lastFiveEpisodes.push(...batchEpisodes);
          console.log(`  ✅ Batch ${batchNum}: ${batchEpisodes.length} episodes saved (${startNum}-${startNum + batchEpisodes.length - 1}) [total: ${totalCreated}]`);
        }
      } catch (e) {
        console.error(`  ❌ Batch ${batchNum} failed:`, e.message?.substring(0, 100));
        // Retry once with simpler prompt
        try {
          const retryPlan = await aiGenerate(
            `You are a TV showrunner. Respond ONLY with valid JSON: {"episodes":[{"episodeNumber":${startNum},"title":"string","synopsis":"string"}]}. Plan ${thisBatch} episodes starting at ${startNum} for "${project.title}". 1 sentence synopses only.`,
            `Plan episodes ${startNum}-${startNum + thisBatch - 1}.`
          );
          if (retryPlan.episodes?.length) {
            const retryEps = retryPlan.episodes.map((ep, i) => ({
              episodeNumber: startNum + i, title: ep.title || `Episode ${startNum + i}`,
              synopsis: ep.synopsis || '', duration: episodeDuration, status: 'draft'
            }));
            await MovieProject.findOneAndUpdate(
              { _id: req.params.id, user: req.user.id },
              { $push: { episodes: { $each: retryEps } }, $inc: { totalEpisodes: retryEps.length } }
            );
            totalCreated += retryEps.length;
            lastFiveEpisodes.push(...retryEps);
            console.log(`  🔄 Batch ${batchNum} retry: ${retryEps.length} episodes saved`);
          }
        } catch { console.error(`  ❌ Batch ${batchNum} retry also failed, skipping`); }
      }
    }

    if (totalCreated === 0) {
      return res.status(500).json({ error: 'Failed to plan any episodes. Try again or use fewer episodes.' });
    }

    // Fetch final state
    const final = await MovieProject.findById(req.params.id).select('-episodes.scenes').lean();
    console.log(`  ✅ Total planned: ${totalCreated}/${totalCount} episodes`);
    res.json({ ok: true, episodesCreated: totalCreated, requested: totalCount, project: final });
  } catch (e) {
    console.error('Season plan error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;
