// ============================================
// FILE: routes/ai-image.routes.js
// AI Image Generation - SMART TITLE-BASED v2.0
// FIXED: Uses article TITLE for context, not category
// FIXED: Detects Christian/religious content properly
// FIXED: Generates appropriate in-text images
// ============================================

const express = require('express');
const router = express.Router();
const axios = require('axios');

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try {
    verifyToken = require('../middleware/auth.middleware');
    if (verifyToken.verifyToken) verifyToken = verifyToken.verifyToken;
  } catch (e2) {
    verifyToken = (req, res, next) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ success: false, error: 'No token' });
      try {
        const jwt = require('jsonwebtoken');
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret');
        next();
      } catch (err) {
        res.status(401).json({ success: false, error: 'Invalid token' });
      }
    };
  }
}

// Image generation providers (in order of preference)
const PROVIDERS = {
  OPENAI: {
    name: 'OpenAI DALL-E 3',
    enabled: !!process.env.OPENAI_API_KEY,
    costPerImage: 0.04
  },
  STABILITY: {
    name: 'Stability AI',
    enabled: !!process.env.STABILITY_API_KEY,
    costPerImage: 0.002
  },
  REPLICATE: {
    name: 'Replicate',
    enabled: !!process.env.REPLICATE_API_TOKEN,
    costPerImage: 0.005
  },
  UNSPLASH: {
    name: 'Unsplash',
    enabled: !!process.env.UNSPLASH_ACCESS_KEY,
    costPerImage: 0
  },
  PEXELS: {
    name: 'Pexels',
    enabled: !!process.env.PEXELS_API_KEY,
    costPerImage: 0
  }
};

console.log('🎨 AI Image Generation Service v2.0 (Title-Based):');
Object.entries(PROVIDERS).forEach(([key, provider]) => {
  console.log(`   ${provider.name}: ${provider.enabled ? '✅ Configured' : '❌ Not configured'}`);
});

// ============================================
// CHRISTIAN/RELIGIOUS CONTENT DETECTION
// ============================================

const CHRISTIAN_KEYWORDS = [
  'lord', 'jesus', 'christ', 'god', 'holy spirit', 'bible', 'scripture', 'gospel',
  'church', 'faith', 'prayer', 'salvation', 'grace', 'worship', 'praise',
  'christian', 'christianity', 'ministry', 'pastor', 'sermon', 'testament',
  'resurrection', 'crucifixion', 'cross', 'heaven', 'angel', 'divine',
  'blessed', 'blessing', 'amen', 'hallelujah', 'prophesy', 'prophecy',
  'rapture', 'tribulation', 'end times', 'second coming', 'kingdom',
  'apostle', 'disciple', 'evangelist', 'missionary', 'covenant', 'psalm',
  'proverbs', 'genesis', 'revelation', 'exodus', 'matthew', 'john',
  'spiritual', 'born again', 'holy', 'righteous', 'sin', 'repentance',
  'forgiveness', 'eternal life', 'redemption', 'messiah', 'savior',
  'day of the lord', 'judgement day', 'judgment', 'apocalypse'
];

const CHRISTIAN_PHRASES = [
  'the lord', 'our lord', 'in christ', 'word of god', 'son of god',
  'lamb of god', 'king of kings', 'holy spirit', 'the father',
  'body of christ', 'blood of christ', 'end times', 'day of the lord',
  'second coming', 'new testament', 'old testament', 'book of',
  'kingdom of god', 'kingdom of heaven', 'eternal life', 'living god'
];

/**
 * Detect if content is Christian/religious
 */
function isChristianContent(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  
  // Check for Christian phrases first (more specific)
  for (const phrase of CHRISTIAN_PHRASES) {
    if (lowerText.includes(phrase)) {
      console.log(`🔍 Detected Christian phrase: "${phrase}"`);
      return true;
    }
  }
  
  // Check for Christian keywords
  const matchedKeywords = CHRISTIAN_KEYWORDS.filter(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lowerText);
  });
  
  // If 2+ keywords match, it's likely Christian content
  if (matchedKeywords.length >= 2) {
    console.log(`🔍 Detected Christian keywords: ${matchedKeywords.join(', ')}`);
    return true;
  }
  
  return false;
}

/**
 * Extract smart keywords from article title for image search
 */
function extractSmartKeywords(title, content = '') {
  const fullText = `${title} ${content}`.toLowerCase();
  const isChristian = isChristianContent(fullText);
  
  console.log(`📝 Title: "${title}"`);
  console.log(`⛪ Christian content detected: ${isChristian}`);
  
  if (isChristian) {
    // For Christian content, use appropriate search terms
    const christianImageTerms = [
      'bible light rays',
      'cross sunset sky',
      'church stained glass',
      'praying hands light',
      'dove sky clouds',
      'sunrise hope',
      'peaceful landscape',
      'open bible',
      'christian cross',
      'worship light'
    ];
    
    // Select based on title themes
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('day of the lord') || titleLower.includes('judgment') || titleLower.includes('end times') || titleLower.includes('apocalypse')) {
      return 'dramatic sky clouds sunset prophetic';
    }
    if (titleLower.includes('prayer') || titleLower.includes('praying')) {
      return 'praying hands spiritual light';
    }
    if (titleLower.includes('faith') || titleLower.includes('believe')) {
      return 'sunrise hope faith inspiration';
    }
    if (titleLower.includes('love') || titleLower.includes('grace')) {
      return 'heart warmth love kindness light';
    }
    if (titleLower.includes('church') || titleLower.includes('worship')) {
      return 'church interior light worship';
    }
    if (titleLower.includes('bible') || titleLower.includes('scripture')) {
      return 'open bible book pages light';
    }
    if (titleLower.includes('jesus') || titleLower.includes('christ') || titleLower.includes('cross')) {
      return 'christian cross sunrise silhouette';
    }
    if (titleLower.includes('heaven') || titleLower.includes('eternal')) {
      return 'sky clouds light rays heavenly';
    }
    if (titleLower.includes('peace') || titleLower.includes('hope')) {
      return 'peaceful sunrise calm serene nature';
    }
    
    // Default Christian imagery
    return 'spiritual light rays inspirational sky';
  }
  
  // For non-Christian content, extract meaningful keywords
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'for', 'and', 'nor', 'but', 'or', 'yet', 'so', 'in', 'on', 'at', 'to', 'from',
    'with', 'about', 'how', 'what', 'why', 'when', 'where', 'who', 'which',
    'this', 'that', 'these', 'those', 'your', 'our', 'my', 'their', 'its',
    'understanding', 'guide', 'complete', 'ultimate', 'best', 'top', 'essential',
    'introduction', 'overview', 'everything', 'need', 'know'
  ]);
  
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  return words.slice(0, 4).join(' ');
}

/**
 * POST /api/ai-image/generate-image
 * Generate an image using AI based on TITLE (not category)
 */
router.post('/generate-image', verifyToken, async (req, res) => {
  try {
    const { 
      prompt,
      title,        // NEW: Article title for context
      content,      // NEW: Article content for context
      style = 'professional', 
      size = '1024x1024', 
      quality = 'standard' 
    } = req.body;

    // Use title if provided, otherwise use prompt
    const contextSource = title || prompt;
    
    if (!contextSource) {
      return res.status(400).json({
        success: false,
        error: 'Title or prompt is required'
      });
    }

    console.log('🎨 Image generation request:');
    console.log(`   Title: ${title || 'N/A'}`);
    console.log(`   Prompt: ${(prompt || '').substring(0, 100)}...`);
    console.log(`   Style: ${style}`);

    // Extract smart keywords based on title context
    const smartKeywords = extractSmartKeywords(contextSource, content);
    console.log(`   Smart Keywords: ${smartKeywords}`);

    // Build enhanced prompt
    const enhancedPrompt = buildSmartPrompt(contextSource, smartKeywords, style);
    console.log(`   Enhanced Prompt: ${enhancedPrompt.substring(0, 150)}...`);

    let imageUrl = null;
    let provider = null;

    // Try providers in order
    if (PROVIDERS.OPENAI.enabled) {
      try {
        imageUrl = await generateWithOpenAI(enhancedPrompt, size, quality);
        provider = 'openai';
      } catch (error) {
        console.warn('⚠️ OpenAI failed:', error.message);
      }
    }

    if (!imageUrl && PROVIDERS.STABILITY.enabled) {
      try {
        imageUrl = await generateWithStability(enhancedPrompt);
        provider = 'stability';
      } catch (error) {
        console.warn('⚠️ Stability AI failed:', error.message);
      }
    }

    if (!imageUrl && PROVIDERS.REPLICATE.enabled) {
      try {
        imageUrl = await generateWithReplicate(enhancedPrompt);
        provider = 'replicate';
      } catch (error) {
        console.warn('⚠️ Replicate failed:', error.message);
      }
    }

    // Try Pexels (better quality than Unsplash for specific topics)
    if (!imageUrl && PROVIDERS.PEXELS.enabled) {
      try {
        imageUrl = await searchPexels(smartKeywords);
        provider = 'pexels';
      } catch (error) {
        console.warn('⚠️ Pexels failed:', error.message);
      }
    }

    // Fallback to Unsplash search
    if (!imageUrl && PROVIDERS.UNSPLASH.enabled) {
      try {
        imageUrl = await searchUnsplash(smartKeywords);
        provider = 'unsplash';
      } catch (error) {
        console.warn('⚠️ Unsplash failed:', error.message);
      }
    }

    // Final fallback - curated stock images based on context
    if (!imageUrl) {
      imageUrl = getSmartFallbackImage(contextSource, smartKeywords);
      provider = 'fallback';
    }

    console.log(`✅ Image generated via ${provider}: ${imageUrl}`);

    res.json({
      success: true,
      url: imageUrl,
      provider,
      keywords: smartKeywords,
      prompt: enhancedPrompt
    });

  } catch (error) {
    console.error('❌ Image generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate image'
    });
  }
});

/**
 * POST /api/ai-image/generate-inline-images
 * Generate multiple inline images for article sections
 */
router.post('/generate-inline-images', verifyToken, async (req, res) => {
  try {
    const { title, sections, count = 2 } = req.body;

    if (!title || !sections || !Array.isArray(sections)) {
      return res.status(400).json({
        success: false,
        error: 'Title and sections array required'
      });
    }

    console.log(`🎨 Generating ${count} inline images for: ${title}`);

    const images = [];
    const isChristian = isChristianContent(`${title} ${sections.join(' ')}`);

    // Generate image for each section that needs one
    const sectionsToImage = sections.slice(0, count);
    
    for (let i = 0; i < sectionsToImage.length; i++) {
      const section = sectionsToImage[i];
      const keywords = extractSmartKeywords(`${title} ${section}`, section);
      
      let imageUrl = null;
      
      // Try Pexels first for variety
      if (PROVIDERS.PEXELS.enabled) {
        try {
          imageUrl = await searchPexels(keywords);
        } catch (e) {
          console.warn('Pexels failed for inline image');
        }
      }
      
      // Try Unsplash
      if (!imageUrl && PROVIDERS.UNSPLASH.enabled) {
        try {
          imageUrl = await searchUnsplash(keywords);
        } catch (e) {
          console.warn('Unsplash failed for inline image');
        }
      }
      
      // Fallback
      if (!imageUrl) {
        imageUrl = getSmartFallbackImage(section, keywords);
      }
      
      images.push({
        sectionIndex: i,
        url: imageUrl,
        keywords
      });
    }

    res.json({
      success: true,
      images,
      isChristianContent: isChristian
    });

  } catch (error) {
    console.error('❌ Inline image generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Build smart prompt based on title context
 */
function buildSmartPrompt(title, keywords, style) {
  const isChristian = isChristianContent(title);
  
  const styleEnhancements = {
    professional: 'Professional, high-quality, clean composition, well-lit, corporate style',
    creative: 'Creative, artistic, vibrant colors, unique perspective',
    minimal: 'Minimalist, clean, simple, modern design, lots of negative space',
    vintage: 'Vintage style, retro aesthetics, warm tones, nostalgic',
    tech: 'Modern technology, futuristic, sleek design, digital elements',
    nature: 'Natural lighting, organic, environmental, peaceful',
    inspirational: 'Uplifting, hopeful, bright light, inspiring atmosphere'
  };

  const enhancement = styleEnhancements[style] || styleEnhancements.professional;
  
  // For Christian content, be very specific to avoid wrong imagery
  if (isChristian) {
    return `${keywords}. ${enhancement}. Christian, spiritual, uplifting, light, hope. NO Hindu, NO Buddhist, NO Islamic, NO pagan symbols. No idols, no statues of other religions. Photorealistic, high resolution. No text, no words, no watermarks.`;
  }
  
  return `${keywords}. ${enhancement}. Photorealistic, high resolution. No text, no words, no watermarks.`;
}

/**
 * Generate image with OpenAI DALL-E 3
 */
async function generateWithOpenAI(prompt, size, quality) {
  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: size === '1792x1024' ? '1792x1024' : '1024x1024',
      quality: quality === 'hd' ? 'hd' : 'standard',
      response_format: 'url'
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  return response.data.data[0].url;
}

/**
 * Generate image with Stability AI
 */
async function generateWithStability(prompt) {
  const response = await axios.post(
    'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
    {
      text_prompts: [
        { text: prompt, weight: 1 },
        { text: 'blurry, bad quality, distorted, text, watermark, hindu, buddhist, idol, statue', weight: -1 }
      ],
      cfg_scale: 7,
      height: 1024,
      width: 1024,
      samples: 1,
      steps: 30
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 60000
    }
  );

  const base64Image = response.data.artifacts[0].base64;
  
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    const cloudinary = require('cloudinary').v2;
    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${base64Image}`,
      { folder: 'cybev/ai-generated' }
    );
    return result.secure_url;
  }
  
  return `data:image/png;base64,${base64Image}`;
}

/**
 * Generate image with Replicate
 */
async function generateWithReplicate(prompt) {
  const response = await axios.post(
    'https://api.replicate.com/v1/predictions',
    {
      version: 'ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4',
      input: {
        prompt: prompt,
        negative_prompt: 'blurry, bad quality, distorted, text, watermark, letters, words, hindu god, buddhist, idol, statue, pagan',
        width: 1024,
        height: 1024,
        num_outputs: 1
      }
    },
    {
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  const predictionId = response.data.id;
  
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const statusResponse = await axios.get(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`
        }
      }
    );
    
    if (statusResponse.data.status === 'succeeded') {
      return statusResponse.data.output[0];
    }
    
    if (statusResponse.data.status === 'failed') {
      throw new Error('Replicate generation failed');
    }
  }
  
  throw new Error('Replicate timeout');
}

/**
 * Search Pexels for images
 */
async function searchPexels(keywords) {
  const response = await axios.get(
    'https://api.pexels.com/v1/search',
    {
      params: {
        query: keywords,
        per_page: 10,
        orientation: 'landscape'
      },
      headers: {
        'Authorization': process.env.PEXELS_API_KEY
      },
      timeout: 10000
    }
  );

  if (response.data.photos && response.data.photos.length > 0) {
    const randomIndex = Math.floor(Math.random() * Math.min(5, response.data.photos.length));
    return response.data.photos[randomIndex].src.large2x;
  }

  throw new Error('No Pexels results found');
}

/**
 * Search Unsplash for images
 */
async function searchUnsplash(keywords) {
  const response = await axios.get(
    'https://api.unsplash.com/search/photos',
    {
      params: {
        query: keywords,
        per_page: 10,
        orientation: 'landscape'
      },
      headers: {
        'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
      },
      timeout: 10000
    }
  );

  if (response.data.results && response.data.results.length > 0) {
    const randomIndex = Math.floor(Math.random() * Math.min(5, response.data.results.length));
    return response.data.results[randomIndex].urls.regular;
  }

  throw new Error('No Unsplash results found');
}

/**
 * Get smart fallback image based on title context
 */
function getSmartFallbackImage(title, keywords) {
  const titleLower = (title || '').toLowerCase();
  const isChristian = isChristianContent(title);
  
  // CHRISTIAN-SPECIFIC IMAGES (curated, appropriate)
  const christianImages = {
    general: [
      'https://images.pexels.com/photos/267559/pexels-photo-267559.jpeg?auto=compress&cs=tinysrgb&w=1200', // Bible
      'https://images.pexels.com/photos/372326/pexels-photo-372326.jpeg?auto=compress&cs=tinysrgb&w=1200', // Light rays
      'https://images.pexels.com/photos/36717/amazing-animal-beautiful-beautifull.jpg?auto=compress&cs=tinysrgb&w=1200', // Peaceful nature
      'https://images.pexels.com/photos/237280/pexels-photo-237280.jpeg?auto=compress&cs=tinysrgb&w=1200' // Sunrise
    ],
    prayer: [
      'https://images.pexels.com/photos/3727255/pexels-photo-3727255.jpeg?auto=compress&cs=tinysrgb&w=1200', // Praying hands
      'https://images.pexels.com/photos/6001170/pexels-photo-6001170.jpeg?auto=compress&cs=tinysrgb&w=1200' // Person praying
    ],
    church: [
      'https://images.pexels.com/photos/157290/pexels-photo-157290.jpeg?auto=compress&cs=tinysrgb&w=1200', // Church interior
      'https://images.pexels.com/photos/236342/pexels-photo-236342.jpeg?auto=compress&cs=tinysrgb&w=1200' // Church stained glass
    ],
    cross: [
      'https://images.pexels.com/photos/51775/cross-sunset-sunrise-silhouette-51775.jpeg?auto=compress&cs=tinysrgb&w=1200', // Cross sunset
      'https://images.pexels.com/photos/161934/cross-sky-religion-christianity-161934.jpeg?auto=compress&cs=tinysrgb&w=1200' // Cross sky
    ],
    bible: [
      'https://images.pexels.com/photos/372326/pexels-photo-372326.jpeg?auto=compress&cs=tinysrgb&w=1200', // Open Bible with light
      'https://images.pexels.com/photos/267559/pexels-photo-267559.jpeg?auto=compress&cs=tinysrgb&w=1200' // Bible
    ],
    hope: [
      'https://images.pexels.com/photos/130621/pexels-photo-130621.jpeg?auto=compress&cs=tinysrgb&w=1200', // Sunrise mountains
      'https://images.pexels.com/photos/1126384/pexels-photo-1126384.jpeg?auto=compress&cs=tinysrgb&w=1200' // Light through clouds
    ],
    judgment: [
      'https://images.pexels.com/photos/1431822/pexels-photo-1431822.jpeg?auto=compress&cs=tinysrgb&w=1200', // Dramatic sky
      'https://images.pexels.com/photos/1252869/pexels-photo-1252869.jpeg?auto=compress&cs=tinysrgb&w=1200' // Storm clouds with light
    ]
  };

  // Category images for non-religious content
  const categoryImages = {
    technology: [
      'https://images.pexels.com/photos/546819/pexels-photo-546819.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    business: [
      'https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/3184287/pexels-photo-3184287.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    health: [
      'https://images.pexels.com/photos/40751/running-runner-long-distance-fitness-40751.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    lifestyle: [
      'https://images.pexels.com/photos/1337380/pexels-photo-1337380.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1051838/pexels-photo-1051838.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    travel: [
      'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1008155/pexels-photo-1008155.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    food: [
      'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1099680/pexels-photo-1099680.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    default: [
      'https://images.pexels.com/photos/1925536/pexels-photo-1925536.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/356056/pexels-photo-356056.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ]
  };

  // For Christian content, select appropriate imagery
  if (isChristian) {
    let images = christianImages.general;
    
    if (titleLower.includes('prayer') || titleLower.includes('praying')) {
      images = christianImages.prayer;
    } else if (titleLower.includes('church') || titleLower.includes('worship')) {
      images = christianImages.church;
    } else if (titleLower.includes('cross') || titleLower.includes('jesus') || titleLower.includes('christ')) {
      images = christianImages.cross;
    } else if (titleLower.includes('bible') || titleLower.includes('scripture')) {
      images = christianImages.bible;
    } else if (titleLower.includes('hope') || titleLower.includes('faith') || titleLower.includes('grace')) {
      images = christianImages.hope;
    } else if (titleLower.includes('judgment') || titleLower.includes('day of the lord') || titleLower.includes('end times') || titleLower.includes('rapture') || titleLower.includes('tribulation')) {
      images = christianImages.judgment;
    }
    
    return images[Math.floor(Math.random() * images.length)];
  }

  // For non-religious content, detect category
  let category = 'default';
  if (titleLower.includes('tech') || titleLower.includes('software') || titleLower.includes('coding') || titleLower.includes('ai') || titleLower.includes('digital')) {
    category = 'technology';
  } else if (titleLower.includes('business') || titleLower.includes('marketing') || titleLower.includes('finance') || titleLower.includes('startup') || titleLower.includes('entrepreneur')) {
    category = 'business';
  } else if (titleLower.includes('health') || titleLower.includes('fitness') || titleLower.includes('wellness') || titleLower.includes('diet') || titleLower.includes('exercise')) {
    category = 'health';
  } else if (titleLower.includes('travel') || titleLower.includes('vacation') || titleLower.includes('adventure') || titleLower.includes('destination') || titleLower.includes('trip')) {
    category = 'travel';
  } else if (titleLower.includes('food') || titleLower.includes('recipe') || titleLower.includes('cooking') || titleLower.includes('restaurant') || titleLower.includes('meal')) {
    category = 'food';
  } else if (titleLower.includes('lifestyle') || titleLower.includes('home') || titleLower.includes('productivity') || titleLower.includes('habits')) {
    category = 'lifestyle';
  }

  const images = categoryImages[category];
  return images[Math.floor(Math.random() * images.length)];
}

module.exports = router;
