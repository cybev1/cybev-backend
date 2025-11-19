// ============================================
// FILE: routes/content.routes.js
// Content Creation API with SEO, Images, NFT
// ============================================

const express = require('express');
const router = express.Router();
const contentCreator = require('../services/content-creator.service');
const verifyToken = require('../middleware/verifyToken');

// Blog model - optional for now
let Blog;
try {
  Blog = require('../models/blog.model');
} catch (error) {
  console.log('⚠️ Blog model not found - publish feature will be limited');
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
 * 
 * Features:
 * - AI-generated content
 * - SEO optimization
 * - Featured image
 * - Content images
 * - Viral hashtags
 * - NFT metadata
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
    
    // TODO: Save to database
    // const savedBlog = await Blog.create({
    //   ...completeBlog,
    //   author: req.user.id,
    //   status: 'draft'
    // });
    
    console.log(`✅ Blog created in ${duration}ms`);
    
    res.json({
      success: true,
      message: `🎉 Blog post created! You earned ${completeBlog.initialTokens} tokens!`,
      data: completeBlog,
      tokensEarned: completeBlog.initialTokens,
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
 * Publish AI-generated blog to database
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

    // Map niche to valid category enum from Blog model
    const categoryMap = {
      'technology': 'Technology',
      'business': 'Business & Finance',
      'health': 'Health & Wellness',
      'lifestyle': 'Lifestyle',
      'education': 'Education',
      'finance': 'Business & Finance',
      'entertainment': 'Entertainment',
      'food': 'Food & Cooking',
      'travel': 'Travel',
      'science': 'Science',
      'sports': 'Sports',
      'fashion': 'Fashion & Beauty',
      'personal-development': 'Personal Development',
      'news': 'News & Politics',
      'environment': 'Environment'
    };
    
    const validCategory = categoryMap[blogData.niche?.toLowerCase()] || 'Other';

    // Create blog in database
    const newBlog = await Blog.create({
      title: blogData.title,
      content: blogData.content,
      author: req.user.id,
      authorName: req.user.name || req.user.username || 'Anonymous',
      category: validCategory,
      tags: blogData.seo?.keywords?.slice(0, 10) || [],
      readTime: parseInt(blogData.readTime) || 5,
      featuredImage: blogData.featuredImage?.url || blogData.featuredImage || '',
      status: 'published'
      // Note: Model will auto-calculate readTime in pre-save hook
      // Note: likes, views, featured, timestamps are handled by model defaults
    });

    console.log(`✅ Blog published with ID: ${newBlog._id}`);

    res.json({
      success: true,
      message: '🎉 Blog published successfully!',
      data: {
        blogId: newBlog._id,
        slug: newBlog.slug,
        url: `/blog/${newBlog.slug}`,
        tokensEarned: blogData.initialTokens || 50
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
 * POST /api/content/create-template
 * Generate website template with demo content
 * 
 * Features:
 * - AI-generated template
 * - Demo images
 * - Demo blog posts
 * - SEO for all pages
 * - NFT ready
 */
router.post('/create-template', verifyToken, async (req, res) => {
  try {
    const {
      templateType,
      businessName,
      description,
      style,
      colors,
      niche
    } = req.body;
    
    if (!templateType || !businessName || !description) {
      return res.status(400).json({
        success: false,
        error: 'Template type, business name, and description are required'
      });
    }

    console.log('🏗️ Generating template with demo content...');
    console.log(`   User: ${req.user.id}`);
    console.log(`   Type: ${templateType}`);
    console.log(`   Business: ${businessName}`);
    
    const startTime = Date.now();
    
    // Generate complete template
    const completeTemplate = await contentCreator.generateTemplateWithDemo({
      templateType,
      businessName,
      description,
      style: style || 'modern',
      colors: colors || 'vibrant',
      niche: niche || templateType
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ Template created in ${duration}ms`);
    
    res.json({
      success: true,
      message: `🎉 Template created! You earned ${completeTemplate.initialTokens} tokens!`,
      data: completeTemplate,
      tokensEarned: completeTemplate.initialTokens,
      generationTime: duration
    });
    
  } catch (error) {
    console.error('❌ Template creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create template'
    });
  }
});

/**
 * POST /api/content/generate-seo
 * Generate SEO metadata for existing content
 */
router.post('/generate-seo', verifyToken, async (req, res) => {
  try {
    const { title, content, niche } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Title and content are required'
      });
    }

    console.log('🔍 Generating SEO metadata...');
    
    const seo = await contentCreator.generateBlogWithSEO(
      title,
      'professional',
      'medium',
      niche || 'general'
    );
    
    res.json({
      success: true,
      data: {
        seoTitle: seo.seoTitle,
        seoDescription: seo.seoDescription,
        slug: seo.slug,
        keywords: seo.keywords,
        metaTags: seo.metaTags
      }
    });
    
  } catch (error) {
    console.error('❌ SEO generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content/generate-hashtags
 * Generate viral hashtags for content
 */
router.post('/generate-hashtags', verifyToken, async (req, res) => {
  try {
    const { topic, niche } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required'
      });
    }

    console.log('🔥 Generating viral hashtags...');
    
    const hashtags = await contentCreator.generateViralHashtags(
      topic,
      niche || 'general'
    );
    
    res.json({
      success: true,
      data: hashtags
    });
    
  } catch (error) {
    console.error('❌ Hashtag generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content/get-featured-image
 * Get featured image for topic
 */
router.post('/get-featured-image', verifyToken, async (req, res) => {
  try {
    const { topic, niche } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required'
      });
    }

    console.log('🖼️ Fetching featured image...');
    
    const image = await contentCreator.getFeaturedImage(topic, niche || topic);
    
    res.json({
      success: true,
      data: image
    });
    
  } catch (error) {
    console.error('❌ Image fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content/mint-nft
 * Prepare content for NFT minting
 */
router.post('/mint-nft', verifyToken, async (req, res) => {
  try {
    const { blogId, contentType } = req.body;
    
    if (!blogId) {
      return res.status(400).json({
        success: false,
        error: 'Blog ID is required'
      });
    }

    console.log('💎 Preparing NFT metadata...');
    
    // TODO: Fetch blog from database
    // const blog = await Blog.findById(blogId);
    
    // For now, return mock response
    const nftMetadata = {
      name: 'Sample Blog Post',
      description: 'NFT of blog content',
      image: 'https://source.unsplash.com/800x600/?blog',
      attributes: [
        { trait_type: 'Content Type', value: contentType || 'blog' },
        { trait_type: 'Mintable', value: 'Yes' }
      ]
    };
    
    res.json({
      success: true,
      message: 'NFT metadata prepared! Ready to mint.',
      data: {
        nftMetadata,
        mintPrice: '0.01 ETH',
        estimatedGas: '0.002 ETH',
        earnings: {
          creator: '90%',
          platform: '10%'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ NFT preparation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content/stake
 * Stake tokens on content for boosting
 */
router.post('/stake', verifyToken, async (req, res) => {
  try {
    const { blogId, amount, duration } = req.body;
    
    if (!blogId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Blog ID and amount are required'
      });
    }

    console.log('💰 Staking tokens...');
    console.log(`   Amount: ${amount} tokens`);
    console.log(`   Duration: ${duration || 7} days`);
    
    // TODO: Implement actual staking logic
    const stakingReward = Math.floor(amount * 0.1); // 10% APY estimate
    
    res.json({
      success: true,
      message: `Successfully staked ${amount} tokens!`,
      data: {
        stakedAmount: amount,
        duration: duration || 7,
        estimatedReward: stakingReward,
        boostMultiplier: 1.5,
        withdrawDate: new Date(Date.now() + (duration || 7) * 24 * 60 * 60 * 1000)
      }
    });
    
  } catch (error) {
    console.error('❌ Staking error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content/viral-score/:blogId
 * Calculate viral potential score
 */
router.get('/viral-score/:blogId', verifyToken, async (req, res) => {
  try {
    const { blogId } = req.params;
    
    // TODO: Fetch blog and calculate real score
    const viralScore = Math.floor(Math.random() * 40) + 60; // Mock: 60-100
    
    res.json({
      success: true,
      data: {
        viralScore,
        factors: {
          seoOptimization: 85,
          contentQuality: 90,
          engagement: 75,
          shareability: 80
        },
        recommendations: viralScore < 80 ? [
          'Add more trending hashtags',
          'Optimize SEO title',
          'Include more images',
          'Add social sharing prompts'
        ] : [
          'Content is optimized for virality!',
          'Share on social media',
          'Stake tokens for boost'
        ]
      }
    });
    
  } catch (error) {
    console.error('❌ Viral score error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/blogs/:id - Get single blog by ID or slug
 */
router.get('/blogs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📖 Fetching blog: ${id}`);
    
    // Try to find by MongoDB ID first, then by slug
    let blog = await Blog.findById(id).populate('author', 'name username email');
    
    if (!blog) {
      // Try finding by slug (title-based)
      blog = await Blog.findOne({ slug: id }).populate('author', 'name username email');
    }
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        error: 'Blog not found'
      });
    }
    
    // Increment view count
    blog.views = (blog.views || 0) + 1;
    await blog.save();
    
    console.log(`✅ Blog found: ${blog.title}`);
    
    res.json({
      success: true,
      data: blog
    });
    
  } catch (error) {
    console.error('❌ Error fetching blog:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
