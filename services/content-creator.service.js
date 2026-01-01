// ============================================
// FILE: services/content-creator.service.js
// PATH: cybev-backend/services/content-creator.service.js
// PURPOSE: AI content generation with DeepSeek (primary) / Claude (fallback)
// UPDATED: Generates Markdown instead of HTML
// ============================================

const fetch = require('node-fetch');

class ContentCreatorService {
  constructor() {
    // Primary: DeepSeek
    this.deepseekKey = process.env.DEEPSEEK_API_KEY;
    this.deepseekUrl = 'https://api.deepseek.com/v1/chat/completions';
    this.deepseekModel = 'deepseek-chat';
    
    // Fallback: Claude (Anthropic)
    this.claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    this.claudeUrl = 'https://api.anthropic.com/v1/messages';
    this.claudeModel = 'claude-3-haiku-20240307';
    
    // Legacy fallback: OpenAI
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.openaiUrl = 'https://api.openai.com/v1/chat/completions';
    this.openaiModel = 'gpt-3.5-turbo';
    
    console.log('🤖 AI Service initialized');
    console.log(`   DeepSeek: ${this.deepseekKey ? '✅ Configured (Primary)' : '❌ Not configured'}`);
    console.log(`   Claude: ${this.claudeKey ? '✅ Configured (Fallback)' : '❌ Not configured'}`);
    console.log(`   OpenAI: ${this.openaiKey ? '✅ Configured (Fallback 2)' : '❌ Not configured'}`);
  }

  /**
   * Call DeepSeek API (Primary)
   */
  async callDeepSeek(systemPrompt, userPrompt, maxTokens = 4000) {
    if (!this.deepseekKey) {
      throw new Error('DeepSeek API key not configured');
    }

    const response = await fetch(this.deepseekUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.deepseekKey}`
      },
      body: JSON.stringify({
        model: this.deepseekModel,
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
      console.error('❌ DeepSeek API Error:', response.status, errorText);
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Call Claude API (Fallback)
   */
  async callClaude(systemPrompt, userPrompt, maxTokens = 4000) {
    if (!this.claudeKey) {
      throw new Error('Claude API key not configured');
    }

    const response = await fetch(this.claudeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.claudeKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.claudeModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Claude API Error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  /**
   * Call OpenAI API (Fallback 2)
   */
  async callOpenAI(systemPrompt, userPrompt, maxTokens = 4000) {
    if (!this.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(this.openaiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiKey}`
      },
      body: JSON.stringify({
        model: this.openaiModel,
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
      console.error('❌ OpenAI API Error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Main AI call with automatic fallback
   * Order: DeepSeek -> Claude -> OpenAI
   */
  async callAI(systemPrompt, userPrompt, maxTokens = 4000) {
    // Try DeepSeek first (Primary)
    if (this.deepseekKey) {
      try {
        console.log('🤖 Trying DeepSeek (Primary)...');
        const result = await this.callDeepSeek(systemPrompt, userPrompt, maxTokens);
        console.log('✅ DeepSeek response received');
        return result;
      } catch (error) {
        console.log('⚠️ DeepSeek failed:', error.message);
      }
    }

    // Try Claude as fallback
    if (this.claudeKey) {
      try {
        console.log('🤖 Trying Claude (Fallback)...');
        const result = await this.callClaude(systemPrompt, userPrompt, maxTokens);
        console.log('✅ Claude response received');
        return result;
      } catch (error) {
        console.log('⚠️ Claude failed:', error.message);
      }
    }

    // Try OpenAI as final fallback
    if (this.openaiKey) {
      try {
        console.log('🤖 Trying OpenAI (Fallback 2)...');
        const result = await this.callOpenAI(systemPrompt, userPrompt, maxTokens);
        console.log('✅ OpenAI response received');
        return result;
      } catch (error) {
        console.log('⚠️ OpenAI failed:', error.message);
      }
    }

    throw new Error('All AI providers failed. Please check API keys and try again.');
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
   * NOW GENERATES MARKDOWN (not HTML)
   */
  async createCompleteBlog({ topic, description, tone, length, niche, targetAudience, seoTitle, seoDescription, seoHashtags }) {
    console.log('📝 Generating complete blog...');
    console.log(`   Topic: ${topic}`);
    console.log(`   Description: ${description || 'Not provided'}`);
    console.log(`   Niche: ${niche}`);
    
    // Determine word count
    let wordCount = 1200;
    if (length === 'short') wordCount = 800;
    else if (length === 'long') wordCount = 2500;

    const systemPrompt = `You are an expert ${niche} content writer for CYBEV, a social blogging platform. Create engaging, SEO-optimized blog posts that captivate readers and drive engagement.

CRITICAL: Generate content in clean MARKDOWN format, NOT HTML. Use:
- ## for main headings
- ### for subheadings  
- **bold** for emphasis
- *italic* for subtle emphasis
- - for bullet points
- 1. for numbered lists
- > for quotes
- Paragraphs separated by blank lines

DO NOT use any HTML tags like <p>, <h2>, <strong>, <article>, etc.

Return your response as valid JSON with this exact structure:
{
  "title": "Catchy SEO-optimized title",
  "content": "Full blog content in MARKDOWN format (NOT HTML)",
  "excerpt": "Compelling 1-2 sentence summary",
  "summary": "Brief 2-3 sentence summary",
  "readTime": "X min read",
  "seo": {
    "title": "SEO-optimized title (60 chars max)",
    "description": "Meta description for search (150-160 chars)",
    "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
  },
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "featuredImage": {
    "url": "",
    "alt": "Descriptive alt text"
  }
}`;

    const userPrompt = `Create a ${tone || 'professional'} blog post about: "${topic}"
${description ? `\nAdditional context/instructions: ${description}` : ''}

Requirements:
- Category: ${niche}
- Target audience: ${targetAudience || 'general readers'}
- Length: approximately ${wordCount} words
- Tone: ${tone || 'professional'}
${seoTitle ? `- Use this SEO title if possible: ${seoTitle}` : ''}
${seoDescription ? `- Use this meta description: ${seoDescription}` : ''}
${seoHashtags?.length ? `- Include these keywords: ${seoHashtags.join(', ')}` : ''}

Make sure to:
1. Start with an engaging hook
2. Use clear subheadings (##, ###) to organize content
3. Include actionable insights
4. End with a compelling call to action
5. Use MARKDOWN formatting ONLY (no HTML tags)
6. Make it shareable and engaging for social media

Return the response as valid JSON.`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, 4000);
      const blogData = this.parseJSON(response, {
        title: topic,
        content: `## ${topic}\n\nContent generation encountered an issue. Please try again.`,
        excerpt: topic,
        summary: topic,
        readTime: '5 min read',
        seo: { 
          title: seoTitle || topic, 
          description: seoDescription || topic, 
          keywords: seoHashtags || [] 
        },
        hashtags: [],
        featuredImage: { url: '', alt: '' }
      });

      // Clean up any remaining HTML tags if AI didn't follow instructions
      if (blogData.content) {
        blogData.content = this.cleanHtmlToMarkdown(blogData.content);
      }

      // Calculate initial tokens based on quality
      let initialTokens = 50;
      if (blogData.content.length > 2000) initialTokens = 75;
      if (blogData.content.length > 4000) initialTokens = 100;
      if (blogData.seo?.keywords?.length >= 5) initialTokens += 10;

      blogData.initialTokens = initialTokens;
      blogData.viralityScore = Math.floor(Math.random() * 30) + 70; // 70-100

      console.log('✅ Blog generated successfully');
      return blogData;
    } catch (error) {
      console.error('❌ Blog generation error:', error);
      throw error;
    }
  }

  /**
   * Convert HTML to Markdown (cleanup function)
   */
  cleanHtmlToMarkdown(html) {
    if (!html) return '';
    
    return html
      // Convert headings
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      // Convert formatting
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      // Convert lists
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      // Convert links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      // Convert blockquotes
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n')
      // Convert paragraphs
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Remove wrapper tags
      .replace(/<article[^>]*>/gi, '')
      .replace(/<\/article>/gi, '')
      .replace(/<section[^>]*>/gi, '')
      .replace(/<\/section>/gi, '')
      .replace(/<div[^>]*>/gi, '')
      .replace(/<\/div>/gi, '\n')
      .replace(/<span[^>]*>/gi, '')
      .replace(/<\/span>/gi, '')
      // Remove any remaining tags
      .replace(/<[^>]+>/g, '')
      // Clean up entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Generate blog title suggestions
   */
  async generateTitles(topic, niche, count = 5) {
    const systemPrompt = `You are a headline expert. Generate ${count} catchy, SEO-optimized blog titles.
Return as JSON array: ["title1", "title2", ...]`;
    
    const userPrompt = `Generate ${count} viral blog titles about "${topic}" in the ${niche} niche.
Make them:
- Attention-grabbing
- SEO-friendly
- Click-worthy
- Under 60 characters each`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, 500);
      const titles = this.parseJSON(response, []);
      return Array.isArray(titles) ? titles : [titles].flat();
    } catch (error) {
      console.error('Title generation error:', error);
      return [`${topic}: A Complete Guide`];
    }
  }

  /**
   * Generate hashtags for content
   */
  async generateHashtags(topic, niche, count = 10) {
    const systemPrompt = `You are a social media expert. Generate trending hashtags.
Return as JSON array: ["#hashtag1", "#hashtag2", ...]`;
    
    const userPrompt = `Generate ${count} relevant hashtags for a blog about "${topic}" in ${niche}.
Include a mix of:
- Popular hashtags (high reach)
- Niche hashtags (targeted)
- Trending hashtags`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, 300);
      const hashtags = this.parseJSON(response, []);
      return Array.isArray(hashtags) ? hashtags : [];
    } catch (error) {
      console.error('Hashtag generation error:', error);
      return [`#${niche}`, `#${topic.replace(/\s+/g, '')}`];
    }
  }

  /**
   * Generate SEO metadata
   */
  async generateSEO(title, content, niche) {
    const systemPrompt = `You are an SEO expert. Generate optimized metadata.
Return as JSON: { "title": "...", "description": "...", "keywords": [...] }`;
    
    const excerpt = content.slice(0, 500);
    const userPrompt = `Generate SEO metadata for:
Title: ${title}
Niche: ${niche}
Content preview: ${excerpt}

Requirements:
- SEO title: 50-60 characters
- Meta description: 150-160 characters  
- 5-8 relevant keywords`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, 500);
      return this.parseJSON(response, {
        title: title.slice(0, 60),
        description: excerpt.slice(0, 160),
        keywords: [niche]
      });
    } catch (error) {
      console.error('SEO generation error:', error);
      return {
        title: title.slice(0, 60),
        description: content.replace(/[#*_]/g, '').slice(0, 160),
        keywords: [niche]
      };
    }
  }

  /**
   * Improve/rewrite existing content
   */
  async improveContent(content, tone = 'professional') {
    const systemPrompt = `You are a content editor. Improve the given content while maintaining the original message.
Return the improved content in MARKDOWN format (not HTML).`;
    
    const userPrompt = `Improve this content with a ${tone} tone:
${content}

Make it:
- More engaging
- Better structured
- More readable
- Use MARKDOWN formatting only`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, 4000);
      return this.cleanHtmlToMarkdown(response);
    } catch (error) {
      console.error('Content improvement error:', error);
      return content;
    }
  }

  /**
   * Generate content outline
   */
  async generateOutline(topic, niche) {
    const systemPrompt = `You are a content strategist. Create a detailed blog outline.
Return as JSON: { "title": "...", "sections": [{ "heading": "...", "points": [...] }] }`;
    
    const userPrompt = `Create a detailed outline for a blog about "${topic}" in ${niche}.
Include:
- Main title
- 4-6 main sections with headings
- 3-4 bullet points per section`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, 1000);
      return this.parseJSON(response, { title: topic, sections: [] });
    } catch (error) {
      console.error('Outline generation error:', error);
      return { title: topic, sections: [] };
    }
  }
}

// Export singleton instance
module.exports = new ContentCreatorService();
