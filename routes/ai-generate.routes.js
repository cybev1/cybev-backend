// ============================================
// FILE: ai-generate.routes.js
// PATH: cybev-backend/routes/ai-generate.routes.js
// PURPOSE: AI Content Generation
// VERSION: 1.0.0
// GITHUB: https://github.com/cybev1/cybev-backend
// PROVIDERS: DeepSeek (default), OpenAI, Claude (fallbacks)
// ============================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// AI Providers - DeepSeek is default (cheapest), OpenAI and Claude as fallbacks
const AI = {
  deepseek: { key: process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  openai: { key: process.env.OPENAI_API_KEY, url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  claude: { key: process.env.ANTHROPIC_API_KEY, url: 'https://api.anthropic.com/v1/messages', model: 'claude-3-haiku-20240307' }
};

const getProvider = () => AI.deepseek.key ? 'deepseek' : AI.openai.key ? 'openai' : AI.claude.key ? 'claude' : null;

async function generate(prompt, system = 'You are a helpful marketing assistant.', opts = {}) {
  const provider = opts.provider || getProvider();
  if (!provider) return { text: generateFallback(opts.type), provider: 'fallback' };

  const p = AI[provider];
  if (!p?.key) return { text: generateFallback(opts.type), provider: 'fallback' };

  try {
    if (provider === 'claude') {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: p.model, max_tokens: 1024, system, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      return { text: data.content?.[0]?.text || '', provider };
    } else {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: 1024 })
      });
      const data = await res.json();
      return { text: data.choices?.[0]?.message?.content || '', provider };
    }
  } catch (err) {
    console.error(`AI error (${provider}):`, err.message);
    const fallbacks = ['deepseek', 'openai', 'claude'].filter(x => x !== provider && AI[x].key);
    for (const fb of fallbacks) {
      try { return await generate(prompt, system, { ...opts, provider: fb }); } catch {}
    }
    return { text: generateFallback(opts.type), provider: 'fallback' };
  }
}

function generateFallback(type) {
  const templates = {
    subject: ['🚀 Exciting update inside!', '✨ You won\'t want to miss this', 'Quick update for you'][Math.floor(Math.random() * 3)],
    content: 'Hi there!\n\nWe have exciting news to share with you.\n\n[Your content here]\n\nBest regards',
    social: ['✨ Check this out! #trending', '🔥 Big news! 🚀', '💡 Did you know?'][Math.floor(Math.random() * 3)],
    comment: ['Great post! 🔥', 'Love this! ❤️', 'Amazing content! 👏'][Math.floor(Math.random() * 3)]
  };
  return templates[type] || templates.social;
}

// GET /api/ai/providers
router.get('/providers', auth, (req, res) => {
  res.json({
    ok: true,
    providers: [
      { id: 'deepseek', name: 'DeepSeek', available: !!AI.deepseek.key, default: true },
      { id: 'openai', name: 'OpenAI', available: !!AI.openai.key },
      { id: 'claude', name: 'Claude', available: !!AI.claude.key }
    ],
    active: getProvider()
  });
});

// POST /api/ai/generate-campaign
router.post('/generate-campaign', auth, async (req, res) => {
  try {
    const { type, field, context, tone } = req.body;
    let prompt = '';

    if (field === 'subject') {
      prompt = `Generate 1 compelling ${type || 'email'} subject line. Context: ${context?.name || 'marketing'}. Tone: ${tone || 'friendly'}. Under 60 chars. Include emoji. Return ONLY the subject.`;
    } else {
      prompt = `Write ${type || 'email'} content. Topic: ${context?.name || 'update'}. Tone: ${tone || 'friendly'}. 2-3 paragraphs with CTA. Return ONLY content.`;
    }

    const result = await generate(prompt, 'You are an expert marketing copywriter.', { type: field });
    res.json({ ok: true, generated: result.text?.trim(), provider: result.provider });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ai/generate-social
router.post('/generate-social', auth, async (req, res) => {
  try {
    const { platforms, context, tone } = req.body;
    const prompt = `Write engaging social media post. Platforms: ${platforms?.join(', ') || 'general'}. Topic: ${context || 'update'}. Tone: ${tone || 'engaging'}. Include emojis. Return ONLY the post.`;
    const result = await generate(prompt, 'You are a social media expert. Create viral content.', { type: 'social' });
    res.json({ ok: true, generated: result.text?.trim(), provider: result.provider });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ai/generate-comments
router.post('/generate-comments', auth, async (req, res) => {
  try {
    const { count, style, niche } = req.body;
    const prompt = `Generate ${count || 5} unique social media comments. Style: ${style || 'friendly'}. Niche: ${niche || 'general'}. Include emojis. Return each on new line separated by |||`;
    const result = await generate(prompt, 'Generate authentic social comments.', { type: 'comment' });
    const comments = result.text?.split('|||').map(c => c.trim()).filter(Boolean) || [];
    res.json({ ok: true, comments, provider: result.provider });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ai/generate-message
router.post('/generate-message', auth, async (req, res) => {
  try {
    const { purpose, context } = req.body;
    const prompt = `Write DM for ${purpose || 'networking'}. Context: ${context || 'outreach'}. 2-3 sentences. Non-spammy. Return ONLY the message.`;
    const result = await generate(prompt, 'Write professional outreach messages.', { type: 'message' });
    res.json({ ok: true, generated: result.text?.trim(), provider: result.provider });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/ai/improve-text
router.post('/improve-text', auth, async (req, res) => {
  try {
    const { text, goal } = req.body;
    if (!text) return res.status(400).json({ ok: false, error: 'Text required' });
    const prompt = `Improve this text: "${text}". Goal: ${goal || 'more engaging'}. Return ONLY improved text.`;
    const result = await generate(prompt);
    res.json({ ok: true, improved: result.text?.trim(), provider: result.provider });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
