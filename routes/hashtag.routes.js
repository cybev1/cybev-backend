// ============================================
// FILE: routes/hashtag.routes.js
// Hashtag System Routes
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Create Hashtag schema if not exists
const getHashtagModel = () => {
  if (mongoose.models.Hashtag) {
    return mongoose.models.Hashtag;
  }

  const hashtagSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    displayName: String, // Original casing
    posts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post'
    }],
    blogs: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Blog'
    }],
    usageCount: {
      type: Number,
      default: 0
    },
    trendingScore: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date,
      default: Date.now
    },
    category: String,
    isBlocked: {
      type: Boolean,
      default: false
    }
  }, {
    timestamps: true
  });

  hashtagSchema.index({ name: 1 });
  hashtagSchema.index({ usageCount: -1 });
  hashtagSchema.index({ trendingScore: -1 });

  return mongoose.model('Hashtag', hashtagSchema);
};

// Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

/**
 * Get trending hashtags
 * GET /api/hashtags/trending
 */
router.get('/trending', async (req, res) => {
  try {
    const Hashtag = getHashtagModel();
    const { limit = 10, period = '24h' } = req.query;

    const periodMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    }[period] || 24 * 60 * 60 * 1000;

    const cutoff = new Date(Date.now() - periodMs);

    const trending = await Hashtag.find({
      lastUsed: { $gte: cutoff },
      isBlocked: { $ne: true }
    })
      .sort({ trendingScore: -1, usageCount: -1 })
      .limit(parseInt(limit))
      .select('name displayName usageCount trendingScore')
      .lean();

    res.json({
      ok: true,
      hashtags: trending,
      period
    });
  } catch (error) {
    console.error('Trending hashtags error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Search hashtags
 * GET /api/hashtags/search
 */
router.get('/search', async (req, res) => {
  try {
    const Hashtag = getHashtagModel();
    const { q, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({ ok: false, error: 'Search query required' });
    }

    const hashtags = await Hashtag.find({
      name: { $regex: q.toLowerCase(), $options: 'i' },
      isBlocked: { $ne: true }
    })
      .sort({ usageCount: -1 })
      .limit(parseInt(limit))
      .select('name displayName usageCount')
      .lean();

    res.json({
      ok: true,
      hashtags
    });
  } catch (error) {
    console.error('Search hashtags error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get hashtag details and posts
 * GET /api/hashtags/:name
 */
router.get('/:name', async (req, res) => {
  try {
    const Hashtag = getHashtagModel();
    const Post = mongoose.models.Post || require('../models/post.model');
    const { name } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const hashtag = await Hashtag.findOne({ 
      name: name.toLowerCase().replace('#', '') 
    });

    if (!hashtag) {
      return res.status(404).json({ ok: false, error: 'Hashtag not found' });
    }

    // Get posts with this hashtag
    const posts = await Post.find({
      $or: [
        { hashtags: hashtag._id },
        { content: { $regex: `#${hashtag.name}\\b`, $options: 'i' } }
      ],
      hidden: { $ne: true }
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .lean();

    res.json({
      ok: true,
      hashtag: {
        name: hashtag.name,
        displayName: hashtag.displayName,
        usageCount: hashtag.usageCount,
        trendingScore: hashtag.trendingScore
      },
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get hashtag error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Follow a hashtag
 * POST /api/hashtags/:name/follow
 */
router.post('/:name/follow', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const { name } = req.params;

    const hashtagName = name.toLowerCase().replace('#', '');

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { followedHashtags: hashtagName }
    });

    res.json({
      ok: true,
      message: `Now following #${hashtagName}`
    });
  } catch (error) {
    console.error('Follow hashtag error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Unfollow a hashtag
 * DELETE /api/hashtags/:name/follow
 */
router.delete('/:name/follow', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const { name } = req.params;

    const hashtagName = name.toLowerCase().replace('#', '');

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { followedHashtags: hashtagName }
    });

    res.json({
      ok: true,
      message: `Unfollowed #${hashtagName}`
    });
  } catch (error) {
    console.error('Unfollow hashtag error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get user's followed hashtags
 * GET /api/hashtags/user/following
 */
router.get('/user/following', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const user = await User.findById(req.user.id).select('followedHashtags');

    res.json({
      ok: true,
      hashtags: user?.followedHashtags || []
    });
  } catch (error) {
    console.error('Get followed hashtags error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Extract and save hashtags from content
 * Utility function - called when creating/updating posts
 */
async function extractAndSaveHashtags(content, contentType = 'post', contentId) {
  const Hashtag = getHashtagModel();
  
  // Extract hashtags from content
  const hashtagRegex = /#(\w+)/g;
  const matches = content.match(hashtagRegex) || [];
  const hashtags = [...new Set(matches.map(h => h.slice(1).toLowerCase()))];

  for (const tag of hashtags) {
    await Hashtag.findOneAndUpdate(
      { name: tag },
      {
        $set: { 
          lastUsed: new Date(),
          displayName: tag
        },
        $inc: { 
          usageCount: 1,
          trendingScore: 1 
        },
        $addToSet: contentType === 'post' 
          ? { posts: contentId }
          : { blogs: contentId }
      },
      { upsert: true }
    );
  }

  return hashtags;
}

// Export utility function
router.extractAndSaveHashtags = extractAndSaveHashtags;

module.exports = router;
