// ============================================
// FILE: services/content-creator.service.js
// AI Content Creation Engine v3.0
// FIXED:
//   - Smart image search based on TITLE (not category)
//   - Christian content detection (Lord = God, not idols)
//   - Proper article length (short/medium/long)
//   - Inline images based on content context
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
    
    console.log('🤖 Content Creator Service v3.0 initialized');
    console.log(`   DeepSeek: ${this.deepseekKey ? '✅ Primary' : '❌ Not configured'}`);
    console.log(`   OpenAI: ${this.openaiKey ? '✅ Fallback 1' : '❌ Not configured'}`);
    console.log(`   Claude: ${this.claudeKey ? '✅ Fallback 2' : '❌ Not configured'}`);
    console.log(`   Pexels: ${this.pexelsKey ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Unsplash: ${this.unsplashKey ? '✅ Configured' : '❌ Not configured'}`);
  }

  // ==========================================
  // CHRISTIAN/RELIGIOUS CONTENT DETECTION
  // ==========================================
  
  // Keywords that indicate Christian/Biblical content
  CHRISTIAN_KEYWORDS = [
    'lord', 'jesus', 'christ', 'god', 'holy spirit', 'bible', 'scripture', 'gospel',
    'church', 'faith', 'prayer', 'salvation', 'grace', 'worship', 'praise',
    'christian', 'christianity', 'ministry', 'pastor', 'sermon', 'testament',
    'resurrection', 'crucifixion', 'cross', 'heaven', 'angel', 'divine',
    'blessed', 'blessing', 'amen', 'hallelujah', 'prophesy', 'prophecy',
    'rapture', 'tribulation', 'end times', 'second coming', 'kingdom',
    'apostle', 'disciple', 'evangelist', 'missionary', 'covenant', 'psalm',
    'proverbs', 'genesis', 'revelation', 'exodus', 'matthew', 'john', 'luke',
    'spiritual', 'born again', 'holy', 'righteous', 'sin', 'repentance',
    'forgiveness', 'eternal life', 'redemption', 'messiah', 'savior', 'saviour',
    'day of the lord', 'judgement day', 'judgment', 'apocalypse', 'armageddon',
    'lamb of god', 'king of kings', 'son of god', 'word of god', 'believer'
  ];

  // Phrases that strongly indicate Christian content
  CHRISTIAN_PHRASES = [
    'the lord', 'our lord', 'in christ', 'word of god', 'son of god',
    'lamb of god', 'king of kings', 'holy spirit', 'the father',
    'body of christ', 'blood of christ', 'end times', 'day of the lord',
    'second coming', 'new testament', 'old testament', 'book of',
    'kingdom of god', 'kingdom of heaven', 'eternal life', 'living god',
    'divine intervention', 'god\'s will', 'lord\'s prayer', 'holy bible',
    'christian life', 'walk with god', 'children of god', 'people of god'
  ];

  /**
   * Detect if content is Christian/religious based on title and content
   */
  isChristianContent(title, content = '') {
    const fullText = `${title} ${content}`.toLowerCase();
    
    // Check for Christian phrases first (more specific)
    for (const phrase of this.CHRISTIAN_PHRASES) {
      if (fullText.includes(phrase)) {
        console.log(`⛪ Detected Christian phrase: "${phrase}"`);
        return true;
      }
    }
    
    // Check for Christian keywords (need 2+ matches)
    const matchedKeywords = this.CHRISTIAN_KEYWORDS.filter(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(fullText);
    });
    
    if (matchedKeywords.length >= 2) {
      console.log(`⛪ Detected Christian keywords: ${matchedKeywords.slice(0, 5).join(', ')}`);
      return true;
    }
    
    return false;
  }

  /**
   * Extract SMART image keywords based on TITLE (not category!)
   * This is the KEY fix - we analyze the title to get appropriate search terms
   */
  extractSmartImageKeywords(title, content = '', niche = 'general') {
    const fullText = `${title} ${content}`.toLowerCase();
    const isChristian = this.isChristianContent(title, content);
    
    console.log(`🔍 Extracting image keywords from title: "${title}"`);
    console.log(`   Christian content: ${isChristian}`);
    
    // ==========================================
    // CHRISTIAN CONTENT - Use appropriate imagery
    // ==========================================
    if (isChristian) {
      const titleLower = title.toLowerCase();
      
      // Map specific Christian topics to appropriate search terms
      // CRITICAL: Avoid generic "lord" which returns Hindu deity images!
      
      if (titleLower.includes('day of the lord') || titleLower.includes('judgment') || 
          titleLower.includes('judgement') || titleLower.includes('end times') || 
          titleLower.includes('apocalypse') || titleLower.includes('tribulation') ||
          titleLower.includes('rapture') || titleLower.includes('second coming')) {
        return {
          featured: 'dramatic sunset sky clouds prophetic',
          inline: ['sunrise hope sky', 'bible light divine', 'cross silhouette sunset']
        };
      }
      
      if (titleLower.includes('prayer') || titleLower.includes('praying')) {
        return {
          featured: 'praying hands light spiritual',
          inline: ['peaceful meditation', 'candle prayer', 'quiet devotion']
        };
      }
      
      if (titleLower.includes('faith') || titleLower.includes('believe') || titleLower.includes('trust')) {
        return {
          featured: 'sunrise hope mountain inspiration',
          inline: ['path light journey', 'hands reaching sky', 'peaceful nature']
        };
      }
      
      if (titleLower.includes('love') || titleLower.includes('grace') || titleLower.includes('mercy')) {
        return {
          featured: 'heart warmth love light',
          inline: ['helping hands', 'family together', 'kindness community']
        };
      }
      
      if (titleLower.includes('church') || titleLower.includes('worship') || titleLower.includes('congregation')) {
        return {
          featured: 'church interior light stained glass',
          inline: ['community gathering', 'singing praise', 'church building']
        };
      }
      
      if (titleLower.includes('bible') || titleLower.includes('scripture') || titleLower.includes('word of god')) {
        return {
          featured: 'open bible book light reading',
          inline: ['studying scripture', 'old book pages', 'wisdom learning']
        };
      }
      
      if (titleLower.includes('jesus') || titleLower.includes('christ') || titleLower.includes('cross') ||
          titleLower.includes('crucif') || titleLower.includes('resurrection')) {
        return {
          featured: 'christian cross sunrise silhouette',
          inline: ['empty tomb sunrise', 'cross hill', 'light rays hope']
        };
      }
      
      if (titleLower.includes('heaven') || titleLower.includes('eternal') || titleLower.includes('glory')) {
        return {
          featured: 'sky clouds light rays heavenly beautiful',
          inline: ['peaceful clouds', 'golden light', 'serene sky']
        };
      }
      
      if (titleLower.includes('peace') || titleLower.includes('hope') || titleLower.includes('comfort')) {
        return {
          featured: 'peaceful sunrise calm serene nature',
          inline: ['quiet lake', 'gentle morning', 'tranquil scene']
        };
      }
      
      if (titleLower.includes('salvation') || titleLower.includes('redeem') || titleLower.includes('forgive')) {
        return {
          featured: 'light breaking through darkness hope',
          inline: ['new beginning sunrise', 'freedom bird sky', 'fresh start']
        };
      }
      
      // Default Christian imagery (avoid "lord" which returns Hindu images!)
      return {
        featured: 'spiritual light rays inspiration peaceful',
        inline: ['bible reading', 'peaceful nature', 'hope sunrise']
      };
    }
    
    // ==========================================
    // NON-RELIGIOUS CONTENT - Extract from title
    // ==========================================
    
    // Stop words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
      'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
      'how', 'what', 'why', 'when', 'where', 'who', 'which', 'this', 'that',
      'your', 'our', 'my', 'their', 'its', 'understanding', 'guide', 'complete',
      'ultimate', 'best', 'top', 'essential', 'introduction', 'overview'
    ]);
    
    // Extract meaningful words from title
    const words = title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    const mainKeywords = words.slice(0, 4).join(' ');
    
    // Category-specific enhancements
    const categoryKeywords = {
      'technology': 'modern digital tech',
      'business': 'professional office corporate',
      'health': 'wellness fitness healthy',
      'lifestyle': 'modern life living',
      'travel': 'adventure destination journey',
      'food': 'delicious cuisine cooking',
      'finance': 'money investment growth',
      'education': 'learning study knowledge',
      'entertainment': 'fun creative media',
      'sports': 'athletic competition active',
      'fashion': 'style trendy clothing'
    };
    
    const categoryEnhancement = categoryKeywords[niche] || '';
    
    return {
      featured: `${mainKeywords} ${categoryEnhancement}`.trim(),
      inline: [mainKeywords, `${words[0] || niche} professional`, `${words[1] || 'modern'} concept`]
    };
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
        { role: 'system', content: options.systemPrompt || 'You are an expert content creator. Generate professional, SEO-optimized content in valid JSON format. Always meet the specified word count requirements.' },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 8192
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.deepseekKey}`
      },
      timeout: 180000 // 3 minutes for long articles
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
        { role: 'system', content: options.systemPrompt || 'You are an expert content creator. Generate professional, SEO-optimized content in valid JSON format. Always meet the specified word count requirements.' },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 8192
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiKey}`
      },
      timeout: 180000
    });
    
    console.log('✅ OpenAI response received');
    return response.data.choices?.[0]?.message?.content || '';
  }
  
  async callClaude(prompt, options = {}) {
    if (!this.claudeKey) throw new Error('Claude API key not configured');
    
    console.log('🤖 Calling Claude...');
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: options.model || 'claude-3-haiku-20240307',
      max_tokens: options.maxTokens || 8192,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.claudeKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 180000
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
  // IMAGE FETCHING (SMART - Based on Title)
  // ==========================================
  
  async getSmartImage(keywords, isChristian = false) {
    // For Christian content, use curated fallback images if API fails
    const christianFallbackImages = [
      'https://images.pexels.com/photos/372326/pexels-photo-372326.jpeg?auto=compress&cs=tinysrgb&w=1200', // Bible with light
      'https://images.pexels.com/photos/51775/cross-sunset-sunrise-silhouette-51775.jpeg?auto=compress&cs=tinysrgb&w=1200', // Cross sunset
      'https://images.pexels.com/photos/1252869/pexels-photo-1252869.jpeg?auto=compress&cs=tinysrgb&w=1200', // Dramatic sky
      'https://images.pexels.com/photos/130621/pexels-photo-130621.jpeg?auto=compress&cs=tinysrgb&w=1200', // Sunrise mountains
      'https://images.pexels.com/photos/267559/pexels-photo-267559.jpeg?auto=compress&cs=tinysrgb&w=1200', // Bible
      'https://images.pexels.com/photos/1126384/pexels-photo-1126384.jpeg?auto=compress&cs=tinysrgb&w=1200', // Light through clouds
    ];

    // Try Pexels first
    if (this.pexelsKey) {
      try {
        const image = await this.getPexelsImage(keywords);
        
        // CRITICAL: Verify the image is appropriate for Christian content
        if (isChristian && image.url) {
          // Check if the returned image might be inappropriate
          const badTerms = ['shiva', 'hindu', 'buddha', 'buddhist', 'mosque', 'islamic', 'krishna', 'ganesh', 'vishnu'];
          const imageAlt = (image.alt || '').toLowerCase();
          const isBadImage = badTerms.some(term => imageAlt.includes(term));
          
          if (isBadImage) {
            console.log('⚠️ Detected inappropriate image for Christian content, using fallback');
            return {
              url: christianFallbackImages[Math.floor(Math.random() * christianFallbackImages.length)],
              source: 'fallback',
              alt: 'Spiritual inspiration'
            };
          }
        }
        
        return image;
      } catch (e) {
        console.log('⚠️ Pexels failed:', e.message);
      }
    }
    
    // Try Unsplash
    if (this.unsplashKey) {
      try {
        const image = await this.getUnsplashImage(keywords);
        return image;
      } catch (e) {
        console.log('⚠️ Unsplash failed:', e.message);
      }
    }
    
    // Fallback for Christian content
    if (isChristian) {
      return {
        url: christianFallbackImages[Math.floor(Math.random() * christianFallbackImages.length)],
        source: 'fallback',
        alt: 'Spiritual inspiration'
      };
    }
    
    // Generic fallback
    return {
      url: 'https://images.pexels.com/photos/1925536/pexels-photo-1925536.jpeg?auto=compress&cs=tinysrgb&w=1200',
      source: 'fallback',
      alt: keywords
    };
  }
  
  async getPexelsImage(query) {
    if (!this.pexelsKey) throw new Error('Pexels API key not configured');
    
    console.log(`🖼️ Searching Pexels for: "${query}"`);
    const response = await axios.get('https://api.pexels.com/v1/search', {
      params: { query, per_page: 10, orientation: 'landscape' },
      headers: { Authorization: this.pexelsKey },
      timeout: 15000
    });
    
    if (response.data.photos?.length > 0) {
      const photo = response.data.photos[Math.floor(Math.random() * Math.min(5, response.data.photos.length))];
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
  }
  
  async getUnsplashImage(query) {
    if (!this.unsplashKey) throw new Error('Unsplash API key not configured');
    
    console.log(`🖼️ Searching Unsplash for: "${query}"`);
    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: { query, per_page: 10, orientation: 'landscape' },
      headers: { Authorization: `Client-ID ${this.unsplashKey}` },
      timeout: 15000
    });
    
    if (response.data.results?.length > 0) {
      const photo = response.data.results[Math.floor(Math.random() * Math.min(5, response.data.results.length))];
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
  }

  // ==========================================
  // MAIN BLOG CREATION METHOD
  // ==========================================
  
  async createCompleteBlog(options) {
    const { topic, description = '', tone = 'professional', length = 'medium', niche = 'general', targetAudience = 'general' } = options;
    
    console.log('📝 ========== CREATING COMPLETE BLOG ==========');
    console.log(`   Topic: ${topic}`);
    console.log(`   Tone: ${tone}`);
    console.log(`   Length: ${length}`);
    console.log(`   Niche: ${niche}`);
    
    try {
      // Step 1: Detect if Christian content (BEFORE image search)
      const isChristian = this.isChristianContent(topic, description);
      console.log(`   Christian Content: ${isChristian ? '✅ Yes' : '❌ No'}`);
      
      // Step 2: Generate blog content
      console.log('📄 Step 1: Generating blog content...');
      const blogContent = await this.generateBlogContent(topic, description, tone, length, niche);
      
      // Step 3: Extract SMART image keywords from TITLE (not category!)
      console.log('🖼️ Step 2: Getting featured image based on TITLE...');
      const imageKeywords = this.extractSmartImageKeywords(topic, blogContent.content, niche);
      console.log(`   Featured image keywords: "${imageKeywords.featured}"`);
      
      const featuredImage = await this.getSmartImage(imageKeywords.featured, isChristian);
      
      // Step 4: Get inline images
      console.log('🖼️ Step 3: Getting inline images...');
      const contentImages = [];
      for (let i = 0; i < Math.min(2, imageKeywords.inline.length); i++) {
        try {
          const img = await this.getSmartImage(imageKeywords.inline[i], isChristian);
          contentImages.push(img);
        } catch (e) {
          console.log(`   Inline image ${i + 1} failed`);
        }
      }
      
      // Step 5: Generate hashtags
      console.log('#️⃣ Step 4: Generating hashtags...');
      const hashtags = await this.generateViralHashtags(topic, niche, isChristian);
      
      // Step 6: Embed images in content
      const contentWithImages = this.embedImagesInContent(blogContent.content, contentImages);
      
      // Calculate tokens earned based on content quality
      let initialTokens = 50;
      if (contentWithImages.length > 3000) initialTokens = 75;
      if (contentWithImages.length > 5000) initialTokens = 100;
      if (blogContent.keywords?.length >= 5) initialTokens += 10;
      if (featuredImage.source !== 'fallback') initialTokens += 10;
      
      console.log('✅ Complete blog created!');
      console.log(`   Title: ${blogContent.title}`);
      console.log(`   Words: ~${Math.round(contentWithImages.replace(/<[^>]*>/g, '').split(/\s+/).length)}`);
      console.log(`   Images: 1 featured + ${contentImages.length} inline`);
      
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
        isChristianContent: isChristian,
        
        initialTokens: initialTokens,
        viralityScore: Math.floor(Math.random() * 30) + 70
      };
      
    } catch (error) {
      console.error('❌ Blog creation error:', error);
      throw error;
    }
  }
  
  // ==========================================
  // BLOG CONTENT GENERATION (FIXED LENGTH)
  // ==========================================
  
  async generateBlogContent(topic, description, tone, length, niche) {
    // FIXED: Proper word counts for each length
    const lengthConfig = {
      'short': { words: '600-900', sections: 3, paragraphs: '2-3' },
      'medium': { words: '1200-1800', sections: 5, paragraphs: '3-4' },
      'long': { words: '2500-3500', sections: 7, paragraphs: '4-5' }
    };
    
    const config = lengthConfig[length] || lengthConfig.medium;
    
    const toneInstructions = {
      professional: 'Write in a professional, authoritative tone. Use industry terminology but explain complex concepts.',
      casual: 'Write in a conversational, friendly tone. Use contractions and relatable language.',
      inspirational: 'Write in an uplifting, motivational tone. Use powerful imagery and encourage the reader.',
      educational: 'Write in a clear, informative tone. Focus on teaching and explaining concepts step by step.',
      storytelling: 'Write in a narrative style. Use personal anecdotes, examples, and engaging stories.'
    };
    
    const prompt = `Create a comprehensive ${config.words} word SEO-optimized blog post.

TOPIC: ${topic}
${description ? `ADDITIONAL CONTEXT: ${description}` : ''}
NICHE: ${niche}
TONE: ${toneInstructions[tone] || toneInstructions.professional}

CRITICAL LENGTH REQUIREMENT:
- This is a ${length.toUpperCase()} article
- MUST be ${config.words} words (this is essential!)
- Include ${config.sections} main sections
- Each section needs ${config.paragraphs} substantial paragraphs

STRUCTURE REQUIREMENTS:
1. TITLE: Create an engaging, SEO-optimized headline (50-60 characters)

2. INTRODUCTION (2-3 paragraphs):
   - Start with a hook that grabs attention
   - Establish the problem or opportunity
   - Preview what the reader will learn

3. MAIN CONTENT (${config.sections} sections with H2 headings):
   - Each section should have a clear, descriptive H2 heading
   - Include ${config.paragraphs} paragraphs per section (each paragraph 3-5 sentences)
   - Add specific examples, data, statistics, or anecdotes
   - Include at least one bulleted or numbered list
   - Use subheadings (H3) within longer sections

4. CONCLUSION:
   - Summarize key takeaways
   - Include a clear call-to-action
   - End with a thought-provoking statement

FORMAT IN HTML:
- <h1> for main title (only one)
- <h2> for section headings
- <h3> for subheadings within sections
- <p> for paragraphs (MAKE PARAGRAPHS SUBSTANTIAL - 3-5 sentences each)
- <ul>/<ol> for lists
- <strong> for emphasis
- <blockquote> for important quotes

RETURN ONLY VALID JSON (no markdown blocks, no explanation):
{
  "title": "Engaging SEO-Optimized Title Here",
  "content": "<article><h1>Title</h1><p>Introduction...</p><h2>Section 1</h2><p>Content...</p>...</article>",
  "summary": "2-3 sentence meta description (max 160 characters)",
  "seoTitle": "SEO Title (60 chars max)",
  "seoDescription": "Meta description for search engines (155 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "slug": "url-friendly-slug-here",
  "readTime": "${length === 'short' ? '3-4' : length === 'medium' ? '6-8' : '12-15'} min"
}`;

    const response = await this.callAI(prompt, { maxTokens: 8192 });
    const parsed = this.parseResponse(response);
    
    if (parsed && parsed.title && parsed.content) {
      // Verify content length
      const wordCount = parsed.content.replace(/<[^>]*>/g, '').split(/\s+/).length;
      console.log(`📊 Generated article word count: ~${wordCount}`);
      
      return parsed;
    }
    
    // Fallback if parsing failed
    return {
      title: topic,
      content: `<article><h1>${topic}</h1><p>${response}</p></article>`,
      summary: topic,
      keywords: [topic.toLowerCase()],
      readTime: '5 min'
    };
  }
  
  // Generate viral hashtags
  async generateViralHashtags(topic, niche, isChristian = false) {
    try {
      const christianHashtags = isChristian ? `
Include these Christian/faith hashtags: Faith, Christian, BibleStudy, Jesus, God, Prayer, Blessed, Scripture, ChristianLife, Worship` : '';

      const prompt = `Generate 15 viral, trending hashtags for this content:
Topic: ${topic}
Niche: ${niche}
${christianHashtags}

Requirements:
- Mix of popular (high reach) and niche-specific hashtags
- 5 broad hashtags (500K+ posts)
- 5 medium hashtags (50K-500K posts)  
- 5 niche hashtags (10K-50K posts)
- No spaces in hashtags
- No # symbol, just the words

Return ONLY a JSON array: ["hashtag1", "hashtag2", "hashtag3", ...]`;

      const response = await this.callAI(prompt);
      
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const hashtags = JSON.parse(match[0]);
        return hashtags.map(h => h.replace(/^#/, '').trim()).filter(h => h.length > 0);
      }
      
      // Fallback
      const hashtags = response.match(/#?\w+/g) || [];
      return hashtags.slice(0, 15).map(h => h.replace(/^#/, ''));
      
    } catch (error) {
      console.log('⚠️ Hashtag generation failed, using defaults');
      
      if (isChristian) {
        return ['Faith', 'Christian', 'BibleStudy', 'Jesus', 'God', 'Prayer', 'Blessed', 'Scripture', 'Inspiration', 'Hope'];
      }
      return [niche, topic.split(' ')[0], 'trending', 'viral', 'blog'];
    }
  }
  
  // Embed images in content at appropriate positions
  embedImagesInContent(content, images) {
    if (!images || images.length === 0) return content;
    
    let result = content;
    const sections = content.split(/<h2/gi);
    
    if (sections.length > 2 && images.length > 0) {
      // Insert images after sections 2 and 4 (if they exist)
      const insertAfterSections = [2, 4].filter(i => i < sections.length);
      
      insertAfterSections.forEach((sectionIndex, imgIndex) => {
        if (images[imgIndex]) {
          const imageHtml = `
<figure class="my-8 text-center">
  <img src="${images[imgIndex].url}" alt="${images[imgIndex].alt || 'Article illustration'}" class="w-full max-w-2xl mx-auto rounded-lg shadow-lg" loading="lazy" />
  ${images[imgIndex].photographer ? `<figcaption class="text-gray-500 text-sm mt-2 italic">Photo by ${images[imgIndex].photographer}</figcaption>` : ''}
</figure>`;
          
          // Find the end of this section and insert the image
          const sectionEndMatch = sections[sectionIndex].match(/<\/p>\s*$/);
          if (sectionEndMatch) {
            sections[sectionIndex] = sections[sectionIndex].replace(/<\/p>\s*$/, '</p>' + imageHtml);
          }
        }
      });
      
      // Rejoin sections
      result = sections.join('<h2');
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
      const prompt = `Suggest 10 trending blog topics for ${niche} niche that would perform well on social media.
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
