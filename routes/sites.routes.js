// ============================================
// FILE: routes/sites.routes.js
// Website Builder API - NATIVE MONGODB FIX
// VERSION: 6.4.5 - Bypasses Mongoose completely
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

// Helper: Get default blocks
function getTemplateBlocks(template) {
  const titles = {
    business: ['Grow Your Business', 'Professional solutions for modern enterprises'],
    portfolio: ['Creative Works', 'Showcasing design excellence'],
    blog: ['Stories & Ideas', 'Thoughts that inspire and inform'],
    shop: ['Shop Now', 'Discover amazing products'],
    startup: ['Launch Your Vision', 'The future starts here'],
    saas: ['Supercharge Your Workflow', 'Automation made simple'],
    music: ['Listen Now', 'New album dropping soon'],
    community: ['Join Our Community', 'Connect, learn, and grow together']
  };
  
  const [title, subtitle] = titles[template] || ['Welcome to My Website', 'Create amazing experiences with CYBEV'];
  
  return [
    {
      id: 'block-hero',
      type: 'hero',
      content: { title, subtitle, buttonText: 'Get Started', buttonLink: '#', align: 'center' }
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
        links: [{ label: 'Privacy', url: '/privacy' }, { label: 'Terms', url: '/terms' }]
      }
    }
  ];
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
// POST /api/sites - CREATE (NATIVE MONGODB)
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { name, description, subdomain, template, theme } = req.body;
    
    console.log('📝 Creating site:', name, subdomain, template);
    
    if (!name || !subdomain) {
      return res.status(400).json({ ok: false, error: 'Name and subdomain required' });
    }
    
    // Check subdomain
    const existing = await getSitesCollection().findOne({ subdomain: subdomain.toLowerCase() });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Subdomain already taken' });
    }
    
    // Get blocks as actual array objects
    const blocks = getTemplateBlocks(template || 'business');
    
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
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await getSitesCollection().insertOne(doc);
    
    if (result.insertedId) {
      const site = await getSitesCollection().findOne({ _id: result.insertedId });
      console.log('✅ Site created:', site.subdomain);
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
