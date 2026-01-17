// ============================================
// FILE: routes/ai-image.routes.js
// AI Image Generation for Blog Featured Images
// Uses multiple providers with fallbacks
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
  // OpenAI DALL-E 3
  OPENAI: {
    name: 'OpenAI DALL-E 3',
    enabled: !!process.env.OPENAI_API_KEY,
    costPerImage: 0.04 // $0.04 for 1024x1024
  },
  // Stability AI
  STABILITY: {
    name: 'Stability AI',
    enabled: !!process.env.STABILITY_API_KEY,
    costPerImage: 0.002
  },
  // Replicate (various models)
  REPLICATE: {
    name: 'Replicate',
    enabled: !!process.env.REPLICATE_API_TOKEN,
    costPerImage: 0.005
  },
  // Unsplash (free, search-based)
  UNSPLASH: {
    name: 'Unsplash',
    enabled: !!process.env.UNSPLASH_ACCESS_KEY,
    costPerImage: 0
  }
};

console.log('🎨 AI Image Generation Service:');
Object.entries(PROVIDERS).forEach(([key, provider]) => {
  console.log(`   ${provider.name}: ${provider.enabled ? '✅ Configured' : '❌ Not configured'}`);
});

/**
 * POST /api/ai/generate-image
 * Generate an image using AI based on prompt
 */
router.post('/generate-image', verifyToken, async (req, res) => {
  try {
    const { prompt, style = 'professional', size = '1024x1024', quality = 'standard' } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    console.log('🎨 Image generation request:');
    console.log(`   Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`   Style: ${style}`);
    console.log(`   Size: ${size}`);

    // Enhance prompt for better results
    const enhancedPrompt = enhancePrompt(prompt, style);

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

    // Fallback to Unsplash search
    if (!imageUrl && PROVIDERS.UNSPLASH.enabled) {
      try {
        imageUrl = await searchUnsplash(prompt);
        provider = 'unsplash';
      } catch (error) {
        console.warn('⚠️ Unsplash failed:', error.message);
      }
    }

    // Final fallback - curated stock images
    if (!imageUrl) {
      imageUrl = getFallbackImage(prompt, style);
      provider = 'fallback';
    }

    console.log(`✅ Image generated via ${provider}: ${imageUrl}`);

    res.json({
      success: true,
      url: imageUrl,
      provider,
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
 * Enhance prompt for better image generation
 */
function enhancePrompt(prompt, style) {
  const styleEnhancements = {
    professional: 'Professional, high-quality, corporate style, clean composition, well-lit',
    creative: 'Creative, artistic, vibrant colors, unique perspective, imaginative',
    minimal: 'Minimalist, clean, simple, lots of white space, modern design',
    vintage: 'Vintage style, retro aesthetics, warm tones, nostalgic feel',
    tech: 'Modern technology, futuristic, sleek design, digital elements, blue tones',
    nature: 'Natural lighting, organic, environmental, green tones, peaceful',
    business: 'Corporate, professional, office environment, business context'
  };

  const enhancement = styleEnhancements[style] || styleEnhancements.professional;
  
  // Remove any request for text in the image
  let cleanPrompt = prompt
    .replace(/with text/gi, '')
    .replace(/text saying/gi, '')
    .replace(/words/gi, '')
    .replace(/title/gi, 'subject')
    .replace(/headline/gi, 'subject');

  return `${cleanPrompt}. ${enhancement}. No text, no words, no letters, no watermarks. Photorealistic, high resolution.`;
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
        { text: 'blurry, bad quality, distorted, text, watermark', weight: -1 }
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

  // Stability returns base64, need to upload to cloud storage
  const base64Image = response.data.artifacts[0].base64;
  
  // Upload to Cloudinary if available
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    const cloudinary = require('cloudinary').v2;
    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${base64Image}`,
      { folder: 'cybev/ai-generated' }
    );
    return result.secure_url;
  }
  
  // Return as data URL (not ideal for production)
  return `data:image/png;base64,${base64Image}`;
}

/**
 * Generate image with Replicate (SDXL)
 */
async function generateWithReplicate(prompt) {
  const response = await axios.post(
    'https://api.replicate.com/v1/predictions',
    {
      version: 'ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4', // SDXL
      input: {
        prompt: prompt,
        negative_prompt: 'blurry, bad quality, distorted, text, watermark, letters, words',
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

  // Poll for completion
  const predictionId = response.data.id;
  let result;
  
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
 * Search Unsplash for relevant images
 */
async function searchUnsplash(prompt) {
  // Extract key terms from prompt
  const keywords = extractKeywords(prompt);
  
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
    // Pick a random image from top results for variety
    const randomIndex = Math.floor(Math.random() * Math.min(5, response.data.results.length));
    return response.data.results[randomIndex].urls.regular;
  }

  throw new Error('No Unsplash results found');
}

/**
 * Extract keywords from prompt for search
 */
function extractKeywords(prompt) {
  // Remove common words and extract key terms
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'for', 'and', 'nor', 'but', 'or', 'yet', 'so', 'in', 'on', 'at', 'to', 'from',
    'with', 'about', 'professional', 'blog', 'article', 'featured', 'image', 'style',
    'modern', 'clean', 'high', 'quality', 'no', 'text', 'words'];
  
  const words = prompt.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  // Return top 3-5 keywords
  return words.slice(0, 5).join(' ');
}

/**
 * Get fallback image based on category/keywords
 */
function getFallbackImage(prompt, style) {
  const promptLower = prompt.toLowerCase();
  
  // Category-based Unsplash URLs (curated, high-quality)
  const categoryImages = {
    technology: [
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200',
      'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1200',
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200'
    ],
    business: [
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200',
      'https://images.unsplash.com/photo-1553484771-047a44eee27b?w=1200'
    ],
    health: [
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200',
      'https://images.unsplash.com/photo-1505576399279-565b52d4ac71?w=1200',
      'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1200'
    ],
    lifestyle: [
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200',
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200',
      'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200'
    ],
    travel: [
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200',
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200',
      'https://images.unsplash.com/photo-1503220317375-aaad61436b1b?w=1200'
    ],
    food: [
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1200',
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200',
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1200'
    ],
    spirituality: [
      'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=1200',
      'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1200',
      'https://images.unsplash.com/photo-1545389336-cf090694435e?w=1200'
    ],
    default: [
      'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200',
      'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=1200',
      'https://images.unsplash.com/photo-1432821596592-e2c18b78144f?w=1200'
    ]
  };

  // Detect category from prompt
  let category = 'default';
  if (promptLower.includes('tech') || promptLower.includes('software') || promptLower.includes('coding') || promptLower.includes('computer')) {
    category = 'technology';
  } else if (promptLower.includes('business') || promptLower.includes('marketing') || promptLower.includes('finance') || promptLower.includes('startup')) {
    category = 'business';
  } else if (promptLower.includes('health') || promptLower.includes('fitness') || promptLower.includes('wellness') || promptLower.includes('medical')) {
    category = 'health';
  } else if (promptLower.includes('travel') || promptLower.includes('vacation') || promptLower.includes('adventure') || promptLower.includes('destination')) {
    category = 'travel';
  } else if (promptLower.includes('food') || promptLower.includes('recipe') || promptLower.includes('cooking') || promptLower.includes('restaurant')) {
    category = 'food';
  } else if (promptLower.includes('church') || promptLower.includes('spiritual') || promptLower.includes('faith') || promptLower.includes('prayer') || promptLower.includes('christian')) {
    category = 'spirituality';
  } else if (promptLower.includes('lifestyle') || promptLower.includes('home') || promptLower.includes('productivity')) {
    category = 'lifestyle';
  }

  const images = categoryImages[category];
  return images[Math.floor(Math.random() * images.length)];
}

module.exports = router;
