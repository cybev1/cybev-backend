const express = require('express');
const router = express.Router();
const Blog = require('../models/blog.model');
const User = require('../models/user.model');
const verifyToken = require('../middleware/verifyToken');

// ========== CREATE BLOG ==========
router.post('/', verifyToken, async (req, res) => {
  try {
    const { 
      title, 
      content, 
      excerpt,
      featuredImage, 
      category, 
      tags, 
      status,
      readTime 
    } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Title and content are required'
      });
    }

    // Fetch user data for authorName
    const user = await User.findById(req.user.id).select('name username email');
    const authorName = user?.name || user?.username || user?.email?.split('@')[0] || 'Anonymous';

    console.log(`📝 Creating blog for user: ${authorName} (${req.user.id})`);

    // Create blog with all fields
    const blog = await Blog.create({
      title,
      content,
      excerpt: excerpt || content.substring(0, 200), // Use excerpt or auto-generate
      featuredImage: featuredImage || '',
      author: req.user.id,
      authorName: authorName, // ADD THIS!
      category: category || 'general', // Default category
      tags: tags || [],
      status: status || 'draft',
      readTime: readTime || Math.ceil(content.split(' ').length / 200)
    });

    console.log(`✅ Blog created by ${authorName}: ${blog._id}`);

    res.status(201).json({
      success: true,
      message: status === 'published' ? '✅ Blog published!' : '✅ Blog saved as draft!',
      blog
    });

  } catch (error) {
    console.error('❌ Create blog error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create blog'
    });
  }
});

// ========== GET ALL BLOGS ==========
router.get('/', async (req, res) => {
  try {
    const { status, category, limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;

    const blogs = await Blog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'name username avatar email')
      .lean();

    // Ensure authorName is populated
    const blogsWithAuthor = blogs.map(blog => ({
      ...blog,
      authorName: blog.authorName || blog.author?.name || blog.author?.username || 'Anonymous'
    }));

    const total = await Blog.countDocuments(query);

    res.json({
      success: true,
      data: {
        blogs: blogsWithAuthor,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Get blogs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch blogs'
    });
  }
});

// ========== GET SINGLE BLOG ==========
router.get('/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name username avatar email');

    if (!blog) {
      return res.status(404).json({
        success: false,
        error: 'Blog not found'
      });
    }

    // Increment views
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
      error: 'Failed to fetch blog'
    });
  }
});

// ========== UPDATE BLOG ==========
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        error: 'Blog not found'
      });
    }

    // Check ownership
    if (blog.author.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to edit this blog'
      });
    }

    const { title, content, excerpt, featuredImage, category, tags, status } = req.body;

    if (title) blog.title = title;
    if (content) blog.content = content;
    if (excerpt !== undefined) blog.excerpt = excerpt;
    if (featuredImage !== undefined) blog.featuredImage = featuredImage;
    if (category) blog.category = category;
    if (tags) blog.tags = tags;
    if (status) blog.status = status;

    await blog.save();

    res.json({
      success: true,
      message: 'Blog updated successfully',
      blog
    });

  } catch (error) {
    console.error('❌ Update blog error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update blog'
    });
  }
});

// ========== DELETE BLOG ==========
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        error: 'Blog not found'
      });
    }

    // Check ownership
    if (blog.author.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this blog'
      });
    }

    await Blog.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Blog deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete blog error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete blog'
    });
  }
});

// ========== GET USER'S BLOGS ==========
router.get('/user/:userId/blogs', async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const blogs = await Blog.find({ author: req.params.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'name username avatar');

    const total = await Blog.countDocuments({ author: req.params.userId });

    res.json({
      success: true,
      blogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Get user blogs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user blogs'
    });
  }
});

module.exports = router;
