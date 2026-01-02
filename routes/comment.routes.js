// ============================================
// FILE: routes/comment.routes.js
// FIXED: Auto-populate authorName for comments
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Try to load verifyToken middleware
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
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }
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

// Optional auth - doesn't fail if no token
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
      req.user = decoded;
    } catch (err) {
      // Ignore invalid token
    }
  }
  next();
};

// Load Comment model
let Comment;
try {
  Comment = require('../models/comment.model');
} catch (e) {
  // Create inline schema if model doesn't exist
  const commentSchema = new mongoose.Schema({
    content: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorAvatar: { type: String },
    blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }]
  }, { timestamps: true });
  
  Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
}

// Helper: Get user info
async function getUserInfo(userId) {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(userId).select('name username profilePicture avatar');
    return {
      name: user?.name || user?.username || 'Anonymous',
      avatar: user?.profilePicture || user?.avatar || null
    };
  } catch (e) {
    return { name: 'Anonymous', avatar: null };
  }
}

// ==========================================
// POST /api/comments - Create comment (generic)
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const { content, blogId, postId, parentCommentId } = req.body;
    
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    
    // Get user info for authorName
    const userInfo = await getUserInfo(req.user.id);
    
    const comment = new Comment({
      content: content.trim(),
      user: req.user.id,
      authorName: userInfo.name,
      authorAvatar: userInfo.avatar,
      blog: blogId || null,
      post: postId || null,
      parentComment: parentCommentId || null
    });
    
    await comment.save();
    
    // Populate user for response
    await comment.populate('user', 'name username profilePicture avatar');
    
    // Update blog/post comment count
    if (blogId) {
      try {
        const Blog = mongoose.model('Blog');
        await Blog.findByIdAndUpdate(blogId, { $inc: { commentsCount: 1 } });
      } catch {}
    }
    
    console.log(`💬 Comment created by ${userInfo.name} on ${blogId ? 'blog' : 'post'}`);
    
    res.status(201).json({
      success: true,
      message: 'Comment added',
      comment: {
        _id: comment._id,
        content: comment.content,
        user: comment.user,
        authorName: comment.authorName,
        createdAt: comment.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Comment creation error:', error);
    res.status(500).json({ 
      error: 'Failed to add comment',
      message: error.message 
    });
  }
});

// ==========================================
// POST /api/comments/blog/:blogId - Comment on blog
// ==========================================
router.post('/blog/:blogId', verifyToken, async (req, res) => {
  try {
    const { blogId } = req.params;
    const { content, parentCommentId } = req.body;
    
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    
    // Get user info
    const userInfo = await getUserInfo(req.user.id);
    
    const comment = new Comment({
      content: content.trim(),
      user: req.user.id,
      authorName: userInfo.name,
      authorAvatar: userInfo.avatar,
      blog: blogId,
      parentComment: parentCommentId || null
    });
    
    await comment.save();
    await comment.populate('user', 'name username profilePicture avatar');
    
    // Update blog comment count
    try {
      const Blog = mongoose.model('Blog');
      await Blog.findByIdAndUpdate(blogId, { $inc: { commentsCount: 1 } });
    } catch {}
    
    console.log(`💬 Comment on blog ${blogId} by ${userInfo.name}`);
    
    res.status(201).json({
      success: true,
      comment: {
        _id: comment._id,
        content: comment.content,
        user: comment.user,
        authorName: comment.authorName,
        createdAt: comment.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Blog comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// ==========================================
// POST /api/comments/post/:postId - Comment on post
// ==========================================
router.post('/post/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parentCommentId } = req.body;
    
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    
    const userInfo = await getUserInfo(req.user.id);
    
    const comment = new Comment({
      content: content.trim(),
      user: req.user.id,
      authorName: userInfo.name,
      authorAvatar: userInfo.avatar,
      post: postId,
      parentComment: parentCommentId || null
    });
    
    await comment.save();
    await comment.populate('user', 'name username profilePicture avatar');
    
    console.log(`💬 Comment on post ${postId} by ${userInfo.name}`);
    
    res.status(201).json({
      success: true,
      comment: {
        _id: comment._id,
        content: comment.content,
        user: comment.user,
        authorName: comment.authorName,
        createdAt: comment.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Post comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// ==========================================
// GET /api/comments/blog/:blogId - Get blog comments
// ==========================================
router.get('/blog/:blogId', optionalAuth, async (req, res) => {
  try {
    const { blogId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const comments = await Comment.find({ blog: blogId, parentComment: null })
      .populate('user', 'name username profilePicture avatar')
      .populate({
        path: 'replies',
        populate: { path: 'user', select: 'name username profilePicture avatar' }
      })
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Comment.countDocuments({ blog: blogId, parentComment: null });
    
    res.json({
      success: true,
      comments,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
    
  } catch (error) {
    console.error('❌ Fetch comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments', comments: [] });
  }
});

// ==========================================
// GET /api/comments/post/:postId - Get post comments
// ==========================================
router.get('/post/:postId', optionalAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const comments = await Comment.find({ post: postId, parentComment: null })
      .populate('user', 'name username profilePicture avatar')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Comment.countDocuments({ post: postId, parentComment: null });
    
    res.json({
      success: true,
      comments,
      total
    });
    
  } catch (error) {
    console.error('❌ Fetch comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments', comments: [] });
  }
});

// ==========================================
// DELETE /api/comments/:id - Delete comment
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    // Check ownership
    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Decrement comment count
    if (comment.blog) {
      try {
        const Blog = mongoose.model('Blog');
        await Blog.findByIdAndUpdate(comment.blog, { $inc: { commentsCount: -1 } });
      } catch {}
    }
    
    await Comment.findByIdAndDelete(req.params.id);
    
    res.json({ success: true, message: 'Comment deleted' });
    
  } catch (error) {
    console.error('❌ Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ==========================================
// POST /api/comments/:id/like - Like comment
// ==========================================
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    const userId = req.user.id;
    const hasLiked = comment.likes?.includes(userId);
    
    if (hasLiked) {
      comment.likes = comment.likes.filter(id => id.toString() !== userId);
    } else {
      comment.likes = comment.likes || [];
      comment.likes.push(userId);
    }
    
    await comment.save();
    
    res.json({
      success: true,
      liked: !hasLiked,
      likesCount: comment.likes.length
    });
    
  } catch (error) {
    console.error('❌ Like comment error:', error);
    res.status(500).json({ error: 'Failed to like comment' });
  }
});

module.exports = router;
