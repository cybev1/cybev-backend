// ============================================
// FILE: services/content-creator.service.js
// Ultimate AI Content Creation Engine
// ============================================

const axios = require('axios');
const aiService = require('./ai.service');

class ContentCreatorService {
  constructor() {
    this.unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    this.pexelsKey = process.env.PEXELS_API_KEY;
  }

  /**
   * 🎨 CREATE COMPLETE BLOG POST WITH EVERYTHING
   * - AI-generated content
   * - SEO optimization (title, description, slug, keywords)
   * - Featured image from Unsplash/Pexels
   * - Viral hashtags
   * - Demo images in content
   * - NFT metadata ready
   */
  async createCompleteBlog(data) {
    const { topic, tone, length, niche, targetAudience } = data;
    
    console.log('📝 Creating complete blog post...');
    console.log(`   Topic: ${topic}`);
    console.log(`   Niche: ${niche}`);
    console.log(`   Target: ${targetAudience}`);
    
    try {
      // Step 1: Generate SEO-optimized content
      const blogContent = await this.generateBlogWithSEO(topic, tone, length, niche);
      
      // Step 2: Get featured image
      const featuredImage = await this.getFeaturedImage(topic, niche);
      
      // Step 3: Generate viral hashtags
      const hashtags = await this.generateViralHashtags(topic, niche);
      
      // Step 4: Get content images
      const contentImages = await this.getContentImages(topic, 3);
      
      // Step 5: Create NFT metadata
      const nftMetadata = this.createNFTMetadata(blogContent, featuredImage);
      
      console.log('✅ Complete blog created!');
      
      return {
        // Content
        title: blogContent.title,
        content: this.embedImagesInContent(blogContent.content, contentImages),
        summary: blogContent.summary,
        
        // SEO
        seo: {
          title: blogContent.seoTitle,
          description: blogContent.seoDescription,
          slug: blogContent.slug,
          keywords: blogContent.keywords,
          metaTags: blogContent.metaTags
        },
        
        // Images
        featuredImage: featuredImage,
        contentImages: contentImages,
        
        // Virality
        hashtags: hashtags,
        shareText: this.generateShareText(blogContent.title, topic),
        
        // Blockchain
        nftMetadata: nftMetadata,
        mintReady: true,
        
        // Analytics
        readTime: this.calculateReadTime(blogContent.content),
        category: niche,
        targetAudience: targetAudience,
        
        // Monetization
        stakingEligible: true,
        initialTokens: 50,
        viralityScore: this.calculateViralityScore(blogContent, hashtags)
      };
      
    } catch (error) {
      console.error('❌ Blog creation error:', error);
      throw new Error('Failed to create complete blog post');
    }
  }

  /**
   * 🎨 GENERATE WEBSITE TEMPLATE WITH DEMO CONTENT
   * - Complete HTML/CSS
   * - Demo images from Unsplash
   * - SEO-optimized
   * - NFT mintable
   */
  async generateTemplateWithDemo(data) {
    const { 
      templateType, 
      businessName, 
      description, 
      style, 
      colors, 
      niche 
    } = data;
    
    console.log('🏗️ Generating template with demo content...');
    
    try {
      // Step 1: Generate base template
      const template = await aiService.generateWebsite({
        websiteType: templateType,
        businessName,
        description,
        style,
        colors
      });
      
      // Step 2: Get demo images for template
      const demoImages = await this.getTemplateImages(niche, 10);
      
      // Step 3: Inject demo images into template
      const templatedWithImages = this.injectDemoImages(template, demoImages);
      
      // Step 4: Generate SEO for each page
      const seoData = await this.generateTemplateSEO(
        businessName, 
        description, 
        niche,
        templatedWithImages.pages
      );
      
      // Step 5: Create demo blog posts
      const demoPosts = await this.generateDemoPosts(niche, 3);
      
      console.log('✅ Template with demo content created!');
      
      return {
        ...templatedWithImages,
        seo: seoData,
        demoPosts: demoPosts,
        demoImages: demoImages,
        nftMetadata: this.createTemplateNFTMetadata(templatedWithImages, businessName),
        mintReady: true,
        stakingEligible: true,
        initialTokens: 100
      };
      
    } catch (error) {
      console.error('❌ Template generation error:', error);
      throw new Error('Failed to generate template with demo content');
    }
  }

  /**
   * 📝 Generate blog with complete SEO
   */
  async generateBlogWithSEO(topic, tone, length, niche) {
    const lengthMap = {
      'short': '800-1200',
      'medium': '1200-2000',
      'long': '2000-3000'
    };

    const prompt = `Create a ${lengthMap[length]} word SEO-optimized blog post.

Topic: ${topic}
Tone: ${tone}
Niche: ${niche}

Requirements:
1. **SEO-Optimized Title**: Catchy, keyword-rich, under 60 characters
2. **SEO Meta Description**: Compelling, 150-160 characters
3. **URL Slug**: SEO-friendly, lowercase, hyphens
4. **Keywords**: 10-15 relevant SEO keywords
5. **Content Structure**:
   - Engaging introduction with hook
   - 5-7 sections with H2 headings (keyword-rich)
   - Each section 2-3 paragraphs
   - Include lists, tips, examples
   - Strong conclusion with CTA
6. **HTML Formatting**: Use <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em>
7. **Internal linking points**: Mark with [LINK: text]
8. **Image placeholders**: Mark with [IMAGE: description]

Return as JSON:
{
  "title": "Main blog title (60 chars max)",
  "seoTitle": "SEO optimized title with primary keyword",
  "seoDescription": "Compelling meta description 150-160 chars",
  "slug": "seo-friendly-url-slug",
  "keywords": ["keyword1", "keyword2", ...],
  "content": "<article>Full HTML content with h2, h3, p, ul, strong, em tags</article>",
  "summary": "2-3 sentence summary",
  "metaTags": {
    "ogTitle": "Open Graph title",
    "ogDescription": "OG description",
    "twitterCard": "summary_large_image"
  },
  "readTime": "X min",
  "category": "Primary category"
}`;

    try {
      const result = await aiService.callClaude(prompt);
      return aiService.parseResponse(result);
    } catch (error) {
      console.warn('Claude failed, using DeepSeek...');
      const result = await aiService.callDeepSeek(prompt);
      return aiService.parseResponse(result);
    }
  }

  /**
   * 🖼️ Get featured image from Unsplash
   */
  async getFeaturedImage(topic, niche) {
    try {
      const query = `${niche} ${topic}`.trim();
      
      // Try Unsplash first
      if (this.unsplashKey) {
        const response = await axios.get('https://api.unsplash.com/search/photos', {
          params: {
            query: query,
            per_page: 1,
            orientation: 'landscape'
          },
          headers: {
            'Authorization': `Client-ID ${this.unsplashKey}`
          }
        });
        
        if (response.data.results[0]) {
          const photo = response.data.results[0];
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
      }
      
      // Fallback to Pexels
      if (this.pexelsKey) {
        const response = await axios.get('https://api.pexels.com/v1/search', {
          params: {
            query: query,
            per_page: 1,
            orientation: 'landscape'
          },
          headers: {
            'Authorization': this.pexelsKey
          }
        });
        
        if (response.data.photos[0]) {
          const photo = response.data.photos[0];
          return {
            url: photo.src.large,
            thumbnail: photo.src.medium,
            alt: query,
            credit: {
              photographer: photo.photographer,
              photographerUrl: photo.photographer_url,
              source: 'Pexels'
            }
          };
        }
      }
      
      // Ultimate fallback: placeholder
      return {
        url: `https://source.unsplash.com/1200x630/?${encodeURIComponent(query)}`,
        thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(query)}`,
        alt: topic,
        credit: {
          source: 'Unsplash Random'
        }
      };
      
    } catch (error) {
      console.error('Image fetch error:', error.message);
      return {
        url: `https://source.unsplash.com/1200x630/?${encodeURIComponent(topic)}`,
        thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(topic)}`,
        alt: topic,
        credit: { source: 'Unsplash' }
      };
    }
  }

  /**
   * 🖼️ Get multiple content images
   */
  async getContentImages(topic, count = 3) {
    const images = [];
    
    try {
      if (this.unsplashKey) {
        const response = await axios.get('https://api.unsplash.com/search/photos', {
          params: {
            query: topic,
            per_page: count,
            orientation: 'landscape'
          },
          headers: {
            'Authorization': `Client-ID ${this.unsplashKey}`
          }
        });
        
        response.data.results.forEach(photo => {
          images.push({
            url: photo.urls.regular,
            thumbnail: photo.urls.small,
            alt: photo.alt_description || topic,
            credit: {
              photographer: photo.user.name,
              photographerUrl: photo.user.links.html
            }
          });
        });
      }
      
      // Fill remaining with placeholders if needed
      while (images.length < count) {
        images.push({
          url: `https://source.unsplash.com/800x600/?${encodeURIComponent(topic)},${images.length}`,
          thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(topic)},${images.length}`,
          alt: topic
        });
      }
      
      return images;
      
    } catch (error) {
      // Return placeholders on error
      return Array(count).fill(null).map((_, i) => ({
        url: `https://source.unsplash.com/800x600/?${encodeURIComponent(topic)},${i}`,
        thumbnail: `https://source.unsplash.com/400x300/?${encodeURIComponent(topic)},${i}`,
        alt: topic
      }));
    }
  }

  /**
   * 🔥 Generate viral hashtags
   */
  async generateViralHashtags(topic, niche) {
    const prompt = `Generate 15 viral hashtags for a blog post about "${topic}" in the ${niche} niche.

Requirements:
- Mix of popular and niche-specific hashtags
- Include trending hashtags
- Variety of specificity (broad to specific)
- Mix of short and long hashtags

Return as JSON:
{
  "primary": ["hashtag1", "hashtag2", "hashtag3"],
  "secondary": ["hashtag4", "hashtag5", "hashtag6"],
  "trending": ["hashtag7", "hashtag8", "hashtag9"],
  "niche": ["hashtag10", "hashtag11", "hashtag12"],
  "viral": ["hashtag13", "hashtag14", "hashtag15"]
}`;

    try {
      const result = await aiService.callDeepSeek(prompt);
      return aiService.parseResponse(result);
    } catch (error) {
      // Fallback hashtags
      return {
        primary: [`#${niche}`, `#${topic.replace(/\s+/g, '')}`, '#blogging'],
        secondary: ['#contentcreator', '#web3', '#blockchain'],
        trending: ['#viral', '#trending', '#mustread'],
        niche: [`#${niche}Tips`, `#${niche}Life`, `#${niche}Community`],
        viral: ['#share', '#amazing', '#inspo']
      };
    }
  }

  /**
   * 🎨 Embed images in content
   */
  embedImagesInContent(htmlContent, images) {
    let modifiedContent = htmlContent;
    
    // Find [IMAGE: description] placeholders
    const imagePlaceholders = htmlContent.match(/\[IMAGE:([^\]]+)\]/g) || [];
    
    imagePlaceholders.forEach((placeholder, index) => {
      if (images[index]) {
        const imgTag = `
          <figure class="content-image">
            <img src="${images[index].url}" alt="${images[index].alt}" loading="lazy" />
            ${images[index].credit ? `<figcaption>Photo by ${images[index].credit.photographer}</figcaption>` : ''}
          </figure>
        `;
        modifiedContent = modifiedContent.replace(placeholder, imgTag);
      }
    });
    
    return modifiedContent;
  }

  /**
   * 🎨 Inject demo images into template
   */
  injectDemoImages(template, demoImages) {
    let pages = { ...template.pages };
    
    Object.keys(pages).forEach(pageName => {
      let pageContent = pages[pageName];
      
      // Replace image placeholders with actual images
      demoImages.forEach((img, index) => {
        pageContent = pageContent.replace(
          /src="[^"]*placeholder[^"]*"/gi,
          `src="${img.url}"`
        );
      });
      
      pages[pageName] = pageContent;
    });
    
    return {
      ...template,
      pages
    };
  }

  /**
   * 📊 Calculate read time
   */
  calculateReadTime(content) {
    const text = content.replace(/<[^>]*>/g, '');
    const wordCount = text.split(/\s+/).length;
    const minutes = Math.ceil(wordCount / 200); // 200 words per minute
    return `${minutes} min`;
  }

  /**
   * 🔥 Calculate virality score
   */
  calculateViralityScore(content, hashtags) {
    let score = 50; // Base score
    
    // Title catchiness
    if (content.title.length < 60 && content.title.length > 30) score += 10;
    if (/[?!]/.test(content.title)) score += 5;
    
    // Content quality
    const wordCount = content.content.replace(/<[^>]*>/g, '').split(/\s+/).length;
    if (wordCount > 1000 && wordCount < 2500) score += 15;
    
    // Hashtag quality
    const totalHashtags = Object.values(hashtags).flat().length;
    if (totalHashtags >= 10) score += 10;
    
    // SEO optimization
    if (content.keywords && content.keywords.length >= 10) score += 10;
    
    return Math.min(score, 100);
  }

  /**
   * 💎 Create NFT metadata
   */
  createNFTMetadata(content, featuredImage) {
    return {
      name: content.title,
      description: content.summary,
      image: featuredImage.url,
      external_url: '', // Will be filled with blog URL
      attributes: [
        { trait_type: 'Category', value: content.category },
        { trait_type: 'Read Time', value: content.readTime },
        { trait_type: 'Word Count', value: content.content.replace(/<[^>]*>/g, '').split(/\s+/).length },
        { trait_type: 'Keywords', value: content.keywords.length }
      ],
      properties: {
        content_type: 'blog_post',
        blockchain: 'ethereum',
        mintable: true
      }
    };
  }

  /**
   * 💎 Create template NFT metadata
   */
  createTemplateNFTMetadata(template, businessName) {
    return {
      name: `${businessName} Website Template`,
      description: `Complete website template for ${businessName}`,
      image: '', // Will be screenshot
      attributes: [
        { trait_type: 'Type', value: template.config.type },
        { trait_type: 'Style', value: template.config.style },
        { trait_type: 'Pages', value: Object.keys(template.pages).length }
      ],
      properties: {
        content_type: 'website_template',
        blockchain: 'ethereum',
        mintable: true
      }
    };
  }

  /**
   * 📱 Generate share text
   */
  generateShareText(title, topic) {
    return `🚀 Just published: "${title}" 

Check it out! 👇

#${topic.replace(/\s+/g, '')} #blogging #web3`;
  }

  /**
   * 🎨 Get template-specific demo images
   */
  async getTemplateImages(niche, count = 10) {
    const keywords = {
      'blog': 'laptop coffee writing desk',
      'portfolio': 'workspace desk office creative',
      'business': 'business office professional team',
      'ecommerce': 'shopping product store retail',
      'restaurant': 'food restaurant dining cuisine',
      'education': 'education learning students classroom'
    };
    
    const query = keywords[niche] || niche;
    return this.getContentImages(query, count);
  }

  /**
   * 📝 Generate demo blog posts for template
   */
  async generateDemoPosts(niche, count = 3) {
    const demoTopics = {
      'blog': ['Getting Started with Blogging', 'Top 10 Content Tips', 'How to Grow Your Audience'],
      'portfolio': ['My Creative Journey', 'Project Showcase 2024', 'Behind the Scenes'],
      'business': ['Our Company Story', 'Why Choose Us', 'Client Success Stories'],
      'ecommerce': ['New Product Launch', 'Summer Sale Guide', 'Customer Favorites'],
      'restaurant': ['Our Signature Dishes', 'Meet the Chef', 'Special Events Menu'],
      'education': ['Course Overview', 'Student Success Stories', 'Learning Resources']
    };
    
    const topics = demoTopics[niche] || ['Welcome Post', 'About Us', 'Latest Updates'];
    const posts = [];
    
    for (let i = 0; i < Math.min(count, topics.length); i++) {
      try {
        const post = await this.generateBlogWithSEO(topics[i], 'professional', 'short', niche);
        const image = await this.getFeaturedImage(topics[i], niche);
        
        posts.push({
          ...post,
          featuredImage: image,
          isDemo: true
        });
      } catch (error) {
        console.error(`Failed to generate demo post ${i}:`, error.message);
      }
    }
    
    return posts;
  }

  /**
   * 📊 Generate SEO for entire template
   */
  async generateTemplateSEO(businessName, description, niche, pages) {
    const seoData = {};
    
    for (const [pageName, pageContent] of Object.entries(pages)) {
      const pageTitle = pageName.charAt(0).toUpperCase() + pageName.slice(1);
      
      seoData[pageName] = {
        title: `${pageTitle} | ${businessName}`,
        description: description.substring(0, 160),
        slug: pageName === 'home' ? '' : pageName.toLowerCase(),
        keywords: [businessName, niche, pageTitle, 'professional', 'web3'],
        metaTags: {
          ogTitle: `${pageTitle} | ${businessName}`,
          ogDescription: description.substring(0, 160),
          twitterCard: 'summary_large_image'
        }
      };
    }
    
    return seoData;
  }
}

module.exports = new ContentCreatorService();
