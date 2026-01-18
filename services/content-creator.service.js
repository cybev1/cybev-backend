// ============================================
// FILE: services/content-creator.service.js
// AI Content Creation Engine v2.0
// FIXED: Better error handling + OpenAI fallback
// CHAIN: DeepSeek → OpenAI → Claude
// ============================================

const axios = require('axios');

class ContentCreatorService {
  constructor() {
    // AI API Keys
    this.deepseekKey = process.env.DEEPSEEK_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    
    // Image API Keys
    this.pexelsKey = process.env.PEXELS_API_KEY;
    this.unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    
    console.log('🤖 Content Creator Service initialized');
    console.log(`   DeepSeek: ${this.deepseekKey ? '✅ Primary' : '❌ Not configured'}`);
    console.log(`   OpenAI: ${this.openaiKey ? '✅ Fallback 1' : '❌ Not configured'}`);
    console.log(`   Claude: ${this.claudeKey ? '✅ Fallback 2' : '❌ Not configured'}`);
    console.log(`   Pexels: ${this.pexelsKey ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Unsplash: ${this.unsplashKey ? '✅ Configured' : '❌ Not configured'}`);
  }

  // ==========================================
  // AI PROVIDER METHODS
  // ==========================================
  
  async callDeepSeek(prompt, options = {}) {
    if (!this.deepseekKey) throw new Error('DeepSeek API key not configured');
    
    console.log('🤖 Calling DeepSeek...');
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: options.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: options.systemPrompt || 'You are an expert content creator. Generate professional, SEO-optimized content in valid JSON format.' },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4096
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.deepseekKey}`
      },
      timeout: 120000
    });
    
    console.log('✅ DeepSeek response received');
    return response.data.choices?.[0]?.message?.content || '';
  }
  
  async callOpenAI(prompt, options = {}) {
    if (!this.openaiKey) throw new Error('OpenAI API key not configured');
    
    console.log('🤖 Calling OpenAI...');
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: options.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: options.systemPrompt || 'You are an expert content creator. Generate professional, SEO-optimized content in valid JSON format.' },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4096
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiKey}`
      },
      timeout: 120000
    });
    
    console.log('✅ OpenAI response received');
    return response.data.choices?.[0]?.message?.content || '';
  }
  
  async callClaude(prompt, options = {}) {
    if (!this.claudeKey) throw new Error('Claude API key not configured');
    
    console.log('🤖 Calling Claude...');
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: options.model || 'claude-3-haiku-20240307',
      max_tokens: options.maxTokens || 4096,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.claudeKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 120000
    });
    
    console.log('✅ Claude response received');
    return response.data.content?.[0]?.text || '';
  }
  
  // Main AI calling method with cascading fallbacks
  async callAI(prompt, options = {}) {
    const providers = [
      { name: 'DeepSeek', fn: () => this.callDeepSeek(prompt, options), enabled: !!this.deepseekKey },
      { name: 'OpenAI', fn: () => this.callOpenAI(prompt, options), enabled: !!this.openaiKey },
      { name: 'Claude', fn: () => this.callClaude(prompt, options), enabled: !!this.claudeKey }
    ];
    
    const errors = [];
    
    for (const provider of providers) {
      if (!provider.enabled) {
        console.log(`⏭️ ${provider.name}: Not configured, skipping`);
        continue;
      }
      
      try {
        const result = await provider.fn();
        if (result && result.trim()) {
          return result;
        }
        throw new Error('Empty response');
      } catch (error) {
        console.error(`❌ ${provider.name} failed:`, error.message);
        errors.push(`${provider.name}: ${error.message}`);
      }
    }
    
    throw new Error(`All AI providers failed: ${errors.join('; ')}`);
  }
  
  // Parse JSON from AI response
  parseResponse(content) {
    if (!content) return null;
    
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
      console.warn('⚠️ JSON parse failed, returning raw content');
      return null;
    }
  }

  // ==========================================
  // IMAGE FETCHING (Pexels & Unsplash)
  // ==========================================
  
  async getPexelsImage(query) {
    if (!this.pexelsKey) throw new Error('Pexels API key not configured');
    
    try {
      console.log(`🖼️ Searching Pexels for: ${query}`);
      const response = await axios.get('https://api.pexels.com/v1/search', {
        params: { query, per_page: 5, orientation: 'landscape' },
        headers: { Authorization: this.pexelsKey },
        timeout: 15000
      });
      
      if (response.data.photos?.length > 0) {
        const photo = response.data.photos[Math.floor(Math.random() * response.data.photos.length)];
        return {
          url: photo.src.large2x || photo.src.large || photo.src.original,
          thumbnail: photo.src.medium,
          photographer: photo.photographer,
          photographerUrl: photo.photographer_url,
          source: 'pexels',
          alt: photo.alt || query
        };
      }
      throw new Error('No Pexels results');
    } catch (error) {
      console.log('⚠️ Pexels failed:', error.message);
      throw error;
    }
  }
  
  async getUnsplashImage(query) {
    if (!this.unsplashKey) throw new Error('Unsplash API key not configured');
    
    try {
      console.log(`🖼️ Searching Unsplash for: ${query}`);
      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: { query, per_page: 5, orientation: 'landscape' },
        headers: { Authorization: `Client-ID ${this.unsplashKey}` },
        timeout: 15000
      });
      
      if (response.data.results?.length > 0) {
        const photo = response.data.results[Math.floor(Math.random() * response.data.results.length)];
        return {
          url: photo.urls.regular || photo.urls.full,
          thumbnail: photo.urls.small,
          photographer: photo.user?.name || 'Unknown',
          photographerUrl: photo.user?.links?.html || '',
          source: 'unsplash',
          alt: photo.alt_description || query
        };
      }
      throw new Error('No Unsplash results');
    } catch (error) {
      console.log('⚠️ Unsplash failed:', error.message);
      throw error;
    }
  }
  
  // Get featured image with fallbacks
  async getFeaturedImage(query, niche = 'general') {
    const searchQuery = `${query} ${niche}`.trim();
    
    // Try Pexels first (higher quality)
    if (this.pexelsKey) {
      try {
        return await this.getPexelsImage(searchQuery);
      } catch (e) {
        console.log('Pexels failed, trying Unsplash...');
      }
    }
    
    // Try Unsplash as fallback
    if (this.unsplashKey) {
      try {
        return await this.getUnsplashImage(searchQuery);
      } catch (e) {
        console.log('Unsplash also failed');
      }
    }
    
    // Return placeholder
    return {
      url: `https://source.unsplash.com/1200x630/?${encodeURIComponent(searchQuery)}`,
      thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(searchQuery)}`,
      photographer: 'Unsplash',
      source: 'unsplash-source',
      alt: searchQuery
    };
  }
  
  // Get multiple content images
  async getContentImages(query, count = 3) {
    const images = [];
    const variations = [query, `${query} concept`, `${query} illustration`];
    
    for (let i = 0; i < count; i++) {
      try {
        const searchQuery = variations[i % variations.length];
        const image = await this.getFeaturedImage(searchQuery);
        images.push(image);
      } catch (e) {
        console.log(`Failed to get image ${i + 1}:`, e.message);
      }
    }
    
    return images;
  }

  // ==========================================
  // MAIN BLOG CREATION METHOD
  // ==========================================
  
  async createCompleteBlog(data) {
    const { topic, description, tone, length, niche, targetAudience } = data;
    
    console.log('📝 Creating complete blog post...');
    console.log(`   Topic: ${topic}`);
    console.log(`   Niche: ${niche}`);
    console.log(`   Tone: ${tone || 'professional'}`);
    
    try {
      // Step 1: Generate blog content
      console.log('📝 Step 1: Generating blog content...');
      const blogContent = await this.generateBlogContent(topic, description, tone, length, niche);
      
      // Step 2: Get featured image
      console.log('🖼️ Step 2: Fetching featured image...');
      const featuredImage = await this.getFeaturedImage(topic, niche);
      console.log(`✅ Featured image: ${featuredImage.url}`);
      
      // Step 3: Get content images
      console.log('🖼️ Step 3: Fetching content images...');
      const contentImages = await this.getContentImages(topic, 3);
      console.log(`✅ Got ${contentImages.length} content images`);
      
      // Step 4: Generate hashtags
      console.log('#️⃣ Step 4: Generating hashtags...');
      const hashtags = await this.generateViralHashtags(topic, niche);
      
      // Step 5: Embed images in content
      const contentWithImages = this.embedImagesInContent(blogContent.content, contentImages);
      
      // Calculate tokens earned
      let initialTokens = 50;
      if (contentWithImages.length > 2000) initialTokens = 75;
      if (contentWithImages.length > 4000) initialTokens = 100;
      if (blogContent.keywords?.length >= 5) initialTokens += 10;
      if (featuredImage.url && !featuredImage.url.includes('source.unsplash')) initialTokens += 10;
      
      console.log('✅ Complete blog created!');
      
      return {
        title: blogContent.title,
        content: contentWithImages,
        summary: blogContent.summary || blogContent.seoDescription,
        excerpt: blogContent.summary || blogContent.seoDescription,
        
        seo: {
          title: blogContent.seoTitle || blogContent.title,
          description: blogContent.seoDescription || blogContent.summary,
          slug: blogContent.slug || this.generateSlug(blogContent.title),
          keywords: blogContent.keywords || []
        },
        
        featuredImage: featuredImage,
        contentImages: contentImages,
        images: contentImages.map(img => img.url),
        
        hashtags: hashtags,
        readTime: blogContent.readTime || this.calculateReadTime(contentWithImages),
        category: niche,
        
        initialTokens: initialTokens,
        viralityScore: Math.floor(Math.random() * 30) + 70
      };
      
    } catch (error) {
      console.error('❌ Blog creation error:', error);
      throw error;
    }
  }
  
  // Generate blog content with AI
  async generateBlogContent(topic, description, tone, length, niche) {
    const lengthMap = {
      'short': '800-1200',
      'medium': '1500-2000',
      'long': '2500-3500'
    };
    const wordRange = lengthMap[length] || '1500-2000';
    
    const prompt = `Create a ${wordRange} word SEO-optimized blog post.

Topic: ${topic}
${description ? `Description: ${description}` : ''}
Niche: ${niche}
Tone: ${tone || 'professional'}

Requirements:
1. Engaging, clickable title (60 chars max)
2. Hook introduction (2-3 sentences that grab attention)
3. 4-6 main sections with H2 headings
4. Each section: 2-4 paragraphs with valuable insights
5. Use bullet points and numbered lists where appropriate
6. Include actionable tips or takeaways
7. Strong conclusion with CTA
8. Natural keyword placement throughout

Format the content in clean HTML with:
- <h2> for section headings
- <p> for paragraphs
- <ul>/<ol> and <li> for lists
- <strong> and <em> for emphasis
- <blockquote> for important quotes

CRITICAL: Return ONLY valid JSON:
{
  "title": "SEO-optimized title",
  "content": "<article>Full HTML content here</article>",
  "summary": "2-3 sentence summary for meta description",
  "seoTitle": "Title for SEO (60 chars)",
  "seoDescription": "Meta description (155 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "slug": "url-friendly-slug",
  "readTime": "X min"
}`;

    const response = await this.callAI(prompt);
    const parsed = this.parseResponse(response);
    
    if (parsed && parsed.title && parsed.content) {
      return parsed;
    }
    
    // Fallback if parsing failed
    return {
      title: topic,
      content: `<article><h2>${topic}</h2><p>${response}</p></article>`,
      summary: topic,
      keywords: [topic.toLowerCase()],
      readTime: '5 min'
    };
  }
  
  // Generate viral hashtags
  async generateViralHashtags(topic, niche) {
    try {
      const prompt = `Generate 15 viral, trending hashtags for this content:
Topic: ${topic}
Niche: ${niche}

Requirements:
- Mix of popular (high reach) and niche-specific hashtags
- Include 5 broad hashtags (500K+ posts)
- Include 5 medium hashtags (50K-500K posts)
- Include 5 niche hashtags (10K-50K posts)
- No spaces in hashtags
- Return as JSON array

Return ONLY: ["hashtag1", "hashtag2", "hashtag3", ...]`;

      const response = await this.callAI(prompt);
      
      // Try to parse as JSON array
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const hashtags = JSON.parse(match[0]);
        return hashtags.map(h => h.replace(/^#/, ''));
      }
      
      // Fallback: extract hashtags from text
      const hashtags = response.match(/#?\w+/g) || [];
      return hashtags.slice(0, 15).map(h => h.replace(/^#/, ''));
      
    } catch (error) {
      console.log('⚠️ Hashtag generation failed, using defaults');
      return [niche, topic.split(' ')[0], 'trending', 'viral', 'blog'];
    }
  }
  
  // Embed images in content
  embedImagesInContent(content, images) {
    if (!images || images.length === 0) return content;
    
    let result = content;
    const paragraphs = content.split('</p>');
    
    if (paragraphs.length > 3 && images.length > 0) {
      // Insert images after every 3rd paragraph
      const insertPoints = [2, 5, 8].filter(i => i < paragraphs.length);
      
      insertPoints.forEach((point, idx) => {
        if (images[idx]) {
          const imageHtml = `
<figure class="my-6">
  <img src="${images[idx].url}" alt="${images[idx].alt || 'Article image'}" class="w-full rounded-lg shadow-md" loading="lazy" />
  ${images[idx].photographer ? `<figcaption class="text-center text-gray-500 text-sm mt-2">Photo by ${images[idx].photographer}</figcaption>` : ''}
</figure>`;
          paragraphs[point] = paragraphs[point] + '</p>' + imageHtml;
        }
      });
      
      result = paragraphs.join('</p>');
    }
    
    return result;
  }
  
  // Helper methods
  generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }
  
  calculateReadTime(content) {
    const text = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
    const wordCount = text.split(' ').filter(w => w.length > 0).length;
    const minutes = Math.ceil(wordCount / 200);
    return `${minutes} min`;
  }
  
  // Get trending topics
  async getTrendingTopics(niche) {
    try {
      const prompt = `Suggest 10 trending blog topics for ${niche} niche.
Return as JSON: { "topics": ["topic1", "topic2", ...] }`;
      
      const response = await this.callAI(prompt);
      const parsed = this.parseResponse(response);
      return parsed?.topics || [`Latest ${niche} trends`, `How to succeed in ${niche}`];
    } catch (error) {
      return [`Latest ${niche} trends`, `Top ${niche} tips`, `${niche} guide for beginners`];
    }
  }
  
  // Generate SEO metadata
  async generateSEOMetadata(title, content, niche) {
    try {
      const prompt = `Generate SEO metadata for this blog:
Title: ${title}
Content preview: ${content.substring(0, 500)}...
Niche: ${niche}

Return ONLY JSON:
{
  "title": "SEO title (60 chars)",
  "description": "Meta description (155 chars)",
  "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"],
  "slug": "url-slug"
}`;

      const response = await this.callAI(prompt);
      return this.parseResponse(response) || { title, description: content.substring(0, 155), keywords: [] };
    } catch (error) {
      return { title, description: content.substring(0, 155), keywords: [] };
    }
  }
}

module.exports = new ContentCreatorService();
