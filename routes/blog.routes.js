const express = require('express');
const router = express.Router();
const Blog = require('../models/blog.model');
const Wallet = require('../models/wallet.model');
const { authenticateToken } = require('../middleware/auth');

// Get all blogs with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 12, featured } = req.query;
    
    const query = { status: 'published' };
    
    if (category && category !== 'All') {
      query.category = category;
    }
    
    if (featured === 'true') {
      query.featured = true;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const blogs = await Blog.find(query)
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Blog.countDocuments(query);
    
    res.json({
      blogs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        hasMore: skip + blogs.length < total
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single blog by ID
router.get('/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name email');
    
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    
    // Increment view count
    blog.views += 1;
    await blog.save();
    
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new blog (protected)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, content, category, tags } = req.body;
    
    const blog = new Blog({
      title,
      content,
      category,
      tags: tags || [],
      author: req.user.id,
      authorName: req.user.name
    });
    
    await blog.save();
    
    // Reward user with tokens
    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) {
      wallet = new Wallet({ user: req.user.id });
    }
    
    await wallet.addTokens(
      50, 
      'BLOG_POST', 
      `Published: ${title}`,
      blog._id
    );
    
    // Update streak
    await wallet.updateStreak();
    
    // Check for achievements
    if (!wallet.achievements.includes('FIRST_POST')) {
      wallet.achievements.push('FIRST_POST');
      await wallet.addTokens(25, 'BONUS', 'First post achievement!');
    }
    
    if (wallet.streaks.current === 7 && !wallet.achievements.includes('WEEK_STREAK')) {
      wallet.achievements.push('WEEK_STREAK');
      await wallet.addTokens(100, 'BONUS', '7-day streak bonus!');
    }
    
    await wallet.save();
    
    res.status(201).json({ 
      blog, 
      tokensEarned: 50,
      currentStreak: wallet.streaks.current
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update blog (protected)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    
    if (blog.author.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const { title, content, category, tags, status } = req.body;
    
    if (title) blog.title = title;
    if (content) blog.content = content;
    if (category) blog.category = category;
    if (tags) blog.tags = tags;
    if (status) blog.status = status;
    
    await blog.save();
    
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete blog (protected)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    
    if (blog.author.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    await blog.deleteOne();
    
    res.json({ message: 'Blog deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Like/Unlike blog (protected)
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    
    const userIndex = blog.likes.indexOf(req.user.id);
    let liked = false;
    
    if (userIndex > -1) {
      // Unlike
      blog.likes.splice(userIndex, 1);
      liked = false;
    } else {
      // Like
      blog.likes.push(req.user.id);
      liked = true;
      
      // Reward blog author with tokens (not self-likes)
      if (blog.author.toString() !== req.user.id) {
        let authorWallet = await Wallet.findOne({ user: blog.author });
        if (!authorWallet) {
          authorWallet = new Wallet({ user: blog.author });
        }
        
        await authorWallet.addTokens(
          5,
          'BLOG_LIKE',
          `Like received on: ${blog.title}`,
          blog._id
        );
      }
    }
    
    await blog.save();
    
    res.json({ 
      liked, 
      likeCount: blog.likes.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's blogs (protected)
router.get('/user/my-blogs', authenticateToken, async (req, res) => {
  try {
    const blogs = await Blog.find({ author: req.user.id })
      .sort({ createdAt: -1 });
    
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trending blogs
router.get('/trending/top', async (req, res) => {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const blogs = await Blog.find({
      status: 'published',
      createdAt: { $gte: threeDaysAgo }
    })
      .populate('author', 'name email')
      .sort({ views: -1, likes: -1 })
      .limit(6);
    
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
