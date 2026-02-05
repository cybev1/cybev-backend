// ============================================
// FILE: routes/blog.routes.js
// Blog Routes - FIXED ROUTE ORDER + POPULATE
// VERSION: 2.3 - Added GET / for public blog listing
// PREVIOUS: 2.2 - Fixed authorName auto-population
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
      authorName: { type: String, required: true },
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

// Get User model
const getUser = () => {
  try {
    return mongoose.models.User || require('../models/user.model');
  } catch (e) {
    return null;
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
// GET /api/blogs - List all public blogs
// MUST come before /my and /:id
// ==========================================
router.get('/', optionalAuth, async (req, res) => {
  try {
    const Blog = getBlog();
    const { 
      page = 1, 
      limit = 12, 
      sort = 'createdAt',
      category,
      search 
    } = req.query;

    console.log(`📖 Fetching public blogs - page ${page}, limit ${limit}, sort ${sort}`);

    // Build query for public/published blogs
    const query = {
      $or: [
        { status: 'published' },
        { status: 'public' },
        { isPublished: true }
      ]
    };

    if (category && category !== 'all') {
      query.category = category.toLowerCase();
    }

    if (search) {
      query.$and = [
        query.$or ? { $or: query.$or } : {},
        {
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { content: { $regex: search, $options: 'i' } },
            { excerpt: { $regex: search, $options: 'i' } }
          ]
        }
      ];
      delete query.$or;
    }

    // Determine sort order
    let sortOption = {};
    if (sort === 'views' || sort === '-views') {
      sortOption = { views: -1 };
    } else if (sort === 'likes' || sort === '-likes') {
      sortOption = { likes: -1 };
    } else {
      sortOption = { createdAt: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('author', 'name username avatar profilePicture')
        .lean(),
      Blog.countDocuments(query)
    ]);

    console.log(`📖 Found ${blogs.length} blogs (total: ${total})`);

    res.json({
      ok: true,
      blogs,
      data: { blogs },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasMore: skip + blogs.length < total
      }
    });
  } catch (err) {
    console.error('❌ List blogs error:', err);
    res.status(500).json({ ok: false, error: err.message, blogs: [] });
  }
});

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
      .lean();

    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Increment views
    await Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } });
    blog.views = (blog.views || 0) + 1;

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
    const User = getUser();
    const userId = req.user.id || req.user.userId || req.user._id;
    
    const {
      title, content, excerpt, slug, status,
      tags, category, featuredImage, website, siteId, authorName
    } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Title is required' });
    }

    // Get author name from user if not provided
    let blogAuthorName = authorName;
    if (!blogAuthorName && User) {
      try {
        const user = await User.findById(userId).select('name username firstName lastName');
        if (user) {
          blogAuthorName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Anonymous';
        }
      } catch (e) {
        console.log('Could not fetch user for authorName:', e.message);
      }
    }
    
    // Fallback to token data or default
    if (!blogAuthorName) {
      blogAuthorName = req.user.name || req.user.username || 'Anonymous';
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
      authorName: blogAuthorName,
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

    console.log(`✅ Blog created: "${title}" by ${blogAuthorName}`);
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
    const LiveStream = mongoose.models.LiveStream || require('../models/livestream.model');
    const Post = mongoose.models.Post || require('../models/post.model');
    const { id } = req.params;
    const userId = req.user?.id || req.user?.userId || req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid content ID' });
    }

    // 1) Try Blog by _id
    let blog = await Blog.findById(id);

    // 2) Try Blog linkage fields (stream-published feed items)
    if (!blog) {
      const oid = new mongoose.Types.ObjectId(id);
      blog = await Blog.findOne({
        $or: [
          { liveStreamId: id }, { feedPostId: id },
          { liveStreamId: oid }, { feedPostId: oid }
        ]
      });
    }

    // If we found a blog, enforce ownership then delete
    if (blog) {
      const ownerIds = [
        blog.author?.toString(),
        blog.user?.toString(),
        blog.userId?.toString()
      ].filter(Boolean);

      const isOwner = userId && ownerIds.includes(userId.toString());
      if (!isOwner && req.user?.role !== 'admin') {
        return res.status(403).json({ ok: false, error: 'Not authorized' });
      }

      // delete linked livestream too (if any)
      if (blog.liveStreamId && mongoose.Types.ObjectId.isValid(blog.liveStreamId)) {
        try { await LiveStream.findByIdAndDelete(blog.liveStreamId); } catch (e) {}
      }

      await blog.deleteOne();
      return res.json({ ok: true, message: 'Deleted' });
    }

    // 3) Not a Blog → could be a LiveStream _id (OBS/device streams)
    const stream = await LiveStream.findById(id);
    if (stream) {
      const isOwner = userId && stream.streamer?.toString() === userId.toString();
      if (!isOwner && req.user?.role !== 'admin') {
        return res.status(403).json({ ok: false, error: 'Not authorized' });
      }

      // delete any blog posts linked to this stream
      await Blog.deleteMany({ $or: [{ liveStreamId: stream._id.toString() }, { liveStreamId: stream._id }] });
      await stream.deleteOne();
      return res.json({ ok: true, message: 'Stream deleted' });
    }

    // 4) Not a Blog/Stream → could be a Post (some feed items are stored as posts but UI deletes via /blogs)
    const post = await Post.findById(id);
    if (post) {
      const postOwner = (post.author || post.user || post.userId || post.owner)?.toString();
      const isOwner = userId && postOwner && postOwner === userId.toString();
      if (!isOwner && req.user?.role !== 'admin') {
        return res.status(403).json({ ok: false, error: 'Not authorized' });
      }
      await post.deleteOne();
      return res.json({ ok: true, message: 'Post deleted' });
    }

    return res.status(404).json({ ok: false, error: 'Blog or Stream not found' });

  } catch (err) {
    console.error('❌ Delete content error:', err);
    return res.status(500).json({ ok: false, error: err.message });
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
        .lean();

      if (blogBySlug) {
        // Increment views
        await Blog.findByIdAndUpdate(blogBySlug._id, { $inc: { views: 1 } });
        blogBySlug.views = (blogBySlug.views || 0) + 1;
        return res.json({ ok: true, blog: blogBySlug });
      }

      return res.status(400).json({ ok: false, error: 'Invalid blog ID or slug' });
    }

    const blog = await Blog.findById(id)
      .populate('author', 'name username avatar bio')
      .lean();

    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Check access for drafts
    const userId = req.user?.id || req.user?.userId;
    const isOwner = userId && [blog.author?._id?.toString(), blog.user?.toString(), blog.userId?.toString()]
      .includes(userId.toString());
    
    if (blog.status !== 'published' && !isOwner && req.user?.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Blog not available' });
    }

    // Increment views
    await Blog.findByIdAndUpdate(id, { $inc: { views: 1 } });
    blog.views = (blog.views || 0) + 1;

    res.json({ ok: true, blog });
  } catch (err) {
    console.error('❌ Get blog error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('📝 Blog routes v2.3 loaded - GET / public listing + authorName fix');
module.exports = router;
