// ============================================
// FILE: services/content-creator.service.js
// Ultimate AI Content Creation Engine
// FIXED: Pexels integration restored, uses ai.service.js
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
        { role: 'system', content: 'You are an expert content creator. Generate professional, SEO-optimized content in valid JSON format.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.deepseekKey}`
      },
      timeout: 120000
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
      timeout: 120000
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
  
  parseResponse(content) {
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
      const featuredImage = await this.getFeaturedImage(topic, niche);
      console.log(`✅ Featured image: ${featuredImage.url}`);
      
      // Step 3: Get content images
      console.log('🖼️ Fetching content images...');
      const contentImages = await this.getContentImages(topic, 3);
      console.log(`✅ Got ${contentImages.length} content images`);
      
      // Step 4: Generate viral hashtags
      const hashtags = await this.generateViralHashtags(topic, niche);
      
      // Step 5: Embed images in content
      const contentWithImages = this.embedImagesInContent(blogContent.content, contentImages);
      
      // Calculate tokens
      let initialTokens = 50;
      if (contentWithImages.length > 2000) initialTokens = 75;
      if (contentWithImages.length > 4000) initialTokens = 100;
      if (blogContent.keywords?.length >= 5) initialTokens += 10;
      if (featuredImage.url && !featuredImage.url.includes('source.unsplash')) initialTokens += 10;
      
      console.log('✅ Complete blog created with images!');
      
      return {
        title: blogContent.title,
        content: contentWithImages,
        summary: blogContent.summary || blogContent.seoDescription,
        excerpt: blogContent.summary || blogContent.seoDescription,
        
        seo: {
          title: blogContent.seoTitle || seoTitle || blogContent.title,
          description: blogContent.seoDescription || seoDescription || blogContent.summary,
          slug: blogContent.slug,
          keywords: blogContent.keywords || seoHashtags || []
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

  // ==========================================
  // 📝 Generate blog with SEO (MARKDOWN format)
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

Return as JSON:
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
      
      throw new Error('Failed to parse AI response');
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
              alt: photo.alt || topic,
              credit: {
                photographer: photo.photographer,
                photographerUrl: photo.photographer_url,
                source: 'Pexels'
              }
            };
          } else {
            console.log('   ⚠️ Pexels returned no results');
          }
        } catch (pexelsError) {
          console.log('   ⚠️ Pexels error:', pexelsError.message);
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
              alt: photo.alt_description || topic,
              credit: {
                photographer: photo.user.name,
                photographerUrl: photo.user.links.html,
                source: 'Unsplash'
              }
            };
          }
        } catch (unsplashError) {
          console.log('   ⚠️ Unsplash error:', unsplashError.message);
        }
      }
      
      // Ultimate fallback: source.unsplash.com (no API key needed)
      console.log('   📷 Using source.unsplash.com fallback...');
      const fallbackUrl = `https://source.unsplash.com/1200x630/?${encodeURIComponent(query)}`;
      return {
        url: fallbackUrl,
        thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(query)}`,
        alt: topic,
        credit: { source: 'Unsplash' }
      };
      
    } catch (error) {
      console.error('   ❌ Image fetch error:', error.message);
      return {
        url: `https://source.unsplash.com/1200x630/?${encodeURIComponent(topic)}`,
        thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(topic)}`,
        alt: topic,
        credit: { source: 'Unsplash' }
      };
    }
  }

  // ==========================================
  // 🖼️ Get multiple content images
  // ==========================================
  async getContentImages(topic, count = 3) {
    const images = [];
    
    try {
      // Try Pexels first
      if (this.pexelsKey) {
        try {
          console.log('   📷 Fetching content images from Pexels...');
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
            response.data.photos.forEach(photo => {
              images.push({
                url: photo.src.large || photo.src.medium,
                thumbnail: photo.src.small,
                alt: photo.alt || topic,
                credit: {
                  photographer: photo.photographer,
                  source: 'Pexels'
                }
              });
            });
            console.log(`   ✅ Got ${images.length} images from Pexels`);
          }
        } catch (e) {
          console.log('   ⚠️ Pexels content images error:', e.message);
        }
      }
      
      // Fill with Unsplash if needed
      if (images.length < count && this.unsplashKey) {
        try {
          const remaining = count - images.length;
          const response = await axios.get('https://api.unsplash.com/search/photos', {
            params: {
              query: topic,
              per_page: remaining,
              orientation: 'landscape'
            },
            headers: {
              'Authorization': `Client-ID ${this.unsplashKey}`
            },
            timeout: 15000
          });
          
          if (response.data.results) {
            response.data.results.forEach(photo => {
              images.push({
                url: photo.urls.regular,
                thumbnail: photo.urls.small,
                alt: photo.alt_description || topic,
                credit: {
                  photographer: photo.user.name,
                  source: 'Unsplash'
                }
              });
            });
          }
        } catch (e) {
          console.log('   ⚠️ Unsplash content images error:', e.message);
        }
      }
      
      // Fill remaining with source.unsplash.com
      while (images.length < count) {
        const idx = images.length;
        images.push({
          url: `https://source.unsplash.com/800x600/?${encodeURIComponent(topic)},${idx}`,
          thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(topic)},${idx}`,
          alt: topic,
          credit: { source: 'Unsplash' }
        });
      }
      
      return images;
      
    } catch (error) {
      console.error('Content images error:', error.message);
      return Array(count).fill(null).map((_, i) => ({
        url: `https://source.unsplash.com/800x600/?${encodeURIComponent(topic)},${i}`,
        thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(topic)},${i}`,
        alt: topic,
        credit: { source: 'Unsplash' }
      }));
    }
  }

  // ==========================================
  // 🔥 Generate viral hashtags
  // ==========================================
  async generateViralHashtags(topic, niche) {
    try {
      const prompt = `Generate 10 viral hashtags for "${topic}" in ${niche}. Return JSON array: ["#hashtag1", "#hashtag2", ...]`;
      const result = await this.callAI(prompt);
      const parsed = this.parseResponse(result);
      
      if (Array.isArray(parsed)) return parsed;
      if (parsed?.hashtags) return parsed.hashtags;
      
      return this.getDefaultHashtags(topic, niche);
    } catch (error) {
      return this.getDefaultHashtags(topic, niche);
    }
  }
  
  getDefaultHashtags(topic, niche) {
    const topicTag = topic.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
    return [
      `#${niche}`,
      `#${topicTag}`,
      '#blogging',
      '#contentcreator',
      '#web3',
      '#CYBEV',
      '#viral',
      '#trending'
    ];
  }

  // ==========================================
  // 🎨 Embed images in content
  // ==========================================
  embedImagesInContent(content, images) {
    if (!content || !images?.length) return content;
    
    let modifiedContent = content;
    
    // Replace [IMAGE: description] placeholders
    const placeholders = content.match(/\[IMAGE:[^\]]*\]/g) || [];
    
    placeholders.forEach((placeholder, index) => {
      if (images[index]) {
        const img = images[index];
        const imgMarkdown = `\n\n![${img.alt}](${img.url})\n*Photo: ${img.credit?.photographer || img.credit?.source || 'Stock'}*\n\n`;
        modifiedContent = modifiedContent.replace(placeholder, imgMarkdown);
      }
    });
    
    // If no placeholders, insert after headings
    if (placeholders.length === 0 && images.length > 0) {
      const lines = modifiedContent.split('\n');
      const newLines = [];
      let imageIndex = 0;
      let headingCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        newLines.push(lines[i]);
        
        // Insert image after every 2nd ## heading
        if (lines[i].startsWith('## ') && !lines[i].startsWith('## Introduction')) {
          headingCount++;
          if (headingCount % 2 === 0 && imageIndex < images.length) {
            const img = images[imageIndex];
            newLines.push('');
            newLines.push(`![${img.alt}](${img.url})`);
            newLines.push(`*Photo: ${img.credit?.source || 'Stock'}*`);
            newLines.push('');
            imageIndex++;
          }
        }
      }
      
      modifiedContent = newLines.join('\n');
    }
    
    return modifiedContent;
  }

  // ==========================================
  // 🔄 Clean HTML to Markdown
  // ==========================================
  cleanHtmlToMarkdown(html) {
    if (!html) return '';
    
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<article[^>]*>/gi, '')
      .replace(/<\/article>/gi, '')
      .replace(/<section[^>]*>/gi, '')
      .replace(/<\/section>/gi, '')
      .replace(/<div[^>]*>/gi, '')
      .replace(/<\/div>/gi, '\n')
      .replace(/<span[^>]*>/gi, '')
      .replace(/<\/span>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ==========================================
  // 📊 Calculate read time
  // ==========================================
  calculateReadTime(content) {
    const text = content.replace(/[#*_\[\]()!]/g, '').replace(/!\[.*?\]\(.*?\)/g, '');
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const minutes = Math.ceil(wordCount / 200);
    return `${minutes} min`;
  }
}

module.exports = new ContentCreatorService();
