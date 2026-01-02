// ============================================
// FILE: routes/content.routes.js
// Content Creation API with WALLET CREDITING
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Try to load content creator service
let contentCreator;
try {
  contentCreator = require('../services/content-creator.service');
} catch (error) {
  console.log('⚠️ Content creator service error:', error.message);
  // Create a fallback
  contentCreator = {
    createCompleteBlog: async () => {
      throw new Error('AI service not available. Please contact support.');
    }
  };
}

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
      // Fallback middleware
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

// Blog model
let Blog;
try {
  Blog = require('../models/blog.model');
} catch (error) {
  console.log('⚠️ Blog model not found');
}

// ==========================================
// UTILITY: Credit tokens to user's wallet
// ==========================================
async function creditUserTokens(userId, amount, description, referenceId = null) {
  try {
    const User = mongoose.model('User');
    
    // Update user's token balance
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { tokenBalance: amount } },
      { new: true }
    );
    
    if (!user) {
      console.log('❌ User not found for token credit:', userId);
      return { success: false, error: 'User not found' };
    }
    
    // Record transaction
    let Transaction;
    try {
      Transaction = mongoose.model('Transaction');
    } catch {
      const transactionSchema = new mongoose.Schema({
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, required: true },
        amount: { type: Number, required: true },
        balance: Number,
        description: String,
        reference: mongoose.Schema.Types.ObjectId,
        referenceType: String,
        status: { type: String, default: 'completed' }
      }, { timestamps: true });
      Transaction = mongoose.model('Transaction', transactionSchema);
    }
    
    await Transaction.create({
      user: userId,
      type: 'reward',
      amount: amount,
      balance: user.tokenBalance,
      description: description,
      reference: referenceId,
      referenceType: 'Blog',
      status: 'completed'
    });
    
    console.log(`💰 Credited ${amount} tokens to user ${userId}. New balance: ${user.tokenBalance}`);
    
    return { 
      success: true, 
      newBalance: user.tokenBalance,
      amount: amount
    };
  } catch (error) {
    console.error('❌ Token credit error:', error);
    return { success: false, error: error.message };
  }
}

// Handle OPTIONS
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

/**
 * POST /api/content/create-blog
 * Create complete blog post with AI
 */
router.post('/create-blog', verifyToken, async (req, res) => {
  try {
    const { topic, tone, length, niche, targetAudience } = req.body;
    
    if (!topic || !niche) {
      return res.status(400).json({
        success: false,
        error: 'Topic and niche are required'
      });
    }

    console.log('📝 Creating complete blog post...');
    console.log(`   User: ${req.user.id}`);
    console.log(`   Topic: ${topic}`);
    console.log(`   Niche: ${niche}`);
    
    const startTime = Date.now();
    
    // Generate complete blog with everything
    const completeBlog = await contentCreator.createCompleteBlog({
      topic,
      tone: tone || 'professional',
      length: length || 'medium',
      niche,
      targetAudience: targetAudience || 'general'
    });
    
    const duration = Date.now() - startTime;
    const tokensEarned = completeBlog.initialTokens || 50;
    
    console.log(`✅ Blog created in ${duration}ms`);
    
    res.json({
      success: true,
      message: `🎉 Blog post created! You earned ${tokensEarned} tokens!`,
      data: completeBlog,
      tokensEarned: tokensEarned,
      generationTime: duration,
      viralityScore: completeBlog.viralityScore
    });
    
  } catch (error) {
    console.error('❌ Blog creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create blog post'
    });
  }
});

/**
 * POST /api/content/publish-blog
 * Publish AI-generated blog to database AND credit tokens
 */
router.post('/publish-blog', verifyToken, async (req, res) => {
  try {
    const { blogData } = req.body;
    
    if (!blogData) {
      return res.status(400).json({
        success: false,
        error: 'Blog data is required'
      });
    }

    console.log('📤 Publishing blog...');
    console.log(`   User: ${req.user.id}`);
    console.log(`   Title: ${blogData.title}`);
    
    // Check if Blog model exists
    if (!Blog) {
      return res.status(503).json({
        success: false,
        error: 'Blog model not available - contact support'
      });
    }

    // Get user name
    let authorName = req.user.name || 'Anonymous';
    try {
      const User = mongoose.model('User');
      const user = await User.findById(req.user.id).select('name username');
      if (user) {
        authorName = user.name || user.username || 'Anonymous';
      }
    } catch {}

    // Create blog in database
    const newBlog = await Blog.create({
      title: blogData.title,
      content: blogData.content,
      excerpt: blogData.summary || blogData.content?.replace(/<[^>]*>/g, '').slice(0, 200),
      author: req.user.id,
      authorName: authorName,
      category: blogData.niche || 'general',
      tags: blogData.seo?.keywords?.slice(0, 10) || blogData.hashtags || [],
      readTime: parseInt(blogData.readTime) || 5,
      featuredImage: blogData.featuredImage?.url || blogData.featuredImage || '',
      isAIGenerated: true,
      status: 'published',
      seo: {
        metaTitle: blogData.seo?.title || blogData.title,
        metaDescription: blogData.seo?.description || blogData.summary,
        keywords: blogData.seo?.keywords || []
      }
    });

    console.log(`✅ Blog published with ID: ${newBlog._id}`);

    // ==========================================
    // 💰 CREDIT TOKENS TO USER'S WALLET
    // ==========================================
    const tokensToCredit = blogData.initialTokens || 50;
    const creditResult = await creditUserTokens(
      req.user.id,
      tokensToCredit,
      `Earned for publishing: "${blogData.title?.slice(0, 50)}..."`,
      newBlog._id
    );
    
    if (creditResult.success) {
      console.log(`💰 User earned ${tokensToCredit} CYBEV tokens!`);
    } else {
      console.log('⚠️ Token credit failed but blog was published');
    }

    res.json({
      success: true,
      message: '🎉 Blog published successfully!',
      data: {
        blogId: newBlog._id,
        slug: newBlog.slug || newBlog._id,
        url: `/blog/${newBlog._id}`,
        tokensEarned: tokensToCredit,
        newBalance: creditResult.newBalance
      }
    });
    
  } catch (error) {
    console.error('❌ Blog publish error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to publish blog'
    });
  }
});

/**
 * POST /api/content/quick-post
 * Create a short blog/micro post and earn tokens
 */
router.post('/quick-post', verifyToken, async (req, res) => {
  try {
    const { content, images } = req.body;
    
    if (!content || content.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Content must be at least 10 characters'
      });
    }

    // Get user info
    let authorName = 'Anonymous';
    try {
      const User = mongoose.model('User');
      const user = await User.findById(req.user.id).select('name username');
      authorName = user?.name || user?.username || 'Anonymous';
    } catch {}

    // Create short blog post
    const newPost = await Blog.create({
      title: '', // Short posts don't have titles
      content: content,
      excerpt: content.slice(0, 200),
      author: req.user.id,
      authorName: authorName,
      category: 'general',
      readTime: 1,
      images: images || [],
      status: 'published'
    });

    // Credit tokens for posting (smaller amount for quick posts)
    const tokensEarned = 5;
    const creditResult = await creditUserTokens(
      req.user.id,
      tokensEarned,
      'Short blog post reward',
      newPost._id
    );

    res.json({
      success: true,
      ok: true,
      message: 'Short blog posted!',
      data: {
        postId: newPost._id,
        tokensEarned: tokensEarned,
        newBalance: creditResult.newBalance
      }
    });

  } catch (error) {
    console.error('❌ Quick post error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create post'
    });
  }
});

/**
 * GET /api/content/topics
 * Get trending topics suggestions
 */
router.get('/topics', async (req, res) => {
  try {
    const { niche = 'technology' } = req.query;
    const topics = await contentCreator.getTrendingTopics(niche);
    
    res.json({
      success: true,
      topics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get topics'
    });
  }
});

/**
 * GET /api/content/image
 * Get a relevant image for a topic
 */
router.get('/image', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const image = await contentCreator.getFeaturedImage(query, 'general');
    
    res.json({
      success: true,
      image
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get image'
    });
  }
});

/**
 * POST /api/content/hashtags
 * Generate viral hashtags for a topic
 */
router.post('/hashtags', async (req, res) => {
  try {
    const { topic, niche } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required'
      });
    }

    const hashtags = await contentCreator.generateViralHashtags(topic, niche || 'general');
    
    res.json({
      success: true,
      hashtags
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate hashtags'
    });
  }
});

/**
 * POST /api/content/seo
 * Generate SEO metadata for content
 */
router.post('/seo', async (req, res) => {
  try {
    const { title, content, niche } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Title and content are required'
      });
    }

    const seo = await contentCreator.generateSEOMetadata(title, content, niche || 'general');
    
    res.json({
      success: true,
      seo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate SEO'
    });
  }
});

/**
 * GET /api/content/earnings
 * Get user's content earnings summary
 */
router.get('/earnings', verifyToken, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id).select('tokenBalance');
    
    // Get transaction history
    let transactions = [];
    try {
      const Transaction = mongoose.model('Transaction');
      transactions = await Transaction.find({
        user: req.user.id,
        type: 'reward'
      })
      .sort({ createdAt: -1 })
      .limit(20);
    } catch {}
    
    // Calculate total earned from content
    const totalEarned = transactions.reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
      success: true,
      ok: true,
      currentBalance: user?.tokenBalance || 0,
      totalEarned: totalEarned,
      recentTransactions: transactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get earnings'
    });
  }
});

module.exports = router;
