// ============================================
// FILE: routes/seo.routes.js
// CYBEV SEO Command Center — FULL ENGINE
// VERSION: 2.0
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');

let auth, isAdmin;
try {
  const m = require('../middleware/verifyToken');
  auth = m.authenticateToken || m;
  isAdmin = m.isAdmin;
} catch { try {
  const m = require('../middleware/auth.middleware');
  auth = m.authenticateToken || m;
  isAdmin = m.isAdmin;
} catch { try {
  const m = require('../middleware/auth');
  auth = m.authenticateToken || m;
  isAdmin = m.isAdmin;
} catch {
  auth = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    try { const jwt = require('jsonwebtoken'); req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024'); req.user.id = req.user.userId || req.user.id; next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  };
  isAdmin = null;
}}}
if (!isAdmin) isAdmin = (req, res, next) => { if (req.user?.role === 'admin' || req.user?.isAdmin) return next(); res.status(403).json({ error: 'Admin only' }); };

let SEOCampaign, Blog, User;
try { SEOCampaign = require('../models/seoCampaign.model'); } catch { SEOCampaign = mongoose.model('SEOCampaign'); }
try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const SITE_URL = process.env.SITE_URL || 'https://cybev.io';

async function aiGenerate(prompt, system = 'You are an expert SEO strategist.', maxTokens = 4000) {
  if (DEEPSEEK_KEY) {
    try {
      const { data } = await axios.post('https://api.deepseek.com/chat/completions', {
        model: 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.7
      }, { headers: { Authorization: `Bearer ${DEEPSEEK_KEY}` }, timeout: 90000 });
      return data.choices?.[0]?.message?.content?.trim();
    } catch (e) { console.log('DeepSeek fail:', e.message); }
  }
  if (OPENAI_KEY) {
    try {
      const { data } = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.7
      }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 90000 });
      return data.choices?.[0]?.message?.content?.trim();
    } catch (e) { console.log('OpenAI fail:', e.message); }
  }
  return null;
}

async function aiJSON(prompt, system) {
  const raw = await aiGenerate(prompt + '\n\nRespond ONLY with valid JSON. No markdown, no backticks.', system);
  if (!raw) return null;
  try { return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); }
  catch { const m = raw.match(/[\[{][\s\S]*[\]}]/); if (m) try { return JSON.parse(m[0]); } catch {} return null; }
}

async function getImage(query) {
  if (!PEXELS_KEY) return '';
  try {
    const { data } = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`, { headers: { Authorization: PEXELS_KEY }, timeout: 10000 });
    const p = data.photos || [];
    return p.length ? p[Math.floor(Math.random() * p.length)].src?.large || '' : '';
  } catch { return ''; }
}

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
  try {
    const userId = req.user.id || req.user._id;
    const campaign = new SEOCampaign({ ...req.body, user: userId });
    await campaign.save();
    res.status(201).json({ success: true, campaign });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/campaigns/:id', auth, async (req, res) => {
  try {
    const campaign = await SEOCampaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, campaign });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/campaigns/:id', auth, async (req, res) => {
  try {
    const campaign = await SEOCampaign.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, campaign });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/campaigns/:id', auth, async (req, res) => {
  try { await SEOCampaign.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ KEYWORD RESEARCH ═══
router.post('/keywords/research', auth, async (req, res) => {
  try {
    const { seedKeyword, niche, region = 'global', count = 30 } = req.body;
    if (!seedKeyword) return res.status(400).json({ error: 'seedKeyword required' });
    const result = await aiJSON(`You are an SEO keyword research expert. Seed keyword: "${seedKeyword}". Niche: "${niche || 'general'}". Region: "${region}".
Generate ${count} keyword opportunities as JSON array. For EACH: keyword, searchVolume (10-500000), difficulty (0-100), cpc (0.10-50), intent (informational|commercial|transactional|navigational), cluster (group name), serpFeature (featured_snippet|people_also_ask|video|faq_rich_result|null).
Mix: head terms, long-tail, questions, comparisons, location-based, commercial.`, 'Data-driven SEO keyword specialist.');
    if (!result || !Array.isArray(result)) return res.status(500).json({ error: 'AI research failed' });
    const clusters = {};
    result.forEach(kw => { const c = kw.cluster || 'uncategorized'; if (!clusters[c]) clusters[c] = []; clusters[c].push(kw); });
    res.json({ success: true, seedKeyword, totalKeywords: result.length, keywords: result, clusters,
      avgDifficulty: Math.round(result.reduce((a, k) => a + (k.difficulty || 50), 0) / result.length),
      avgVolume: Math.round(result.reduce((a, k) => a + (k.searchVolume || 0), 0) / result.length),
      quickWins: result.filter(k => (k.difficulty || 50) < 30 && (k.searchVolume || 0) > 100).length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/keywords/gap', auth, async (req, res) => {
  try {
    const { competitorDomain, ourNiche, count = 20 } = req.body;
    if (!competitorDomain) return res.status(400).json({ error: 'competitorDomain required' });
    const result = await aiJSON(`Competitor: "${competitorDomain}". Our niche: "${ourNiche || 'general'}".
Identify ${count} keyword gaps. For each: keyword, competitorEstimatedRank (1-20), searchVolume, difficulty (0-100), opportunity (high|medium|low), suggestedTitle, contentAngle. Return JSON array.`, 'Competitive SEO intelligence analyst.');
    res.json({ success: true, competitorDomain, gaps: result || [], highOpportunity: (result || []).filter(g => g.opportunity === 'high').length });
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

// ═══ AI CONTENT GENERATION ═══
router.post('/content/generate', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { keyword, title, niche, tone = 'professional', wordCount = 1500, socialChannels = [], includeFAQ = true, internalLinkKeywords = [], campaignId, authorId } = req.body;
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    let socialInst = '';
    if (socialChannels.length) { socialInst = '\n\nNATURALLY weave in these channels (not ads, genuine recommendations):\n'; socialChannels.forEach(ch => { socialInst += `- ${ch.platform}: ${ch.url} (${ch.promotionStyle || 'moderate'})\n`; }); }
    let linkInst = '';
    if (internalLinkKeywords.length) { linkInst = `\n\nInclude internal links to related topics on ${SITE_URL}/blog/[slug]:\n`; internalLinkKeywords.forEach(k => { linkInst += `- "${k}"\n`; }); }

    const article = await aiGenerate(`Write a comprehensive SEO blog article.
PRIMARY KEYWORD: "${keyword}" ${title ? `\nTITLE: "${title}"` : '\nGenerate click-worthy title with keyword'}
NICHE: "${niche || 'general'}" TONE: ${tone} LENGTH: ${wordCount}+ words
STRUCTURE: Hook first 100 words, TOC, H2/H3 with keyword variations, short paragraphs, lists, Key Takeaways box, stats, strong conclusion+CTA${includeFAQ ? ', FAQ 5 questions' : ''}.
SEO: keyword in first paragraph, variations throughout, meta description 155 chars, 5-8 tags, LSI keywords, E-E-A-T.
${socialInst}${linkInst}
BANNED: "In today's digital age", "ever-evolving landscape", "without further ado", "let's dive in", "it's important to note"
OUTPUT JSON: {"title":"...","metaDescription":"...","excerpt":"...","content":"...(full HTML)...","tags":["..."],"category":"...","faq":[{"question":"...","answer":"..."}],"readabilityScore":"X/100"}`,
    'Elite SEO content strategist. Articles indistinguishable from expert human writers.', 6000);

    let parsed;
    try { parsed = JSON.parse(article.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); }
    catch { const m = article?.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else return res.status(500).json({ error: 'Parse failed' }); }

    const featuredImage = await getImage(keyword);
    const imgs = [];
    for (const q of [keyword, `${niche || keyword} illustration`, `${keyword} example`]) { const i = await getImage(q); if (i) imgs.push(i); }
    let enriched = parsed.content || '';
    if (imgs.length) {
      const paras = enriched.split('</p>');
      [0.25, 0.5, 0.75].forEach((pct, i) => { const idx = Math.floor(paras.length * pct); if (idx && paras[idx] && imgs[i]) paras[idx] += `</p><figure style="margin:1.5em 0"><img src="${imgs[i]}" alt="${keyword}" style="width:100%;border-radius:8px" loading="lazy"/></figure>`; });
      enriched = paras.join('</p>');
    }
    let faqSchema = null;
    if (includeFAQ && parsed.faq?.length) {
      faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": parsed.faq.map(f => ({ "@type": "Question", "name": f.question, "acceptedAnswer": { "@type": "Answer", "text": f.answer } })) };
    }
    let finalAuthorId = userId, finalAuthorName = '';
    if (authorId) { const a = await User.findById(authorId).select('name username displayName').lean(); if (a) { finalAuthorId = a._id; finalAuthorName = a.displayName || a.name || a.username; } }
    if (!finalAuthorName) { const me = await User.findById(userId).select('name username displayName').lean(); finalAuthorName = me?.displayName || me?.name || me?.username || 'CYBEV Writer'; }

    const blog = new Blog({ title: parsed.title, content: enriched, excerpt: parsed.metaDescription || parsed.excerpt || '', featuredImage, author: finalAuthorId, authorName: finalAuthorName, category: parsed.category || niche || 'general', tags: parsed.tags || [keyword], status: 'published' });
    await blog.save();
    if (campaignId) await SEOCampaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.totalArticlesGenerated': 1 }, lastRunAt: new Date() }).catch(() => {});

    res.json({ success: true, blog: { _id: blog._id, title: blog.title, slug: blog.slug, url: `${SITE_URL}/blog/${blog.slug || blog._id}`, excerpt: parsed.metaDescription, tags: blog.tags, faqSchema, keyword, featuredImage } });
  } catch (e) { console.error('SEO content gen:', e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/content/bulk-generate', auth, async (req, res) => {
  try {
    const { campaignId, keywords, niche, tone, socialChannels, count = 5 } = req.body;
    if (!keywords?.length && !campaignId) return res.status(400).json({ error: 'keywords or campaignId required' });
    let targetKws = keywords || [];
    let campaign = campaignId ? await SEOCampaign.findById(campaignId) : null;
    if (campaign && !targetKws.length) targetKws = campaign.keywords.filter(k => !k.targetBlogId).slice(0, count).map(k => k.keyword);
    const batch = targetKws.slice(0, count);
    res.json({ success: true, message: `Generating ${batch.length} articles in background`, keywords: batch, estimatedTime: `${batch.length * 45}s` });

    (async () => {
      for (const kw of batch) {
        try {
          let authorId = req.user.id || req.user._id;
          if (campaign?.settings?.randomizeAuthors) { const s = await User.aggregate([{ $match: { isSynthetic: true } }, { $sample: { size: 1 } }]); if (s.length) authorId = s[0]._id; }
          const art = await aiGenerate(`Write SEO article about "${kw}". Niche: "${niche || campaign?.niche || 'general'}". Tone: ${tone || 'professional'}. 1200+ words. Include headings, lists, FAQ 3-5 questions, conclusion.
${(socialChannels || campaign?.socialChannels || []).map(ch => `Mention ${ch.platform}: ${ch.url}`).join('\n')}
Return JSON: {"title":"...","metaDescription":"...","content":"...(HTML)...","tags":["..."],"category":"..."}`, 'Expert SEO writer.', 5000);
          let p; try { p = JSON.parse(art.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); } catch { const m = art?.match(/\{[\s\S]*\}/); if (m) p = JSON.parse(m[0]); else continue; }
          const img = await getImage(kw);
          const author = await User.findById(authorId).select('name username displayName').lean();
          const blog = new Blog({ title: p.title, content: p.content, excerpt: p.metaDescription || '', featuredImage: img, author: authorId, authorName: author?.displayName || author?.name || author?.username || 'CYBEV', category: p.category || 'general', tags: p.tags || [kw], status: 'published' });
          await blog.save();
          if (campaign) { const ki = campaign.keywords.findIndex(k => k.keyword.toLowerCase() === kw.toLowerCase()); if (ki >= 0) { campaign.keywords[ki].targetBlogId = blog._id; campaign.keywords[ki].targetUrl = `${SITE_URL}/blog/${blog.slug || blog._id}`; campaign.keywords[ki].status = 'tracking'; } campaign.stats.totalArticlesGenerated++; }
          console.log(`✅ SEO: "${p.title}" for "${kw}"`);
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) { console.error(`❌ "${kw}":`, e.message); }
      }
      if (campaign) { campaign.lastRunAt = new Date(); await campaign.save(); }
    })().catch(e => console.error('Bulk:', e));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ CONTENT CLUSTER ENGINE ═══
router.post('/cluster/plan', auth, async (req, res) => {
  try {
    const { pillarKeyword, niche, articleCount = 10 } = req.body;
    if (!pillarKeyword) return res.status(400).json({ error: 'pillarKeyword required' });
    const plan = await aiJSON(`Plan a content cluster for SEO dominance.
PILLAR: "${pillarKeyword}" NICHE: "${niche || 'general'}" SUPPORTING ARTICLES: ${articleCount}
Return JSON: {"pillarArticle":{"title":"...","keyword":"${pillarKeyword}","outline":["..."]},"supportingArticles":[{"title":"...","keyword":"...","angle":"...","linksTo":"...","targetSerpFeature":"featured_snippet|people_also_ask|faq_rich_result|video|null"}],"interlinkingStrategy":"...","estimatedTimeToAuthority":"X weeks"}
Each supporting article targets a specific long-tail. Together they create an impenetrable content fortress.`, 'Topical authority strategist.');
    res.json({ success: true, plan: plan || {} });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/cluster/deploy', auth, async (req, res) => {
  try {
    const { campaignId, plan, socialChannels } = req.body;
    if (!plan) return res.status(400).json({ error: 'plan required' });
    const total = 1 + (plan.supportingArticles?.length || 0);
    res.json({ success: true, message: `Deploying cluster: ${total} articles`, estimatedTime: `${total * 50}s` });

    (async () => {
      const userId = req.user.id || req.user._id;
      const blogIds = [];
      try {
        const art = await aiGenerate(`Write a DEFINITIVE 3000+ word pillar article. TITLE: "${plan.pillarArticle.title}" KEYWORD: "${plan.pillarArticle.keyword}" OUTLINE: ${JSON.stringify(plan.pillarArticle.outline)}
Include: TOC, H2/H3, stats, FAQ, expert insights. ${(socialChannels || []).map(ch => `Mention ${ch.platform}: ${ch.url}`).join('\n')}
Return JSON: {"title":"...","content":"...(HTML)...","metaDescription":"...","tags":["..."],"category":"..."}`, 'World-class content strategist.', 8000);
        let p; try { p = JSON.parse(art.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); } catch { const m = art?.match(/\{[\s\S]*\}/); if (m) p = JSON.parse(m[0]); }
        if (p) {
          const img = await getImage(plan.pillarArticle.keyword);
          const u = await User.findById(userId).select('name username displayName').lean();
          const b = new Blog({ title: p.title, content: p.content, excerpt: p.metaDescription || '', featuredImage: img, author: userId, authorName: u?.displayName || u?.name || u?.username || 'CYBEV', category: p.category || 'general', tags: p.tags || [], status: 'published' });
          await b.save(); blogIds.push(b._id); console.log(`✅ Pillar: ${b._id}`);
        }
      } catch (e) { console.error('Pillar fail:', e.message); }

      for (const sa of (plan.supportingArticles || [])) {
        try {
          await new Promise(r => setTimeout(r, 3000));
          let authorId = userId;
          try { const s = await User.aggregate([{ $match: { isSynthetic: true } }, { $sample: { size: 1 } }]); if (s.length) authorId = s[0]._id; } catch {}
          const art = await aiGenerate(`Write SEO article (1500+ words). TITLE: "${sa.title}" KEYWORD: "${sa.keyword}" ANGLE: "${sa.angle}"
${blogIds[0] ? `Link to pillar: ${SITE_URL}/blog/${blogIds[0]}` : ''} ${(socialChannels || []).map(ch => `Mention ${ch.platform}: ${ch.url}`).join('\n')}
Return JSON: {"title":"...","content":"...(HTML)...","metaDescription":"...","tags":["..."],"category":"..."}`, 'Expert SEO writer.', 5000);
          let p; try { p = JSON.parse(art.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); } catch { const m = art?.match(/\{[\s\S]*\}/); if (m) p = JSON.parse(m[0]); }
          if (p) {
            const img = await getImage(sa.keyword);
            const a = await User.findById(authorId).select('name username displayName').lean();
            const b = new Blog({ title: p.title, content: p.content, excerpt: p.metaDescription || '', featuredImage: img, author: authorId, authorName: a?.displayName || a?.name || a?.username || 'CYBEV', category: p.category || 'general', tags: p.tags || [], status: 'published' });
            await b.save(); blogIds.push(b._id); console.log(`✅ Support: ${b._id}`);
          }
        } catch (e) { console.error(`Fail "${sa.title}":`, e.message); }
      }
      if (campaignId) await SEOCampaign.findByIdAndUpdate(campaignId, { $push: { contentClusters: { name: plan.pillarArticle.keyword, pillarKeyword: plan.pillarArticle.keyword, pillarBlogId: blogIds[0], supportingBlogIds: blogIds.slice(1), totalArticles: blogIds.length, status: 'complete' } }, $inc: { 'stats.totalArticlesGenerated': blogIds.length } }).catch(() => {});
      console.log(`🏗️ Cluster: ${blogIds.length} articles deployed`);
    })().catch(e => console.error('Cluster:', e));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ PROGRAMMATIC SEO ═══
router.post('/programmatic/generate', auth, async (req, res) => {
  try {
    const { campaignId, titleTemplate, promptTemplate, variables, category, tone = 'professional', socialChannels, maxPages = 50, batchSize = 10 } = req.body;
    if (!titleTemplate || !variables?.length) return res.status(400).json({ error: 'titleTemplate and variables required' });
    const combos = [];
    const gen = (vars, cur = {}) => { if (!vars.length) { combos.push({ ...cur }); return; } const [f, ...r] = vars; for (const v of f.values) gen(r, { ...cur, [f.name]: v }); };
    gen(variables);
    const batch = combos.slice(0, Math.min(maxPages, batchSize));
    res.json({ success: true, message: `Generating ${batch.length} of ${Math.min(combos.length, maxPages)} pages`, totalCombinations: Math.min(combos.length, maxPages), batchSize: batch.length,
      sampleTitles: batch.slice(0, 5).map(c => { let t = titleTemplate; Object.entries(c).forEach(([k, v]) => { t = t.replace(`{${k}}`, v); }); return t; }) });

    (async () => {
      const userId = req.user.id || req.user._id;
      let generated = 0;
      for (const combo of batch) {
        try {
          let t = titleTemplate, pr = promptTemplate || `Write comprehensive article: ${titleTemplate}`;
          Object.entries(combo).forEach(([k, v]) => { t = t.replace(`{${k}}`, v); pr = pr.replace(`{${k}}`, v); });
          let authorId = userId;
          try { const s = await User.aggregate([{ $match: { isSynthetic: true } }, { $sample: { size: 1 } }]); if (s.length) authorId = s[0]._id; } catch {}
          const art = await aiGenerate(`${pr}\nTITLE: "${t}" TONE: ${tone} 1000-1500 words. Headings, local context, FAQ 3 questions.
${(socialChannels || []).map(ch => `Mention ${ch.platform}: ${ch.url}`).join('\n')}
Return JSON: {"title":"...","content":"...(HTML)...","metaDescription":"...","tags":["..."],"category":"${category || 'general'}"}`, 'Expert local SEO writer.', 4000);
          let p; try { p = JSON.parse(art.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); } catch { const m = art?.match(/\{[\s\S]*\}/); if (m) p = JSON.parse(m[0]); }
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
    const { days = 30, minViews = 10 } = req.body;
    const stale = await Blog.find({ author: userId, status: 'published', isDeleted: { $ne: true }, updatedAt: { $lt: new Date(Date.now() - days * 86400000) }, views: { $gte: minViews } }).sort({ views: -1 }).limit(50).select('title slug views updatedAt createdAt category').lean();
    const candidates = stale.map(b => ({ _id: b._id, title: b.title, slug: b.slug, views: b.views, daysSinceUpdate: Math.floor((Date.now() - new Date(b.updatedAt).getTime()) / 86400000), category: b.category, urgency: Math.floor((Date.now() - new Date(b.updatedAt).getTime()) / 86400000) > 60 ? 'high' : 'medium' }));
    res.json({ success: true, candidates, total: candidates.length, highUrgency: candidates.filter(c => c.urgency === 'high').length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/refresh/execute', auth, async (req, res) => {
  try {
    const { blogId } = req.body;
    const blog = await Blog.findById(blogId);
    if (!blog) return res.status(404).json({ error: 'Not found' });
    const refreshed = await aiGenerate(`Update this article to be current and better optimized.
TITLE: "${blog.title}" CONTENT (2000 chars): "${(blog.content || '').substring(0, 2000)}" CATEGORY: "${blog.category}" PUBLISHED: ${blog.createdAt}
Tasks: Update outdated info to 2026, add new sections, improve intro, add/update FAQ, strengthen linking, improve keywords, add "Updated: ${new Date().toISOString().split('T')[0]}".
Return JSON: {"title":"...","content":"...(HTML)...","metaDescription":"...","tags":["..."],"changesSummary":["..."]}`, 'Content refresher.', 6000);
    let p; try { p = JSON.parse(refreshed.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); } catch { const m = refreshed?.match(/\{[\s\S]*\}/); if (m) p = JSON.parse(m[0]); }
    if (!p) return res.status(500).json({ error: 'Refresh failed' });
    blog.title = p.title || blog.title;
    blog.content = p.content || blog.content;
    if (p.metaDescription) blog.excerpt = p.metaDescription;
    if (p.tags?.length) blog.tags = p.tags;
    await blog.save();
    res.json({ success: true, blog: { _id: blog._id, title: blog.title, slug: blog.slug }, changes: p.changesSummary || [] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ INTERNAL LINK INTELLIGENCE ═══
router.post('/interlink/scan', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const blogs = await Blog.find({ author: userId, status: 'published', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(100).select('title slug tags category').lean();
    if (blogs.length < 2) return res.json({ success: true, opportunities: [], message: 'Need 2+ blogs' });
    const summaries = blogs.slice(0, 50).map(b => ({ id: b._id, title: b.title, slug: b.slug, category: b.category, tags: (b.tags || []).slice(0, 5) }));
    const opps = await aiJSON(`Analyze articles and find internal linking opportunities. Articles: ${JSON.stringify(summaries)}
Return JSON array: [{"fromId":"...","fromTitle":"...","toId":"...","toTitle":"...","anchorText":"...","reason":"..."}] Find 10-20 opportunities.`, 'Internal linking specialist.');
    res.json({ success: true, opportunities: opps || [], totalBlogs: blogs.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ SCHEMA MARKUP GENERATOR ═══
router.post('/schema/generate', auth, async (req, res) => {
  try {
    const { blogId, schemaTypes = ['article', 'faq', 'breadcrumb'] } = req.body;
    const blog = await Blog.findById(blogId).populate('author', 'name username displayName avatar').lean();
    if (!blog) return res.status(404).json({ error: 'Not found' });
    const schemas = [];
    if (schemaTypes.includes('article')) schemas.push({ "@context": "https://schema.org", "@type": "Article", "headline": blog.title, "description": blog.excerpt || blog.title, "image": blog.featuredImage || `${SITE_URL}/og-image.png`, "datePublished": blog.createdAt, "dateModified": blog.updatedAt, "author": { "@type": "Person", "name": blog.authorName || blog.author?.name }, "publisher": { "@type": "Organization", "name": "CYBEV", "logo": { "@type": "ImageObject", "url": `${SITE_URL}/logo.png` } }, "mainEntityOfPage": `${SITE_URL}/blog/${blog.slug || blog._id}` });
    if (schemaTypes.includes('breadcrumb')) schemas.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL }, { "@type": "ListItem", "position": 2, "name": "Blog", "item": `${SITE_URL}/blog` }, { "@type": "ListItem", "position": 3, "name": blog.title }] });
    if (schemaTypes.includes('faq')) {
      const faq = await aiJSON(`Extract 5 FAQ from: "${blog.title}" Content: "${(blog.content || '').replace(/<[^>]+>/g, '').substring(0, 2000)}". Return JSON: [{"question":"...","answer":"..."}]`, 'FAQ specialist.');
      if (faq?.length) schemas.push({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq.map(f => ({ "@type": "Question", "name": f.question, "acceptedAnswer": { "@type": "Answer", "text": f.answer } })) });
    }
    if (schemaTypes.includes('howto')) {
      const h = await aiJSON(`Extract HowTo steps from: "${blog.title}" Content: "${(blog.content || '').replace(/<[^>]+>/g, '').substring(0, 2000)}". Return JSON: {"name":"...","steps":[{"name":"...","text":"..."}]} or null.`, 'Schema specialist.');
      if (h?.steps?.length) schemas.push({ "@context": "https://schema.org", "@type": "HowTo", "name": h.name, "step": h.steps.map((s, i) => ({ "@type": "HowToStep", "position": i + 1, "name": s.name, "text": s.text })) });
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
    if (published > 20) recs.push({ type: 'clustering', priority: 'medium', message: 'Build Content Clusters around top topics.' });
    recs.push({ type: 'social', priority: 'medium', message: 'Connect social channels for natural promotion in articles.' });
    res.json({ success: true, health: { overallScore: overall, contentScore: cs, freshnessScore: fs, velocityScore: vs, engagementScore: es, grade: overall >= 80 ? 'A' : overall >= 60 ? 'B' : overall >= 40 ? 'C' : 'D' }, stats: { totalBlogs: total, publishedBlogs: published, recentBlogs30d: recent, totalViews: views, avgViewsPerBlog: published ? Math.round(views / published) : 0, activeCampaigns: campaigns }, topBlogs, categoryDistribution: catDist, recommendations: recs });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/analytics', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const uid = new mongoose.Types.ObjectId(userId);
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 86400000);
    const [daily, top, catPerf] = await Promise.all([
      Blog.aggregate([{ $match: { author: uid, createdAt: { $gte: since }, isDeleted: { $ne: true } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { _id: 1 } }]),
      Blog.find({ author: uid, status: 'published', isDeleted: { $ne: true } }).sort({ views: -1 }).limit(20).select('title slug views createdAt category tags').lean(),
      Blog.aggregate([{ $match: { author: uid, status: 'published', isDeleted: { $ne: true } } }, { $group: { _id: '$category', articles: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { views: -1 } }])
    ]);
    res.json({ success: true, period: `${days}d`, dailyContent: daily, topPerformers: top, categoryPerformance: catPerf, totalArticlesInPeriod: daily.reduce((a, d) => a + d.count, 0), totalViewsInPeriod: daily.reduce((a, d) => a + d.views, 0) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ ADMIN ENDPOINTS ═══
router.get('/admin/overview', auth, isAdmin, async (req, res) => {
  try {
    const [total, published, viewsAgg, campaigns, recent, topCats] = await Promise.all([
      Blog.countDocuments({ isDeleted: { $ne: true } }),
      Blog.countDocuments({ status: 'published', isDeleted: { $ne: true } }),
      Blog.aggregate([{ $match: { isDeleted: { $ne: true } } }, { $group: { _id: null, t: { $sum: '$views' } } }]),
      SEOCampaign.countDocuments({}),
      Blog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) }, isDeleted: { $ne: true } }),
      Blog.aggregate([{ $match: { status: 'published', isDeleted: { $ne: true } } }, { $group: { _id: '$category', count: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { views: -1 } }, { $limit: 15 }])
    ]);
    res.json({ success: true, overview: { totalBlogs: total, totalPublished: published, totalViews: viewsAgg[0]?.t || 0, totalCampaigns: campaigns, articlesThisWeek: recent, avgArticlesPerDay: Math.round(recent / 7 * 10) / 10 }, topCategories: topCats });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/admin/campaigns', auth, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const campaigns = await SEOCampaign.find({}).populate('user', 'name username displayName').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();
    const total = await SEOCampaign.countDocuments({});
    res.json({ success: true, campaigns, total });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══ OG META TAGS (v1.0 compat) ═══
router.get('/blog/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate('author', 'name username avatar').lean();
    if (!blog) return res.json({ title: 'CYBEV', description: 'Where Creators Connect', image: `${SITE_URL}/og-image.png`, url: SITE_URL, type: 'website' });
    res.json({ title: blog.title, description: (blog.excerpt || blog.content || '').replace(/<[^>]+>/g, '').substring(0, 200), image: blog.featuredImage || `${SITE_URL}/og-image.png`, url: `${SITE_URL}/blog/${blog.slug || req.params.id}`, type: 'article', author: blog.author?.name || blog.authorName });
  } catch { res.json({ title: 'CYBEV', description: 'Where Creators Connect', image: `${SITE_URL}/og-image.png`, url: SITE_URL, type: 'website' }); }
});

router.get('/profile/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).lean();
    if (!user) return res.json({ title: 'CYBEV', description: 'Where Creators Connect', image: `${SITE_URL}/og-image.png`, url: SITE_URL, type: 'website' });
    res.json({ title: `${user.displayName || user.name || user.username} — CYBEV`, description: user.bio || `Follow ${user.displayName || user.username} on CYBEV`, image: user.profilePicture || user.avatar || `${SITE_URL}/og-image.png`, url: `${SITE_URL}/${user.username}`, type: 'profile' });
  } catch { res.json({ title: 'CYBEV', description: 'Where Creators Connect', image: `${SITE_URL}/og-image.png`, url: SITE_URL, type: 'website' }); }
});

console.log('🔍 SEO Command Center v2.0 loaded — campaigns, clusters, programmatic, refresh, analytics');
module.exports = router;
