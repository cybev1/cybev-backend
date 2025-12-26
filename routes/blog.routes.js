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
    // NOTE: Sorting by an array field (likes) is unreliable; compute a simple score.
    const raw = await Blog.find({})  // Show ALL, not just published
      .limit(100)
      .populate('author', 'name username profilePicture')
      .lean();

    const blogs = raw
      .map((b) => {
        const likesCount = Array.isArray(b.likes) ? b.likes.length : 0;
        const shares = Array.isArray(b.shares) ? b.shares.length : 0;
        const shareCount = typeof b.shareCount === 'number' ? b.shareCount : shares;
        // very simple, tunable score
        const score = (b.views || 0) + (likesCount * 2) + (shareCount * 3);
        return { ...b, likesCount, shareCount, _trendScore: score };
      })
      .sort((a, b) => (b._trendScore || 0) - (a._trendScore || 0))
      .slice(0, 10);
    
    console.log(`✅ Found ${blogs.length} trending blogs`);
    
    res.json({
      success: true,
      blogs
    });
  } catch (error) {
    console.error('❌ Error fetching trending blogs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trending blogs'
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
      message: 'Blog updated successfully',
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
        message: 'Blog not found'
      });
    }
    
    const likes = blog.likes || [];
    const userIndex = likes.indexOf(req.user.id);
    const isLike = userIndex === -1;

    if (!isLike) {
      likes.splice(userIndex, 1);
    } else {
      likes.push(req.user.id);

      // Notify author (avoid self-notifs)
      try {
        const authorId = blog.author?.toString?.() || blog.author;
        if (authorId && authorId.toString() !== req.user.id.toString()) {
          await createNotification(authorId, 'like', 'Someone liked your post', {
            blogId: blog._id,
            senderId: req.user.id,
          });
        }
      } catch (e) {
        console.warn('⚠️ Like notification failed:', e?.message || e);
      }
    }

    blog.likes = likes;
    await blog.save();

    res.json({
      success: true,
      liked: isLike,
      likeCount: likes.length
    });
  } catch (error) {
    console.error('❌ Error toggling like:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle like'
    });
  }
});

// Track shares (for analytics + trending)
router.post('/:id/share', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    blog.shares = blog.shares || [];
    blog.shares.push({ user: req.user.id, timestamp: new Date() });
    blog.shareCount = (blog.shareCount || 0) + 1;
    await blog.save();

    // Notify author (avoid self-notifs)
    try {
      const authorId = blog.author?.toString?.() || blog.author;
      if (authorId && authorId.toString() !== req.user.id.toString()) {
        await createNotification(authorId, 'share', 'Someone shared your post', {
          blogId: blog._id,
          senderId: req.user.id,
        });
      }
    } catch (e) {
      console.warn('⚠️ Share notification failed:', e?.message || e);
    }

    res.json({
      success: true,
      shareCount: blog.shareCount,
    });
  } catch (error) {
    console.error('❌ Error tracking share:', error);
    res.status(500).json({ success: false, message: 'Failed to track share' });
  }
});

module.exports = router;
