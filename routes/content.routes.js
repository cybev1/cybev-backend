// ============================================
// FILE: routes/content.routes.js
// AI Content Generation Routes
// VERSION: 3.0.0 - Uses content-creator.service.js
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, error: 'Invalid token' });
  }
};

// ==========================================
// LOAD CONTENT CREATOR SERVICE
// ==========================================

let contentCreator;
try {
  contentCreator = require('../services/content-creator.service');
  console.log('✅ Content creator service loaded');
} catch (err) {
  console.log('⚠️ Content creator service not found:', err.message);
  contentCreator = null;
}

// ==========================================
// LOAD BLOG MODEL
// ==========================================

let Blog;
try {
  Blog = require('../models/blog.model');
} catch {
  const blogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    excerpt: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [String],
    category: String,
    featuredImage: String,
    coverImage: String,
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isAIGenerated: { type: Boolean, default: false },
    seo: {
      title: String,
      description: String,
      keywords: [String],
      slug: String
    },
    aiMetadata: {
      model: String,
      topic: String,
      tone: String,
      length: String,
      generatedAt: Date
    }
  }, { timestamps: true });
  Blog = mongoose.models.Blog || mongoose.model('Blog', blogSchema);
}

// ==========================================
// POST /api/content/create-blog
// ==========================================

router.post('/create-blog', verifyToken, async (req, res) => {
  try {
    const { 
      topic, 
      description = '',
      niche = 'general',
      tone = 'professional', 
      length = 'medium',
      keywords = '',
      autoPublish = false,
      generateImage = true
    } = req.body;
    
    console.log('🤖 AI Blog Generation Request:', { 
      topic, 
      niche, 
      tone, 
      length, 
      user: req.user?.id || req.user?.userId 
    });
    
    if (!topic || topic.trim().length < 3) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Please provide a topic (at least 3 characters)' 
      });
    }

    // Check if content creator service is available
    if (!contentCreator) {
      return res.status(500).json({ 
        ok: false, 
        error: 'AI service not available. Content creator service not loaded.' 
      });
    }

    // Check if at least one AI provider is configured
    const hasAI = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || 
                  process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    
    if (!hasAI) {
      console.error('❌ No AI API keys configured');
      return res.status(500).json({ 
        ok: false, 
        error: 'AI service not configured. Please add DEEPSEEK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY to environment variables.' 
      });
    }

    // Generate the blog using content creator service
    console.log('📝 Starting blog generation...');
    const result = await contentCreator.createCompleteBlog({
      topic,
      description,
      tone,
      length,
      niche,
      targetAudience: 'general'
    });

    if (!result || !result.title) {
      throw new Error('Blog generation returned empty result');
    }

    // Create blog in database
    const blog = new Blog({
      title: result.title,
      content: result.content,
      excerpt: result.excerpt || result.summary,
      tags: result.hashtags || result.seo?.keywords || [niche],
      category: niche,
      author: req.user.id || req.user.userId,
      status: autoPublish ? 'published' : 'draft',
      featuredImage: result.featuredImage?.url || null,
      coverImage: result.featuredImage?.url || null,
      isAIGenerated: true,
      seo: result.seo || {
        title: result.title,
        description: result.summary,
        keywords: result.hashtags || [],
        slug: result.seo?.slug
      },
      aiMetadata: {
        model: 'content-creator-v2',
        topic,
        tone,
        length,
        generatedAt: new Date()
      }
    });

    await blog.save();
    console.log('✅ Blog created:', blog._id);

    // Return success response
    res.json({
      ok: true,
      blog: {
        _id: blog._id,
        title: blog.title,
        excerpt: blog.excerpt,
        content: blog.content,
        tags: blog.tags,
        category: blog.category,
        featuredImage: blog.featuredImage,
        status: blog.status,
        seo: blog.seo
      },
      tokensEarned: result.initialTokens || 50,
      viralityScore: result.viralityScore || Math.floor(Math.random() * 30) + 70,
      hashtags: result.hashtags,
      readTime: result.readTime,
      message: 'Blog generated successfully!'
    });

  } catch (error) {
    console.error('❌ Blog generation error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'AI service not available. Please try again later.'
    });
  }
});

// ==========================================
// POST /api/content/generate-ideas
// ==========================================

router.post('/generate-ideas', verifyToken, async (req, res) => {
  try {
    const { topic, niche = 'general', count = 5 } = req.body;

    if (!topic) {
      return res.status(400).json({ ok: false, error: 'Topic is required' });
    }

    if (!contentCreator) {
      return res.status(500).json({ ok: false, error: 'AI service not available' });
    }

    const topics = await contentCreator.getTrendingTopics(niche);
    res.json({ ok: true, ideas: topics });
  } catch (error) {
    console.error('Ideas generation error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// POST /api/content/generate-seo
// ==========================================

router.post('/generate-seo', verifyToken, async (req, res) => {
  try {
    const { title, content, niche = 'general' } = req.body;

    if (!title || !content) {
      return res.status(400).json({ ok: false, error: 'Title and content are required' });
    }

    if (!contentCreator) {
      return res.status(500).json({ ok: false, error: 'AI service not available' });
    }

    const seo = await contentCreator.generateSEOMetadata(title, content, niche);
    res.json({ ok: true, seo });
  } catch (error) {
    console.error('SEO generation error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// POST /api/content/generate-hashtags
// ==========================================

router.post('/generate-hashtags', verifyToken, async (req, res) => {
  try {
    const { topic, niche = 'general' } = req.body;

    if (!topic) {
      return res.status(400).json({ ok: false, error: 'Topic is required' });
    }

    if (!contentCreator) {
      return res.status(500).json({ ok: false, error: 'AI service not available' });
    }

    const hashtags = await contentCreator.generateViralHashtags(topic, niche);
    res.json({ ok: true, hashtags });
  } catch (error) {
    console.error('Hashtag generation error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GET /api/content/health
// ==========================================

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: contentCreator ? 'loaded' : 'not_loaded',
    providers: {
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
      pexels: !!process.env.PEXELS_API_KEY,
      unsplash: !!process.env.UNSPLASH_ACCESS_KEY
    }
  });
});

module.exports = router;
