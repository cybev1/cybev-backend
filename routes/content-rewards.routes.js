// ============================================
// FILE: content-rewards.routes.js
// PATH: /routes/content-rewards.routes.js
// Auto-wires rewards to existing content endpoints
// ============================================
const express = require('express');
const router = express.Router();
const { rewardUser, RATES } = require('../middleware/rewards.middleware');

// Auth middleware
let verifyToken;
try { verifyToken = require('../middleware/verifyToken'); } catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try {
      const m = require('../middleware/auth');
      verifyToken = m.authenticateToken || m;
    } catch (e3) {
      verifyToken = (req, res, next) => {
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

console.log('💰 Content Rewards routes loaded — auto-crediting on content actions');

// ─── Manual reward trigger (frontend calls after successful action) ───
// POST /api/rewards/trigger
router.post('/trigger', verifyToken, async (req, res) => {
  try {
    const { action, contentId, contentType } = req.body;
    const userId = req.user.id || req.user.userId;

    const rewardMap = {
      'blog_create': { type: 'BLOG_POST', desc: 'Published a blog post', model: 'Blog' },
      'vlog_create': { type: 'VLOG_POST', desc: 'Uploaded a vlog', model: 'Vlog' },
      'post_create': { type: 'POST_CREATE', desc: 'Created a social post', model: 'Post' },
      'comment': { type: 'COMMENT', desc: 'Posted a comment', model: 'Comment' },
      'blog_like': { type: 'BLOG_LIKE', desc: 'Your content was liked' },
      'blog_share': { type: 'BLOG_SHARE', desc: 'Your content was shared' },
    };

    const reward = rewardMap[action];
    if (!reward) return res.status(400).json({ error: 'Unknown action', valid: Object.keys(rewardMap) });

    const amount = RATES[reward.type] || 0;
    if (amount <= 0) return res.json({ ok: true, credited: 0 });

    await rewardUser(userId, reward.type, reward.desc, {
      relatedId: contentId,
      relatedModel: reward.model || contentType
    });

    res.json({ ok: true, credited: amount, type: reward.type, message: `+${amount} credits!` });
  } catch (err) {
    console.error('Reward trigger error:', err);
    res.status(500).json({ error: 'Failed to trigger reward' });
  }
});

// ─── Get earning rates ───
router.get('/rates', (req, res) => {
  res.json({ ok: true, rates: RATES });
});

// ─── Reward another user (e.g. content author gets credit when someone likes their content) ───
// POST /api/rewards/credit-author
router.post('/credit-author', verifyToken, async (req, res) => {
  try {
    const { authorId, action, contentId } = req.body;
    if (!authorId) return res.status(400).json({ error: 'authorId required' });

    const rewardMap = {
      'like': { type: 'BLOG_LIKE', desc: 'Someone liked your content', amount: RATES.BLOG_LIKE },
      'share': { type: 'BLOG_SHARE', desc: 'Someone shared your content', amount: RATES.BLOG_SHARE },
      'view': { type: 'BLOG_VIEW', desc: 'Content view', amount: RATES.BLOG_VIEW },
    };

    const reward = rewardMap[action];
    if (!reward) return res.json({ ok: true, credited: 0 });

    await rewardUser(authorId, reward.type, reward.desc, {
      amount: reward.amount,
      relatedId: contentId
    });

    res.json({ ok: true, credited: reward.amount });
  } catch (err) {
    console.error('Credit author error:', err);
    res.status(500).json({ error: 'Failed to credit author' });
  }
});

module.exports = router;
