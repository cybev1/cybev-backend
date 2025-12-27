// routes/blog.routes.js - CLEAN VERSION (No verification on public routes)
const express = require('express');
const router = express.Router();
const Blog = require('../models/blog.model');
const verifyToken = require('../middleware/verifyToken');
const requireEmailVerification = require('../middleware/requireEmailVerification');
const { createNotification } = require('../utils/notifications');

// ========================================
// IMPORTANT: Specific routes BEFORE :id routes!
// ========================================

// ========== PUBLIC ROUTES (No auth - Feed access) ==========

// GET /api/blogs/trending - Get trending blogs
router.get('/trending', async (req, res) => {
  try {
    console.log('🔥 Fetching trending blogs');
    
    // Calculate trending score: views + (likes * 3) + recency bonus
    const blogs = await Blog.aggregate([
      {
        $addFields: {
          likeCount: { $size: { $ifNull: ['$likes', []] } },
          // Recency: blogs from last 7 days get bonus
          recencyBonus: {
            $cond: {
              if: { $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
              then: 50,
              else: 0
            }
          }
        }
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $ifNull: ['$views', 0] },
              { $multiply: ['$likeCount', 3] },
              '$recencyBonus'
            ]
          }
        }
      },
      { $sort: { trendingScore: -1 } },
      { $limit: 10 }
    ]);

    // Populate author info
    await Blog.populate(blogs, { path: 'author', select: 'name username profilePicture' });
    
    console.log(`✅ Found ${blogs.length} trending blogs`);
    
    res.json({
      success: true,
      ok: true,
      blogs
    });
  } catch (error) {
    console.error('❌ Error fetching trending blogs:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to fetch trending blogs'
    });
  }
});

// GET /api/blogs/trending-tags - Get trending tags
router.get('/trending-tags', async (req, res) => {
  try {
    console.log('🏷️ Fetching trending tags');
    
    const tags = await Blog.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { tag: '$_id', count: 1, _id: 0 } }
    ]);
    
    console.log(`✅ Found ${tags.length} trending tags`);
    
    res.json({
      success: true,
      ok: true,
      tags
    });
  } catch (error) {
    console.error('❌ Error fetching trending tags:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to fetch trending tags'
    });
  }
});

// GET /api/blogs/search - Search blogs
router.get('/search', async (req, res) => {
  try {
    const { q, tag, category, author, sort = 'recent', limit = 20, skip = 0 } = req.query;
    
    console.log('🔍 Searching blogs:', { q, tag, category, author });
    
    const query = {};
    
    // Text search
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ];
    }
    
    // Filter by tag
    if (tag) {
      query.tags = { $in: [tag] };
    }
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by author
    if (author) {
      query.author = author;
    }
    
    // Sorting options
    let sortOption = { createdAt: -1 };
    if (sort === 'popular') {
      sortOption = { views: -1 };
    } else if (sort === 'likes') {
      sortOption = { 'likes.length': -1 };
    } else if (sort === 'oldest') {
      sortOption = { createdAt: 1 };
    }
    
    const blogs = await Blog.find(query)
      .sort(sortOption)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('author', 'name username profilePicture');
    
    const total = await Blog.countDocuments(query);
    
    console.log(`✅ Found ${blogs.length} blogs matching search`);
    
    res.json({
      success: true,
      ok: true,
      blogs,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + blogs.length < total
      }
    });
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Search failed'
    });
  }
});

// GET /api/blogs - Get all blogs (PUBLIC - for feed)
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;  // Increased from 10!
    const skip = parseInt(req.query.skip) || 0;
    
    console.log(`📚 Fetching blogs - limit: ${limit}, skip: ${skip}`);
    
    // Show ALL blogs for feed (not just published)
    const blogs = await Blog.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name username profilePicture');
    
    const total = await Blog.countDocuments({});
    
    console.log(`✅ Found ${blogs.length} blogs (${total} total)`);
    
    res.json({
      success: true,
      data: {
        blogs,
        total,
        limit,
        skip
      }
    });
  } catch (error) {
    console.error('❌ Error fetching blogs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs'
    });
  }
});

// ========== PROTECTED ROUTES (User-specific - Email verified) ==========

// GET /api/blogs/my-blogs - Get current user's blogs
// ⭐ MUST BE BEFORE /:id ROUTE!
router.get('/my-blogs', verifyToken, requireEmailVerification, async (req, res) => {
  try {
    console.log('📚 Fetching my blogs for user:', req.user.id);
    
    const blogs = await Blog.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .populate('author', 'name username profilePicture');
    
    console.log(`✅ Found ${blogs.length} blogs for user`);
    
    res.json({
      success: true,
      blogs,
      count: blogs.length
    });
  } catch (error) {
    console.error('❌ Error fetching user blogs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs'
    });
  }
});

// GET /api/blogs/stats - Get user's blog statistics
// ⭐ MUST BE BEFORE /:id ROUTE!
router.get('/stats', verifyToken, requireEmailVerification, async (req, res) => {
  try {
    console.log('📊 Fetching blog stats for user:', req.user.id);
    
    const blogs = await Blog.find({ author: req.user.id });
    
    const stats = {
      totalPosts: blogs.length,
      totalViews: blogs.reduce((sum, blog) => sum + (blog.views || 0), 0),
      totalLikes: blogs.reduce((sum, blog) => sum + (blog.likes?.length || 0), 0),
      totalComments: blogs.reduce((sum, blog) => sum + (blog.comments?.length || 0), 0),
      totalEarnings: blogs.reduce((sum, blog) => sum + (blog.earnings || 0), 0)
    };
    
    console.log('✅ Blog stats:', stats);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// ========== :id ROUTES (After specific routes) ==========

// GET /api/blogs/:id - Get single blog by ID (PUBLIC)
router.get('/:id', async (req, res) => {
  try {
    console.log('📖 Fetching blog:', req.params.id);
    
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name username profilePicture');
    
    if (!blog) {
      console.log('❌ Blog not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }
    
    // Increment view count
    blog.views = (blog.views || 0) + 1;
    await blog.save();
    
    console.log('✅ Blog found:', blog.title);
    
    res.json({
      success: true,
      blog
    });
  } catch (error) {
    console.error('❌ Get blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blog'
    });
  }
});

// POST /api/blogs - Create new blog (AUTH REQUIRED - No email verification)
router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('📝 Creating blog for user:', req.user.id);
    
    const blog = new Blog({
      ...req.body,
      author: req.user.id
    });
    
    await blog.save();
    await blog.populate('author', 'name username profilePicture');
    
    console.log('✅ Blog created:', blog._id);
    
    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      blog
    });
  } catch (error) {
    console.error('❌ Error creating blog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create blog'
    });
  }
});

// PUT /api/blogs/:id - Update blog (AUTH REQUIRED - No email verification)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findOne({
      _id: req.params.id,
      author: req.user.id
    });
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found or unauthorized'
      });
    }
    
    Object.assign(blog, req.body);
    await blog.save();
    await blog.populate('author', 'name username profilePicture');
    
    res.json({
      success: true,
      message: 'Blog created successfully',
      blog
    });
  } catch (error) {
    console.error('❌ Error updating blog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update blog'
    });
  }
});

// DELETE /api/blogs/:id - Delete blog (AUTH REQUIRED - No email verification)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findOneAndDelete({
      _id: req.params.id,
      author: req.user.id
    });
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found or unauthorized'
      });
    }
    
    res.json({
      success: true,
      message: 'Blog deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting blog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete blog'
    });
  }
});

// POST /api/blogs/:id/like - Toggle like (AUTH REQUIRED - No email verification)
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        ok: false,
        message: 'Blog not found'
      });
    }
    
    const likes = blog.likes || [];
    const userIndex = likes.indexOf(req.user.id);
    let liked = false;
    
    if (userIndex > -1) {
      likes.splice(userIndex, 1);
      liked = false;
    } else {
      likes.push(req.user.id);
      liked = true;
    }
    
    blog.likes = likes;
    await blog.save();
    
    // Send notification when liked (not unliked)
    if (liked && blog.author && String(blog.author) !== String(req.user.id)) {
      try {
        await createNotification({
          recipient: blog.author,
          sender: req.user.id,
          type: 'like',
          message: `liked your post "${blog.title?.substring(0, 30) || 'your post'}"`,
          entityId: blog._id,
          entityModel: 'Blog'
        });
      } catch (notifyErr) {
        console.warn('Like notification failed:', notifyErr.message);
      }
    }
    
    res.json({
      success: true,
      ok: true,
      liked,
      likeCount: likes.length
    });
  } catch (error) {
    console.error('❌ Error toggling like:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to toggle like'
    });
  }
});

// POST /api/blogs/:id/share - Track share (PUBLIC - no auth needed)
router.post('/:id/share', async (req, res) => {
  try {
    const { platform } = req.body;
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }
    
    // Initialize shares object if needed
    if (!blog.shares) {
      blog.shares = { total: 0, platforms: {} };
    }
    
    // Increment total
    blog.shares.total = (blog.shares.total || 0) + 1;
    
    // Track by platform
    if (platform) {
      blog.shares.platforms = blog.shares.platforms || {};
      blog.shares.platforms[platform] = (blog.shares.platforms[platform] || 0) + 1;
    }
    
    await blog.save();
    
    res.json({
      ok: true,
      shares: blog.shares
    });
  } catch (error) {
    console.error('Share tracking error:', error);
    res.status(500).json({ ok: false, error: 'Failed to track share' });
  }
});

module.exports = router;
