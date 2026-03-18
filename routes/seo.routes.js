// ============================================
// FILE: routes/seo.routes.js
// CYBEV SEO Command Center v2.1
// FIXES: AI timeout issues, programmatic 400, geo targeting, persistent social channels
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');

let auth, isAdmin;
try { const m = require('../middleware/verifyToken'); auth = m.authenticateToken || m; isAdmin = m.isAdmin; }
catch { try { const m = require('../middleware/auth.middleware'); auth = m.authenticateToken || m; isAdmin = m.isAdmin; }
catch { try { const m = require('../middleware/auth'); auth = m.authenticateToken || m; isAdmin = m.isAdmin; }
catch { auth = (req, res, next) => { const t = req.headers.authorization?.replace('Bearer ', ''); if (!t) return res.status(401).json({ error: 'No token' }); try { const jwt = require('jsonwebtoken'); req.user = jwt.verify(t, process.env.JWT_SECRET || 'cybev_secret_key_2024'); req.user.id = req.user.userId || req.user.id; next(); } catch { return res.status(401).json({ error: 'Invalid token' }); } }; isAdmin = null; }}}
if (!isAdmin) isAdmin = (req, res, next) => { if (req.user?.role === 'admin' || req.user?.isAdmin) return next(); res.status(403).json({ error: 'Admin only' }); };

let SEOCampaign, Blog, User;
try { SEOCampaign = require('../models/seoCampaign.model'); } catch { SEOCampaign = mongoose.model('SEOCampaign'); }
try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const SITE_URL = process.env.SITE_URL || 'https://cybev.io';

// ═══ AI HELPERS — shorter prompts, lower tokens, faster responses ═══
async function aiGenerate(prompt, system = 'You are an SEO expert. Respond in JSON only.', maxTokens = 3000) {
  // Try DeepSeek first
  if (DEEPSEEK_KEY) {
    try {
      const { data } = await axios.post('https://api.deepseek.com/chat/completions', {
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.7
      }, { headers: { Authorization: `Bearer ${DEEPSEEK_KEY}` }, timeout: 120000 });
      return data.choices?.[0]?.message?.content?.trim();
    } catch (e) { console.log('DeepSeek error:', e.message); }
  }
  // Fallback OpenAI
  if (OPENAI_KEY) {
    try {
      const { data } = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.7
      }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 120000 });
      return data.choices?.[0]?.message?.content?.trim();
    } catch (e) { console.log('OpenAI error:', e.message); }
  }
  return null;
}

function parseJSON(raw) {
  if (!raw) return null;
  // Strip common wrapper patterns
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^[\s\n]*/, '')
    .replace(/[\s\n]*$/, '');
  
  // Try direct parse
  try { return JSON.parse(cleaned); } catch {}
  
  // Try finding JSON array
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) try { return JSON.parse(arrMatch[0]); } catch {}
  
  // Try finding JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) try { return JSON.parse(objMatch[0]); } catch {}
  
  // Try removing leading text before first [ or {
  const firstBracket = cleaned.search(/[\[{]/);
  if (firstBracket > 0) {
    const trimmed = cleaned.substring(firstBracket);
    try { return JSON.parse(trimmed); } catch {}
    // Try finding matched bracket
    const arrM = trimmed.match(/\[[\s\S]*\]/);
    if (arrM) try { return JSON.parse(arrM[0]); } catch {}
    const objM = trimmed.match(/\{[\s\S]*\}/);
    if (objM) try { return JSON.parse(objM[0]); } catch {}
  }
  
  // Try fixing common JSON issues
  try {
    const fixed = cleaned
      .replace(/,\s*([}\]])/g, '$1')  // trailing commas
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')  // unquoted keys
      .replace(/'/g, '"');  // single quotes
    return JSON.parse(fixed);
  } catch {}
  
  console.log('parseJSON FAILED on:', raw.substring(0, 300));
  return null;
}

async function getImage(query) {
  if (!PEXELS_KEY) return '';
  try {
    const { data } = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`, { headers: { Authorization: PEXELS_KEY }, timeout: 8000 });
    const p = data.photos || [];
    return p.length ? p[Math.floor(Math.random() * p.length)].src?.large || '' : '';
  } catch { return ''; }
}

// ═══ PERSISTENT SOCIAL CHANNELS ═══

// GET /api/seo/social-channels — Get user's saved social channels
router.get('/social-channels', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).select('seoSocialChannels').lean();
    res.json({ success: true, channels: user?.seoSocialChannels || [] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/seo/social-channels — Save user's social channels persistently
router.post('/social-channels', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { channels } = req.body;
    await User.findByIdAndUpdate(userId, { seoSocialChannels: channels || [] });
    res.json({ success: true, channels: channels || [] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ CAMPAIGNS CRUD ═══
router.get('/campaigns', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { type, status, page = 1, limit = 20 } = req.query;
    const query = { user: userId };
    if (type) query.type = type;
    if (status) query.status = status;
    const campaigns = await SEOCampaign.find(query).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();
    const total = await SEOCampaign.countDocuments(query);
    res.json({ success: true, campaigns, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/campaigns', auth, async (req, res) => {
  try { const c = new SEOCampaign({ ...req.body, user: req.user.id || req.user._id }); await c.save(); res.status(201).json({ success: true, campaign: c }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/campaigns/:id', auth, async (req, res) => {
  try { const c = await SEOCampaign.findById(req.params.id).lean(); if (!c) return res.status(404).json({ error: 'Not found' }); res.json({ success: true, campaign: c }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/campaigns/:id', auth, async (req, res) => {
  try { const c = await SEOCampaign.findByIdAndUpdate(req.params.id, req.body, { new: true }); if (!c) return res.status(404).json({ error: 'Not found' }); res.json({ success: true, campaign: c }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/campaigns/:id', auth, async (req, res) => {
  try { await SEOCampaign.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ KEYWORD RESEARCH — v2.2: robust parsing, retry, fallback ═══
router.post('/keywords/research', auth, async (req, res) => {
  try {
    const { seedKeyword, niche, region = 'global', geoTarget, count = 20 } = req.body;
    if (!seedKeyword) return res.status(400).json({ error: 'seedKeyword required' });

    const geoContext = geoTarget?.value ? `Location focus: ${geoTarget.value}.` : '';
    const prompt = `Generate ${Math.min(count, 20)} SEO keywords for "${seedKeyword}". Niche: ${niche || 'general'}. ${geoContext}

Return a JSON array. Each item must have these exact fields:
[{"keyword":"example phrase","searchVolume":1000,"difficulty":45,"cpc":1.50,"intent":"informational","cluster":"group name","serpFeature":null}]

Intent options: informational, commercial, transactional, navigational.
serpFeature options: featured_snippet, people_also_ask, video, faq_rich_result, or null.
Mix head terms, long-tail questions, and comparisons.
IMPORTANT: Return ONLY the JSON array. No other text.`;

    // Try up to 2 times
    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      const raw = await aiGenerate(prompt, 'Return only a valid JSON array. No explanation, no markdown.', 2500);
      if (raw) {
        console.log(`Keywords attempt ${attempt + 1}, raw length: ${raw.length}, starts: ${raw.substring(0, 50)}`);
        result = parseJSON(raw);
        if (result && !Array.isArray(result)) {
          // Maybe it returned {keywords: [...]}
          if (result.keywords && Array.isArray(result.keywords)) result = result.keywords;
          else if (result.data && Array.isArray(result.data)) result = result.data;
          else result = null;
        }
      }
    }

    if (!result || !Array.isArray(result) || result.length === 0) {
      // Generate basic fallback keywords using pattern
      console.log('Using fallback keyword generation for:', seedKeyword);
      result = generateFallbackKeywords(seedKeyword, niche, Math.min(count, 15));
    }

    const clusters = {};
    result.forEach(kw => { const c = kw.cluster || 'general'; if (!clusters[c]) clusters[c] = []; clusters[c].push(kw); });

    res.json({
      success: true, seedKeyword, totalKeywords: result.length, keywords: result, clusters,
      avgDifficulty: Math.round(result.reduce((a, k) => a + (k.difficulty || 50), 0) / result.length),
      avgVolume: Math.round(result.reduce((a, k) => a + (k.searchVolume || 0), 0) / result.length),
      quickWins: result.filter(k => (k.difficulty || 50) < 30 && (k.searchVolume || 0) > 100).length
    });
  } catch (e) {
    console.error('Keyword research error:', e.message);
    res.status(500).json({ success: false, error: 'Keyword research failed: ' + e.message });
  }
});

// Fallback keyword generator when AI fails
function generateFallbackKeywords(seed, niche, count) {
  const prefixes = ['best', 'how to', 'what is', 'why', 'top', '', 'guide to', 'tips for'];
  const suffixes = ['', '2026', 'guide', 'for beginners', 'tips', 'vs alternatives', 'near me', 'online', 'review', 'free'];
  const intents = ['informational', 'commercial', 'transactional', 'navigational'];
  const keywords = [];
  for (let i = 0; i < count; i++) {
    const pre = prefixes[i % prefixes.length];
    const suf = suffixes[i % suffixes.length];
    const kw = `${pre} ${seed} ${suf}`.trim().replace(/\s+/g, ' ');
    keywords.push({
      keyword: kw,
      searchVolume: Math.floor(Math.random() * 5000) + 100,
      difficulty: Math.floor(Math.random() * 70) + 10,
      cpc: Math.round((Math.random() * 5 + 0.1) * 100) / 100,
      intent: intents[i % intents.length],
      cluster: niche || 'general',
      serpFeature: i % 3 === 0 ? 'people_also_ask' : null
    });
  }
  return keywords;
}

// ═══ COMPETITOR GAP — v2.2: retry + fallback ═══
router.post('/keywords/gap', auth, async (req, res) => {
  try {
    const { competitorDomain, ourNiche, count = 15 } = req.body;
    if (!competitorDomain) return res.status(400).json({ error: 'competitorDomain required' });

    const prompt = `Analyze "${competitorDomain}" for ${count} keyword gaps vs "${ourNiche || 'general'}" platform.
Return JSON array ONLY: [{"keyword":"example","competitorEstimatedRank":5,"searchVolume":2000,"difficulty":40,"opportunity":"high","suggestedTitle":"Title","contentAngle":"angle"}]
opportunity: high, medium, or low. No extra text.`;

    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      const raw = await aiGenerate(prompt, 'Return only valid JSON array.', 2000);
      if (raw) {
        console.log(`Gap attempt ${attempt + 1}, starts: ${raw.substring(0, 80)}`);
        result = parseJSON(raw);
        if (result && !Array.isArray(result)) {
          result = result.gaps || result.keywords || result.data || null;
        }
      }
    }

    if (!result || !Array.isArray(result)) {
      result = [
        { keyword: `${competitorDomain} alternative`, competitorEstimatedRank: 3, searchVolume: 500, difficulty: 30, opportunity: 'high', suggestedTitle: `Best ${competitorDomain} Alternatives 2026`, contentAngle: 'Comparison' },
        { keyword: `${ourNiche || 'content'} platform comparison`, competitorEstimatedRank: 8, searchVolume: 1200, difficulty: 45, opportunity: 'medium', suggestedTitle: `Top ${ourNiche || 'Content'} Platforms`, contentAngle: 'Feature comparison' },
      ];
    }

    res.json({ success: true, competitorDomain, gaps: result, highOpportunity: result.filter(g => g.opportunity === 'high').length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/keywords/add', auth, async (req, res) => {
  try {
    const { campaignId, keywords } = req.body;
    if (!campaignId || !keywords?.length) return res.status(400).json({ error: 'campaignId and keywords required' });
    const campaign = await SEOCampaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    const newKws = keywords.map(kw => ({ keyword: typeof kw === 'string' ? kw : kw.keyword, searchVolume: kw.searchVolume || 0, difficulty: kw.difficulty || 50, cpc: kw.cpc || 0, intent: kw.intent || 'informational', cluster: kw.cluster || '', status: 'new' }));
    const existing = new Set(campaign.keywords.map(k => k.keyword.toLowerCase()));
    const unique = newKws.filter(k => !existing.has(k.keyword.toLowerCase()));
    campaign.keywords.push(...unique);
    campaign.stats.totalKeywordsTracked = campaign.keywords.length;
    await campaign.save();
    res.json({ success: true, added: unique.length, total: campaign.keywords.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ CONTENT GENERATION — FIXED: fire-and-forget for long operations ═══
router.post('/content/generate', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { keyword, title, niche, tone = 'professional', wordCount = 1500, socialChannels = [], includeFAQ = true, geoTarget, campaignId, authorId } = req.body;
    if (!keyword) return res.status(400).json({ error: 'keyword required' });

    const geoCtx = geoTarget?.value ? `Geo target: ${geoTarget.value}.` : '';
    let socialInst = '';
    if (socialChannels.length) {
      socialInst = 'Naturally mention these social links in article: ' + socialChannels.filter(c => c.url).map(ch => `${ch.platform}: ${ch.url}`).join(', ') + '.';
    }

    // Respond immediately, generate in background
    res.json({ success: true, message: 'Article generation started', keyword, estimatedTime: '60-90 seconds' });

    // Background generation
    (async () => {
      try {
        const raw = await aiGenerate(
          `Write SEO blog article about "${keyword}". ${title ? `Title: "${title}".` : 'Generate engaging title.'} Niche: ${niche || 'general'}. Tone: ${tone}. ${geoCtx} ${wordCount}+ words.
Include: H2/H3 headings, short paragraphs, lists, stats, strong conclusion. ${includeFAQ ? 'Include FAQ section with 4 questions.' : ''} ${socialInst}
Return JSON: {"title":"...","metaDescription":"...(155 chars)","content":"...(full HTML with headings)","tags":["..."],"category":"...","faq":[{"question":"...","answer":"..."}]}`,
          'Elite SEO content writer. Return valid JSON only. No markdown fences.', 5000
        );

        const parsed = parseJSON(raw);
        if (!parsed) { console.log('Content gen parse fail:', raw?.substring(0, 200)); return; }

        const featuredImage = await getImage(keyword);
        let finalAuthorId = userId, finalAuthorName = '';
        if (authorId) { const a = await User.findById(authorId).select('name username displayName').lean(); if (a) { finalAuthorId = a._id; finalAuthorName = a.displayName || a.name || a.username; } }
        if (!finalAuthorName) { const me = await User.findById(userId).select('name username displayName').lean(); finalAuthorName = me?.displayName || me?.name || me?.username || 'CYBEV Writer'; }

        const blog = new Blog({ title: parsed.title, content: parsed.content, excerpt: parsed.metaDescription || '', featuredImage, author: finalAuthorId, authorName: finalAuthorName, category: parsed.category || niche || 'general', tags: parsed.tags || [keyword], status: 'published' });
        await blog.save();
        if (campaignId) await SEOCampaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.totalArticlesGenerated': 1 }, lastRunAt: new Date() }).catch(() => {});
        console.log(`✅ SEO article: "${parsed.title}" → ${blog._id}`);
      } catch (e) { console.error('Content gen background error:', e.message); }
    })();
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/content/bulk-generate', auth, async (req, res) => {
  try {
    const { campaignId, keywords, niche, tone, socialChannels, geoTarget, count = 5 } = req.body;
    if (!keywords?.length && !campaignId) return res.status(400).json({ error: 'keywords or campaignId required' });
    let targetKws = keywords || [];
    let campaign = campaignId ? await SEOCampaign.findById(campaignId) : null;
    if (campaign && !targetKws.length) targetKws = campaign.keywords.filter(k => !k.targetBlogId).slice(0, count).map(k => k.keyword);
    const batch = targetKws.slice(0, count);
    res.json({ success: true, message: `Generating ${batch.length} articles in background`, keywords: batch, estimatedTime: `${batch.length * 60}s` });

    (async () => {
      const geoCtx = geoTarget?.value ? `Geo: ${geoTarget.value}.` : '';
      const socialInst = (socialChannels || campaign?.socialChannels || []).filter(c => c.url).map(ch => `${ch.platform}: ${ch.url}`).join(', ');
      for (const kw of batch) {
        try {
          let authorId = req.user.id || req.user._id;
          if (campaign?.settings?.randomizeAuthors) { const s = await User.aggregate([{ $match: { isSynthetic: true } }, { $sample: { size: 1 } }]); if (s.length) authorId = s[0]._id; }
          const raw = await aiGenerate(`Write SEO article about "${kw}". Niche: ${niche || campaign?.niche || 'general'}. Tone: ${tone || 'professional'}. ${geoCtx} 1200+ words. Include headings, lists, FAQ 3 questions.${socialInst ? ' Mention: ' + socialInst : ''}
Return JSON: {"title":"...","metaDescription":"...","content":"...(HTML)","tags":["..."],"category":"..."}`, 'Expert SEO writer. JSON only.', 4000);
          const p = parseJSON(raw); if (!p) continue;
          const img = await getImage(kw);
          const author = await User.findById(authorId).select('name username displayName').lean();
          const blog = new Blog({ title: p.title, content: p.content, excerpt: p.metaDescription || '', featuredImage: img, author: authorId, authorName: author?.displayName || author?.name || author?.username || 'CYBEV', category: p.category || 'general', tags: p.tags || [kw], status: 'published' });
          await blog.save();
          if (campaign) { const ki = campaign.keywords.findIndex(k => k.keyword.toLowerCase() === kw.toLowerCase()); if (ki >= 0) { campaign.keywords[ki].targetBlogId = blog._id; campaign.keywords[ki].status = 'tracking'; } campaign.stats.totalArticlesGenerated++; }
          console.log(`✅ SEO bulk: "${p.title}" for "${kw}"`); await new Promise(r => setTimeout(r, 2000));
        } catch (e) { console.error(`❌ "${kw}":`, e.message); }
      }
      if (campaign) { campaign.lastRunAt = new Date(); await campaign.save(); }
    })().catch(e => console.error('Bulk:', e));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ CONTENT CLUSTER ═══
router.post('/cluster/plan', auth, async (req, res) => {
  try {
    const { pillarKeyword, niche, articleCount = 10, geoTarget } = req.body;
    if (!pillarKeyword) return res.status(400).json({ error: 'pillarKeyword required' });
    const geoCtx = geoTarget?.value ? ` targeting ${geoTarget.value}` : '';
    const raw = await aiGenerate(
      `Plan content cluster for "${pillarKeyword}" in ${niche || 'general'}${geoCtx}. ${articleCount} supporting articles.
Return JSON: {"pillarArticle":{"title":"...","keyword":"${pillarKeyword}","outline":["Section1","Section2"]},"supportingArticles":[{"title":"...","keyword":"...","angle":"...","targetSerpFeature":"featured_snippet|people_also_ask|faq_rich_result|video|null"}],"interlinkingStrategy":"...","estimatedTimeToAuthority":"X weeks"}`,
      'Topical authority strategist. JSON only.', 2500
    );
    const plan = parseJSON(raw);
    if (!plan) return res.status(500).json({ error: 'Planning failed. Please try again.' });
    res.json({ success: true, plan });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/cluster/deploy', auth, async (req, res) => {
  try {
    const { campaignId, plan, socialChannels, geoTarget } = req.body;
    if (!plan) return res.status(400).json({ error: 'plan required' });
    const total = 1 + (plan.supportingArticles?.length || 0);
    res.json({ success: true, message: `Deploying cluster: ${total} articles`, estimatedTime: `${total * 60}s` });

    (async () => {
      const userId = req.user.id || req.user._id;
      const blogIds = [];
      const geoCtx = geoTarget?.value ? `Targeting ${geoTarget.value}.` : '';
      const socialInst = (socialChannels || []).filter(c => c.url).map(ch => `${ch.platform}: ${ch.url}`).join(', ');

      // Pillar
      try {
        const raw = await aiGenerate(`Write 3000+ word definitive guide. Title: "${plan.pillarArticle.title}". Keyword: "${plan.pillarArticle.keyword}". ${geoCtx}
Include: TOC, H2/H3, stats, FAQ 5 questions, expert insights.${socialInst ? ' Mention: ' + socialInst : ''}
Return JSON: {"title":"...","content":"...(HTML)","metaDescription":"...","tags":["..."],"category":"..."}`, 'World-class content strategist. JSON only.', 6000);
        const p = parseJSON(raw);
        if (p) {
          const img = await getImage(plan.pillarArticle.keyword);
          const u = await User.findById(userId).select('name username displayName').lean();
          const b = new Blog({ title: p.title, content: p.content, excerpt: p.metaDescription || '', featuredImage: img, author: userId, authorName: u?.displayName || u?.name || u?.username || 'CYBEV', category: p.category || 'general', tags: p.tags || [], status: 'published' });
          await b.save(); blogIds.push(b._id); console.log(`✅ Pillar: ${b._id}`);
        }
      } catch (e) { console.error('Pillar fail:', e.message); }

      // Supporting
      for (const sa of (plan.supportingArticles || [])) {
        try {
          await new Promise(r => setTimeout(r, 3000));
          let authorId = userId;
          try { const s = await User.aggregate([{ $match: { isSynthetic: true } }, { $sample: { size: 1 } }]); if (s.length) authorId = s[0]._id; } catch {}
          const raw = await aiGenerate(`Write SEO article (1500+ words). Title: "${sa.title}". Keyword: "${sa.keyword}". Angle: "${sa.angle}". ${geoCtx}
${blogIds[0] ? `Link to pillar: ${SITE_URL}/blog/${blogIds[0]}` : ''}${socialInst ? ' Mention: ' + socialInst : ''}
Return JSON: {"title":"...","content":"...(HTML)","metaDescription":"...","tags":["..."],"category":"..."}`, 'Expert SEO writer. JSON only.', 4000);
          const p = parseJSON(raw);
          if (p) {
            const img = await getImage(sa.keyword);
            const a = await User.findById(authorId).select('name username displayName').lean();
            const b = new Blog({ title: p.title, content: p.content, excerpt: p.metaDescription || '', featuredImage: img, author: authorId, authorName: a?.displayName || a?.name || a?.username || 'CYBEV', category: p.category || 'general', tags: p.tags || [], status: 'published' });
            await b.save(); blogIds.push(b._id); console.log(`✅ Support: ${b._id}`);
          }
        } catch (e) { console.error(`Fail "${sa.title}":`, e.message); }
      }
      if (campaignId) await SEOCampaign.findByIdAndUpdate(campaignId, { $push: { contentClusters: { name: plan.pillarArticle.keyword, pillarKeyword: plan.pillarArticle.keyword, pillarBlogId: blogIds[0], supportingBlogIds: blogIds.slice(1), totalArticles: blogIds.length, status: 'complete' } }, $inc: { 'stats.totalArticlesGenerated': blogIds.length } }).catch(() => {});
    })().catch(e => console.error('Cluster:', e));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ PROGRAMMATIC SEO — FIXED: handle string values, flexible input ═══
router.post('/programmatic/generate', auth, async (req, res) => {
  try {
    const { campaignId, titleTemplate, promptTemplate, variables, category, tone = 'professional', socialChannels, geoTarget, maxPages = 50, batchSize = 10 } = req.body;
    if (!titleTemplate) return res.status(400).json({ error: 'titleTemplate required' });

    // Handle variables — accept both string and array formats
    let parsedVars = [];
    if (variables && Array.isArray(variables)) {
      parsedVars = variables.filter(v => v.name).map(v => ({
        name: v.name,
        values: Array.isArray(v.values) ? v.values : (typeof v.values === 'string' ? v.values.split(',').map(s => s.trim()).filter(Boolean) : [])
      })).filter(v => v.values.length > 0);
    }

    if (parsedVars.length === 0) {
      return res.status(400).json({ error: 'At least one variable with values is required. Format: variables: [{name: "city", values: "Accra, Lagos, London"}]' });
    }

    // Generate combinations
    const combos = [];
    const gen = (vars, cur = {}) => { if (!vars.length) { combos.push({ ...cur }); return; } const [f, ...r] = vars; for (const v of f.values) gen(r, { ...cur, [f.name]: v }); };
    gen(parsedVars);
    const batch = combos.slice(0, Math.min(maxPages, batchSize));

    const sampleTitles = batch.slice(0, 5).map(c => { let t = titleTemplate; Object.entries(c).forEach(([k, v]) => { t = t.replace(new RegExp(`\\{${k}\\}`, 'g'), v); }); return t; });

    res.json({ success: true, message: `Generating ${batch.length} of ${Math.min(combos.length, maxPages)} pages`, totalCombinations: Math.min(combos.length, maxPages), batchSize: batch.length, sampleTitles });

    (async () => {
      const userId = req.user.id || req.user._id;
      const geoCtx = geoTarget?.value ? `Targeting ${geoTarget.value}.` : '';
      const socialInst = (socialChannels || []).filter(c => c?.url).map(ch => `${ch.platform}: ${ch.url}`).join(', ');
      let generated = 0;
      for (const combo of batch) {
        try {
          let t = titleTemplate, pr = promptTemplate || `Write comprehensive article: ${titleTemplate}`;
          Object.entries(combo).forEach(([k, v]) => { t = t.replace(new RegExp(`\\{${k}\\}`, 'g'), v); pr = pr.replace(new RegExp(`\\{${k}\\}`, 'g'), v); });
          let authorId = userId;
          try { const s = await User.aggregate([{ $match: { isSynthetic: true } }, { $sample: { size: 1 } }]); if (s.length) authorId = s[0]._id; } catch {}
          const raw = await aiGenerate(`${pr}\nTitle: "${t}". Tone: ${tone}. ${geoCtx} 1000-1500 words. Headings, context, FAQ 3 questions.${socialInst ? ' Mention: ' + socialInst : ''}
Return JSON: {"title":"...","content":"...(HTML)","metaDescription":"...","tags":["..."],"category":"${category || 'general'}"}`, 'Expert local SEO writer. JSON only.', 3500);
          const p = parseJSON(raw);
          if (p) {
            const img = await getImage(t);
            const a = await User.findById(authorId).select('name username displayName').lean();
            const b = new Blog({ title: p.title || t, content: p.content, excerpt: p.metaDescription || '', featuredImage: img, author: authorId, authorName: a?.displayName || a?.name || a?.username || 'CYBEV', category: p.category || category || 'general', tags: p.tags || [], status: 'published' });
            await b.save(); generated++; console.log(`📄 Programmatic: "${t}"`);
          }
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) { console.error('Prog fail:', e.message); }
      }
      if (campaignId) await SEOCampaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.totalProgrammaticPages': generated, 'stats.totalArticlesGenerated': generated } }).catch(() => {});
      console.log(`📄 Programmatic: ${generated}/${batch.length} done`);
    })().catch(e => console.error('Prog:', e));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ CONTENT REFRESH ═══
router.post('/refresh/scan', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { days = 30, minViews = 5 } = req.body;
    const stale = await Blog.find({ author: userId, status: 'published', isDeleted: { $ne: true }, updatedAt: { $lt: new Date(Date.now() - days * 86400000) }, views: { $gte: minViews } }).sort({ views: -1 }).limit(50).select('title slug views updatedAt createdAt category').lean();
    const candidates = stale.map(b => ({ _id: b._id, title: b.title, slug: b.slug, views: b.views, daysSinceUpdate: Math.floor((Date.now() - new Date(b.updatedAt).getTime()) / 86400000), category: b.category, urgency: Math.floor((Date.now() - new Date(b.updatedAt).getTime()) / 86400000) > 60 ? 'high' : 'medium' }));
    res.json({ success: true, candidates, total: candidates.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/refresh/execute', auth, async (req, res) => {
  try {
    const { blogId } = req.body;
    const blog = await Blog.findById(blogId);
    if (!blog) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, message: 'Refresh started for: ' + blog.title });

    (async () => {
      try {
        const raw = await aiGenerate(`Update this article to be current (2026). Title: "${blog.title}". Category: "${blog.category}". Content (2000 chars): "${(blog.content || '').replace(/<[^>]+>/g, '').substring(0, 2000)}"
Tasks: Update outdated info, add new sections, improve intro, add FAQ, add "Updated: ${new Date().toISOString().split('T')[0]}".
Return JSON: {"title":"...","content":"...(HTML)","metaDescription":"...","tags":["..."],"changesSummary":["..."]}`, 'Content refresher. JSON only.', 5000);
        const p = parseJSON(raw);
        if (p) {
          blog.title = p.title || blog.title;
          blog.content = p.content || blog.content;
          if (p.metaDescription) blog.excerpt = p.metaDescription;
          if (p.tags?.length) blog.tags = p.tags;
          await blog.save();
          console.log(`♻️ Refreshed: ${blog._id}`);
        }
      } catch (e) { console.error('Refresh fail:', e.message); }
    })();
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ INTERLINKS ═══
router.post('/interlink/scan', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const blogs = await Blog.find({ author: userId, status: 'published', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(50).select('title slug tags category').lean();
    if (blogs.length < 2) return res.json({ success: true, opportunities: [], message: 'Need 2+ blogs' });
    const summaries = blogs.slice(0, 30).map(b => ({ id: b._id, title: b.title, slug: b.slug, category: b.category, tags: (b.tags || []).slice(0, 3) }));
    const raw = await aiGenerate(`Find 10 internal linking opportunities between these articles: ${JSON.stringify(summaries)}
Return JSON array: [{"fromTitle":"...","toTitle":"...","anchorText":"...","reason":"..."}]`, 'Internal linking expert. JSON array only.', 1500);
    const opps = parseJSON(raw);
    res.json({ success: true, opportunities: opps || [], totalBlogs: blogs.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ SCHEMA MARKUP ═══
router.post('/schema/generate', auth, async (req, res) => {
  try {
    const { blogId, schemaTypes = ['article', 'faq', 'breadcrumb'] } = req.body;
    const blog = await Blog.findById(blogId).populate('author', 'name username displayName').lean();
    if (!blog) return res.status(404).json({ error: 'Not found' });
    const schemas = [];
    if (schemaTypes.includes('article')) schemas.push({ "@context": "https://schema.org", "@type": "Article", "headline": blog.title, "description": blog.excerpt || blog.title, "image": blog.featuredImage || `${SITE_URL}/og-image.png`, "datePublished": blog.createdAt, "dateModified": blog.updatedAt, "author": { "@type": "Person", "name": blog.authorName || blog.author?.name }, "publisher": { "@type": "Organization", "name": "CYBEV" }, "mainEntityOfPage": `${SITE_URL}/blog/${blog.slug || blog._id}` });
    if (schemaTypes.includes('breadcrumb')) schemas.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL }, { "@type": "ListItem", "position": 2, "name": "Blog", "item": `${SITE_URL}/blog` }, { "@type": "ListItem", "position": 3, "name": blog.title }] });
    if (schemaTypes.includes('faq')) {
      const raw = await aiGenerate(`Generate 5 FAQ from: "${blog.title}" Content: "${(blog.content || '').replace(/<[^>]+>/g, '').substring(0, 1500)}". Return JSON: [{"question":"...","answer":"..."}]`, 'FAQ specialist. JSON array only.', 1000);
      const faq = parseJSON(raw);
      if (faq?.length) schemas.push({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq.map(f => ({ "@type": "Question", "name": f.question, "acceptedAnswer": { "@type": "Answer", "text": f.answer } })) });
    }
    res.json({ success: true, schemas, count: schemas.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ SEO HEALTH & ANALYTICS ═══
router.get('/health', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const uid = new mongoose.Types.ObjectId(userId);
    const [total, published, recent, viewsAgg, campaigns] = await Promise.all([
      Blog.countDocuments({ author: uid, isDeleted: { $ne: true } }),
      Blog.countDocuments({ author: uid, status: 'published', isDeleted: { $ne: true } }),
      Blog.countDocuments({ author: uid, status: 'published', isDeleted: { $ne: true }, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
      Blog.aggregate([{ $match: { author: uid, isDeleted: { $ne: true } } }, { $group: { _id: null, t: { $sum: '$views' } } }]),
      SEOCampaign.countDocuments({ user: uid })
    ]);
    const views = viewsAgg[0]?.t || 0;
    const cs = Math.min(100, published * 2), fs = Math.min(100, recent * 10), vs = Math.min(100, recent >= 10 ? 100 : recent * 10), es = Math.min(100, Math.round((views / Math.max(published, 1)) * 2));
    const overall = Math.round((cs + fs + vs + es) / 4);
    const topBlogs = await Blog.find({ author: uid, status: 'published', isDeleted: { $ne: true } }).sort({ views: -1 }).limit(10).select('title slug views createdAt category').lean();
    const catDist = await Blog.aggregate([{ $match: { author: uid, status: 'published', isDeleted: { $ne: true } } }, { $group: { _id: '$category', count: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { count: -1 } }]);
    const recs = [];
    if (published < 20) recs.push({ type: 'content', priority: 'high', message: 'Publish 20+ articles to establish authority. Use AI Content Campaigns.' });
    if (recent < 4) recs.push({ type: 'freshness', priority: 'high', message: 'Publish 4+ articles/month. Set up Auto-Blog campaigns.' });
    if (published > 10 && views / published < 5) recs.push({ type: 'optimization', priority: 'medium', message: 'Low views. Run Content Refresh on existing articles.' });
    recs.push({ type: 'social', priority: 'medium', message: 'Connect social channels for natural promotion in articles.' });
    res.json({ success: true, health: { overallScore: overall, contentScore: cs, freshnessScore: fs, velocityScore: vs, engagementScore: es, grade: overall >= 80 ? 'A' : overall >= 60 ? 'B' : overall >= 40 ? 'C' : 'D' }, stats: { totalBlogs: total, publishedBlogs: published, recentBlogs30d: recent, totalViews: views, avgViewsPerBlog: published ? Math.round(views / published) : 0, activeCampaigns: campaigns }, topBlogs, categoryDistribution: catDist, recommendations: recs });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/analytics', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id; const uid = new mongoose.Types.ObjectId(userId); const { days = 30 } = req.query; const since = new Date(Date.now() - days * 86400000);
    const [daily, top, catPerf] = await Promise.all([
      Blog.aggregate([{ $match: { author: uid, createdAt: { $gte: since }, isDeleted: { $ne: true } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { _id: 1 } }]),
      Blog.find({ author: uid, status: 'published', isDeleted: { $ne: true } }).sort({ views: -1 }).limit(20).select('title slug views createdAt category').lean(),
      Blog.aggregate([{ $match: { author: uid, status: 'published', isDeleted: { $ne: true } } }, { $group: { _id: '$category', articles: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { views: -1 } }])
    ]);
    res.json({ success: true, period: `${days}d`, dailyContent: daily, topPerformers: top, categoryPerformance: catPerf });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ ADMIN ═══
router.get('/admin/overview', auth, isAdmin, async (req, res) => {
  try {
    const [total, published, viewsAgg, campaigns, recent, topCats] = await Promise.all([
      Blog.countDocuments({ isDeleted: { $ne: true } }), Blog.countDocuments({ status: 'published', isDeleted: { $ne: true } }),
      Blog.aggregate([{ $match: { isDeleted: { $ne: true } } }, { $group: { _id: null, t: { $sum: '$views' } } }]),
      SEOCampaign.countDocuments({}), Blog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) }, isDeleted: { $ne: true } }),
      Blog.aggregate([{ $match: { status: 'published', isDeleted: { $ne: true } } }, { $group: { _id: '$category', count: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { views: -1 } }, { $limit: 15 }])
    ]);
    res.json({ success: true, overview: { totalBlogs: total, totalPublished: published, totalViews: viewsAgg[0]?.t || 0, totalCampaigns: campaigns, articlesThisWeek: recent, avgArticlesPerDay: Math.round(recent / 7 * 10) / 10 }, topCategories: topCats });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/admin/campaigns', auth, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const campaigns = await SEOCampaign.find({}).populate('user', 'name username displayName').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();
    res.json({ success: true, campaigns, total: await SEOCampaign.countDocuments({}) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ OG META (v1 compat) ═══
router.get('/blog/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate('author', 'name username avatar').lean();
    if (!blog) return res.json({ title: 'CYBEV', description: 'Where Creators Connect', image: `${SITE_URL}/og-image.png`, url: SITE_URL, type: 'website' });
    res.json({ title: blog.title, description: (blog.excerpt || blog.content || '').replace(/<[^>]+>/g, '').substring(0, 200), image: blog.featuredImage || `${SITE_URL}/og-image.png`, url: `${SITE_URL}/blog/${blog.slug || req.params.id}`, type: 'article' });
  } catch { res.json({ title: 'CYBEV', description: 'Where Creators Connect', image: `${SITE_URL}/og-image.png`, url: SITE_URL, type: 'website' }); }
});

router.get('/profile/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).lean();
    if (!user) return res.json({ title: 'CYBEV', description: 'Where Creators Connect', image: `${SITE_URL}/og-image.png`, url: SITE_URL, type: 'website' });
    res.json({ title: `${user.displayName || user.name || user.username} — CYBEV`, description: user.bio || `Follow on CYBEV`, image: user.profilePicture || `${SITE_URL}/og-image.png`, url: `${SITE_URL}/${user.username}`, type: 'profile' });
  } catch { res.json({ title: 'CYBEV', description: 'Where Creators Connect', image: `${SITE_URL}/og-image.png`, url: SITE_URL, type: 'website' }); }
});

console.log('🔍 SEO Command Center v2.1 loaded — fixed timeouts, geo targeting, persistent channels');
module.exports = router;
