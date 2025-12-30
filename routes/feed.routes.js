// ============================================
// FILE: routes/feed.routes.js
// PATH: cybev-backend/routes/feed.routes.js
// PURPOSE: Unified feed from posts and blogs
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Get models (don't redefine - use existing)
const getPostModel = () => {
  try {
    return mongoose.model('Post');
  } catch {
    // Only create if doesn't exist
    const postSchema = new mongoose.Schema({
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      content: { type: String, maxlength: 5000 },
      images: [String],
      video: String,
      likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
      shares: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
      isHidden: { type: Boolean, default: false },
      isFeatured: { type: Boolean, default: false }
    }, { timestamps: true });
    return mongoose.model('Post', postSchema);
  }
};

const getBlogModel = () => {
  try {
    return mongoose.model('Blog');
  } catch {
    const blogSchema = new mongoose.Schema({
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      title: { type: String, required: true },
      slug: String,
      content: String,
      excerpt: String,
      featuredImage: String,
      coverImage: String,
      tags: [String],
      status: { type: String, enum: ['draft', 'published'], default: 'published' },
      likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      views: { type: Number, default: 0 },
      isHidden: { type: Boolean, default: false },
      isFeatured: { type: Boolean, default: false }
    }, { timestamps: true });
    return mongoose.model('Blog', blogSchema);
  }
};

// GET /api/feed - Get unified feed
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, sort = 'latest', userId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const Post = getPostModel();
    const Blog = getBlogModel();

    // Build query
    const baseQuery = { isHidden: { $ne: true } };
    if (userId) baseQuery.author = userId;

    // Get posts
    let posts = [];
    try {
      posts = await Post.find(baseQuery)
        .populate('author', 'name username avatar isVerified')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      
      posts = posts.map(p => ({ ...p, type: 'post' }));
    } catch (e) {
      console.log('Posts fetch error:', e.message);
    }

    // Get blogs
    let blogs = [];
    try {
      const blogQuery = { ...baseQuery, status: 'published' };
      blogs = await Blog.find(blogQuery)
        .populate('author', 'name username avatar isVerified')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      
      blogs = blogs.map(b => ({ ...b, type: 'blog' }));
    } catch (e) {
      console.log('Blogs fetch error:', e.message);
    }

    // Combine and sort
    let feed = [...posts, ...blogs];

    // Sort based on filter
    switch (sort) {
      case 'trending':
        feed.sort((a, b) => {
          const scoreA = (a.views || 0) + (a.likes?.length || 0) * 10;
          const scoreB = (b.views || 0) + (b.likes?.length || 0) * 10;
          return scoreB - scoreA;
        });
        break;
      case 'popular':
        feed.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
        break;
      case 'latest':
      default:
        feed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Paginate
    const total = feed.length;
    feed = feed.slice(skip, skip + parseInt(limit));

    res.json({
      ok: true,
      posts: feed,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get feed', posts: [] });
  }
});

// GET /api/feed/following - Get feed from followed users
router.get('/following', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user.id;

    // Get user's following list
    const User = mongoose.model('User');
    const user = await User.findById(userId).select('following');
    
    if (!user || !user.following || user.following.length === 0) {
      return res.json({ ok: true, posts: [], message: 'Follow some users to see their posts' });
    }

    const followingIds = user.following;
    const Post = getPostModel();
    const Blog = getBlogModel();

    // Get posts from followed users
    const posts = await Post.find({ 
      author: { $in: followingIds }, 
      isHidden: { $ne: true } 
    })
      .populate('author', 'name username avatar isVerified')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // Get blogs from followed users
    const blogs = await Blog.find({ 
      author: { $in: followingIds }, 
      status: 'published',
      isHidden: { $ne: true } 
    })
      .populate('author', 'name username avatar isVerified')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // Combine and sort
    let feed = [
      ...posts.map(p => ({ ...p, type: 'post' })),
      ...blogs.map(b => ({ ...b, type: 'blog' }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate
    const skip = (parseInt(page) - 1) * parseInt(limit);
    feed = feed.slice(skip, skip + parseInt(limit));

    res.json({ ok: true, posts: feed });
  } catch (error) {
    console.error('Following feed error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get feed', posts: [] });
  }
});

// GET /api/feed/featured - Get featured content
router.get('/featured', async (req, res) => {
  try {
    const Post = getPostModel();
    const Blog = getBlogModel();

    const posts = await Post.find({ isFeatured: true, isHidden: { $ne: true } })
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const blogs = await Blog.find({ isFeatured: true, status: 'published', isHidden: { $ne: true } })
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const feed = [
      ...posts.map(p => ({ ...p, type: 'post' })),
      ...blogs.map(b => ({ ...b, type: 'blog' }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ ok: true, posts: feed });
  } catch (error) {
    console.error('Featured feed error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get featured', posts: [] });
  }
});

module.exports = router;
