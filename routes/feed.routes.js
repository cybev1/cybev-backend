```javascript
const express = require('express');
const router = express.Router();
const Blog = require('../models/blog.model');
const Follow = require('../models/follow.model');
const { authenticateToken } = require('../middleware/auth');

// Get personalized feed (posts from followed users)
router.get('/following', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get list of users the current user follows
    const following = await Follow.find({ follower: userId }).select('following');
    const followingIds = following.map(f => f.following);

    // If not following anyone, return empty feed with suggestion
    if (followingIds.length === 0) {
      return res.json({
        blogs: [],
        pagination: { page, limit, total: 0, pages: 0 },
        message: 'Follow users to see their posts in your feed'
      });
    }

    // Get blogs from followed users
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
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Get mixed feed (combination of following + popular)
router.get('/mixed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get following users
    const following = await Follow.find({ follower: userId }).select('following');
    const followingIds = following.map(f => f.following);

    // Get 70% from following, 30% popular
    const followingLimit = Math.ceil(limit * 0.7);
    const popularLimit = Math.floor(limit * 0.3);

    let allBlogs = [];

    // Get blogs from followed users
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
      
      allBlogs = [...followingBlogs];
    }

    // Fill remaining with popular posts (not from followed users)
    const popularBlogs = await Blog.find({
      author: { $nin: [...followingIds, userId] },
      status: 'published'
    })
      .populate('author', 'username email avatar')
      .populate('likes', 'username')
      .sort('-likes -createdAt')
      .limit(popularLimit);

    allBlogs = [...allBlogs, ...popularBlogs];

    // Shuffle to mix following and popular
    allBlogs.sort(() => Math.random() - 0.5);

    res.json({
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
    res.status(500).json({ error: 'Failed to fetch mixed feed' });
  }
});

module.exports = router;
```
