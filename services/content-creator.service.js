// ============================================
// FILE: services/content-creator.service.js
// PATH: cybev-backend/services/content-creator.service.js
// PURPOSE: Ultimate AI Content Creation Engine
// VERSION: 6.8.3 - Fixed JSON parse error with robust fallback
// PREVIOUS: 6.5.0 - Original version
// ROLLBACK: Check AI response format if issues persist
// GITHUB: https://github.com/cybev1/cybev-backend
// UPDATED: 2026-01-12
// ============================================

const axios = require('axios');

// Load AI Service
let aiService;
try {
  aiService = require('./ai.service');
  console.log('🤖 AI Service loaded from ai.service.js');
} catch (e) {
  console.log('⚠️ ai.service.js not found, using built-in AI');
  aiService = null;
}

class ContentCreatorService {
  constructor() {
    this.unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    this.pexelsKey = process.env.PEXELS_API_KEY;
    
    // AI API keys (fallback if ai.service not available)
    this.deepseekKey = process.env.DEEPSEEK_API_KEY;
    this.claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    
    console.log('🤖 AI Service initialized');
    console.log(`   DeepSeek: ${this.deepseekKey ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Claude: ${this.claudeKey ? '✅ Configured (Fallback)' : '❌ Not configured'}`);
    console.log(`   Pexels: ${this.pexelsKey ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Unsplash: ${this.unsplashKey ? '✅ Configured' : '❌ Not configured'}`);
  }

  // ==========================================
  // AI CALLING METHODS
  // ==========================================
  
  async callDeepSeek(prompt) {
    if (!this.deepseekKey) throw new Error('DeepSeek API key not configured');
    
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are an expert content creator. Generate professional, SEO-optimized content. ALWAYS respond with valid JSON only, no markdown code blocks.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.deepseekKey}`
      },
      timeout: 90000 // 90 seconds to avoid Cloudflare 524
    });
    
    return response.data.choices?.[0]?.message?.content || '';
  }
  
  async callClaude(prompt) {
    if (!this.claudeKey) throw new Error('Claude API key not configured');
    
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.claudeKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 90000 // 90 seconds to avoid Cloudflare 524
    });
    
    return response.data.content?.[0]?.text || '';
  }
  
  async callAI(prompt) {
    // Use ai.service.js if available (it handles DeepSeek -> Claude fallback)
    if (aiService?.callDeepSeek) {
      try {
        console.log('🤖 Using ai.service.js (DeepSeek primary)...');
        const result = await aiService.callDeepSeek(prompt);
        console.log('✅ DeepSeek response received');
        return result;
      } catch (e) {
        console.log('⚠️ DeepSeek failed:', e.message);
        // Try Claude via ai.service
        if (aiService?.callClaude) {
          try {
            console.log('🤖 Trying Claude via ai.service...');
            const result = await aiService.callClaude(prompt);
            console.log('✅ Claude response received');
            return result;
          } catch (e2) {
            console.log('⚠️ Claude also failed:', e2.message);
          }
        }
      }
    }
    
    // Direct fallback if ai.service not available
    if (this.deepseekKey) {
      try {
        console.log('🤖 Trying DeepSeek directly...');
        const result = await this.callDeepSeek(prompt);
        console.log('✅ DeepSeek response received');
        return result;
      } catch (error) {
        console.log('⚠️ DeepSeek failed:', error.message);
      }
    }
    
    if (this.claudeKey) {
      try {
        console.log('🤖 Trying Claude directly...');
        const result = await this.callClaude(prompt);
        console.log('✅ Claude response received');
        return result;
      } catch (error) {
        console.log('⚠️ Claude failed:', error.message);
      }
    }
    
    throw new Error('All AI providers failed. Please check API keys.');
  }
  
  // ==========================================
  // FIXED v6.8.3: Robust JSON parsing with multiple fallback strategies
  // ==========================================
  parseResponse(content) {
    if (!content || typeof content !== 'string') {
      console.warn('⚠️ Empty or invalid content received');
      return null;
    }

    // Strategy 1: Try direct JSON parse
    try {
      const direct = JSON.parse(content.trim());
      if (direct && direct.content) {
        console.log('✅ Direct JSON parse successful');
        return direct;
      }
    } catch (e) {
      // Continue to next strategy
    }

    // Strategy 2: Extract JSON from markdown code blocks
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed && parsed.content) {
          console.log('✅ JSON extracted from code block');
          return parsed;
        }
      }
    } catch (e) {
      // Continue to next strategy
    }

    // Strategy 3: Find JSON object anywhere in the string
    try {
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        // Clean up common issues
        let jsonStr = objectMatch[0]
          .replace(/[\r\n]+/g, ' ')  // Remove newlines
          .replace(/,\s*}/g, '}')    // Remove trailing commas
          .replace(/,\s*]/g, ']');   // Remove trailing commas in arrays
        
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.content) {
          console.log('✅ JSON object extracted from content');
          return parsed;
        }
      }
    } catch (e) {
      // Continue to next strategy
    }

    // Strategy 4: Try to find individual fields
    try {
      const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/);
      const contentMatch = content.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*})/);
      const summaryMatch = content.match(/"summary"\s*:\s*"([^"]+)"/);
      
      if (titleMatch && contentMatch) {
        console.log('✅ JSON fields extracted individually');
        return {
          title: titleMatch[1],
          content: contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          summary: summaryMatch ? summaryMatch[1] : '',
          keywords: [],
          readTime: '5 min'
        };
      }
    } catch (e) {
      // Continue to fallback
    }

    console.warn('⚠️ All JSON parsing strategies failed');
    return null;
  }

  // ==========================================
  // FIXED v6.8.3: Create fallback blog from raw AI content
  // ==========================================
  createFallbackBlog(rawContent, topic) {
    console.log('🔄 Creating fallback blog from raw content...');
    
    // Try to extract useful content from the raw response
    let content = rawContent;
    let title = topic;
    let summary = '';

    // Try to find a title (first line that looks like a title)
    const lines = rawContent.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      // First non-empty line might be the title
      const firstLine = lines[0].replace(/^#+\s*/, '').replace(/^\*+/, '').trim();
      if (firstLine.length > 10 && firstLine.length < 100) {
        title = firstLine;
      }
    }

    // Extract summary (first paragraph)
    const paragraphs = rawContent.split(/\n\n+/).filter(p => p.trim().length > 50);
    if (paragraphs.length > 0) {
      summary = paragraphs[0].replace(/^#+\s*/, '').substring(0, 200).trim();
      if (!summary.endsWith('.')) summary += '...';
    }

    // Clean up the content - convert to markdown if needed
    content = rawContent
      .replace(/<[^>]+>/g, '') // Remove any HTML tags
      .replace(/^```[\s\S]*?```$/gm, '') // Remove code blocks
      .trim();

    // If content is too short, use the raw content
    if (content.length < 100) {
      content = rawContent;
    }

    return {
      title: title.substring(0, 60),
      seoTitle: title.substring(0, 60),
      seoDescription: summary.substring(0, 160),
      slug: this.generateSlug(title),
      keywords: this.extractKeywords(topic),
      content: content,
      summary: summary,
      readTime: `${Math.max(3, Math.ceil(content.split(/\s+/).length / 200))} min`
    };
  }

  // Helper: Generate URL slug
  generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  // Helper: Extract keywords from topic
  extractKeywords(topic) {
    return topic
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 10);
  }

  // ==========================================
  // 🎨 CREATE COMPLETE BLOG POST WITH EVERYTHING
  // ==========================================
  async createCompleteBlog(data) {
    const { topic, description, tone, length, niche, targetAudience, seoTitle, seoDescription, seoHashtags } = data;
    
    console.log('📝 Creating complete blog post...');
    console.log(`   Topic: ${topic}`);
    console.log(`   Description: ${description || 'Not provided'}`);
    console.log(`   Niche: ${niche}`);
    
    try {
      // Step 1: Generate SEO-optimized content
      console.log('📝 Generating blog content...');
      const blogContent = await this.generateBlogWithSEO(topic, description, tone, length, niche, seoTitle, seoDescription, seoHashtags);
      
      // Step 2: Get featured image from Pexels/Unsplash
      console.log('🖼️ Fetching featured image...');
      let featuredImage;
      try {
        featuredImage = await this.getFeaturedImage(topic, niche);
        console.log(`✅ Featured image: ${featuredImage?.url || 'None'}`);
      } catch (imgError) {
        console.log('⚠️ Featured image failed:', imgError.message);
        featuredImage = { url: '', alt: topic, credit: {} };
      }
      
      // Step 3: Get content images
      console.log('🖼️ Fetching content images...');
      let contentImages = [];
      try {
        contentImages = await this.getContentImages(topic, 3);
        console.log(`✅ Got ${contentImages.length} content images`);
      } catch (imgError) {
        console.log('⚠️ Content images failed:', imgError.message);
      }
      
      // Step 4: Generate viral hashtags
      let hashtags = {};
      try {
        hashtags = await this.generateViralHashtags(topic, niche);
      } catch (hashError) {
        console.log('⚠️ Hashtag generation failed:', hashError.message);
        hashtags = { general: [`#${niche}`, '#blog', '#trending'] };
      }
      
      // Step 5: Embed images in content
      const contentWithImages = this.embedImagesInContent(blogContent.content, contentImages);
      
      // Calculate tokens
      let initialTokens = 50;
      if (contentWithImages.length > 2000) initialTokens = 75;
      if (contentWithImages.length > 4000) initialTokens = 100;
      if (blogContent.keywords?.length >= 5) initialTokens += 10;
      
      return {
        title: blogContent.title,
        content: contentWithImages,
        summary: blogContent.summary || '',
        
        seo: {
          title: blogContent.seoTitle || blogContent.title,
          description: blogContent.seoDescription || blogContent.summary || '',
          slug: blogContent.slug || this.generateSlug(blogContent.title),
          keywords: Array.isArray(blogContent.keywords) ? blogContent.keywords : []
        },
        
        featuredImage: featuredImage,
        
        hashtags: hashtags,
        
        readTime: blogContent.readTime || '5 min',
        
        initialTokens: initialTokens,
        viralityScore: Math.floor(Math.random() * 30) + 70
      };
      
    } catch (error) {
      console.error('❌ Blog creation error:', error);
      throw error;
    }
  }

  // ==========================================
  // 📝 Generate blog with SEO (MARKDOWN format)
  // FIXED v6.8.3: Added fallback for failed JSON parsing
  // ==========================================
  async generateBlogWithSEO(topic, description, tone, length, niche, seoTitle, seoDescription, seoHashtags) {
    const lengthMap = {
      'short': '800-1200',
      'medium': '1200-2000',
      'long': '2000-3000'
    };
    const wordRange = lengthMap[length] || '1200-2000';

    const prompt = `Create a ${wordRange} word SEO-optimized blog post.

Topic: ${topic}
${description ? `Additional context: ${description}` : ''}
Tone: ${tone || 'professional'}
Niche: ${niche}
${seoTitle ? `Preferred SEO Title: ${seoTitle}` : ''}
${seoDescription ? `Preferred Meta Description: ${seoDescription}` : ''}
${seoHashtags?.length ? `Include keywords: ${seoHashtags.join(', ')}` : ''}

IMPORTANT: Write in clean MARKDOWN format (NOT HTML):
- Use ## for main headings
- Use ### for subheadings
- Use **bold** for emphasis
- Use *italic* for subtle emphasis
- Use - for bullet lists
- Use > for blockquotes
- Separate paragraphs with blank lines
- Add [IMAGE: description] placeholders where images should go

Requirements:
1. SEO-Optimized Title (under 60 chars)
2. Meta Description (150-160 chars)
3. URL Slug (lowercase, hyphens)
4. 10-15 relevant keywords
5. Content with 5-7 sections using ## headings
6. Engaging intro with hook
7. Strong conclusion with CTA
8. Include 2-3 [IMAGE: description] placeholders

RESPOND WITH VALID JSON ONLY (no markdown code blocks):
{
  "title": "Blog title (60 chars max)",
  "seoTitle": "SEO optimized title",
  "seoDescription": "Meta description 150-160 chars",
  "slug": "seo-friendly-url-slug",
  "keywords": ["keyword1", "keyword2"],
  "content": "Full MARKDOWN content with ## headings and [IMAGE:] placeholders",
  "summary": "2-3 sentence summary",
  "readTime": "X min"
}`;

    try {
      const result = await this.callAI(prompt);
      const parsed = this.parseResponse(result);
      
      if (parsed && parsed.content) {
        // Clean any HTML that might have been generated
        parsed.content = this.cleanHtmlToMarkdown(parsed.content);
        return parsed;
      }
      
      // FIXED v6.8.3: Use fallback instead of throwing error
      console.log('⚠️ JSON parsing failed, using fallback...');
      const fallback = this.createFallbackBlog(result, topic);
      return fallback;
      
    } catch (error) {
      console.error('Blog generation error:', error);
      throw error;
    }
  }

  // ==========================================
  // 🖼️ Get featured image (Pexels PRIMARY)
  // ==========================================
  async getFeaturedImage(topic, niche) {
    try {
      const query = `${niche} ${topic}`.trim().slice(0, 100);
      console.log(`   Searching images for: "${query}"`);
      
      // Try Pexels FIRST (user has this configured and working)
      if (this.pexelsKey) {
        try {
          console.log('   📷 Trying Pexels (primary)...');
          const response = await axios.get('https://api.pexels.com/v1/search', {
            params: {
              query: query,
              per_page: 1,
              orientation: 'landscape'
            },
            headers: {
              'Authorization': this.pexelsKey
            },
            timeout: 15000
          });
          
          if (response.data.photos && response.data.photos.length > 0) {
            const photo = response.data.photos[0];
            console.log('   ✅ Pexels image found!');
            return {
              url: photo.src.large2x || photo.src.large || photo.src.original,
              thumbnail: photo.src.medium,
              alt: photo.alt || query,
              credit: {
                photographer: photo.photographer,
                photographerUrl: photo.photographer_url,
                source: 'Pexels',
                sourceUrl: photo.url
              }
            };
          }
        } catch (pexelsError) {
          console.log('   ⚠️ Pexels failed:', pexelsError.message);
        }
      }
      
      // Try Unsplash as fallback
      if (this.unsplashKey) {
        try {
          console.log('   📷 Trying Unsplash (fallback)...');
          const response = await axios.get('https://api.unsplash.com/search/photos', {
            params: {
              query: query,
              per_page: 1,
              orientation: 'landscape'
            },
            headers: {
              'Authorization': `Client-ID ${this.unsplashKey}`
            },
            timeout: 15000
          });
          
          if (response.data.results && response.data.results.length > 0) {
            const photo = response.data.results[0];
            console.log('   ✅ Unsplash image found!');
            return {
              url: photo.urls.regular,
              thumbnail: photo.urls.small,
              alt: photo.alt_description || query,
              credit: {
                photographer: photo.user.name,
                photographerUrl: photo.user.links.html,
                source: 'Unsplash',
                sourceUrl: photo.links.html
              }
            };
          }
        } catch (unsplashError) {
          console.log('   ⚠️ Unsplash failed:', unsplashError.message);
        }
      }
      
      // Return placeholder
      console.log('   ⚠️ No image found, using placeholder');
      return {
        url: `https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200`,
        thumbnail: `https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400`,
        alt: topic,
        credit: {
          photographer: 'Unsplash',
          photographerUrl: 'https://unsplash.com',
          source: 'Unsplash',
          sourceUrl: 'https://unsplash.com'
        }
      };
    } catch (error) {
      console.error('Image fetch error:', error);
      return {
        url: '',
        alt: topic,
        credit: {}
      };
    }
  }

  // ==========================================
  // 🖼️ Get content images
  // ==========================================
  async getContentImages(topic, count = 3) {
    const images = [];
    
    try {
      if (this.pexelsKey) {
        const response = await axios.get('https://api.pexels.com/v1/search', {
          params: {
            query: topic,
            per_page: count,
            orientation: 'landscape'
          },
          headers: {
            'Authorization': this.pexelsKey
          },
          timeout: 15000
        });
        
        if (response.data.photos) {
          for (const photo of response.data.photos) {
            images.push({
              url: photo.src.large,
              alt: photo.alt || topic,
              credit: `Photo by ${photo.photographer} on Pexels`
            });
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Content images error:', error.message);
    }
    
    return images;
  }

  // ==========================================
  // 🏷️ Generate viral hashtags
  // ==========================================
  async generateViralHashtags(topic, niche) {
    try {
      const prompt = `Generate 15 viral hashtags for a blog about "${topic}" in the ${niche} niche.

Return ONLY valid JSON (no markdown):
{
  "trending": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "niche": ["#hashtag4", "#hashtag5", "#hashtag6"],
  "general": ["#hashtag7", "#hashtag8", "#hashtag9"],
  "engagement": ["#hashtag10", "#hashtag11", "#hashtag12"],
  "branded": ["#hashtag13", "#hashtag14", "#hashtag15"]
}`;

      const result = await this.callAI(prompt);
      const parsed = this.parseResponse(result);
      
      if (parsed) {
        return parsed;
      }
      
      // Fallback hashtags
      return {
        trending: [`#${niche}`, '#trending', '#viral'],
        niche: [`#${niche}life`, `#${niche}tips`, `#${niche}content`],
        general: ['#blog', '#content', '#creator'],
        engagement: ['#follow', '#share', '#like'],
        branded: ['#cybev', '#cybevio', '#createwithcybev']
      };
    } catch (error) {
      console.log('⚠️ Hashtag generation error:', error.message);
      return {
        general: [`#${niche}`, '#blog', '#trending', '#content', '#creator']
      };
    }
  }

  // ==========================================
  // 🖼️ Embed images in content
  // ==========================================
  embedImagesInContent(content, images) {
    if (!images || images.length === 0) return content;
    
    let result = content;
    let imageIndex = 0;
    
    // Replace [IMAGE: description] placeholders
    result = result.replace(/\[IMAGE:\s*([^\]]+)\]/gi, (match, description) => {
      if (imageIndex < images.length) {
        const img = images[imageIndex];
        imageIndex++;
        return `\n\n![${img.alt || description}](${img.url})\n*${img.credit || ''}*\n\n`;
      }
      return match;
    });
    
    return result;
  }

  // ==========================================
  // 🧹 Clean HTML to Markdown
  // ==========================================
  cleanHtmlToMarkdown(content) {
    if (!content) return '';
    
    return content
      // Convert headers
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      // Convert text formatting
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      // Convert lists
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      // Convert paragraphs and breaks
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Convert links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      // Convert blockquotes
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
      // Remove remaining tags
      .replace(/<[^>]+>/g, '')
      // Clean up
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

module.exports = new ContentCreatorService();
