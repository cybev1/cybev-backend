const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const Follow = require('../models/follow.model');
const Post = require('../models/post.model');

/**
 * Feed API
 * Mounted at: /api/feed
 *
 * NOTE: The primary feed endpoint used by the frontend is /posts/feed.
 * This router exists for backward-compat and for future expansion.
 */

// GET /api/feed?scope=all|following&limit=50&page=1
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 100);
    const skip = (page - 1) * limit;

    const scope = String(req.query.scope || 'all').toLowerCase();

    const query = {};
    if (scope === 'following') {
      const follows = await Follow.find({ follower: req.user.id }).select('following');
      const followingIds = follows.map((f) => f.following);
      query.authorId = { $in: [...followingIds, req.user.id] };
    }

    const [posts, total] = await Promise.all([
      Post.find(query)
        .populate('authorId', 'username displayName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments(query),
    ]);

    res.json({
      ok: true,
      posts,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + posts.length < total,
      },
    });
  } catch (err) {
    console.error('feed error:', err);
    res.status(500).json({ ok: false, message: 'Failed to load feed' });
  }
});

module.exports = router;
