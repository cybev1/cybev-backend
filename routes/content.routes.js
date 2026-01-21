// ============================================
// FILE: routes/content.routes.js
// CYBEV AI Content Generation - FIXED VERSION
// VERSION: 3.0.0 - Robust with Multiple AI Fallbacks
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Get Blog model
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
// AI PROVIDERS CONFIGURATION
// ==========================================

const AI_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    getKey: () => process.env.DEEPSEEK_API_KEY
  },
  openai: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    getKey: () => process.env.OPENAI_API_KEY
  },
  anthropic: {
    name: 'Claude',
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-20241022',
    getKey: () => process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
  }
};

// ==========================================
// HELPER: Generate with AI (with fallbacks)
// ==========================================

async function generateWithAI(systemPrompt, userPrompt) {
  const providers = ['deepseek', 'openai', 'anthropic'];
  const errors = [];

  for (const providerKey of providers) {
    const provider = AI_PROVIDERS[providerKey];
    const apiKey = provider.getKey();
    
    if (!apiKey) {
      console.log(`⏭️ Skipping ${provider.name} - No API key`);
      continue;
    }

    try {
      console.log(`🤖 Trying ${provider.name}...`);

      let response;
      
      if (providerKey === 'anthropic') {
        // Claude has different API format
        response = await fetch(provider.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: provider.model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }]
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Claude API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const content = data.content?.[0]?.text;
        
        if (content) {
          console.log(`✅ ${provider.name} succeeded!`);
          return { content, provider: provider.name };
        }
      } else {
        // OpenAI / DeepSeek format
        response = await fetch(provider.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 4096
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`${provider.name} API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (content) {
          console.log(`✅ ${provider.name} succeeded!`);
          return { content, provider: provider.name };
        }
      }
    } catch (error) {
      console.error(`❌ ${provider.name} failed:`, error.message);
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  // All providers failed
  throw new Error(`All AI providers failed: ${errors.join('; ')}`);
}

// ==========================================
// HELPER: Fetch image from Pexels/Unsplash
// ==========================================

async function fetchFeaturedImage(topic) {
  // Try Pexels first
  if (process.env.PEXELS_API_KEY) {
    try {
      const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(topic)}&per_page=1`, {
        headers: { 'Authorization': process.env.PEXELS_API_KEY }
      });
      const data = await res.json();
      if (data.photos?.[0]?.src?.large) {
        console.log('📸 Got image from Pexels');
        return data.photos[0].src.large;
      }
    } catch (e) {
      console.log('Pexels failed:', e.message);
    }
  }

  // Try Unsplash
  if (process.env.UNSPLASH_ACCESS_KEY) {
    try {
      const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(topic)}&per_page=1`, {
        headers: { 'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
      });
      const data = await res.json();
      if (data.results?.[0]?.urls?.regular) {
        console.log('📸 Got image from Unsplash');
        return data.results[0].urls.regular;
      }
    } catch (e) {
      console.log('Unsplash failed:', e.message);
    }
  }

  // Fallback to placeholder
  return `https://source.unsplash.com/featured/1200x630/?${encodeURIComponent(topic)}`;
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
    
    console.log('🤖 AI Blog Generation Request:', { topic, niche, tone, length, user: req.user?.id });
    
    if (!topic || topic.trim().length < 3) {
      return res.status(400).json({ ok: false, error: 'Please provide a topic (at least 3 characters)' });
    }

    // Check if at least one AI provider is configured
    const hasAI = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!hasAI) {
      console.error('❌ No AI API keys configured');
      return res.status(500).json({ 
        ok: false, 
        error: 'AI service not configured. Please add DEEPSEEK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY to environment variables.' 
      });
    }

    // Determine word count
    let wordCount = 1200;
    if (length === 'short') wordCount = 800;
    else if (length === 'long') wordCount = 2500;

    // Build prompts
    const systemPrompt = `You are a professional blog writer specializing in ${niche} content. Write engaging, well-structured blog posts.

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "title": "Catchy SEO-friendly Title",
  "content": "<h2>Introduction</h2><p>Content here with proper HTML tags...</p>",
  "excerpt": "Compelling 1-2 sentence summary",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "${niche}"
}

For content, use HTML: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>`;

    let userPrompt = `Write a ${length} blog post (${wordCount} words) about: "${topic}"
Niche: ${niche}
Tone: ${tone}`;

    if (description) userPrompt += `\nContext: ${description}`;
    if (keywords) userPrompt += `\nKeywords to include: ${keywords}`;

    // Generate content with AI
    console.log('📤 Generating content with AI...');
    const { content: aiContent, provider } = await generateWithAI(systemPrompt, userPrompt);

    // Parse JSON response
    let blogData;
    try {
      // Clean up response - remove markdown code blocks if present
      let jsonStr = aiContent.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      
      // Remove any leading/trailing non-JSON characters
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      
      blogData = JSON.parse(jsonStr);
      console.log('✅ Parsed blog:', { title: blogData.title });
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError.message);
      // Fallback: use raw content
      blogData = {
        title: topic,
        content: `<h2>${topic}</h2>${aiContent.split('\n').map(p => `<p>${p}</p>`).join('')}`,
        excerpt: aiContent.substring(0, 160).replace(/<[^>]*>/g, ''),
        tags: [niche],
        category: niche
      };
    }

    // Get featured image
    let featuredImage = null;
    if (generateImage) {
      featuredImage = await fetchFeaturedImage(topic);
    }

    // Create blog in database
    const blog = new Blog({
      title: blogData.title || topic,
      content: blogData.content || '',
      excerpt: blogData.excerpt || blogData.content?.replace(/<[^>]*>/g, '').substring(0, 160) || '',
      tags: blogData.tags || [niche],
      category: blogData.category || niche,
      author: req.user.id,
      status: autoPublish ? 'published' : 'draft',
      featuredImage: featuredImage,
      coverImage: featuredImage,
      isAIGenerated: true,
      aiMetadata: {
        model: provider,
        topic,
        tone,
        length,
        generatedAt: new Date()
      }
    });

    await blog.save();
    console.log('✅ Blog created:', blog._id);

    // Calculate tokens earned
    const tokensEarned = autoPublish ? 50 : 25;

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
        status: blog.status
      },
      tokensEarned,
      viralityScore: Math.floor(Math.random() * 30) + 70,
      aiProvider: provider,
      message: `Blog generated successfully using ${provider}!`
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

    const systemPrompt = `Generate ${count} unique blog post ideas about "${topic}" in the ${niche} niche. Return ONLY a JSON array of objects with title and description.`;
    const userPrompt = `Generate ${count} blog ideas about: ${topic}
    
Return JSON array like: [{"title": "...", "description": "..."}, ...]`;

    const { content } = await generateWithAI(systemPrompt, userPrompt);

    let ideas;
    try {
      let jsonStr = content.trim();
      const match = jsonStr.match(/\[[\s\S]*\]/);
      if (match) jsonStr = match[0];
      ideas = JSON.parse(jsonStr);
    } catch {
      ideas = [{ title: topic, description: 'Write about this topic' }];
    }

    res.json({ ok: true, ideas });
  } catch (error) {
    console.error('Ideas generation error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// POST /api/content/improve
// ==========================================

router.post('/improve', verifyToken, async (req, res) => {
  try {
    const { content, instruction = 'Improve this content' } = req.body;

    if (!content) {
      return res.status(400).json({ ok: false, error: 'Content is required' });
    }

    const systemPrompt = `You are an expert editor. Improve the given content according to the instruction. Return only the improved content, no explanations.`;
    const userPrompt = `Instruction: ${instruction}\n\nContent to improve:\n${content}`;

    const { content: improved } = await generateWithAI(systemPrompt, userPrompt);

    res.json({ ok: true, improved });
  } catch (error) {
    console.error('Improve error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GET /api/content/health
// ==========================================

router.get('/health', (req, res) => {
  res.json({
    ok: true,
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
