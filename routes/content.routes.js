// ============================================
// FILE: services/content-creator.service.js
// PATH: cybev-backend/services/content-creator.service.js
// PURPOSE: AI content generation with DeepSeek/OpenAI
// ============================================

const fetch = require('node-fetch');

class ContentCreatorService {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    this.isDeepSeek = !!process.env.DEEPSEEK_API_KEY;
    this.apiUrl = this.isDeepSeek 
      ? 'https://api.deepseek.com/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    this.model = this.isDeepSeek ? 'deepseek-chat' : 'gpt-3.5-turbo';
    
    console.log(`🤖 Content Creator initialized with ${this.isDeepSeek ? 'DeepSeek' : 'OpenAI'}`);
  }

  /**
   * Make API call to AI service
   */
  async callAI(systemPrompt, userPrompt, maxTokens = 4000) {
    if (!this.apiKey) {
      throw new Error('AI API key not configured. Please set DEEPSEEK_API_KEY in environment variables.');
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ AI API Error:', response.status, errorText);
      
      if (response.status === 401) throw new Error('AI API authentication failed');
      if (response.status === 402) throw new Error('AI API account has insufficient balance');
      if (response.status === 429) throw new Error('AI API rate limit reached. Try again later.');
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Parse JSON from AI response (handles markdown code blocks)
   */
  parseJSON(content, fallback = {}) {
    try {
      let jsonStr = content;
      
      // Remove markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      
      // Find JSON object
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objectMatch) jsonStr = objectMatch[0];
      
      return JSON.parse(jsonStr.trim());
    } catch (error) {
      console.warn('⚠️ JSON parse failed, using fallback');
      return fallback;
    }
  }

  /**
   * Generate complete blog post with all features
   */
  async createCompleteBlog({ topic, tone, length, niche, targetAudience }) {
    console.log('📝 Generating complete blog...');
    
    // Determine word count
    let wordCount = 1200;
    if (length === 'short') wordCount = 800;
    else if (length === 'long') wordCount = 2500;

    const systemPrompt = `You are an expert ${niche} content writer. Create engaging, SEO-optimized blog posts that captivate readers and drive engagement.

Return your response as valid JSON with this exact structure:
{
  "title": "Catchy SEO-optimized title",
  "content": "Full blog content with HTML formatting (<h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>)",
  "excerpt": "Compelling 1-2 sentence summary",
  "seo": {
    "metaTitle": "SEO title (60 chars max)",
    "metaDescription": "Meta description (160 chars max)",
    "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
    "slug": "url-friendly-slug"
  },
  "hashtags": {
    "primary": ["#hashtag1", "#hashtag2", "#hashtag3"],
    "trending": ["#trending1", "#trending2"],
    "niche": ["#niche1", "#niche2"]
  },
  "readTime": 5,
  "viralityScore": 85
}`;

    const userPrompt = `Create a ${length} blog post (approximately ${wordCount} words) about: "${topic}"

Niche: ${niche}
Tone: ${tone}
Target Audience: ${targetAudience}

Requirements:
1. Catchy, SEO-optimized title
2. Engaging hook in introduction
3. Well-structured sections with H2/H3 headers
4. Practical insights and examples
5. Strong call-to-action conclusion
6. SEO metadata
7. Viral hashtags for social sharing

Format content with proper HTML tags. Return only valid JSON.`;

    const aiResponse = await this.callAI(systemPrompt, userPrompt);
    
    const blogData = this.parseJSON(aiResponse, {
      title: topic,
      content: `<h2>${topic}</h2><p>Content generation in progress...</p>`,
      excerpt: topic,
      seo: { keywords: [niche], slug: this.slugify(topic) },
      hashtags: { primary: [`#${niche}`], trending: [], niche: [] },
      readTime: 5,
      viralityScore: 70
    });

    // Get featured image
    const featuredImage = await this.getFeaturedImage(topic, niche);
    
    // Get content images
    const contentImages = await this.getContentImages(topic, niche, 3);

    // Calculate tokens earned
    const initialTokens = this.calculateTokens(blogData);

    return {
      ...blogData,
      niche,
      tone,
      targetAudience,
      featuredImage,
      contentImages,
      initialTokens,
      nftMetadata: this.generateNFTMetadata(blogData, featuredImage),
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Generate blog with SEO optimization
   */
  async generateBlogWithSEO(title, tone, length, niche) {
    const systemPrompt = `You are an SEO expert. Generate comprehensive SEO metadata for blog content.

Return JSON:
{
  "seoTitle": "SEO optimized title (60 chars)",
  "seoDescription": "Meta description (160 chars)",
  "slug": "url-friendly-slug",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "metaTags": [
    {"name": "author", "content": "CYBEV"},
    {"property": "og:title", "content": "..."},
    {"property": "og:description", "content": "..."}
  ]
}`;

    const userPrompt = `Generate SEO metadata for a ${niche} blog titled: "${title}"
Tone: ${tone}
Length: ${length}`;

    const response = await this.callAI(systemPrompt, userPrompt, 1000);
    return this.parseJSON(response, {
      seoTitle: title,
      seoDescription: title,
      slug: this.slugify(title),
      keywords: [niche],
      metaTags: []
    });
  }

  /**
   * Generate viral hashtags
   */
  async generateViralHashtags(topic, niche) {
    const systemPrompt = `You are a social media expert. Generate viral hashtags for content.

Return JSON:
{
  "primary": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "trending": ["#trending1", "#trending2", "#trending3"],
  "niche": ["#niche1", "#niche2", "#niche3"],
  "all": ["#tag1", "#tag2", ...]
}`;

    const userPrompt = `Generate viral hashtags for: "${topic}" in the ${niche} niche.
Include trending, niche-specific, and general hashtags.`;

    const response = await this.callAI(systemPrompt, userPrompt, 500);
    return this.parseJSON(response, {
      primary: [`#${niche}`, `#${topic.split(' ')[0]}`],
      trending: ['#viral', '#trending'],
      niche: [`#${niche}content`],
      all: []
    });
  }

  /**
   * Get featured image from Unsplash
   */
  async getFeaturedImage(topic, niche) {
    try {
      // Create search query from topic
      const searchTerms = `${niche} ${topic}`.replace(/[^a-zA-Z0-9 ]/g, '').split(' ').slice(0, 3).join(',');
      
      const imageUrl = `https://source.unsplash.com/1200x630/?${encodeURIComponent(searchTerms)}`;
      
      return {
        url: imageUrl,
        alt: `${topic} - ${niche}`,
        source: 'unsplash',
        width: 1200,
        height: 630
      };
    } catch (error) {
      console.warn('⚠️ Featured image fetch failed:', error.message);
      return {
        url: `https://source.unsplash.com/1200x630/?${encodeURIComponent(niche)}`,
        alt: niche,
        source: 'unsplash',
        width: 1200,
        height: 630
      };
    }
  }

  /**
   * Get content images
   */
  async getContentImages(topic, niche, count = 3) {
    const images = [];
    const searchTerms = topic.split(' ').slice(0, 2).join(' ');
    
    for (let i = 0; i < count; i++) {
      images.push({
        url: `https://source.unsplash.com/800x600/?${encodeURIComponent(searchTerms)}&sig=${i}`,
        alt: `${topic} image ${i + 1}`,
        source: 'unsplash'
      });
    }
    
    return images;
  }

  /**
   * Generate template with demo content
   */
  async generateTemplateWithDemo({ templateType, businessName, description, style, colors, niche }) {
    console.log('🏗️ Generating template with demo content...');

    const systemPrompt = `You are a web designer and content creator. Generate a complete website template structure with demo content.

Return JSON:
{
  "templateName": "Template Name",
  "pages": [
    {
      "name": "Home",
      "slug": "/",
      "sections": [
        {
          "type": "hero",
          "title": "...",
          "subtitle": "...",
          "cta": "..."
        }
      ]
    }
  ],
  "demoPosts": [
    {
      "title": "Blog Post Title",
      "excerpt": "Brief description",
      "content": "Full content..."
    }
  ],
  "colors": {
    "primary": "#...",
    "secondary": "#...",
    "accent": "#..."
  },
  "seo": {
    "title": "...",
    "description": "..."
  }
}`;

    const userPrompt = `Create a ${templateType} website template for "${businessName}".
Description: ${description}
Style: ${style}
Color scheme: ${colors}
Niche: ${niche}

Include:
- Multiple page layouts
- Demo blog posts
- SEO optimization
- Color scheme`;

    const response = await this.callAI(systemPrompt, userPrompt, 3000);
    const templateData = this.parseJSON(response, {
      templateName: `${businessName} Template`,
      pages: [],
      demoPosts: [],
      colors: { primary: '#8B5CF6', secondary: '#EC4899', accent: '#10B981' },
      seo: { title: businessName, description }
    });

    return {
      ...templateData,
      businessName,
      niche,
      style,
      initialTokens: 100,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Calculate tokens earned for content
   */
  calculateTokens(blogData) {
    let tokens = 50; // Base tokens
    
    // Bonus for length
    const contentLength = blogData.content?.length || 0;
    if (contentLength > 2000) tokens += 20;
    if (contentLength > 5000) tokens += 30;
    
    // Bonus for SEO
    if (blogData.seo?.keywords?.length >= 5) tokens += 10;
    if (blogData.seo?.metaDescription) tokens += 5;
    
    // Bonus for hashtags
    if (blogData.hashtags?.primary?.length >= 3) tokens += 10;
    
    // Bonus for virality score
    if (blogData.viralityScore >= 80) tokens += 15;
    if (blogData.viralityScore >= 90) tokens += 10;
    
    return tokens;
  }

  /**
   * Generate NFT metadata
   */
  generateNFTMetadata(blogData, featuredImage) {
    return {
      name: blogData.title,
      description: blogData.excerpt || blogData.seo?.metaDescription,
      image: featuredImage?.url,
      attributes: [
        { trait_type: 'Content Type', value: 'Blog Post' },
        { trait_type: 'Niche', value: blogData.niche || 'General' },
        { trait_type: 'Virality Score', value: blogData.viralityScore || 70 },
        { trait_type: 'Word Count', value: Math.floor((blogData.content?.length || 0) / 5) },
        { trait_type: 'Created', value: new Date().toISOString().split('T')[0] }
      ],
      properties: {
        category: 'blog',
        creators: [{ address: '', share: 100 }]
      }
    };
  }

  /**
   * Create URL-friendly slug
   */
  slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }
}

// Export singleton instance
module.exports = new ContentCreatorService();
