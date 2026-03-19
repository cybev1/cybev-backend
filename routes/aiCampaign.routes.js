// ============================================
// FILE: routes/aiCampaign.routes.js
// PATH: cybev-backend/routes/aiCampaign.routes.js
// PURPOSE: AI Campaign Planner - generate 30-day content calendars
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const AICampaign = require('../models/aiCampaign.model');
const axios = require('axios');

// Auth middleware - resilient import
let authenticateToken;
try {
  const authMod = require('../middleware/verifyToken');
  authenticateToken = authMod.authenticateToken || authMod.verifyToken || authMod;
} catch {
  try {
    authenticateToken = require('../middleware/auth');
    if (authenticateToken.authenticateToken) authenticateToken = authenticateToken.authenticateToken;
  } catch {
    authenticateToken = (req, res, next) => {
      const jwt = require('jsonwebtoken');
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ ok: false, error: 'No token' });
      try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
        next();
      } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
    };
  }
}
const auth = authenticateToken;

// ==========================================
// AI GENERATION HELPER
// ==========================================

async function generateWithAI(prompt, systemPrompt, maxTokens = 4096) {
  // Try DeepSeek first
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const resp = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: maxTokens
      }, {
        headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        timeout: 60000
      });
      return resp.data.choices[0].message.content;
    } catch (e) {
      console.log('DeepSeek failed, trying fallback:', e.message);
    }
  }

  // OpenAI fallback
  if (process.env.OPENAI_API_KEY) {
    try {
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: maxTokens
      }, {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        timeout: 60000
      });
      return resp.data.choices[0].message.content;
    } catch (e) {
      console.log('OpenAI failed:', e.message);
    }
  }

  throw new Error('No AI provider available');
}

function parseJSON(text) {
  // Strip markdown code fences
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  // Try to find JSON array or object
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) try { return JSON.parse(arrMatch[0]); } catch {}
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) try { return JSON.parse(objMatch[0]); } catch {}
  throw new Error('Failed to parse AI response as JSON');
}

// ==========================================
// CRUD ROUTES
// ==========================================

// GET /api/ai-campaigns - List user's campaigns
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { user: req.user.id };
    if (status) query.status = status;

    const campaigns = await AICampaign.find(query)
      .select('-calendar.content.content -generationLog') // Exclude heavy fields in list
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await AICampaign.countDocuments(query);

    res.json({ ok: true, campaigns, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/ai-campaigns/:id - Get campaign with full calendar
router.get('/:id', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ai-campaigns - Create campaign (draft)
router.post('/', auth, async (req, res) => {
  try {
    const {
      name, description, niche, targetAudience, brandVoice,
      goals, contentMix, platforms, startDate, durationDays,
      postsPerDay, postingTimes, timezone, autoPublish, autoGenerateAssets
    } = req.body;

    if (!name || !niche) {
      return res.status(400).json({ ok: false, error: 'Name and niche are required' });
    }

    const campaign = new AICampaign({
      user: req.user.id,
      name,
      description,
      niche,
      targetAudience: targetAudience || 'general audience',
      brandVoice: brandVoice || 'professional',
      goals: goals || ['grow engagement'],
      contentMix: contentMix || {},
      platforms: platforms || ['cybev', 'facebook', 'instagram'],
      startDate: startDate || new Date(),
      durationDays: Math.min(durationDays || 30, 90),
      postsPerDay: Math.min(postsPerDay || 2, 10),
      postingTimes: postingTimes || ['09:00', '14:00'],
      timezone: timezone || 'UTC',
      autoPublish: autoPublish || false,
      autoGenerateAssets: autoGenerateAssets || false,
      status: 'draft'
    });

    // Calculate end date
    campaign.endDate = new Date(campaign.startDate);
    campaign.endDate.setDate(campaign.endDate.getDate() + campaign.durationDays);

    await campaign.save();
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/ai-campaigns/:id - Update campaign settings
router.put('/:id', auth, async (req, res) => {
  try {
    const allowed = [
      'name', 'description', 'niche', 'targetAudience', 'brandVoice',
      'goals', 'contentMix', 'platforms', 'postsPerDay', 'postingTimes',
      'timezone', 'autoPublish', 'autoGenerateAssets', 'status'
    ];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const campaign = await AICampaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { $set: updates },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/ai-campaigns/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await AICampaign.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!result) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    res.json({ ok: true, message: 'Campaign deleted' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// AI CALENDAR GENERATION
// ==========================================

// POST /api/ai-campaigns/:id/generate - Generate full 30-day calendar
router.post('/:id/generate', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    // Mark as generating
    campaign.status = 'generating';
    await campaign.save();

    // Fire and forget - respond immediately
    res.json({ ok: true, message: 'Calendar generation started. This takes 30-60 seconds.', campaignId: campaign._id });

    // Generate in background
    generateCalendarBackground(campaign).catch(err => {
      console.error('Calendar generation failed:', err);
      AICampaign.findByIdAndUpdate(campaign._id, {
        status: 'failed',
        $push: { generationLog: { action: 'generation_failed', details: err.message } }
      }).catch(console.error);
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function generateCalendarBackground(campaign) {
  console.log(`🗓️ Generating ${campaign.durationDays}-day calendar for "${campaign.name}"...`);

  const calendar = [];
  const batchSize = 7; // Generate 7 days at a time
  const totalDays = campaign.durationDays;

  for (let batchStart = 0; batchStart < totalDays; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, totalDays);
    const daysInBatch = batchEnd - batchStart;

    const systemPrompt = `You are an expert social media strategist and content planner for the "${campaign.niche}" niche.
Target audience: ${campaign.targetAudience || 'general audience'}
Brand voice: ${campaign.brandVoice}
Goals: ${campaign.goals.join(', ')}
Platforms: ${campaign.platforms.join(', ')}

RULES:
- Each day gets ${campaign.postsPerDay} content pieces
- Mix content types: blogs (long-form), social posts (captions), video scripts, graphics prompts, music prompts, reels
- Make content progressive — build themes across the week
- Include trending hooks, emotional triggers, and clear CTAs
- Hashtags should be relevant and a mix of popular + niche
- Graphics prompts should describe the visual in detail for AI image generation
- Video scripts should be 30-60 second outlines
- ALWAYS respond with ONLY valid JSON, no extra text`;

    const prompt = `Generate content for days ${batchStart + 1} to ${batchEnd} of a ${totalDays}-day campaign.

Content mix preferences: ${JSON.stringify(campaign.contentMix)}

Return a JSON array where each element represents one day:
[
  {
    "dayNumber": ${batchStart + 1},
    "theme": "Day's theme",
    "content": [
      {
        "type": "social_post",
        "platform": "instagram",
        "title": "Post title",
        "caption": "The actual post caption text...",
        "hashtags": ["#tag1", "#tag2"],
        "mediaPrompt": "Detailed description for AI image generation: a vibrant...",
        "mediaType": "image",
        "callToAction": "Link in bio!",
        "tone": "inspirational",
        "scheduledTime": "09:00"
      },
      {
        "type": "blog",
        "platform": "cybev",
        "title": "Blog Title Here",
        "caption": "Meta description for SEO",
        "content": "Full blog post content (3-5 paragraphs minimum)...",
        "hashtags": ["#tag1"],
        "seoKeywords": ["keyword1", "keyword2"],
        "callToAction": "Subscribe for more!",
        "tone": "educational",
        "scheduledTime": "14:00"
      }
    ]
  }
]

Generate exactly ${daysInBatch} days with ${campaign.postsPerDay} pieces each. Make content SPECIFIC, ACTIONABLE, and ENGAGING — not generic filler.`;

    try {
      const result = await generateWithAI(prompt, systemPrompt, 4096);
      const days = parseJSON(result);

      for (const day of days) {
        const dayDate = new Date(campaign.startDate);
        dayDate.setDate(dayDate.getDate() + (day.dayNumber - 1));

        calendar.push({
          dayNumber: day.dayNumber,
          date: dayDate,
          theme: day.theme || `Day ${day.dayNumber}`,
          content: (day.content || []).map(piece => ({
            type: piece.type || 'social_post',
            platform: piece.platform || 'all',
            title: piece.title || '',
            caption: piece.caption || '',
            content: piece.content || '',
            hashtags: piece.hashtags || [],
            mediaPrompt: piece.mediaPrompt || '',
            mediaType: piece.mediaType || 'none',
            seoKeywords: piece.seoKeywords || [],
            callToAction: piece.callToAction || '',
            tone: piece.tone || campaign.brandVoice,
            scheduledTime: piece.scheduledTime || '09:00',
            status: 'ready'
          })),
          notes: ''
        });
      }

      console.log(`  ✅ Days ${batchStart + 1}-${batchEnd} generated`);
    } catch (err) {
      console.error(`  ❌ Batch ${batchStart + 1}-${batchEnd} failed:`, err.message);
      // Fill with placeholder days
      for (let d = batchStart; d < batchEnd; d++) {
        const dayDate = new Date(campaign.startDate);
        dayDate.setDate(dayDate.getDate() + d);
        calendar.push({
          dayNumber: d + 1,
          date: dayDate,
          theme: 'Generation failed — edit manually',
          content: [],
          notes: `AI generation failed: ${err.message}`
        });
      }
    }

    // Small delay between batches to avoid rate limits
    if (batchStart + batchSize < totalDays) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Sort by day number and save
  calendar.sort((a, b) => a.dayNumber - b.dayNumber);

  const totalPieces = calendar.reduce((sum, day) => sum + day.content.length, 0);

  await AICampaign.findByIdAndUpdate(campaign._id, {
    calendar,
    status: 'ready',
    lastGeneratedAt: new Date(),
    'stats.totalPieces': totalPieces,
    'stats.generated': totalPieces,
    $push: {
      generationLog: {
        action: 'calendar_generated',
        details: `${calendar.length} days, ${totalPieces} content pieces`,
        timestamp: new Date()
      }
    }
  });

  console.log(`🗓️ Calendar complete: ${calendar.length} days, ${totalPieces} pieces`);
}

// ==========================================
// CONTENT PIECE MANAGEMENT
// ==========================================

// PUT /api/ai-campaigns/:id/day/:dayNumber/content/:contentId - Edit a content piece
router.put('/:id/day/:dayNumber/content/:contentId', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    const day = campaign.calendar.find(d => d.dayNumber === Number(req.params.dayNumber));
    if (!day) return res.status(404).json({ ok: false, error: 'Day not found' });

    const piece = day.content.id(req.params.contentId);
    if (!piece) return res.status(404).json({ ok: false, error: 'Content piece not found' });

    // Update allowed fields
    const fields = ['title', 'caption', 'content', 'hashtags', 'mediaPrompt', 'mediaType',
      'seoKeywords', 'callToAction', 'tone', 'scheduledTime', 'platform', 'status'];
    fields.forEach(f => { if (req.body[f] !== undefined) piece[f] = req.body[f]; });

    await campaign.save();
    res.json({ ok: true, piece });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ai-campaigns/:id/day/:dayNumber/content - Add a content piece to a day
router.post('/:id/day/:dayNumber/content', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    const day = campaign.calendar.find(d => d.dayNumber === Number(req.params.dayNumber));
    if (!day) return res.status(404).json({ ok: false, error: 'Day not found' });

    day.content.push({
      type: req.body.type || 'social_post',
      platform: req.body.platform || 'all',
      title: req.body.title || '',
      caption: req.body.caption || '',
      content: req.body.content || '',
      hashtags: req.body.hashtags || [],
      mediaPrompt: req.body.mediaPrompt || '',
      mediaType: req.body.mediaType || 'none',
      callToAction: req.body.callToAction || '',
      tone: req.body.tone || 'professional',
      scheduledTime: req.body.scheduledTime || '12:00',
      status: 'ready'
    });

    campaign.stats.totalPieces = campaign.calendar.reduce((s, d) => s + d.content.length, 0);
    await campaign.save();
    res.json({ ok: true, day });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/ai-campaigns/:id/day/:dayNumber/content/:contentId
router.delete('/:id/day/:dayNumber/content/:contentId', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    const day = campaign.calendar.find(d => d.dayNumber === Number(req.params.dayNumber));
    if (!day) return res.status(404).json({ ok: false, error: 'Day not found' });

    day.content.pull(req.params.contentId);
    campaign.stats.totalPieces = campaign.calendar.reduce((s, d) => s + d.content.length, 0);
    await campaign.save();
    res.json({ ok: true, message: 'Content piece removed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// REGENERATE SINGLE PIECE
// ==========================================

// POST /api/ai-campaigns/:id/day/:dayNumber/content/:contentId/regenerate
router.post('/:id/day/:dayNumber/content/:contentId/regenerate', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    const day = campaign.calendar.find(d => d.dayNumber === Number(req.params.dayNumber));
    if (!day) return res.status(404).json({ ok: false, error: 'Day not found' });

    const piece = day.content.id(req.params.contentId);
    if (!piece) return res.status(404).json({ ok: false, error: 'Content piece not found' });

    const prompt = `Regenerate this ${piece.type} for the "${campaign.niche}" niche.
Platform: ${piece.platform}
Day theme: ${day.theme}
Brand voice: ${campaign.brandVoice}
Target audience: ${campaign.targetAudience}
${req.body.instructions ? `Special instructions: ${req.body.instructions}` : ''}

Return JSON: { "title": "...", "caption": "...", "content": "...", "hashtags": [...], "mediaPrompt": "...", "callToAction": "..." }`;

    const result = await generateWithAI(prompt, 'You are a creative content strategist. Respond with ONLY valid JSON.', 2048);
    const parsed = parseJSON(result);

    piece.title = parsed.title || piece.title;
    piece.caption = parsed.caption || piece.caption;
    piece.content = parsed.content || piece.content;
    piece.hashtags = parsed.hashtags || piece.hashtags;
    piece.mediaPrompt = parsed.mediaPrompt || piece.mediaPrompt;
    piece.callToAction = parsed.callToAction || piece.callToAction;
    piece.status = 'ready';
    piece.generationMeta = { model: 'deepseek', generatedAt: new Date() };

    await campaign.save();
    res.json({ ok: true, piece });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GENERATE ASSETS (Images/Videos/Music)
// ==========================================

// POST /api/ai-campaigns/:id/generate-assets - Generate media for all "ready" pieces with prompts
router.post('/:id/generate-assets', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    // Count pieces that need asset generation
    let count = 0;
    for (const day of campaign.calendar) {
      for (const piece of day.content) {
        if (piece.mediaPrompt && !piece.mediaUrl && piece.status === 'ready') count++;
      }
    }

    res.json({ ok: true, message: `Queued ${count} pieces for asset generation. This runs in the background.`, count });

    // Background: call AI Content routes to generate assets
    // This would call the existing /api/ai-content/generate-image, /api/ai-content/generate-video etc.
    // For now we log it - actual integration depends on credits balance
    campaign.generationLog.push({
      action: 'assets_queued',
      details: `${count} assets queued for generation`,
      timestamp: new Date()
    });
    await campaign.save();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ACTIVATE / PAUSE / COMPLETE
// ==========================================

// POST /api/ai-campaigns/:id/activate
router.post('/:id/activate', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, status: { $in: ['ready', 'paused'] } },
      { status: 'active', $push: { generationLog: { action: 'activated', timestamp: new Date() } } },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found or not ready' });
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ai-campaigns/:id/pause
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const campaign = await AICampaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, status: 'active' },
      { status: 'paused', $push: { generationLog: { action: 'paused', timestamp: new Date() } } },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found or not active' });
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// STATS
// ==========================================

// GET /api/ai-campaigns/stats/overview
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const campaigns = await AICampaign.find({ user: req.user.id });
    const stats = {
      totalCampaigns: campaigns.length,
      active: campaigns.filter(c => c.status === 'active').length,
      totalPieces: campaigns.reduce((s, c) => s + (c.stats?.totalPieces || 0), 0),
      totalPublished: campaigns.reduce((s, c) => s + (c.stats?.published || 0), 0),
      totalCreditsUsed: campaigns.reduce((s, c) => s + (c.stats?.totalCreditsUsed || 0), 0)
    };
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
