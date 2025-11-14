// ============================================
// FILE: routes/ai.routes.js
// AI generation endpoints
// ============================================

const express = require('express');
const router = express.Router();
const aiService = require('../services/ai.service');
const verifyToken = require('../middleware/verifyToken');

// Handle OPTIONS preflight
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

/**
 * POST /api/ai/generate-website
 * Generate complete website with AI
 */
router.post('/generate-website', verifyToken, async (req, res) => {
  try {
    const { websiteType, businessName, description, style, colors } = req.body;
    
    // Validation
    if (!websiteType || !businessName || !description) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: websiteType, businessName, description'
      });
    }

    console.log('🎨 Website generation request:');
    console.log(`   Type: ${websiteType}`);
    console.log(`   Business: ${businessName}`);
    console.log(`   Style: ${style}`);
    console.log(`   User: ${req.user.id}`);
    
    // Generate website
    const startTime = Date.now();
    const generatedSite = await aiService.generateWebsite({
      websiteType,
      businessName,
      description,
      style: style || 'modern',
      colors: colors || 'vibrant'
    });
    const duration = Date.now() - startTime;
    
    console.log(`✅ Website generated in ${duration}ms`);
    
    // TODO: Save to database
    // TODO: Award tokens to user
    
    res.json({
      success: true,
      data: generatedSite,
      tokensEarned: 100,
      generationTime: duration,
      message: 'Website generated successfully! You earned 100 tokens! 🎉'
    });
    
  } catch (error) {
    console.error('❌ Website generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate website',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/ai/generate-blog
 * Generate blog post with AI
 */
router.post('/generate-blog', verifyToken, async (req, res) => {
  try {
    const { topic, tone, length, keywords } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required'
      });
    }

    console.log('📝 Blog generation request:');
    console.log(`   Topic: ${topic}`);
    console.log(`   Tone: ${tone}`);
    console.log(`   Length: ${length}`);
    
    const startTime = Date.now();
    const blogPost = await aiService.generateBlogPost({
      topic,
      tone: tone || 'professional',
      length: length || 'medium',
      keywords: keywords || []
    });
    const duration = Date.now() - startTime;
    
    console.log(`✅ Blog post generated in ${duration}ms`);
    
    res.json({
      success: true,
      data: blogPost,
      tokensEarned: 50,
      generationTime: duration,
      message: 'Blog post generated! You earned 50 tokens! 🎉'
    });
    
  } catch (error) {
    console.error('❌ Blog generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate blog post'
    });
  }
});

/**
 * POST /api/ai/generate-seo
 * Generate SEO metadata for content
 */
router.post('/generate-seo', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    console.log('🔍 Generating SEO metadata...');
    
    const seo = await aiService.generateSEO(content);
    
    console.log('✅ SEO metadata generated');
    
    res.json({
      success: true,
      data: seo
    });
    
  } catch (error) {
    console.error('❌ SEO generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate SEO metadata'
    });
  }
});

/**
 * GET /api/ai/test
 * Test AI service connectivity
 */
router.get('/test', verifyToken, async (req, res) => {
  try {
    console.log('🧪 Testing AI service...');
    
    const result = await aiService.testConnection();
    
    console.log('✅ AI service test passed!');
    
    res.json({
      success: true,
      message: 'All AI services are operational! 🎉',
      ...result
    });
    
  } catch (error) {
    console.error('❌ AI service test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'AI service test failed. Check API keys in Railway environment variables.'
    });
  }
});

/**
 * GET /api/ai/stats
 * Get AI service usage statistics
 */
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const stats = aiService.getStats();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ai/improve-content
 * Improve existing content with AI
 */
router.post('/improve-content', verifyToken, async (req, res) => {
  try {
    const { content, improvementType } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    console.log(`🔧 Improving content (${improvementType})...`);
    
    const improvements = {
      'grammar': 'Fix grammar and spelling errors',
      'clarity': 'Improve clarity and readability',
      'seo': 'Optimize for SEO',
      'engagement': 'Make more engaging and compelling',
      'professional': 'Make more professional'
    };
    
    const prompt = `${improvements[improvementType] || 'Improve this content'}:

${content}

Return the improved version maintaining the same format but enhanced.`;

    let improved;
    try {
      improved = await aiService.callClaude(prompt);
    } catch (error) {
      improved = await aiService.callDeepSeek(prompt);
    }
    
    console.log('✅ Content improved');
    
    res.json({
      success: true,
      data: {
        original: content,
        improved: improved
      },
      tokensEarned: 10
    });
    
  } catch (error) {
    console.error('❌ Content improvement error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
