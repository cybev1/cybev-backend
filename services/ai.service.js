// ============================================
// FILE: services/ai.service.js
// AI Service with Claude primary, DeepSeek fallback
// ============================================

const axios = require('axios');

class AIService {
  constructor() {
    this.claudeKey = process.env.ANTHROPIC_API_KEY;
    this.deepseekKey = process.env.DEEPSEEK_API_KEY;
    
    // Track which API is being used
    this.stats = {
      claudeSuccess: 0,
      claudeFails: 0,
      deepseekUsed: 0
    };
  }

  /**
   * Main generation method - tries Claude first, falls back to DeepSeek
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
      // Try Claude first (best quality)
      console.log('🧠 Trying Claude AI (primary)...');
      const result = await this.callClaude(prompt);
      this.stats.claudeSuccess++;
      console.log('✅ Claude generation successful!');
      return this.parseResponse(result);
      
    } catch (claudeError) {
      console.warn('⚠️ Claude failed:', claudeError.message);
      this.stats.claudeFails++;
      
      // Fallback to DeepSeek
      try {
        console.log('⚡ Falling back to DeepSeek...');
        const result = await this.callDeepSeek(prompt);
        this.stats.deepseekUsed++;
        console.log('✅ DeepSeek generation successful!');
        return this.parseResponse(result);
        
      } catch (deepseekError) {
        console.error('❌ Both AI services failed!');
        console.error('Claude error:', claudeError.message);
        console.error('DeepSeek error:', deepseekError.message);
        throw new Error('AI generation failed. Please try again.');
      }
    }
  }

  /**
   * Generate blog post content
   */
  async generateBlogPost(data) {
    const { topic, tone, length, keywords } = data;
    
    console.log('📝 Generating blog post...');
    console.log(`Topic: ${topic}, Tone: ${tone}, Length: ${length}`);
    
    const prompt = this.buildBlogPrompt({ topic, tone, length, keywords });

    try {
      // Try Claude first
      console.log('🧠 Using Claude for blog generation...');
      const result = await this.callClaude(prompt);
      this.stats.claudeSuccess++;
      return this.parseResponse(result);
      
    } catch (claudeError) {
      console.warn('⚠️ Claude failed, using DeepSeek...');
      this.stats.claudeFails++;
      
      const result = await this.callDeepSeek(prompt);
      this.stats.deepseekUsed++;
      return this.parseResponse(result);
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
      const result = await this.callClaude(prompt);
      return this.parseResponse(result);
    } catch (error) {
      const result = await this.callDeepSeek(prompt);
      return this.parseResponse(result);
    }
  }

  /**
   * Call Claude API
   */
  async callClaude(prompt) {
    if (!this.claudeKey) {
      throw new Error('Claude API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-5-sonnet-20241022',
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
          timeout: 60000 // 60 second timeout
        }
      );

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
   * Call DeepSeek API (fallback)
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
              content: 'You are an expert web developer and content creator. Generate professional, high-quality content.'
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
          timeout: 60000
        }
      );

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

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
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

Return ONLY valid JSON (no markdown, no code blocks):
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
      console.error('Raw response:', response.substring(0, 200));
      throw new Error('Invalid AI response format');
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      claudeSuccessRate: this.stats.claudeSuccess / (this.stats.claudeSuccess + this.stats.claudeFails) * 100 || 0,
      fallbackUsageRate: this.stats.deepseekUsed / (this.stats.claudeSuccess + this.stats.deepseekUsed) * 100 || 0
    };
  }

  /**
   * Test AI connection
   */
  async testConnection() {
    const testPrompt = 'Respond with: "AI service is working perfectly!" in a creative way.';
    
    try {
      const claudeResult = await this.callClaude(testPrompt);
      const deepseekResult = await this.callDeepSeek(testPrompt);
      
      return {
        claude: { status: 'working', response: claudeResult },
        deepseek: { status: 'working', response: deepseekResult },
        stats: this.getStats()
      };
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }
}

module.exports = new AIService();
