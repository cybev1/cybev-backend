// ============================================
// FILE: routes/sites.routes.js
// Website Builder API - NATIVE MONGODB FIX
// VERSION: 6.5.0 - With AI Image Generation
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Import middleware
let verifyToken;
try {
  verifyToken = require('../middleware/auth.middleware');
  if (verifyToken.verifyToken) verifyToken = verifyToken.verifyToken;
} catch (e) {
  verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: 'No token' });
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret');
      next();
    } catch (err) {
      res.status(401).json({ ok: false, error: 'Invalid token' });
    }
  };
}

// ==========================================
// USE NATIVE MONGODB - NO MONGOOSE MODEL
// ==========================================
const getSitesCollection = () => mongoose.connection.db.collection('sites');

// ==========================================
// AI IMAGE SEARCH - Pexels & Unsplash
// ==========================================
async function searchImage(query, orientation = 'landscape') {
  try {
    // Try Pexels first
    if (process.env.PEXELS_API_KEY) {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`,
        { headers: { Authorization: process.env.PEXELS_API_KEY }, timeout: 10000 }
      );
      const data = await res.json();
      if (data.photos?.length) {
        const photo = data.photos[Math.floor(Math.random() * Math.min(data.photos.length, 3))];
        return photo.src.large2x || photo.src.large;
      }
    }
    
    // Try Unsplash
    if (process.env.UNSPLASH_ACCESS_KEY) {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`,
        { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }, timeout: 10000 }
      );
      const data = await res.json();
      if (data.results?.length) {
        const photo = data.results[Math.floor(Math.random() * Math.min(data.results.length, 3))];
        return photo.urls.regular;
      }
    }
    
    return null;
  } catch (err) {
    console.log('Image search error:', err.message);
    return null;
  }
}

// Get AI images for template
async function getTemplateImages(template, siteName) {
  const searchTerms = {
    business: ['professional office business', 'business team meeting', 'corporate success'],
    portfolio: ['creative design workspace', 'art studio creative', 'designer portfolio'],
    blog: ['writing desk workspace', 'coffee laptop blogging', 'content creation'],
    shop: ['ecommerce shopping retail', 'online store products', 'shopping bags'],
    startup: ['startup innovation tech', 'modern workspace startup', 'technology business'],
    saas: ['software technology cloud', 'dashboard analytics', 'tech platform'],
    music: ['music concert stage', 'musician performance', 'recording studio'],
    community: ['community people gathering', 'group collaboration', 'social networking'],
    church: ['church worship congregation', 'christian praise worship', 'church service']
  };
  
  // Detect church/religious content from site name
  const nameLower = (siteName || '').toLowerCase();
  const churchKeywords = ['church', 'pastor', 'ministry', 'christ', 'christian', 'jesus', 'worship', 'prayer', 'fellowship', 'bible', 'gospel', 'faith', 'ce ', 'lw ', 'blw'];
  const isChurch = churchKeywords.some(kw => nameLower.includes(kw));
  
  // Override template if church-related
  const effectiveTemplate = isChurch ? 'church' : (template || 'business');
  const terms = searchTerms[effectiveTemplate] || searchTerms.business;
  
  // Build search query
  let nameQuery = siteName.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  
  // For church sites, use church-specific search terms
  if (isChurch) {
    nameQuery = 'church worship praise christian';
    console.log(`⛪ Detected church site: ${siteName}`);
  }
  
  console.log(`🎨 Searching images for: ${effectiveTemplate} - ${nameQuery}`);
  
  // Search for images in parallel
  const [heroImage, feature1, feature2, feature3] = await Promise.all([
    searchImage(`${nameQuery} ${terms[0]}`, 'landscape'),
    searchImage(terms[1], 'square'),
    searchImage(terms[2], 'square'),
    searchImage(isChurch ? 'church community' : `${nameQuery} professional`, 'square')
  ]);
  
  return {
    heroImage: heroImage || (isChurch 
      ? 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=1200&h=800&fit=crop'
      : 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=800&fit=crop'),
    featureImages: [feature1, feature2, feature3].filter(Boolean)
  };
}

// Generate AI content for hero section
function generateHeroContent(template, siteName, description) {
  // Detect church/religious content from site name
  const nameLower = (siteName || '').toLowerCase();
  const churchKeywords = ['church', 'pastor', 'ministry', 'christ', 'christian', 'jesus', 'worship', 'prayer', 'fellowship', 'bible', 'gospel', 'faith', 'ce ', 'lw ', 'blw'];
  const isChurch = churchKeywords.some(kw => nameLower.includes(kw));
  
  // Override template if church-related
  const effectiveTemplate = isChurch ? 'church' : template;
  
  const content = {
    business: {
      title: siteName || 'Grow Your Business',
      subtitle: description || 'Professional solutions for modern enterprises. We help you succeed.',
      buttonText: 'Get Started'
    },
    portfolio: {
      title: siteName || 'Creative Portfolio',
      subtitle: description || 'Showcasing exceptional design and creative excellence.',
      buttonText: 'View Work'
    },
    blog: {
      title: siteName || 'Stories & Ideas',
      subtitle: description || 'Thoughts that inspire, inform, and ignite curiosity.',
      buttonText: 'Start Reading'
    },
    shop: {
      title: siteName || 'Shop Now',
      subtitle: description || 'Discover amazing products crafted with care.',
      buttonText: 'Browse Collection'
    },
    startup: {
      title: siteName || 'Launch Your Vision',
      subtitle: description || 'The future starts here. Join us on this journey.',
      buttonText: 'Learn More'
    },
    saas: {
      title: siteName || 'Supercharge Your Workflow',
      subtitle: description || 'Automation made simple. Start your free trial today.',
      buttonText: 'Try Free'
    },
    music: {
      title: siteName || 'Listen Now',
      subtitle: description || 'New album dropping soon. Stay tuned for the latest tracks.',
      buttonText: 'Stream Now'
    },
    community: {
      title: siteName || 'Join Our Community',
      subtitle: description || 'Connect, learn, and grow together with like-minded people.',
      buttonText: 'Join Now'
    },
    church: {
      title: siteName || 'Welcome Home',
      subtitle: description || 'A place of worship, fellowship, and spiritual transformation. Join us!',
      buttonText: 'Join Us'
    }
  };
  
  return content[effectiveTemplate] || content.business;
}

// Helper: Get default blocks with AI images
async function getTemplateBlocks(template, siteName, description) {
  // Get AI-generated images
  const images = await getTemplateImages(template, siteName || 'business');
  const heroContent = generateHeroContent(template, siteName, description);
  
  const blocks = [
    {
      id: `block-${Date.now()}-hero`,
      type: 'hero',
      content: {
        title: heroContent.title,
        subtitle: heroContent.subtitle,
        buttonText: heroContent.buttonText,
        buttonLink: '#contact',
        backgroundImage: images.heroImage,
        align: 'center',
        overlay: true
      }
    },
    {
      id: `block-${Date.now()}-features`,
      type: 'features',
      content: {
        title: 'Our Features',
        items: [
          { icon: 'zap', title: 'Fast', description: 'Lightning fast performance', image: images.featureImages[0] },
          { icon: 'shield', title: 'Secure', description: 'Enterprise-grade security', image: images.featureImages[1] },
          { icon: 'heart', title: 'Loved', description: 'Trusted by millions', image: images.featureImages[2] }
        ]
      }
    },
    {
      id: `block-${Date.now()}-cta`,
      type: 'cta',
      content: {
        title: 'Ready to get started?',
        description: 'Join thousands of users who trust our platform.',
        buttonText: 'Sign Up Now',
        buttonLink: '#'
      }
    },
    {
      id: `block-${Date.now()}-contact`,
      type: 'contact',
      content: {
        title: 'Get in Touch',
        email: 'contact@example.com',
        phone: '+1 234 567 890',
        address: '123 Main Street'
      }
    },
    {
      id: `block-${Date.now()}-footer`,
      type: 'footer',
      content: {
        copyright: `© ${new Date().getFullYear()} ${siteName || 'Your Company'}. All rights reserved.`,
        links: [{ label: 'Privacy', url: '/privacy' }, { label: 'Terms', url: '/terms' }]
      }
    }
  ];
  
  return blocks;
}

// ==========================================
// GET /api/sites/my
// ==========================================
router.get('/my', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const sites = await getSitesCollection()
      .find({ owner: new ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json({ ok: true, sites });
  } catch (err) {
    console.error('Get sites error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch sites' });
  }
});

// ==========================================
// GET /api/sites/domain/check
// ==========================================
router.get('/domain/check', async (req, res) => {
  try {
    const { subdomain } = req.query;
    if (!subdomain || subdomain.length < 3) {
      return res.json({ ok: false, available: false });
    }
    
    const reserved = ['www', 'api', 'app', 'admin', 'mail', 'blog', 'shop', 'help', 'support'];
    if (reserved.includes(subdomain.toLowerCase())) {
      return res.json({ ok: true, available: false, reason: 'Reserved' });
    }
    
    const existing = await getSitesCollection().findOne({ subdomain: subdomain.toLowerCase() });
    res.json({ ok: true, available: !existing });
  } catch (err) {
    res.json({ ok: true, available: true });
  }
});

// ==========================================
// GET /api/sites/templates
// ==========================================
router.get('/templates', (req, res) => {
  res.json({
    ok: true,
    templates: [
      { id: 'business', name: 'Business Pro' },
      { id: 'portfolio', name: 'Creative Portfolio' },
      { id: 'blog', name: 'Modern Blog' },
      { id: 'shop', name: 'E-Commerce Store' },
      { id: 'startup', name: 'Startup Launch' },
      { id: 'saas', name: 'SaaS Product' },
      { id: 'music', name: 'Artist/Music' },
      { id: 'community', name: 'Community Hub' }
    ]
  });
});

// ==========================================
// GET /api/sites/subdomain/:subdomain (public)
// ==========================================
router.get('/subdomain/:subdomain', async (req, res) => {
  try {
    const site = await getSitesCollection().findOne({ 
      subdomain: req.params.subdomain.toLowerCase(),
      status: 'published'
    });
    
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    await getSitesCollection().updateOne({ _id: site._id }, { $inc: { views: 1 } });
    res.json({ ok: true, site });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to fetch site' });
  }
});

// ==========================================
// POST /api/sites - CREATE (WITH AI IMAGES)
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { name, description, subdomain, template, theme } = req.body;
    
    console.log('📝 Creating site with AI images:', name, subdomain, template);
    
    if (!name || !subdomain) {
      return res.status(400).json({ ok: false, error: 'Name and subdomain required' });
    }
    
    // Check subdomain
    const existing = await getSitesCollection().findOne({ subdomain: subdomain.toLowerCase() });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Subdomain already taken' });
    }
    
    // Get blocks with AI-generated images (async)
    console.log('🎨 Generating AI images for site...');
    const blocks = await getTemplateBlocks(template || 'business', name, description);
    console.log('✅ AI images generated');
    
    // Create document - NATIVE MONGODB INSERT
    const doc = {
      owner: new ObjectId(userId),
      name: name.trim(),
      description: (description || '').trim(),
      subdomain: subdomain.toLowerCase().trim(),
      template: template || 'business',
      status: 'draft',
      theme: theme || { colorTheme: 'purple', fontPair: 'modern' },
      blocks: blocks,
      pages: [{ id: 'home', name: 'Home', slug: '/', blocks: blocks }],
      views: 0,
      aiGenerated: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await getSitesCollection().insertOne(doc);
    
    if (result.insertedId) {
      const site = await getSitesCollection().findOne({ _id: result.insertedId });
      console.log('✅ Site created with AI images:', site.subdomain);
      res.status(201).json({ ok: true, site });
    } else {
      throw new Error('Insert failed');
    }
  } catch (err) {
    console.error('❌ Create site error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/sites/:id
// ==========================================
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    let site;
    if (ObjectId.isValid(id)) {
      site = await getSitesCollection().findOne({ _id: new ObjectId(id) });
    } else {
      site = await getSitesCollection().findOne({ subdomain: id.toLowerCase() });
    }
    
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    if (site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    res.json({ ok: true, site });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to fetch site' });
  }
});

// ==========================================
// PUT /api/sites/:id
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await getSitesCollection().findOne({ _id: new ObjectId(id) });
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    if (site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const updateData = { updatedAt: new Date() };
    const fields = ['name', 'description', 'template', 'theme', 'blocks', 'pages',
      'favicon', 'ogImage', 'ogTitle', 'ogDescription', 'googleAnalytics',
      'customHead', 'customCss', 'password', 'status', 'thumbnail'];
    
    fields.forEach(f => {
      if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });
    
    await getSitesCollection().updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    const updated = await getSitesCollection().findOne({ _id: new ObjectId(id) });
    res.json({ ok: true, site: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to update site' });
  }
});

// ==========================================
// PUT /api/sites/:id/subdomain
// ==========================================
router.put('/:id/subdomain', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { subdomain } = req.body;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    if (!subdomain || subdomain.length < 3) {
      return res.status(400).json({ ok: false, error: 'Invalid subdomain' });
    }
    
    const site = await getSitesCollection().findOne({ _id: new ObjectId(id) });
    if (!site || site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const existing = await getSitesCollection().findOne({ 
      subdomain: subdomain.toLowerCase(),
      _id: { $ne: new ObjectId(id) }
    });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Subdomain taken' });
    }
    
    await getSitesCollection().updateOne(
      { _id: new ObjectId(id) },
      { $set: { subdomain: subdomain.toLowerCase(), updatedAt: new Date() } }
    );
    
    const updated = await getSitesCollection().findOne({ _id: new ObjectId(id) });
    res.json({ ok: true, site: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to change subdomain' });
  }
});

// ==========================================
// PUT /api/sites/:id/publish
// ==========================================
router.put('/:id/publish', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { publish } = req.body;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await getSitesCollection().findOne({ _id: new ObjectId(id) });
    if (!site || site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const update = { status: publish ? 'published' : 'draft', updatedAt: new Date() };
    if (publish) update.publishedAt = new Date();
    
    await getSitesCollection().updateOne({ _id: new ObjectId(id) }, { $set: update });
    res.json({ ok: true, status: update.status });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to publish' });
  }
});

// ==========================================
// DELETE /api/sites/:id
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await getSitesCollection().findOne({ _id: new ObjectId(id) });
    if (!site || site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    await getSitesCollection().deleteOne({ _id: new ObjectId(id) });
    console.log('🗑️ Site deleted:', site.subdomain);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to delete' });
  }
});

console.log('✅ Sites routes loaded (v6.4.5 - Native MongoDB)');

module.exports = router;
