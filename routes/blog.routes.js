// ============================================
// FILE: routes/blog.routes.js
// PURPOSE: Blog CRUD + AI Generation with DeepSeek
// ============================================

const express = require('express');
const router = express.Router();
const Blog = require('../models/blog.model');
const verifyToken = require('../middleware/verifyToken');
const requireEmailVerification = require('../middleware/requireEmailVerification');
const { createNotification } = require('../utils/notifications');

// ========================================
// IMPORTANT: Specific routes BEFORE :id routes!
// ========================================

// ========== PUBLIC ROUTES (No auth - Feed access) ==========

// GET /api/blogs/trending - Get trending blogs
router.get('/trending', async (req, res) => {
  try {
    console.log('🔥 Fetching trending blogs');
    
    const blogs = await Blog.aggregate([
      {
        $addFields: {
          likeCount: { $size: { $ifNull: ['$likes', []] } },
          recencyBonus: {
            $cond: {
              if: { $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
              then: 50,
              else: 0
            }
          }
        }
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $ifNull: ['$views', 0] },
              { $multiply: ['$likeCount', 3] },
              '$recencyBonus'
            ]
          }
        }
      },
      { $sort: { trendingScore: -1 } },
      { $limit: 10 }
    ]);

    await Blog.populate(blogs, { path: 'author', select: 'name username profilePicture' });
    
    console.log(`✅ Found ${blogs.length} trending blogs`);
    
    res.json({ success: true, ok: true, blogs });
  } catch (error) {
    console.error('❌ Error fetching trending blogs:', error);
    res.status(500).json({ success: false, ok: false, message: 'Failed to fetch trending blogs' });
  }
});

// GET /api/blogs/trending-tags - Get trending tags
router.get('/trending-tags', async (req, res) => {
  try {
    const tags = await Blog.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { tag: '$_id', count: 1, _id: 0 } }
    ]);
    
    res.json({ success: true, ok: true, tags });
  } catch (error) {
    res.status(500).json({ success: false, ok: false, message: 'Failed to fetch trending tags' });
  }
});

// GET /api/blogs/search - Search blogs
router.get('/search', async (req, res) => {
  try {
    const { q, tag, category, author, sort = 'recent', limit = 20, skip = 0 } = req.query;
    
    const query = {};
    
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ];
    }
    
    if (tag) query.tags = { $in: [tag] };
    if (category) query.category = category;
    if (author) query.author = author;
    
    let sortOption = { createdAt: -1 };
    if (sort === 'popular') sortOption = { views: -1 };
    else if (sort === 'likes') sortOption = { 'likes.length': -1 };
    else if (sort === 'oldest') sortOption = { createdAt: 1 };
    
    const blogs = await Blog.find(query)
      .sort(sortOption)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('author', 'name username profilePicture');
    
    const total = await Blog.countDocuments(query);
    
    res.json({
      success: true,
      ok: true,
      blogs,
      pagination: { total, limit: parseInt(limit), skip: parseInt(skip), hasMore: parseInt(skip) + blogs.length < total }
    });
  } catch (error) {
    res.status(500).json({ success: false, ok: false, message: 'Search failed' });
  }
});

// GET /api/blogs - Get all blogs (PUBLIC - for feed)
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const blogs = await Blog.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name username profilePicture');
    
    const total = await Blog.countDocuments({});
    
    res.json({ success: true, data: { blogs, total, limit, skip } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch blogs' });
  }
});

// ========== PROTECTED ROUTES (User-specific) ==========

// GET /api/blogs/my-blogs - Get current user's blogs
router.get('/my-blogs', verifyToken, requireEmailVerification, async (req, res) => {
  try {
    console.log('📚 Fetching my blogs for user:', req.user.id);
    
    const blogs = await Blog.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .populate('author', 'name username profilePicture');
    
    console.log(`✅ Found ${blogs.length} blogs for user`);
    
    res.json({ success: true, blogs, count: blogs.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch blogs' });
  }
});

// GET /api/blogs/stats - Get user's blog statistics
router.get('/stats', verifyToken, requireEmailVerification, async (req, res) => {
  try {
    console.log('📊 Fetching blog stats for user:', req.user.id);
    
    const blogs = await Blog.find({ author: req.user.id });
    
    const stats = {
      totalPosts: blogs.length,
      totalViews: blogs.reduce((sum, blog) => sum + (blog.views || 0), 0),
      totalLikes: blogs.reduce((sum, blog) => sum + (blog.likes?.length || 0), 0),
      totalComments: blogs.reduce((sum, blog) => sum + (blog.comments?.length || 0), 0),
      totalEarnings: blogs.reduce((sum, blog) => sum + (blog.earnings || 0), 0)
    };
    
    console.log('✅ Blog stats:', stats);
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

// ============================================
// 🤖 AI BLOG GENERATION - DEEPSEEK
// ============================================

router.post('/generate', verifyToken, async (req, res) => {
  try {
    console.log('🤖 AI Blog generation started for user:', req.user.id);
    
    const { topic, tone = 'professional', length = 'medium', autoPublish = false } = req.body;
    
    if (!topic || topic.trim().length < 3) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Please provide a topic (at least 3 characters)' 
      });
    }

    // Check for DeepSeek API key
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    
    if (!DEEPSEEK_API_KEY) {
      console.error('❌ DEEPSEEK_API_KEY not configured');
      return res.status(500).json({ 
        ok: false, 
        error: 'AI service not configured. Please add DEEPSEEK_API_KEY to environment variables.' 
      });
    }

    // Determine word count based on length
    let wordCount = 800;
    if (length === 'short') wordCount = 400;
    else if (length === 'long') wordCount = 1500;

    // Build the prompt
    const systemPrompt = `You are an expert blog writer. Write engaging, well-structured blog posts with proper HTML formatting.

Output format:
- Use <h2> for main sections (2-4 sections)
- Use <h3> for subsections if needed
- Use <p> for paragraphs
- Use <ul> or <ol> for lists when appropriate
- Use <strong> for emphasis
- Use <blockquote> for quotes or key points
- Do NOT include the title in the content (it will be added separately)
- Do NOT use <h1> tags
- Make the content engaging and informative`;

    const userPrompt = `Write a ${length} blog post (approximately ${wordCount} words) about: "${topic}"

Tone: ${tone}

Requirements:
1. Create an engaging title (return it separately)
2. Write a compelling excerpt/summary (2-3 sentences)
3. Generate 3-5 relevant tags
4. Write the full blog content with proper HTML formatting

Respond in this exact JSON format:
{
  "title": "Your Blog Title Here",
  "excerpt": "A compelling 2-3 sentence summary of the blog post.",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "<h2>First Section</h2><p>Content here...</p>..."
}`;

    console.log('📤 Sending request to DeepSeek API...');

    // Call DeepSeek API
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ DeepSeek API error:', response.status, errorText);
      return res.status(500).json({ 
        ok: false, 
        error: `AI service error: ${response.status}` 
      });
    }

    const data = await response.json();
    console.log('📥 DeepSeek response received');

    // Extract the content
    const aiContent = data.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      console.error('❌ No content in AI response');
      return res.status(500).json({ ok: false, error: 'AI returned empty response' });
    }

    // Parse the JSON response
    let blogData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        blogData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      console.log('Raw AI response:', aiContent.substring(0, 500));
      
      // Fallback: Use the raw content
      blogData = {
        title: topic,
        excerpt: `A blog post about ${topic}`,
        tags: [topic.split(' ')[0].toLowerCase()],
        content: `<p>${aiContent}</p>`
      };
    }

    // Validate required fields
    if (!blogData.title || !blogData.content) {
      return res.status(500).json({ 
        ok: false, 
        error: 'AI generated incomplete content' 
      });
    }

    // Create the blog post
    const blog = new Blog({
      title: blogData.title,
      content: blogData.content,
      excerpt: blogData.excerpt || blogData.content.replace(/<[^>]*>/g, '').substring(0, 160),
      tags: blogData.tags || [],
      author: req.user.id,
      status: autoPublish ? 'published' : 'draft',
      aiGenerated: true,
      aiPrompt: topic
    });

    await blog.save();
    await blog.populate('author', 'name username profilePicture');

    console.log('✅ AI blog created:', blog._id, blog.title);

    res.json({
      ok: true,
      success: true,
      message: 'Blog generated successfully!',
      blog,
      blogId: blog._id
    });

  } catch (error) {
    console.error('❌ AI generation error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to generate blog' 
    });
  }
});

// ============================================
// :id ROUTES (After specific routes)
// ============================================

// GET /api/blogs/:id - Get single blog by ID (PUBLIC)
router.get('/:id', async (req, res) => {
  try {
    console.log('📖 Fetching blog:', req.params.id);
    
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name username profilePicture');
    
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    
    // Increment view count
    blog.views = (blog.views || 0) + 1;
    await blog.save();
    
    res.json({ success: true, blog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch blog' });
  }
});

// POST /api/blogs - Create new blog
router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('📝 Creating blog for user:', req.user.id);
    
    const blog = new Blog({
      ...req.body,
      author: req.user.id
    });
    
    await blog.save();
    await blog.populate('author', 'name username profilePicture');
    
    console.log('✅ Blog created:', blog._id);
    
    res.status(201).json({ success: true, message: 'Blog created successfully', blog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create blog' });
  }
});

// PUT /api/blogs/:id - Update blog
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findOne({ _id: req.params.id, author: req.user.id });
    
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found or unauthorized' });
    }
    
    Object.assign(blog, req.body);
    await blog.save();
    await blog.populate('author', 'name username profilePicture');
    
    res.json({ success: true, ok: true, message: 'Blog updated successfully', blog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update blog' });
  }
});

// DELETE /api/blogs/:id - Delete blog
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findOneAndDelete({ _id: req.params.id, author: req.user.id });
    
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found or unauthorized' });
    }
    
    res.json({ success: true, message: 'Blog deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete blog' });
  }
});

// POST /api/blogs/:id/like - Toggle like
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ success: false, ok: false, message: 'Blog not found' });
    }
    
    const likes = blog.likes || [];
    const userIndex = likes.indexOf(req.user.id);
    let liked = false;
    
    if (userIndex > -1) {
      likes.splice(userIndex, 1);
      liked = false;
    } else {
      likes.push(req.user.id);
      liked = true;
    }
    
    blog.likes = likes;
    await blog.save();
    
    // Send notification when liked
    if (liked && blog.author && String(blog.author) !== String(req.user.id)) {
      try {
        await createNotification({
          recipient: blog.author,
          sender: req.user.id,
          type: 'like',
          message: `liked your post "${blog.title?.substring(0, 30) || 'your post'}"`,
          entityId: blog._id,
          entityModel: 'Blog'
        });
      } catch (notifyErr) {
        console.warn('Like notification failed:', notifyErr.message);
      }
    }
    
    res.json({ success: true, ok: true, liked, likeCount: likes.length });
  } catch (error) {
    res.status(500).json({ success: false, ok: false, message: 'Failed to toggle like' });
  }
});

// POST /api/blogs/:id/share - Track share
router.post('/:id/share', async (req, res) => {
  try {
    const { platform } = req.body;
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }
    
    if (!blog.shares) {
      blog.shares = { total: 0, platforms: {} };
    }
    
    blog.shares.total = (blog.shares.total || 0) + 1;
    
    if (platform) {
      blog.shares.platforms = blog.shares.platforms || {};
      blog.shares.platforms[platform] = (blog.shares.platforms[platform] || 0) + 1;
    }
    
    await blog.save();
    
    res.json({ ok: true, shares: blog.shares });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to track share' });
  }
});

module.exports = router;
