// ============================================
// FILE: routes/blog.routes.js
// Blog Routes - FIXED ROUTE ORDER
// VERSION: 2.0 - Fixed /my route order
// ISSUE: /my was being caught by /:id route
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Get Blog model
const getBlog = () => {
  try {
    return mongoose.models.Blog || require('../models/blog.model');
  } catch (e) {
    // Create a basic schema if model doesn't exist
    const BlogSchema = new mongoose.Schema({
      title: String,
      content: String,
      excerpt: String,
      slug: String,
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, default: 'draft' },
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      tags: [String],
      category: String,
      featuredImage: String,
      website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website' },
      siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website' },
      publishedAt: Date,
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }, { timestamps: true });
    
    return mongoose.model('Blog', BlogSchema);
  }
};

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// Optional auth - doesn't fail if no token
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    } catch (err) {}
  }
  next();
};

// ==========================================
// IMPORTANT: /my MUST come BEFORE /:id
// ==========================================

// GET /api/blogs/my - Get current user's blogs (MUST BE FIRST!)
router.get('/my', verifyToken, async (req, res) => {
  try {
    const Blog = getBlog();
    const userId = req.user.id || req.user.userId || req.user._id;
    
    console.log(`📖 Fetching blogs for user: ${userId}`);
    
    const { status, limit = 50, page = 1, sort = '-createdAt' } = req.query;
    
    const query = {
      $or: [
        { author: userId },
        { user: userId },
        { userId: userId }
      ]
    };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const blogs = await Blog.find(query)
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .populate('website', 'name subdomain')
      .lean();

    const total = await Blog.countDocuments(query);

    // Calculate stats
    const stats = {
      total,
      published: await Blog.countDocuments({ ...query, status: 'published' }),
      draft: await Blog.countDocuments({ ...query, status: 'draft' }),
      totalViews: blogs.reduce((sum, b) => sum + (b.views || 0), 0)
    };

    res.json({
      ok: true,
      blogs,
      count: blogs.length,
      total,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('❌ Get my blogs error:', err);
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

// GET /api/blogs/stats - Get blog stats for current user
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const Blog = getBlog();
    const userId = req.user.id || req.user.userId || req.user._id;
    
    const query = {
      $or: [
        { author: userId },
        { user: userId },
        { userId: userId }
      ]
    };

    const [total, published, draft, viewsResult] = await Promise.all([
      Blog.countDocuments(query),
      Blog.countDocuments({ ...query, status: 'published' }),
      Blog.countDocuments({ ...query, status: 'draft' }),
      Blog.aggregate([
        { $match: { $or: [
          { author: new mongoose.Types.ObjectId(userId) },
          { user: new mongoose.Types.ObjectId(userId) },
          { userId: new mongoose.Types.ObjectId(userId) }
        ]}},
        { $group: { _id: null, totalViews: { $sum: { $ifNull: ['$views', 0] } } } }
      ])
    ]);

    res.json({
      ok: true,
      stats: {
        total,
        published,
        draft,
        totalViews: viewsResult[0]?.totalViews || 0
      }
    });
  } catch (err) {
    console.error('❌ Get blog stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/blogs/featured - Get featured blogs
router.get('/featured', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { limit = 10 } = req.query;

    const blogs = await Blog.find({ 
      status: 'published',
      $or: [{ featured: true }, { isFeatured: true }]
    })
      .sort('-publishedAt -createdAt')
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .lean();

    res.json({ ok: true, blogs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

// GET /api/blogs/recent - Get recent public blogs
router.get('/recent', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { limit = 20 } = req.query;

    const blogs = await Blog.find({ status: 'published' })
      .sort('-publishedAt -createdAt')
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .lean();

    res.json({ ok: true, blogs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

// GET /api/blogs/popular - Get popular blogs by views
router.get('/popular', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { limit = 10 } = req.query;

    const blogs = await Blog.find({ status: 'published' })
      .sort('-views -likes')
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .lean();

    res.json({ ok: true, blogs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

// GET /api/blogs/category/:category - Get blogs by category
router.get('/category/:category', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { category } = req.params;
    const { limit = 20, page = 1 } = req.query;

    const query = { 
      status: 'published',
      category: { $regex: new RegExp(category, 'i') }
    };

    const blogs = await Blog.find(query)
      .sort('-publishedAt -createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .lean();

    const total = await Blog.countDocuments(query);

    res.json({ ok: true, blogs, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

// GET /api/blogs/tag/:tag - Get blogs by tag
router.get('/tag/:tag', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { tag } = req.params;
    const { limit = 20, page = 1 } = req.query;

    const query = { 
      status: 'published',
      tags: { $regex: new RegExp(tag, 'i') }
    };

    const blogs = await Blog.find(query)
      .sort('-publishedAt -createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .lean();

    const total = await Blog.countDocuments(query);

    res.json({ ok: true, blogs, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

// GET /api/blogs/user/:userId - Get blogs by user ID
router.get('/user/:userId', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { userId } = req.params;
    const { limit = 20, page = 1, status } = req.query;

    // Only show published to non-owners
    const isOwner = req.user && (req.user.id === userId || req.user.userId === userId);
    
    const query = {
      $or: [
        { author: userId },
        { user: userId },
        { userId: userId }
      ]
    };
    
    if (!isOwner) {
      query.status = 'published';
    } else if (status && status !== 'all') {
      query.status = status;
    }

    const blogs = await Blog.find(query)
      .sort('-createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .lean();

    const total = await Blog.countDocuments(query);

    res.json({ ok: true, blogs, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

// GET /api/blogs/site/:siteId - Get blogs for a specific website
router.get('/site/:siteId', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { siteId } = req.params;
    const { limit = 20, page = 1, status } = req.query;

    const query = {
      $or: [
        { website: siteId },
        { siteId: siteId }
      ]
    };
    
    // Only show published unless owner
    if (status) {
      query.status = status;
    } else {
      query.status = 'published';
    }

    const blogs = await Blog.find(query)
      .sort('-publishedAt -createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('author', 'name username avatar')
      .lean();

    const total = await Blog.countDocuments(query);

    res.json({ ok: true, blogs, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

// GET /api/blogs/slug/:slug - Get blog by slug
router.get('/slug/:slug', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { slug } = req.params;

    const blog = await Blog.findOne({ slug })
      .populate('author', 'name username avatar bio')
      .populate('website', 'name subdomain');

    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Increment views
    blog.views = (blog.views || 0) + 1;
    await blog.save();

    res.json({ ok: true, blog });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// CRUD OPERATIONS
// ==========================================

// POST /api/blogs - Create new blog
router.post('/', verifyToken, async (req, res) => {
  try {
    const Blog = getBlog();
    const userId = req.user.id || req.user.userId || req.user._id;
    
    const {
      title, content, excerpt, slug, status,
      tags, category, featuredImage, website, siteId
    } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Title is required' });
    }

    // Generate slug if not provided
    const blogSlug = slug || title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

    const blog = new Blog({
      title,
      content,
      excerpt: excerpt || content?.substring(0, 200),
      slug: blogSlug,
      author: userId,
      user: userId,
      userId: userId,
      status: status || 'draft',
      tags: tags || [],
      category,
      featuredImage,
      website: website || siteId,
      siteId: siteId || website,
      publishedAt: status === 'published' ? new Date() : null
    });

    await blog.save();
    await blog.populate('author', 'name username avatar');

    res.status(201).json({ ok: true, blog });
  } catch (err) {
    console.error('❌ Create blog error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/blogs/:id - Update blog
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const Blog = getBlog();
    const { id } = req.params;
    const userId = req.user.id || req.user.userId || req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid blog ID' });
    }

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Check ownership
    const isOwner = [blog.author?.toString(), blog.user?.toString(), blog.userId?.toString()]
      .includes(userId.toString());
    
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const allowedUpdates = [
      'title', 'content', 'excerpt', 'slug', 'status',
      'tags', 'category', 'featuredImage', 'website', 'siteId'
    ];

    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        blog[field] = req.body[field];
      }
    }

    // Set publishedAt when publishing
    if (req.body.status === 'published' && !blog.publishedAt) {
      blog.publishedAt = new Date();
    }

    blog.updatedAt = new Date();
    await blog.save();
    await blog.populate('author', 'name username avatar');

    res.json({ ok: true, blog });
  } catch (err) {
    console.error('❌ Update blog error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/blogs/:id - Delete blog
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const Blog = getBlog();
    const { id } = req.params;
    const userId = req.user.id || req.user.userId || req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid blog ID' });
    }

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Check ownership
    const isOwner = [blog.author?.toString(), blog.user?.toString(), blog.userId?.toString()]
      .includes(userId.toString());
    
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    await Blog.findByIdAndDelete(id);

    res.json({ ok: true, message: 'Blog deleted successfully' });
  } catch (err) {
    console.error('❌ Delete blog error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /:id - Get blog by ID (MUST BE LAST!)
// ==========================================

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { id } = req.params;

    console.log(`📖 Fetching blog: ${id}`);

    // Check if it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      // Try to find by slug instead
      const blogBySlug = await Blog.findOne({ slug: id })
        .populate('author', 'name username avatar bio')
        .populate('website', 'name subdomain');

      if (blogBySlug) {
        blogBySlug.views = (blogBySlug.views || 0) + 1;
        await blogBySlug.save();
        return res.json({ ok: true, blog: blogBySlug });
      }

      return res.status(400).json({ ok: false, error: 'Invalid blog ID or slug' });
    }

    const blog = await Blog.findById(id)
      .populate('author', 'name username avatar bio')
      .populate('website', 'name subdomain');

    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Check access for drafts
    const userId = req.user?.id || req.user?.userId;
    const isOwner = userId && [blog.author?.toString(), blog.user?.toString(), blog.userId?.toString()]
      .includes(userId.toString());
    
    if (blog.status !== 'published' && !isOwner && req.user?.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Blog not available' });
    }

    // Increment views
    blog.views = (blog.views || 0) + 1;
    await blog.save();

    res.json({ ok: true, blog });
  } catch (err) {
    console.error('❌ Get blog error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
