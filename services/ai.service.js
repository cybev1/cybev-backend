// ============================================
// FILE: services/ai.service.js
// AI Service with DeepSeek PRIMARY, Claude fallback
// Optimized for cost savings
// ============================================

const axios = require('axios');

class AIService {
  constructor() {
    this.deepseekKey = process.env.DEEPSEEK_API_KEY;
    this.claudeKey = process.env.ANTHROPIC_API_KEY;
    
    // Track which API is being used
    this.stats = {
      deepseekSuccess: 0,
      deepseekFails: 0,
      claudeUsed: 0,
      totalCost: 0
    };

    console.log('🤖 AI Service initialized');
    console.log(`   DeepSeek: ${this.deepseekKey ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Claude: ${this.claudeKey ? '✅ Configured (Fallback)' : '❌ Missing'}`);
  }

  /**
   * Main generation method - DeepSeek PRIMARY, Claude fallback
   * DeepSeek is much cheaper and you have balance!
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
      // Try DeepSeek FIRST (cheaper & you have balance!)
      console.log('⚡ Using DeepSeek AI (primary - cheaper)...');
      const result = await this.callDeepSeek(prompt);
      this.stats.deepseekSuccess++;
      console.log('✅ DeepSeek generation successful!');
      return this.parseResponse(result);
      
    } catch (deepseekError) {
      console.warn('⚠️ DeepSeek failed:', deepseekError.message);
      this.stats.deepseekFails++;
      
      // Fallback to Claude (expensive but reliable)
      try {
        console.log('🧠 Falling back to Claude (expensive fallback)...');
        const result = await this.callClaude(prompt);
        this.stats.claudeUsed++;
        console.log('✅ Claude generation successful!');
        return this.parseResponse(result);
        
      } catch (claudeError) {
        console.error('❌ Both AI services failed!');
        console.error('DeepSeek error:', deepseekError.message);
        console.error('Claude error:', claudeError.message);
        throw new Error('AI generation failed. Please try again.');
      }
    }
  }

  /**
   * Generate blog post content - DeepSeek primary
   */
  async generateBlogPost(data) {
    const { topic, tone, length, keywords } = data;
    
    console.log('📝 Generating blog post...');
    console.log(`Topic: ${topic}, Tone: ${tone}, Length: ${length}`);
    
    const prompt = this.buildBlogPrompt({ topic, tone, length, keywords });

    try {
      // Try DeepSeek first (cheaper!)
      console.log('⚡ Using DeepSeek for blog generation...');
      const result = await this.callDeepSeek(prompt);
      this.stats.deepseekSuccess++;
      return this.parseResponse(result);
      
    } catch (deepseekError) {
      console.warn('⚠️ DeepSeek failed, using Claude (expensive)...');
      this.stats.deepseekFails++;
      
      const result = await this.callClaude(prompt);
      this.stats.claudeUsed++;
      return this.parseResponse(result);
    }
  }

  /**
   * Generate SEO metadata - DeepSeek primary
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
              content: 'You are an expert web developer and content creator. Generate professional, high-quality content in valid JSON format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 4096
        },
        {
          headers: {
            'Authorization': `Bearer ${this.deepseekKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 90000 // 90 second timeout
        }
      );

      // Estimate cost (DeepSeek is ~$0.14 per 1M input tokens, $0.28 per 1M output tokens)
      const inputCost = (response.data.usage?.prompt_tokens || 0) * 0.14 / 1000000;
      const outputCost = (response.data.usage?.completion_tokens || 0) * 0.28 / 1000000;
      this.stats.totalCost += (inputCost + outputCost);
      
      console.log(`💰 DeepSeek cost: $${(inputCost + outputCost).toFixed(6)}`);

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
   * Call Claude API (FALLBACK - Expensive!)
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
          max_tokens: 4096,
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
          timeout: 90000 // 90 second timeout
        }
      );

      // Estimate cost (Claude Sonnet 4 is ~$3 per 1M input tokens, $15 per 1M output tokens)
      const inputCost = (response.data.usage?.input_tokens || 0) * 3 / 1000000;
      const outputCost = (response.data.usage?.output_tokens || 0) * 15 / 1000000;
      this.stats.totalCost += (inputCost + outputCost);
      
      console.log(`💰 Claude cost: $${(inputCost + outputCost).toFixed(6)} (EXPENSIVE!)`);

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

CRITICAL: Return ONLY valid JSON in this exact format (no markdown, no code blocks, no extra text):
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
   * Build blog post generation prompt
   */
  buildBlogPrompt({ topic, tone, length, keywords }) {
    const lengthMap = {
      'short': '500-800 words',
      'medium': '800-1500 words',
      'long': '1500+ words'
    };

    return `Write a ${lengthMap[length]} blog post in a ${tone} tone about: ${topic}

${keywords && keywords.length > 0 ? `Keywords to include: ${keywords.join(', ')}` : ''}

Structure:
1. Catchy, SEO-optimized headline
2. Engaging introduction (hook + context)
3. Main content with 3-5 sections (use H2 headings)
4. Each section should have:
   - Clear subheading
   - 2-3 paragraphs
   - Examples or data when relevant
5. Compelling conclusion with CTA
6. Proper HTML formatting

Format:
- Use <h1> for title
- Use <h2> for section headings
- Use <p> for paragraphs
- Use <strong> and <em> for emphasis
- Use <ul>/<ol> for lists
- Keep paragraphs concise (3-4 sentences)

CRITICAL: Return ONLY valid JSON (no markdown, no code blocks, no extra text):
{
  "title": "Blog Post Title",
  "content": "<article>HTML formatted content</article>",
  "summary": "2-3 sentence summary",
  "keywords": ["extracted", "keywords"],
  "readTime": "X min read",
  "category": "Suggested category"
}`;
  }

  /**
   * Parse AI response (handles both JSON and markdown-wrapped JSON)
   */
  parseResponse(response) {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.trim();
      
      // Remove ```json or ``` wrappers
      cleaned = cleaned.replace(/^```json\s*\n?/i, '');
      cleaned = cleaned.replace(/^```\s*\n?/i, '');
      cleaned = cleaned.replace(/\n?```\s*$/i, '');
      cleaned = cleaned.trim();
      
      // Parse JSON
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
      fallbackUsageRate: this.stats.claudeUsed / (this.stats.deepseekSuccess + this.stats.claudeUsed) * 100 || 0,
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
      stats: this.getStats()
    };

    // Test DeepSeek
    try {
      const deepseekResult = await this.callDeepSeek(testPrompt);
      results.deepseek = { 
        status: 'working', 
        response: deepseekResult,
        priority: 'PRIMARY (Cheaper)'
      };
    } catch (error) {
      results.deepseek = { 
        status: 'error', 
        error: error.message 
      };
    }

    // Test Claude
    try {
      const claudeResult = await this.callClaude(testPrompt);
      results.claude = { 
        status: 'working', 
        response: claudeResult,
        priority: 'FALLBACK (Expensive)'
      };
    } catch (error) {
      results.claude = { 
        status: 'error', 
        error: error.message 
      };
    }

    return results;
  }
}

module.exports = new AIService();
