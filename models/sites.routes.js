// ============================================
// FILE: routes/sites.routes.js
// Website Builder API Routes - COMPLETE FIX
// VERSION: 6.4.4
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

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
// FORCE DELETE CACHED MODEL & CREATE NEW
// ==========================================
if (mongoose.models.Site) {
  delete mongoose.models.Site;
  delete mongoose.modelSchemas.Site;
  console.log('🔄 Cleared cached Site model');
}

// Simple, flexible Site Schema
const SiteSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  subdomain: { type: String, unique: true, sparse: true, lowercase: true },
  customDomain: mongoose.Schema.Types.Mixed,
  template: { type: String, default: 'business' },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  
  // ALL FLEXIBLE FIELDS - Use Mixed to accept any structure
  theme: mongoose.Schema.Types.Mixed,
  blocks: mongoose.Schema.Types.Mixed,  // Can be array or anything
  pages: mongoose.Schema.Types.Mixed,   // Can be array or anything
  navigation: mongoose.Schema.Types.Mixed,
  footer: mongoose.Schema.Types.Mixed,
  branding: mongoose.Schema.Types.Mixed,
  seo: mongoose.Schema.Types.Mixed,
  
  // Simple string fields
  favicon: String,
  ogImage: String,
  ogTitle: String,
  ogDescription: String,
  googleAnalytics: String,
  customHead: String,
  customCss: String,
  password: String,
  thumbnail: String,
  
  // Stats
  views: { type: Number, default: 0 },
  
  publishedAt: Date
}, {
  timestamps: true,
  strict: false  // Allow any additional fields
});

// Create fresh model
const Site = mongoose.model('Site', SiteSchema);
console.log('✅ Fresh Site model created');

// ==========================================
// HELPER: Get default blocks for template
// ==========================================
function getTemplateBlocks(template) {
  const blocks = [
    {
      id: 'block-hero',
      type: 'hero',
      content: {
        title: getHeroTitle(template),
        subtitle: getHeroSubtitle(template),
        buttonText: 'Get Started',
        buttonLink: '#',
        align: 'center'
      }
    },
    {
      id: 'block-features',
      type: 'features',
      content: {
        title: 'Our Features',
        items: [
          { icon: 'zap', title: 'Fast', description: 'Lightning fast performance' },
          { icon: 'shield', title: 'Secure', description: 'Enterprise-grade security' },
          { icon: 'heart', title: 'Loved', description: 'Trusted by millions' }
        ]
      }
    },
    {
      id: 'block-cta',
      type: 'cta',
      content: {
        title: 'Ready to get started?',
        description: 'Join thousands of users who trust our platform.',
        buttonText: 'Sign Up Now',
        buttonLink: '#'
      }
    },
    {
      id: 'block-footer',
      type: 'footer',
      content: {
        copyright: '© 2026 Your Company. All rights reserved.',
        links: [
          { label: 'Privacy', url: '/privacy' },
          { label: 'Terms', url: '/terms' }
        ]
      }
    }
  ];
  
  return blocks;
}

function getHeroTitle(template) {
  const titles = {
    business: 'Grow Your Business',
    portfolio: 'Creative Works',
    blog: 'Stories & Ideas',
    shop: 'Shop Now',
    startup: 'Launch Your Vision',
    saas: 'Supercharge Your Workflow',
    music: 'Listen Now',
    community: 'Join Our Community'
  };
  return titles[template] || 'Welcome to My Website';
}

function getHeroSubtitle(template) {
  const subtitles = {
    business: 'Professional solutions for modern enterprises',
    portfolio: 'Showcasing design excellence',
    blog: 'Thoughts that inspire and inform',
    shop: 'Discover amazing products',
    startup: 'The future starts here',
    saas: 'Automation made simple',
    music: 'New album dropping soon',
    community: 'Connect, learn, and grow together'
  };
  return subtitles[template] || 'Create amazing experiences with CYBEV';
}

// ==========================================
// ROUTES
// ==========================================

// GET /api/sites/my - Get user's sites
router.get('/my', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const sites = await Site.find({ owner: userId }).sort({ updatedAt: -1 });
    res.json({ ok: true, sites });
  } catch (err) {
    console.error('Get user sites error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch sites' });
  }
});

// GET /api/sites/domain/check - Check subdomain availability
router.get('/domain/check', async (req, res) => {
  try {
    const { subdomain } = req.query;
    
    if (!subdomain || subdomain.length < 3) {
      return res.json({ ok: false, available: false, error: 'Subdomain too short' });
    }
    
    const reserved = ['www', 'api', 'app', 'admin', 'mail', 'blog', 'shop', 'help', 'support', 'status', 'cdn', 'assets'];
    if (reserved.includes(subdomain.toLowerCase())) {
      return res.json({ ok: true, available: false, reason: 'Reserved' });
    }
    
    const existing = await Site.findOne({ subdomain: subdomain.toLowerCase() });
    res.json({ ok: true, available: !existing });
  } catch (err) {
    console.error('Check subdomain error:', err);
    res.json({ ok: true, available: true });
  }
});

// GET /api/sites/templates
router.get('/templates', (req, res) => {
  res.json({
    ok: true,
    templates: [
      { id: 'business', name: 'Business Pro', category: 'business' },
      { id: 'portfolio', name: 'Creative Portfolio', category: 'portfolio' },
      { id: 'blog', name: 'Modern Blog', category: 'blog' },
      { id: 'shop', name: 'E-Commerce Store', category: 'shop' },
      { id: 'startup', name: 'Startup Launch', category: 'startup' },
      { id: 'saas', name: 'SaaS Product', category: 'startup' },
      { id: 'music', name: 'Artist/Music', category: 'creative' },
      { id: 'community', name: 'Community Hub', category: 'community' }
    ]
  });
});

// GET /api/sites/subdomain/:subdomain - Public site
router.get('/subdomain/:subdomain', async (req, res) => {
  try {
    const site = await Site.findOne({ 
      subdomain: req.params.subdomain.toLowerCase(),
      status: 'published'
    }).populate('owner', 'name username avatar');
    
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    await Site.updateOne({ _id: site._id }, { $inc: { views: 1 } });
    res.json({ ok: true, site });
  } catch (err) {
    console.error('Get site by subdomain error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch site' });
  }
});

// ==========================================
// POST /api/sites - Create new site (FIXED)
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { name, description, subdomain, template, theme } = req.body;
    
    console.log('📝 Creating site:', { name, subdomain, template });
    
    if (!name || !subdomain) {
      return res.status(400).json({ ok: false, error: 'Name and subdomain required' });
    }
    
    // Check subdomain
    const existing = await Site.findOne({ subdomain: subdomain.toLowerCase() });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Subdomain already taken' });
    }
    
    // Get default blocks as PLAIN ARRAY
    const defaultBlocks = getTemplateBlocks(template || 'business');
    
    // Ensure it's actually an array (defensive)
    if (!Array.isArray(defaultBlocks)) {
      console.error('❌ defaultBlocks is not an array!');
      return res.status(500).json({ ok: false, error: 'Internal error: blocks not array' });
    }
    
    console.log('📦 Blocks count:', defaultBlocks.length);
    console.log('📦 First block type:', typeof defaultBlocks[0], defaultBlocks[0]?.type);
    
    // Create site document directly with $set to avoid schema casting
    const siteDoc = {
      owner: new mongoose.Types.ObjectId(userId),
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
      subdomain: subdomain.toLowerCase().trim(),
      template: template || 'business',
      status: 'draft',
      theme: theme || { colorTheme: 'purple', fontPair: 'modern' },
      blocks: defaultBlocks,
      pages: [{
        id: 'home',
        name: 'Home',
        slug: '/',
        blocks: defaultBlocks
      }],
      views: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Use insertOne to bypass Mongoose casting completely
    const result = await Site.collection.insertOne(siteDoc);
    
    if (result.insertedId) {
      const site = await Site.findById(result.insertedId);
      console.log(`✅ Site created: ${name} (${subdomain}.cybev.io)`);
      res.status(201).json({ ok: true, site });
    } else {
      throw new Error('Insert failed');
    }
    
  } catch (err) {
    console.error('❌ Create site error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to create site' });
  }
});

// GET /api/sites/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    let site;
    if (mongoose.Types.ObjectId.isValid(id)) {
      site = await Site.findById(id).populate('owner', 'name username avatar');
    } else {
      site = await Site.findOne({ subdomain: id.toLowerCase() }).populate('owner', 'name username avatar');
    }
    
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    const ownerId = site.owner?._id || site.owner;
    if (ownerId.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    res.json({ ok: true, site });
  } catch (err) {
    console.error('Get site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch site' });
  }
});

// PUT /api/sites/:id
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    const ownerId = site.owner?._id || site.owner;
    if (ownerId.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    // Update using $set to avoid casting issues
    const updateData = { updatedAt: new Date() };
    const allowedFields = [
      'name', 'description', 'template', 'theme', 'blocks', 'pages',
      'favicon', 'ogImage', 'ogTitle', 'ogDescription',
      'googleAnalytics', 'customHead', 'customCss', 'password',
      'status', 'thumbnail', 'navigation', 'footer', 'branding'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });
    
    await Site.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: updateData }
    );
    
    const updatedSite = await Site.findById(id);
    res.json({ ok: true, site: updatedSite });
  } catch (err) {
    console.error('Update site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to update site' });
  }
});

// PUT /api/sites/:id/subdomain
router.put('/:id/subdomain', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { subdomain } = req.body;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    if (!subdomain || subdomain.length < 3) {
      return res.status(400).json({ ok: false, error: 'Invalid subdomain' });
    }
    
    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    const ownerId = site.owner?._id || site.owner;
    if (ownerId.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const existing = await Site.findOne({ 
      subdomain: subdomain.toLowerCase(),
      _id: { $ne: id }
    });
    
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Subdomain already taken' });
    }
    
    await Site.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { subdomain: subdomain.toLowerCase(), updatedAt: new Date() } }
    );
    
    const updatedSite = await Site.findById(id);
    res.json({ ok: true, site: updatedSite });
  } catch (err) {
    console.error('Change subdomain error:', err);
    res.status(500).json({ ok: false, error: 'Failed to change subdomain' });
  }
});

// PUT /api/sites/:id/publish
router.put('/:id/publish', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { publish } = req.body;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    const ownerId = site.owner?._id || site.owner;
    if (ownerId.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const status = publish ? 'published' : 'draft';
    const updateData = { status, updatedAt: new Date() };
    if (publish) updateData.publishedAt = new Date();
    
    await Site.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: updateData }
    );
    
    res.json({ ok: true, status });
  } catch (err) {
    console.error('Publish site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to publish site' });
  }
});

// DELETE /api/sites/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    const ownerId = site.owner?._id || site.owner;
    if (ownerId.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    await Site.deleteOne({ _id: id });
    console.log(`🗑️ Site deleted: ${site.name}`);
    res.json({ ok: true, message: 'Site deleted' });
  } catch (err) {
    console.error('Delete site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete site' });
  }
});

console.log('✅ Sites routes loaded (Website Builder v6.4.4)');

module.exports = router;
