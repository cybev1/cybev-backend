// ============================================
// FILE: services/ai.service.js
// AI Service v2.0 - FIXED Article Generation
// FIXES:
//   - Respects article length (short/medium/long)
//   - Generates inline images based on TITLE
//   - Better content structure
//   - DeepSeek PRIMARY, Claude fallback
// ============================================

const axios = require('axios');

class AIService {
  constructor() {
    this.deepseekKey = process.env.DEEPSEEK_API_KEY;
    this.claudeKey = process.env.ANTHROPIC_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    this.stats = {
      deepseekSuccess: 0,
      deepseekFails: 0,
      claudeUsed: 0,
      openaiUsed: 0,
      totalCost: 0
    };

    console.log('🤖 AI Service v2.0 initialized');
    console.log(`   DeepSeek: ${this.deepseekKey ? '✅ Configured (Primary)' : '❌ Missing'}`);
    console.log(`   Claude: ${this.claudeKey ? '✅ Configured (Fallback)' : '❌ Missing'}`);
    console.log(`   OpenAI: ${this.openaiKey ? '✅ Configured (Fallback 2)' : '❌ Missing'}`);
  }

  /**
   * Generate blog post content - FIXED with proper length and inline images
   */
  async generateBlogPost(data) {
    const { topic, title, tone = 'professional', length = 'medium', keywords = [], category, includeImages = true } = data;
    
    console.log('📝 Generating blog post...');
    console.log(`   Topic/Title: ${title || topic}`);
    console.log(`   Tone: ${tone}`);
    console.log(`   Length: ${length}`);
    console.log(`   Include Images: ${includeImages}`);
    
    const prompt = this.buildBlogPrompt({ 
      topic: title || topic, 
      tone, 
      length, 
      keywords,
      includeImages 
    });

    try {
      console.log('⚡ Using DeepSeek for blog generation...');
      const result = await this.callDeepSeek(prompt);
      this.stats.deepseekSuccess++;
      return this.parseResponse(result);
      
    } catch (deepseekError) {
      console.warn('⚠️ DeepSeek failed, trying Claude...');
      this.stats.deepseekFails++;
      
      try {
        const result = await this.callClaude(prompt);
        this.stats.claudeUsed++;
        return this.parseResponse(result);
      } catch (claudeError) {
        console.warn('⚠️ Claude failed, trying OpenAI...');
        
        if (this.openaiKey) {
          try {
            const result = await this.callOpenAI(prompt);
            this.stats.openaiUsed++;
            return this.parseResponse(result);
          } catch (openaiError) {
            throw new Error('All AI providers failed');
          }
        }
        throw new Error('AI generation failed');
      }
    }
  }

  /**
   * Build blog post generation prompt - FIXED with proper length requirements
   */
  buildBlogPrompt({ topic, tone, length, keywords, includeImages }) {
    // FIXED: Proper word counts for each length
    const lengthConfig = {
      'short': {
        words: '500-700 words',
        sections: 3,
        description: 'concise but informative'
      },
      'medium': {
        words: '1000-1500 words',
        sections: 5,
        description: 'comprehensive with good detail'
      },
      'long': {
        words: '2000-3000 words',
        sections: 7,
        description: 'in-depth, comprehensive, and detailed with examples'
      }
    };

    const config = lengthConfig[length] || lengthConfig.medium;

    const toneDescriptions = {
      professional: 'Professional, authoritative, yet accessible. Use industry terminology but explain it when needed.',
      casual: 'Conversational, friendly, relatable. Use contractions and everyday language.',
      inspirational: 'Uplifting, motivational, encouraging. Use powerful imagery and call to action.',
      educational: 'Clear, informative, structured. Focus on teaching and explaining concepts.',
      storytelling: 'Narrative-driven, engaging, with personal anecdotes and examples.'
    };

    const toneInstruction = toneDescriptions[tone] || toneDescriptions.professional;

    // Image placeholder instruction
    const imageInstruction = includeImages ? `
IMPORTANT - INLINE IMAGES:
After sections 1 and 3 (or sections 2 and 4 for long articles), add an image placeholder tag like this:
[IMAGE: description of what image should show, related to the section above]

Example:
[IMAGE: peaceful sunrise over mountains representing hope and new beginnings]

These placeholders will be replaced with actual images. Make the descriptions specific to the article topic.` : '';

    return `Write a ${config.words} blog post in a ${tone} tone about: "${topic}"

TONE: ${toneInstruction}

LENGTH REQUIREMENT: This MUST be ${config.words}. This is a ${length.toUpperCase()} article - it should be ${config.description}.

${keywords && keywords.length > 0 ? `KEYWORDS TO INCLUDE: ${keywords.join(', ')}` : ''}

STRUCTURE:
1. Create a catchy, SEO-optimized headline (H1)
2. Write an engaging introduction that hooks the reader (2-3 paragraphs)
3. Create ${config.sections} main sections with H2 headings:
   - Each section should have 2-4 paragraphs
   - Include specific examples, data, or anecdotes
   - Use H3 subheadings within sections if needed
4. Write a compelling conclusion with a call-to-action
${imageInstruction}

FORMAT REQUIREMENTS:
- Use <h1> for the main title
- Use <h2> for section headings
- Use <h3> for subheadings within sections
- Use <p> for paragraphs (EACH paragraph should be 3-5 sentences)
- Use <strong> and <em> for emphasis
- Use <ul> or <ol> for lists (include at least 1 list)
- Use <blockquote> for any quotes

QUALITY REQUIREMENTS:
- Make each paragraph substantial (not just 1-2 sentences)
- Include specific examples, not generic statements
- Add value that readers can't find elsewhere
- End with actionable takeaways

CRITICAL: Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "title": "SEO-Optimized Blog Post Title",
  "content": "<article>Full HTML formatted article content here with all sections and image placeholders</article>",
  "summary": "2-3 sentence summary for meta description",
  "excerpt": "One compelling sentence excerpt for previews",
  "keywords": ["extracted", "seo", "keywords"],
  "readTime": "${length === 'short' ? '3' : length === 'medium' ? '6' : '10'} min read",
  "wordCount": ${length === 'short' ? '600' : length === 'medium' ? '1200' : '2500'},
  "sections": ["Section 1 Title", "Section 2 Title", "etc"],
  "imageSuggestions": ["Description for featured image based on title", "Description for inline image 1", "Description for inline image 2"]
}`;
  }

  /**
   * Generate website content
   */
  async generateWebsite(data) {
    const { websiteType, businessName, description, style, colors } = data;
    
    console.log('🎨 Starting website generation...');
    console.log(`📋 Type: ${websiteType}, Business: ${businessName}`);
    
    const prompt = this.buildWebsitePrompt({
      websiteType,
      businessName,
      description,
      style,
      colors
    });

    try {
      console.log('⚡ Using DeepSeek AI (primary)...');
      const result = await this.callDeepSeek(prompt);
      this.stats.deepseekSuccess++;
      console.log('✅ DeepSeek generation successful!');
      return this.parseResponse(result);
      
    } catch (deepseekError) {
      console.warn('⚠️ DeepSeek failed:', deepseekError.message);
      this.stats.deepseekFails++;
      
      try {
        console.log('🧠 Falling back to Claude...');
        const result = await this.callClaude(prompt);
        this.stats.claudeUsed++;
        console.log('✅ Claude generation successful!');
        return this.parseResponse(result);
        
      } catch (claudeError) {
        console.error('❌ Both AI services failed!');
        throw new Error('AI generation failed. Please try again.');
      }
    }
  }

  /**
   * Generate SEO metadata
   */
  async generateSEO(content) {
    const prompt = `Analyze this content and generate SEO metadata:

Content: ${content.substring(0, 500)}...

Return as JSON:
{
  "title": "SEO-optimized title (60 chars max)",
  "description": "Meta description (155 chars max)",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "slug": "url-friendly-slug"
}`;

    try {
      const result = await this.callDeepSeek(prompt);
      this.stats.deepseekSuccess++;
      return this.parseResponse(result);
    } catch (error) {
      console.warn('⚠️ DeepSeek failed for SEO, using Claude...');
      const result = await this.callClaude(prompt);
      this.stats.claudeUsed++;
      return this.parseResponse(result);
    }
  }

  /**
   * Call DeepSeek API (PRIMARY - Cheaper!)
   */
  async callDeepSeek(prompt) {
    if (!this.deepseekKey) {
      throw new Error('DeepSeek API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are an expert content creator, web developer, and SEO specialist. Generate professional, high-quality content in valid JSON format. Always ensure the content meets the specified length requirements.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 8192 // Increased for longer articles
        },
        {
          headers: {
            'Authorization': `Bearer ${this.deepseekKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000 // 2 minutes for long articles
        }
      );

      const inputCost = (response.data.usage?.prompt_tokens || 0) * 0.14 / 1000000;
      const outputCost = (response.data.usage?.completion_tokens || 0) * 0.28 / 1000000;
      this.stats.totalCost += (inputCost + outputCost);
      
      console.log(`💰 DeepSeek cost: $${(inputCost + outputCost).toFixed(6)}`);
      console.log(`📊 Tokens: ${response.data.usage?.prompt_tokens} in, ${response.data.usage?.completion_tokens} out`);

      return response.data.choices[0].message.content;
      
    } catch (error) {
      if (error.response) {
        console.error('DeepSeek API error:', error.response.status, error.response.data);
        throw new Error(`DeepSeek API error: ${error.response.status}`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('DeepSeek request timeout');
      } else {
        throw new Error(`DeepSeek error: ${error.message}`);
      }
    }
  }

  /**
   * Call Claude API (FALLBACK)
   */
  async callClaude(prompt) {
    if (!this.claudeKey) {
      throw new Error('Claude API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          temperature: 0.7,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        {
          headers: {
            'x-api-key': this.claudeKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }
      );

      const inputCost = (response.data.usage?.input_tokens || 0) * 3 / 1000000;
      const outputCost = (response.data.usage?.output_tokens || 0) * 15 / 1000000;
      this.stats.totalCost += (inputCost + outputCost);
      
      console.log(`💰 Claude cost: $${(inputCost + outputCost).toFixed(6)}`);

      return response.data.content[0].text;
      
    } catch (error) {
      if (error.response) {
        console.error('Claude API error:', error.response.status, error.response.data);
        throw new Error(`Claude API error: ${error.response.status}`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Claude request timeout');
      } else {
        throw new Error(`Claude error: ${error.message}`);
      }
    }
  }

  /**
   * Call OpenAI API (FALLBACK 2)
   */
  async callOpenAI(prompt) {
    if (!this.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert content creator. Generate professional content in valid JSON format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 8192
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }
      );

      return response.data.choices[0].message.content;
      
    } catch (error) {
      if (error.response) {
        console.error('OpenAI API error:', error.response.status, error.response.data);
        throw new Error(`OpenAI API error: ${error.response.status}`);
      }
      throw new Error(`OpenAI error: ${error.message}`);
    }
  }

  /**
   * Build website generation prompt
   */
  buildWebsitePrompt({ websiteType, businessName, description, style, colors }) {
    return `Generate a complete, professional ${websiteType} website for "${businessName}".

Business Description: ${description}
Design Style: ${style}
Color Scheme: ${colors}

Requirements:
1. Create a modern, responsive design
2. Include proper HTML5 structure
3. Add beautiful CSS styling
4. Make it mobile-friendly
5. Include SEO meta tags
6. Use semantic HTML
7. Add proper accessibility features

Generate the following pages:

**Homepage:**
- Eye-catching hero section with CTA
- Features/services section
- Testimonials/social proof
- Call-to-action sections
- Footer with contact info

**About Page:**
- Company story
- Mission & values
- Team section (placeholder)
- Timeline/milestones

**Contact Page:**
- Contact form (name, email, message)
- Contact information
- Social media links
- Map placeholder

**Styling:**
- Professional CSS with ${colors} color scheme
- ${style} design aesthetic
- Smooth transitions & animations
- Mobile-first responsive design
- Modern typography

CRITICAL: Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "pages": {
    "home": "<!DOCTYPE html><html>...</html>",
    "about": "<!DOCTYPE html><html>...</html>",
    "contact": "<!DOCTYPE html><html>...</html>"
  },
  "css": "/* Complete stylesheet */",
  "metadata": {
    "title": "Website Title",
    "description": "SEO description",
    "keywords": ["keyword1", "keyword2", "keyword3"]
  },
  "config": {
    "businessName": "${businessName}",
    "type": "${websiteType}",
    "style": "${style}",
    "colors": "${colors}"
  }
}`;
  }

  /**
   * Parse AI response
   */
  parseResponse(response) {
    try {
      let cleaned = response.trim();
      
      // Remove markdown code blocks if present
      cleaned = cleaned.replace(/^```json\s*\n?/i, '');
      cleaned = cleaned.replace(/^```\s*\n?/i, '');
      cleaned = cleaned.replace(/\n?```\s*$/i, '');
      cleaned = cleaned.trim();
      
      return JSON.parse(cleaned);
      
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Raw response (first 500 chars):', response.substring(0, 500));
      throw new Error('Invalid AI response format - please try again');
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      deepseekSuccessRate: this.stats.deepseekSuccess / (this.stats.deepseekSuccess + this.stats.deepseekFails) * 100 || 0,
      fallbackUsageRate: (this.stats.claudeUsed + this.stats.openaiUsed) / (this.stats.deepseekSuccess + this.stats.claudeUsed + this.stats.openaiUsed) * 100 || 0,
      totalCostUSD: this.stats.totalCost.toFixed(4)
    };
  }

  /**
   * Test AI connection
   */
  async testConnection() {
    const testPrompt = 'Respond with valid JSON: {"status": "working", "message": "AI service is ready!"}';
    
    const results = {
      deepseek: { status: 'not_tested' },
      claude: { status: 'not_tested' },
      openai: { status: 'not_tested' },
      stats: this.getStats()
    };

    // Test DeepSeek
    if (this.deepseekKey) {
      try {
        const deepseekResult = await this.callDeepSeek(testPrompt);
        results.deepseek = { 
          status: 'working', 
          response: deepseekResult,
          priority: 'PRIMARY (Cheapest)'
        };
      } catch (error) {
        results.deepseek = { 
          status: 'error', 
          error: error.message 
        };
      }
    }

    // Test Claude
    if (this.claudeKey) {
      try {
        const claudeResult = await this.callClaude(testPrompt);
        results.claude = { 
          status: 'working', 
          response: claudeResult,
          priority: 'FALLBACK 1'
        };
      } catch (error) {
        results.claude = { 
          status: 'error', 
          error: error.message 
        };
      }
    }

    // Test OpenAI
    if (this.openaiKey) {
      try {
        const openaiResult = await this.callOpenAI(testPrompt);
        results.openai = { 
          status: 'working', 
          response: openaiResult,
          priority: 'FALLBACK 2'
        };
      } catch (error) {
        results.openai = { 
          status: 'error', 
          error: error.message 
        };
      }
    }

    return results;
  }
}

module.exports = new AIService();
