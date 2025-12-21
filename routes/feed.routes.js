const express = require('express');
const router = express.Router();

const Blog = require('../models/blog.model');
const Follow = require('../models/follow.model');
const { authenticateToken } = require('../middleware/auth');

// Get personalized feed (blogs from followed users)
router.get('/following', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Get list of users the current user follows
    const following = await Follow.find({ follower: userId }).select('following');
    const followingIds = following.map((f) => f.following);

    if (followingIds.length === 0) {
      return res.json({
        ok: true,
        blogs: [],
        pagination: { page, limit, total: 0, pages: 0 },
        message: 'Follow users to see their posts in your feed'
      });
    }

    const blogs = await Blog.find({
      author: { $in: followingIds },
      status: 'published'
    })
      .populate('author', 'username email avatar')
      .populate('likes', 'username')
      .sort('-createdAt')
      .limit(limit)
      .skip(skip);

    const total = await Blog.countDocuments({
      author: { $in: followingIds },
      status: 'published'
    });

    res.json({
      ok: true,
      blogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch feed' });
  }
});

// Get mixed feed (70% following + 30% popular)
router.get('/mixed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Get following users
    const following = await Follow.find({ follower: userId }).select('following');
    const followingIds = following.map((f) => f.following);

    const followingLimit = Math.ceil(limit * 0.7);
    const popularLimit = Math.max(0, limit - followingLimit);

    let allBlogs = [];

    // From followed users
    if (followingIds.length > 0) {
      const followingBlogs = await Blog.find({
        author: { $in: followingIds },
        status: 'published'
      })
        .populate('author', 'username email avatar')
        .populate('likes', 'username')
        .sort('-createdAt')
        .limit(followingLimit)
        .skip(skip);

      allBlogs = allBlogs.concat(followingBlogs);
    }

    // Popular posts not from followed users
    const popularBlogs = await Blog.find({
      author: { $nin: [...followingIds, userId] },
      status: 'published'
    })
      .populate('author', 'username email avatar')
      .populate('likes', 'username')
      .sort('-createdAt') // Safer than sorting by "-likes" (array) in Mongo
      .limit(popularLimit);

    allBlogs = allBlogs.concat(popularBlogs);

    // Light shuffle to mix buckets
    allBlogs.sort(() => Math.random() - 0.5);

    res.json({
      ok: true,
      blogs: allBlogs,
      pagination: {
        page,
        limit,
        total: allBlogs.length,
        pages: Math.ceil(allBlogs.length / limit)
      }
    });
  } catch (error) {
    console.error('Mixed feed error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch mixed feed' });
  }
});

module.exports = router;
