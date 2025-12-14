// routes/blog.routes.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const Blog = require('../models/blog.model');
const { verifyToken } = require('../middleware/auth');

// ========================================
// IMPORTANT: Specific routes MUST come BEFORE :id routes!
// ========================================

// GET /api/blogs/my-blogs - Get current user's blogs
router.get('/my-blogs', verifyToken, async (req, res) => {
  try {
    const blogs = await Blog.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .populate('author', 'name username profilePicture');
    
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
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const blogs = await Blog.find({ author: req.user.id });
    
    const stats = {
      totalPosts: blogs.length,
      totalViews: blogs.reduce((sum, blog) => sum + (blog.views || 0), 0),
      totalLikes: blogs.reduce((sum, blog) => sum + (blog.likes?.length || 0), 0),
      totalComments: blogs.reduce((sum, blog) => sum + (blog.comments?.length || 0), 0),
      totalEarnings: blogs.reduce((sum, blog) => sum + (blog.earnings || 0), 0)
    };
    
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

// GET /api/blogs/trending - Get trending blogs
router.get('/trending', async (req, res) => {
  try {
    const blogs = await Blog.find({ status: 'published' })
      .sort({ views: -1, likes: -1 })
      .limit(10)
      .populate('author', 'name username profilePicture');
    
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

// GET /api/blogs - Get all published blogs (with pagination)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const blogs = await Blog.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name username profilePicture');
    
    const total = await Blog.countDocuments({ status: 'published' });
    
    res.json({
      success: true,
      blogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
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

// POST /api/blogs - Create new blog
router.post('/', verifyToken, async (req, res) => {
  try {
    const blog = new Blog({
      ...req.body,
      author: req.user.id
    });
    
    await blog.save();
    await blog.populate('author', 'name username profilePicture');
    
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

// GET /api/blogs/:id - Get single blog by ID
router.get('/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name username profilePicture');
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }
    
    // Increment view count
    blog.views = (blog.views || 0) + 1;
    await blog.save();
    
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

// PUT /api/blogs/:id - Update blog
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

// DELETE /api/blogs/:id - Delete blog
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

// POST /api/blogs/:id/like - Toggle like
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
    
    if (userIndex > -1) {
      likes.splice(userIndex, 1);
    } else {
      likes.push(req.user.id);
    }
    
    blog.likes = likes;
    await blog.save();
    
    res.json({
      success: true,
      liked: userIndex === -1,
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

module.exports = router;
