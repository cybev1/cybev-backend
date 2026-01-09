// ============================================
// FILE: routes/blogs-my.routes.js
// Blogs "My" Routes - MUST LOAD BEFORE blog.routes.js
// FIX: /api/blogs/my was being caught by /:id route
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// Get Blog model
const getBlog = () => {
  return mongoose.models.Blog || require('../models/blog.model');
};

// ==========================================
// GET /api/blogs/my - Get current user's blogs
// CRITICAL: This must be defined before /:id route
// ==========================================
router.get('/my', verifyToken, async (req, res) => {
  try {
    const Blog = getBlog();

    const blogs = await Blog.find({ author: req.user.id })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ ok: true, blogs: blogs || [], posts: blogs || [] });
  } catch (error) {
    console.error('Get my blogs error:', error);
    res.status(500).json({ ok: false, error: error.message, blogs: [], posts: [] });
  }
});

// ==========================================
// GET /api/blogs/user/:userId - Get blogs by user ID
// ==========================================
router.get('/user/:userId', async (req, res) => {
  try {
    const Blog = getBlog();
    const { userId } = req.params;

    // Handle 'undefined' userId
    if (!userId || userId === 'undefined') {
      return res.json({ ok: true, blogs: [], posts: [] });
    }

    const blogs = await Blog.find({ 
      author: userId,
      isPublished: true 
    })
      .sort({ createdAt: -1 })
      .populate('author', 'name username avatar')
      .lean();

    res.json({ ok: true, blogs: blogs || [], posts: blogs || [] });
  } catch (error) {
    console.error('Get user blogs error:', error);
    res.status(500).json({ ok: false, error: error.message, blogs: [], posts: [] });
  }
});

module.exports = router;
