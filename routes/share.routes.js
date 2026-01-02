// ============================================
// FILE: routes/share.routes.js
// Share to Timeline Feature
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Load verifyToken middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try {
    verifyToken = require('../middleware/auth.middleware');
  } catch (e2) {
    try {
      verifyToken = require('../middleware/auth');
    } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token provided' });
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          req.user = decoded;
          next();
        } catch (err) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      };
    }
  }
}

// Load models
let SharedPost, Blog, User;
try {
  SharedPost = require('../models/sharedPost.model');
} catch (e) {
  const sharedPostSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    originalBlog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
    originalPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    contentType: { type: String, enum: ['blog', 'post'], required: true },
    comment: { type: String, maxlength: 500, default: '' },
    visibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reactions: {
      like: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      love: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      haha: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      wow: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      sad: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      angry: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    commentsCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  }, { timestamps: true });
  SharedPost = mongoose.models.SharedPost || mongoose.model('SharedPost', sharedPostSchema);
}

try { Blog = require('../models/blog.model'); } catch (e) { Blog = mongoose.model('Blog'); }
try { User = require('../models/user.model'); } catch (e) { User = mongoose.model('User'); }

// ==========================================
// POST /api/share/timeline - Share to Timeline
// ==========================================
router.post('/timeline', verifyToken, async (req, res) => {
  try {
    const { blogId, postId, comment, visibility } = req.body;
    const userId = req.user.id;
    
    console.log('📤 Share to timeline request:', { blogId, postId, userId });
    
    if (!blogId && !postId) {
      return res.status(400).json({
        success: false,
        error: 'Blog ID or Post ID is required'
      });
    }
    
    // Check if content exists
    let originalContent;
    let contentType;
    
    if (blogId) {
      originalContent = await Blog.findById(blogId);
      contentType = 'blog';
      if (!originalContent) {
        return res.status(404).json({ success: false, error: 'Blog not found' });
      }
    } else {
      const Post = mongoose.model('Post');
      originalContent = await Post.findById(postId);
      contentType = 'post';
      if (!originalContent) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }
    }
    
    // Check if user already shared this
    const existingShare = await SharedPost.findOne({
      user: userId,
      ...(blogId ? { originalBlog: blogId } : { originalPost: postId }),
      isActive: true
    });
    
    if (existingShare) {
      return res.status(400).json({
        success: false,
        error: 'You have already shared this to your timeline'
      });
    }
    
    // Create the shared post
    const sharedPost = new SharedPost({
      user: userId,
      originalBlog: blogId || null,
      originalPost: postId || null,
      contentType,
      comment: comment?.trim() || '',
      visibility: visibility || 'public'
    });
    
    await sharedPost.save();
    
    // Update share count on original content
    if (blogId) {
      await Blog.findByIdAndUpdate(blogId, {
        $inc: { 'shares.total': 1, 'shares.platforms.timeline': 1 }
      });
    }
    
    // Get user info for response
    const user = await User.findById(userId).select('name username profilePicture avatar');
    
    // Populate the shared post for response
    await sharedPost.populate([
      { path: 'user', select: 'name username profilePicture avatar' },
      { 
        path: 'originalBlog', 
        select: 'title content excerpt featuredImage author createdAt readTime views',
        populate: { path: 'author', select: 'name username profilePicture avatar' }
      }
    ]);
    
    console.log('✅ Shared to timeline successfully');
    
    res.status(201).json({
      success: true,
      message: 'Shared to your timeline!',
      sharedPost: sharedPost
    });
    
  } catch (error) {
    console.error('❌ Share to timeline error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to share to timeline'
    });
  }
});

// ==========================================
// DELETE /api/share/timeline/:id - Remove from Timeline
// ==========================================
router.delete('/timeline/:id', verifyToken, async (req, res) => {
  try {
    const sharedPost = await SharedPost.findById(req.params.id);
    
    if (!sharedPost) {
      return res.status(404).json({ success: false, error: 'Shared post not found' });
    }
    
    // Check ownership
    if (sharedPost.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    // Decrement share count on original
    if (sharedPost.originalBlog) {
      await Blog.findByIdAndUpdate(sharedPost.originalBlog, {
        $inc: { 'shares.total': -1, 'shares.platforms.timeline': -1 }
      });
    }
    
    // Soft delete
    sharedPost.isActive = false;
    await sharedPost.save();
    
    res.json({
      success: true,
      message: 'Removed from timeline'
    });
    
  } catch (error) {
    console.error('❌ Remove share error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove share' });
  }
});

// ==========================================
// GET /api/share/timeline/:userId - Get user's shared posts
// ==========================================
router.get('/timeline/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const sharedPosts = await SharedPost.find({
      user: req.params.userId,
      isActive: true
    })
    .populate('user', 'name username profilePicture avatar')
    .populate({
      path: 'originalBlog',
      select: 'title content excerpt featuredImage author createdAt readTime views shares',
      populate: { path: 'author', select: 'name username profilePicture avatar' }
    })
    .sort({ createdAt: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));
    
    const total = await SharedPost.countDocuments({
      user: req.params.userId,
      isActive: true
    });
    
    res.json({
      success: true,
      sharedPosts,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
    
  } catch (error) {
    console.error('❌ Get shared posts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch shared posts' });
  }
});

// ==========================================
// GET /api/share/check/:blogId - Check if user shared this
// ==========================================
router.get('/check/:blogId', verifyToken, async (req, res) => {
  try {
    const existingShare = await SharedPost.findOne({
      user: req.user.id,
      originalBlog: req.params.blogId,
      isActive: true
    });
    
    res.json({
      success: true,
      shared: !!existingShare,
      sharedPost: existingShare
    });
    
  } catch (error) {
    res.status(500).json({ success: false, shared: false });
  }
});

// ==========================================
// POST /api/share/:id/react - React to shared post
// ==========================================
router.post('/:id/react', verifyToken, async (req, res) => {
  try {
    const { type } = req.body;
    const userId = req.user.id;
    
    const validTypes = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid reaction type' });
    }
    
    const sharedPost = await SharedPost.findById(req.params.id);
    if (!sharedPost) {
      return res.status(404).json({ success: false, error: 'Shared post not found' });
    }
    
    // Initialize reactions if needed
    if (!sharedPost.reactions) {
      sharedPost.reactions = {};
      validTypes.forEach(t => sharedPost.reactions[t] = []);
    }
    
    // Remove user from all reactions first
    validTypes.forEach(t => {
      if (sharedPost.reactions[t]) {
        sharedPost.reactions[t] = sharedPost.reactions[t].filter(
          id => id.toString() !== userId
        );
      }
    });
    
    // Add new reaction
    if (!sharedPost.reactions[type]) sharedPost.reactions[type] = [];
    sharedPost.reactions[type].push(userId);
    
    await sharedPost.save();
    
    res.json({
      success: true,
      reactions: sharedPost.reactions
    });
    
  } catch (error) {
    console.error('❌ Reaction error:', error);
    res.status(500).json({ success: false, error: 'Failed to react' });
  }
});

console.log('✅ Share routes loaded');

module.exports = router;
