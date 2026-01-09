// ============================================
// FILE: routes/sites.routes.js
// Website Builder API Routes - Complete
// VERSION: 6.4.2
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

// Site Schema (embedded)
const SiteSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  subdomain: { type: String, unique: true, lowercase: true },
  customDomain: String,
  template: { type: String, default: 'business' },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  
  // Theme settings
  theme: {
    colorTheme: { type: String, default: 'purple' },
    fontPair: { type: String, default: 'modern' },
    colors: {
      primary: String,
      secondary: String
    },
    fonts: {
      heading: String,
      body: String
    }
  },
  
  // Page content
  pages: [{
    id: String,
    name: String,
    slug: String,
    blocks: [{
      id: String,
      type: String,
      content: mongoose.Schema.Types.Mixed
    }]
  }],
  
  // For backward compatibility
  blocks: [{
    id: String,
    type: String,
    content: mongoose.Schema.Types.Mixed
  }],
  
  // SEO
  favicon: String,
  ogImage: String,
  ogTitle: String,
  ogDescription: String,
  
  // Advanced
  googleAnalytics: String,
  customHead: String,
  customCss: String,
  password: String,
  
  // Stats
  views: { type: Number, default: 0 },
  thumbnail: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

SiteSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

let Site;
try {
  Site = mongoose.model('Site');
} catch {
  Site = mongoose.model('Site', SiteSchema);
}

// ==========================================
// GET /api/sites/my - Get user's sites
// ==========================================
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

// ==========================================
// GET /api/sites/domain/check - Check subdomain availability
// ==========================================
router.get('/domain/check', async (req, res) => {
  try {
    const { subdomain } = req.query;
    
    if (!subdomain || subdomain.length < 3) {
      return res.json({ ok: false, available: false, error: 'Subdomain too short' });
    }
    
    // Reserved subdomains
    const reserved = ['www', 'api', 'app', 'admin', 'mail', 'blog', 'shop', 'help', 'support', 'status', 'cdn', 'assets'];
    if (reserved.includes(subdomain.toLowerCase())) {
      return res.json({ ok: true, available: false, reason: 'Reserved' });
    }
    
    const existing = await Site.findOne({ subdomain: subdomain.toLowerCase() });
    res.json({ ok: true, available: !existing });
  } catch (err) {
    console.error('Check subdomain error:', err);
    res.status(500).json({ ok: false, available: true }); // Assume available on error
  }
});

// ==========================================
// GET /api/sites/subdomain/:subdomain - Get site by subdomain (public)
// ==========================================
router.get('/subdomain/:subdomain', async (req, res) => {
  try {
    const site = await Site.findOne({ 
      subdomain: req.params.subdomain.toLowerCase(),
      status: 'published'
    }).populate('owner', 'name username avatar');
    
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    // Increment views
    site.views = (site.views || 0) + 1;
    await site.save();
    
    res.json({ ok: true, site });
  } catch (err) {
    console.error('Get site by subdomain error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch site' });
  }
});

// ==========================================
// POST /api/sites - Create new site
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { name, description, subdomain, template, theme } = req.body;
    
    if (!name || !subdomain) {
      return res.status(400).json({ ok: false, error: 'Name and subdomain required' });
    }
    
    // Check subdomain availability
    const existing = await Site.findOne({ subdomain: subdomain.toLowerCase() });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Subdomain already taken' });
    }
    
    // Default blocks based on template
    const defaultBlocks = getTemplateBlocks(template);
    
    const site = new Site({
      owner: userId,
      name,
      description,
      subdomain: subdomain.toLowerCase(),
      template: template || 'business',
      theme: theme || { colorTheme: 'purple', fontPair: 'modern' },
      blocks: defaultBlocks,
      pages: [{
        id: 'home',
        name: 'Home',
        slug: '/',
        blocks: defaultBlocks
      }],
      status: 'draft'
    });
    
    await site.save();
    
    console.log(`✅ Site created: ${name} (${subdomain}.cybev.io)`);
    res.status(201).json({ ok: true, site });
  } catch (err) {
    console.error('Create site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to create site' });
  }
});

// ==========================================
// GET /api/sites/:id - Get single site
// ==========================================
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Handle ObjectId or subdomain
    let site;
    if (mongoose.Types.ObjectId.isValid(id)) {
      site = await Site.findById(id).populate('owner', 'name username avatar');
    } else {
      site = await Site.findOne({ subdomain: id.toLowerCase() }).populate('owner', 'name username avatar');
    }
    
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    // Check ownership
    const userId = req.user.id || req.user._id || req.user.userId;
    if (site.owner._id.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    res.json({ ok: true, site });
  } catch (err) {
    console.error('Get site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch site' });
  }
});

// ==========================================
// PUT /api/sites/:id - Update site
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    if (site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    // Update allowed fields
    const allowedFields = [
      'name', 'description', 'template', 'theme', 'blocks', 'pages',
      'favicon', 'ogImage', 'ogTitle', 'ogDescription',
      'googleAnalytics', 'customHead', 'customCss', 'password',
      'status', 'thumbnail'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        site[field] = req.body[field];
      }
    });
    
    site.updatedAt = new Date();
    await site.save();
    
    res.json({ ok: true, site });
  } catch (err) {
    console.error('Update site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to update site' });
  }
});

// ==========================================
// PUT /api/sites/:id/subdomain - Change subdomain
// ==========================================
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
    
    if (site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    // Check if new subdomain is available
    const existing = await Site.findOne({ 
      subdomain: subdomain.toLowerCase(),
      _id: { $ne: id }
    });
    
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Subdomain already taken' });
    }
    
    site.subdomain = subdomain.toLowerCase();
    site.updatedAt = new Date();
    await site.save();
    
    res.json({ ok: true, site });
  } catch (err) {
    console.error('Change subdomain error:', err);
    res.status(500).json({ ok: false, error: 'Failed to change subdomain' });
  }
});

// ==========================================
// PUT /api/sites/:id/publish - Publish/unpublish site
// ==========================================
router.put('/:id/publish', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { publish } = req.body;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    if (site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    site.status = publish ? 'published' : 'draft';
    site.updatedAt = new Date();
    await site.save();
    
    res.json({ ok: true, site, status: site.status });
  } catch (err) {
    console.error('Publish site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to publish site' });
  }
});

// ==========================================
// DELETE /api/sites/:id - Delete site
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const site = await Site.findById(id);
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    
    if (site.owner.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    await Site.deleteOne({ _id: id });
    
    console.log(`🗑️ Site deleted: ${site.name} (${site.subdomain}.cybev.io)`);
    res.json({ ok: true, message: 'Site deleted' });
  } catch (err) {
    console.error('Delete site error:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete site' });
  }
});

// ==========================================
// GET /api/sites/templates - Get available templates
// ==========================================
router.get('/templates', async (req, res) => {
  const templates = [
    { id: 'business', name: 'Business Pro', category: 'business', description: 'Professional business website' },
    { id: 'portfolio', name: 'Creative Portfolio', category: 'portfolio', description: 'Showcase your work' },
    { id: 'blog', name: 'Modern Blog', category: 'blog', description: 'Clean blog layout' },
    { id: 'shop', name: 'E-Commerce Store', category: 'shop', description: 'Online store' },
    { id: 'startup', name: 'Startup Launch', category: 'startup', description: 'Landing page for startups' },
    { id: 'saas', name: 'SaaS Product', category: 'startup', description: 'Software product page' },
    { id: 'music', name: 'Artist/Music', category: 'creative', description: 'For musicians and artists' },
    { id: 'community', name: 'Community Hub', category: 'community', description: 'Build your community' }
  ];
  
  res.json({ ok: true, templates });
});

// Helper: Get default blocks for template
function getTemplateBlocks(template) {
  const heroBlock = {
    id: 'block-hero',
    type: 'hero',
    content: {
      title: 'Welcome to My Website',
      subtitle: 'Create amazing experiences with CYBEV',
      buttonText: 'Get Started',
      buttonLink: '#',
      align: 'center'
    }
  };
  
  const featuresBlock = {
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
  };
  
  const ctaBlock = {
    id: 'block-cta',
    type: 'cta',
    content: {
      title: 'Ready to get started?',
      description: 'Join thousands of users who trust our platform.',
      buttonText: 'Sign Up Now',
      buttonLink: '#'
    }
  };
  
  const footerBlock = {
    id: 'block-footer',
    type: 'footer',
    content: {
      copyright: '© 2026 Your Company. All rights reserved.',
      links: [
        { label: 'Privacy', url: '/privacy' },
        { label: 'Terms', url: '/terms' }
      ]
    }
  };
  
  // Customize hero based on template
  const templateHeros = {
    business: { title: 'Grow Your Business', subtitle: 'Professional solutions for modern enterprises' },
    portfolio: { title: 'Creative Works', subtitle: 'Showcasing design excellence' },
    blog: { title: 'Stories & Ideas', subtitle: 'Thoughts that inspire and inform' },
    shop: { title: 'Shop Now', subtitle: 'Discover amazing products' },
    startup: { title: 'Launch Your Vision', subtitle: 'The future starts here' },
    saas: { title: 'Supercharge Your Workflow', subtitle: 'Automation made simple' },
    music: { title: 'Listen Now', subtitle: 'New album dropping soon' },
    community: { title: 'Join Our Community', subtitle: 'Connect, learn, and grow together' }
  };
  
  if (templateHeros[template]) {
    heroBlock.content = { ...heroBlock.content, ...templateHeros[template] };
  }
  
  return [heroBlock, featuresBlock, ctaBlock, footerBlock];
}

console.log('✅ Sites routes loaded (Website Builder)');

module.exports = router;
