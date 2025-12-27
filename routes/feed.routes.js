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

// GET /api/feed/following - Posts from followed users only
router.get('/following', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const follows = await Follow.find({ follower: req.user.id }).select('following');
    const followingIds = follows.map((f) => f.following);

    if (followingIds.length === 0) {
      return res.json({
        ok: true,
        posts: [],
        pagination: { page, limit, total: 0, hasMore: false },
        message: 'Follow users to see their posts here'
      });
    }

    const [posts, total] = await Promise.all([
      Post.find({ authorId: { $in: followingIds } })
        .populate('authorId', 'username displayName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments({ authorId: { $in: followingIds } }),
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
    console.error('feed/following error:', err);
    res.status(500).json({ ok: false, message: 'Failed to load following feed' });
  }
});

// GET /api/feed/mixed - Mix of followed users and trending content
router.get('/mixed', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const follows = await Follow.find({ follower: req.user.id }).select('following');
    const followingIds = follows.map((f) => f.following);

    // Get posts - prioritize followed users but include others
    const [posts, total] = await Promise.all([
      Post.find({})
        .populate('authorId', 'username displayName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments({}),
    ]);

    // Sort to prioritize followed users' posts
    const sortedPosts = posts.sort((a, b) => {
      const aIsFollowed = followingIds.some(id => id.equals(a.authorId?._id));
      const bIsFollowed = followingIds.some(id => id.equals(b.authorId?._id));
      if (aIsFollowed && !bIsFollowed) return -1;
      if (!aIsFollowed && bIsFollowed) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      ok: true,
      posts: sortedPosts,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + posts.length < total,
      },
    });
  } catch (err) {
    console.error('feed/mixed error:', err);
    res.status(500).json({ ok: false, message: 'Failed to load mixed feed' });
  }
});

module.exports = router;
