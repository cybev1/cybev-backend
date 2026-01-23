// ============================================
// FILE: routes/bible.routes.js
// Bible, Concordance, Commentary utilities for Church/Org tools
// VERSION: 1.0.0
// NOTE: Uses configurable providers. Defaults to bible-api.com for passage fetching.
// ============================================

const express = require('express');
const router = express.Router();

let auth;
try {
  const m = require('../middleware/auth');
  auth = m.authenticateToken || m.verifyToken || m;
} catch {
  auth = (req, res, next) => next();
}

// Very small in-memory cache with TTL (best-effort)
const cache = new Map();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.v;
}
function cacheSet(key, value) {
  cache.set(key, { t: Date.now(), v: value });
}

/**
 * GET /api/church/bible/passage?ref=John%203:16-18&translation=kjv
 * Returns full verse text for a reference.
 */
router.get('/passage', async (req, res) => {
  try {
    const ref = (req.query.ref || '').toString().trim();
    const translation = (req.query.translation || '').toString().trim().toLowerCase();
    if (!ref) return res.status(400).json({ ok: false, error: 'Missing ref' });

    const key = `passage:${translation}:${ref}`;
    const cached = cacheGet(key);
    if (cached) return res.json({ ok: true, ...cached, cached: true });

    // Provider: bible-api.com (public). Supports ?translation=kjv,web,asv,...
    const axios = require('axios');
    const encoded = encodeURIComponent(ref);
    const url = translation
      ? `https://bible-api.com/${encoded}?translation=${encodeURIComponent(translation)}`
      : `https://bible-api.com/${encoded}`;

    const r = await axios.get(url, { timeout: 15000 });
    const data = r.data || {};

    const verses = (data.verses || []).map(v => ({
      book_name: v.book_name,
      chapter: v.chapter,
      verse: v.verse,
      text: (v.text || '').trim()
    }));

    const payload = {
      reference: data.reference || ref,
      translation: data.translation_id || translation || null,
      translation_name: data.translation_name || null,
      verses,
      text: (data.text || '').trim()
    };

    cacheSet(key, payload);
    res.json({ ok: true, ...payload });
  } catch (err) {
    console.error('Bible passage error:', err?.message || err);
    res.status(500).json({ ok: false, error: 'Failed to fetch passage. Provider may be down or ref invalid.' });
  }
});

/**
 * GET /api/church/bible/concordance?q=faith
 * NOTE: Full-Bible concordance requires a provider/key.
 * This endpoint currently returns a helpful error unless configured.
 */
router.get('/concordance', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ ok: false, error: 'Missing q' });

  // If user configured a search provider, use it.
  // Example: SCRIPTURE_SEARCH_URL=https://.../search?q=...&key=...
  const searchUrl = process.env.SCRIPTURE_SEARCH_URL;
  if (!searchUrl) {
    return res.json({
      ok: false,
      error: 'Concordance search provider not configured',
      hint: 'Set SCRIPTURE_SEARCH_URL to an endpoint that supports keyword search and returns verse matches.'
    });
  }

  try {
    const axios = require('axios');
    const url = searchUrl.replace('{q}', encodeURIComponent(q));
    const r = await axios.get(url, { timeout: 15000 });
    res.json({ ok: true, provider: 'custom', q, results: r.data });
  } catch (err) {
    console.error('Concordance error:', err?.message || err);
    res.status(500).json({ ok: false, error: 'Failed to search concordance provider' });
  }
});

/**
 * GET /api/church/bible/commentary?ref=John%203:16
 * Commentary is church-specific: teachers/pastors can attach notes to scriptures.
 * For now, this endpoint is a placeholder for external commentary providers.
 */
router.get('/commentary', async (req, res) => {
  const ref = (req.query.ref || '').toString().trim();
  if (!ref) return res.status(400).json({ ok: false, error: 'Missing ref' });

  const commentaryUrl = process.env.SCRIPTURE_COMMENTARY_URL;
  if (!commentaryUrl) {
    return res.json({
      ok: false,
      error: 'Commentary provider not configured',
      hint: 'Set SCRIPTURE_COMMENTARY_URL to an endpoint that supports {ref} replacement.'
    });
  }

  try {
    const axios = require('axios');
    const url = commentaryUrl.replace('{ref}', encodeURIComponent(ref));
    const r = await axios.get(url, { timeout: 15000 });
    res.json({ ok: true, provider: 'custom', ref, commentary: r.data });
  } catch (err) {
    console.error('Commentary error:', err?.message || err);
    res.status(500).json({ ok: false, error: 'Failed to fetch commentary provider' });
  }
});

module.exports = router;
