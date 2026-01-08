// ============================================
// FILE: routes/search.routes.js
// Comprehensive Search Routes
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Middleware
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
      req.user = decoded;
    } catch (err) {
      // Token invalid, continue without auth
    }
  }
  next();
};

/**
 * Global search across all content types
 * GET /api/search
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, type = 'all', page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Search query must be at least 2 characters' 
      });
    }

    const searchQuery = q.trim();
    const searchRegex = new RegExp(searchQuery, 'i');
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const results = {
      users: [],
      posts: [],
      blogs: [],
      groups: [],
      events: [],
      hashtags: []
    };

    // Search users
    if (type === 'all' || type === 'users') {
      const User = mongoose.models.User || require('../models/user.model');
      results.users = await User.find({
        $or: [
          { name: searchRegex },
          { username: searchRegex },
          { bio: searchRegex }
        ],
        role: { $ne: 'banned' }
      })
        .select('name username avatar bio followers following isVerified')
        .limit(type === 'users' ? limitNum : 5)
        .skip(type === 'users' ? skip : 0)
        .lean();

      // Add follower/following counts
      results.users = results.users.map(u => ({
        ...u,
        followersCount: u.followers?.length || 0,
        followingCount: u.following?.length || 0
      }));
    }

    // Search posts
    if (type === 'all' || type === 'posts') {
      const Post = mongoose.models.Post || require('../models/post.model');
      results.posts = await Post.find({
        $or: [
          { content: searchRegex },
          { tags: searchRegex }
        ],
        hidden: { $ne: true }
      })
        .populate('author', 'name username avatar')
        .select('content media views likes commentsCount createdAt')
        .sort({ createdAt: -1 })
        .limit(type === 'posts' ? limitNum : 10)
        .skip(type === 'posts' ? skip : 0)
        .lean();

      results.posts = results.posts.map(p => ({
        ...p,
        likesCount: p.likes?.length || 0
      }));
    }

    // Search blogs
    if (type === 'all' || type === 'blogs') {
      const Blog = mongoose.models.Blog;
      if (Blog) {
        results.blogs = await Blog.find({
          $or: [
            { title: searchRegex },
            { content: searchRegex },
            { tags: searchRegex }
          ],
          published: true
        })
          .populate('author', 'name username avatar')
          .select('title slug excerpt coverImage views likes createdAt')
          .sort({ createdAt: -1 })
          .limit(type === 'blogs' ? limitNum : 5)
          .skip(type === 'blogs' ? skip : 0)
          .lean();
      }
    }

    // Search groups
    if (type === 'all' || type === 'groups') {
      const Group = mongoose.models.Group;
      if (Group) {
        results.groups = await Group.find({
          $or: [
            { name: searchRegex },
            { description: searchRegex }
          ],
          visibility: 'public'
        })
          .select('name description coverImage membersCount category')
          .limit(type === 'groups' ? limitNum : 5)
          .skip(type === 'groups' ? skip : 0)
          .lean();
      }
    }

    // Search events
    if (type === 'all' || type === 'events') {
      const Event = mongoose.models.Event;
      if (Event) {
        results.events = await Event.find({
          $or: [
            { title: searchRegex },
            { description: searchRegex }
          ],
          visibility: 'public',
          startDate: { $gte: new Date() }
        })
          .select('title description coverImage startDate endDate location type')
          .sort({ startDate: 1 })
          .limit(type === 'events' ? limitNum : 5)
          .skip(type === 'events' ? skip : 0)
          .lean();
      }
    }

    // Search hashtags
    if (type === 'all' || type === 'hashtags') {
      const Hashtag = mongoose.models.Hashtag;
      if (Hashtag) {
        results.hashtags = await Hashtag.find({
          name: searchRegex,
          isBlocked: { $ne: true }
        })
          .select('name displayName usageCount')
          .sort({ usageCount: -1 })
          .limit(type === 'hashtags' ? limitNum : 5)
          .skip(type === 'hashtags' ? skip : 0)
          .lean();
      }
    }

    // Calculate total results for pagination
    const totalResults = type === 'all'
      ? Object.values(results).reduce((sum, arr) => sum + arr.length, 0)
      : results[type]?.length || 0;

    res.json({
      ok: true,
      query: searchQuery,
      type,
      results,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total: totalResults
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get search suggestions (autocomplete)
 * GET /api/search/suggestions
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;

    if (!q || q.length < 1) {
      return res.json({ ok: true, suggestions: [] });
    }

    const searchRegex = new RegExp('^' + q, 'i');
    const suggestions = [];

    // Username suggestions
    const User = mongoose.models.User || require('../models/user.model');
    const users = await User.find({
      username: searchRegex,
      role: { $ne: 'banned' }
    })
      .select('username name avatar')
      .limit(parseInt(limit))
      .lean();

    users.forEach(u => {
      suggestions.push({
        type: 'user',
        text: `@${u.username}`,
        name: u.name,
        avatar: u.avatar
      });
    });

    // Hashtag suggestions
    const Hashtag = mongoose.models.Hashtag;
    if (Hashtag) {
      const hashtags = await Hashtag.find({
        name: searchRegex,
        isBlocked: { $ne: true }
      })
        .select('name usageCount')
        .sort({ usageCount: -1 })
        .limit(parseInt(limit))
        .lean();

      hashtags.forEach(h => {
        suggestions.push({
          type: 'hashtag',
          text: `#${h.name}`,
          count: h.usageCount
        });
      });
    }

    res.json({
      ok: true,
      suggestions: suggestions.slice(0, parseInt(limit) * 2)
    });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get recent/popular searches
 * GET /api/search/popular
 */
router.get('/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get trending hashtags
    const Hashtag = mongoose.models.Hashtag;
    let trending = [];
    
    if (Hashtag) {
      trending = await Hashtag.find({
        isBlocked: { $ne: true },
        lastUsed: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
        .select('name usageCount')
        .sort({ trendingScore: -1 })
        .limit(parseInt(limit))
        .lean();
    }

    res.json({
      ok: true,
      popular: trending.map(h => ({
        type: 'hashtag',
        text: `#${h.name}`,
        count: h.usageCount
      }))
    });
  } catch (error) {
    console.error('Popular searches error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Search users only
 * GET /api/search/users
 */
router.get('/users', optionalAuth, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const { q, page = 1, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ ok: false, error: 'Search query required' });
    }

    const searchRegex = new RegExp(q, 'i');

    const [users, total] = await Promise.all([
      User.find({
        $or: [
          { name: searchRegex },
          { username: searchRegex },
          { bio: searchRegex }
        ],
        role: { $ne: 'banned' }
      })
        .select('name username avatar bio followers following isVerified')
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments({
        $or: [
          { name: searchRegex },
          { username: searchRegex },
          { bio: searchRegex }
        ],
        role: { $ne: 'banned' }
      })
    ]);

    // Check if current user follows each result
    let currentUserFollowing = [];
    if (req.user) {
      const currentUser = await User.findById(req.user.id).select('following').lean();
      currentUserFollowing = currentUser?.following?.map(id => id.toString()) || [];
    }

    const usersWithFollowStatus = users.map(u => ({
      ...u,
      followersCount: u.followers?.length || 0,
      followingCount: u.following?.length || 0,
      isFollowing: currentUserFollowing.includes(u._id.toString())
    }));

    res.json({
      ok: true,
      users: usersWithFollowStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Search posts only
 * GET /api/search/posts
 */
router.get('/posts', optionalAuth, async (req, res) => {
  try {
    const Post = mongoose.models.Post || require('../models/post.model');
    const { q, page = 1, limit = 20, sort = 'recent' } = req.query;

    if (!q) {
      return res.status(400).json({ ok: false, error: 'Search query required' });
    }

    const searchRegex = new RegExp(q, 'i');
    
    const sortOptions = {
      recent: { createdAt: -1 },
      popular: { views: -1 },
      engagement: { commentsCount: -1 }
    };

    const [posts, total] = await Promise.all([
      Post.find({
        $or: [
          { content: searchRegex },
          { tags: searchRegex }
        ],
        hidden: { $ne: true }
      })
        .populate('author', 'name username avatar')
        .select('content media views likes commentsCount createdAt')
        .sort(sortOptions[sort] || sortOptions.recent)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Post.countDocuments({
        $or: [
          { content: searchRegex },
          { tags: searchRegex }
        ],
        hidden: { $ne: true }
      })
    ]);

    res.json({
      ok: true,
      posts: posts.map(p => ({
        ...p,
        likesCount: p.likes?.length || 0
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Search posts error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
