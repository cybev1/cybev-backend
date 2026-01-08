// ============================================
// FILE: routes/sites.routes.js
// Website Builder API Routes
// VERSION: 2.0
// Added: Domain registration via DomainNameAPI
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Get Site model
const getSiteModel = () => {
  return mongoose.models.Site || require('../models/site.model');
};

// Get Domain service
let domainService;
try {
  domainService = require('../services/domain.service');
} catch (err) {
  console.log('Domain service not found');
}

// Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// ==========================================
// SITE MANAGEMENT
// ==========================================

/**
 * Create new site
 * POST /api/sites
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const { name, tagline, category, template, aiGenerated, prompt } = req.body;

    if (!name) {
      return res.status(400).json({ ok: false, error: 'Site name is required' });
    }

    const existingSites = await Site.countDocuments({ owner: req.user.id });
    const maxSites = 10;
    
    if (existingSites >= maxSites) {
      return res.status(403).json({ 
        ok: false, 
        error: `You can create up to ${maxSites} sites` 
      });
    }

    const defaultHomePage = {
      title: 'Home',
      slug: 'home',
      isHomePage: true,
      isPublished: true,
      sections: [
        {
          type: 'hero',
          content: {
            heading: name,
            subheading: tagline || 'Welcome to my website',
            buttonText: 'Learn More',
            buttonUrl: '#about',
            backgroundImage: ''
          },
          settings: { padding: 'large', alignment: 'center' },
          order: 0
        },
        {
          type: 'text',
          content: {
            heading: 'About',
            text: 'Tell your story here. What makes you unique? What do you do?'
          },
          settings: { padding: 'medium' },
          order: 1
        },
        {
          type: 'blog-posts',
          content: { heading: 'Latest Posts', count: 6 },
          settings: { padding: 'medium' },
          order: 2
        },
        {
          type: 'contact-form',
          content: { heading: 'Get in Touch', submitText: 'Send Message' },
          settings: { padding: 'medium' },
          order: 3
        }
      ]
    };

    const site = new Site({
      owner: req.user.id,
      name,
      tagline,
      category: category || 'personal-blog',
      theme: { template: template || 'minimal' },
      pages: [defaultHomePage],
      navigation: {
        items: [
          { label: 'Home', pageId: null, url: '/', order: 0 },
          { label: 'Blog', url: '/blog', order: 1 },
          { label: 'Contact', url: '/contact', order: 2 }
        ]
      },
      aiGenerated: aiGenerated ? {
        isAiGenerated: true,
        prompt,
        generatedAt: new Date()
      } : undefined
    });

    await site.save();

    res.status(201).json({
      ok: true,
      site: {
        _id: site._id,
        name: site.name,
        subdomain: site.subdomain,
        url: site.url,
        status: site.status
      }
    });
  } catch (error) {
    console.error('Create site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * List user's sites
 * GET /api/sites
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const sites = await Site.find({ owner: req.user.id })
      .select('name subdomain customDomain status category stats.views createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      ok: true,
      sites: sites.map(s => ({
        ...s,
        url: s.customDomain?.verified 
          ? `https://${s.customDomain.domain}`
          : `https://${s.subdomain}.cybev.io`
      }))
    });
  } catch (error) {
    console.error('List sites error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get site details
 * GET /api/sites/:id
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const site = await Site.findOne({
      _id: req.params.id,
      owner: req.user.id
    }).lean();

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    res.json({ ok: true, site });
  } catch (error) {
    console.error('Get site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Update site settings
 * PUT /api/sites/:id
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const allowedUpdates = [
      'name', 'tagline', 'description', 'category',
      'theme', 'branding', 'navigation', 'footer',
      'socialLinks', 'contact', 'blogSettings', 'seo', 'integrations'
    ];

    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const site = await Site.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: updates },
      { new: true }
    );

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    res.json({ ok: true, site });
  } catch (error) {
    console.error('Update site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Delete site
 * DELETE /api/sites/:id
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const site = await Site.findOneAndDelete({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    res.json({ ok: true, message: 'Site deleted' });
  } catch (error) {
    console.error('Delete site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Publish/Unpublish site
 * POST /api/sites/:id/publish
 */
router.post('/:id/publish', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const { publish = true } = req.body;

    const site = await Site.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { 
        status: publish ? 'published' : 'draft',
        ...(publish && { publishedAt: new Date() })
      },
      { new: true }
    );

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    res.json({ 
      ok: true, 
      message: publish ? 'Site published!' : 'Site unpublished',
      url: site.url
    });
  } catch (error) {
    console.error('Publish site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// PAGES
// ==========================================

/**
 * Add page to site
 * POST /api/sites/:id/pages
 */
router.post('/:id/pages', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const { title, slug, description, sections = [] } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Page title required' });
    }

    const site = await Site.findOne({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    const pageSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (site.pages.some(p => p.slug === pageSlug)) {
      return res.status(400).json({ ok: false, error: 'Page slug already exists' });
    }

    const newPage = {
      title,
      slug: pageSlug,
      description,
      sections,
      order: site.pages.length
    };

    site.pages.push(newPage);
    await site.save();

    res.status(201).json({
      ok: true,
      page: site.pages[site.pages.length - 1]
    });
  } catch (error) {
    console.error('Add page error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Update page
 * PUT /api/sites/:id/pages/:pageId
 */
router.put('/:id/pages/:pageId', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const { title, slug, description, sections, isPublished, seo } = req.body;

    const site = await Site.findOne({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    const pageIndex = site.pages.findIndex(p => p._id.toString() === req.params.pageId);
    if (pageIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Page not found' });
    }

    if (title) site.pages[pageIndex].title = title;
    if (slug) site.pages[pageIndex].slug = slug;
    if (description !== undefined) site.pages[pageIndex].description = description;
    if (sections) site.pages[pageIndex].sections = sections;
    if (isPublished !== undefined) site.pages[pageIndex].isPublished = isPublished;
    if (seo) site.pages[pageIndex].seo = seo;

    await site.save();

    res.json({ ok: true, page: site.pages[pageIndex] });
  } catch (error) {
    console.error('Update page error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Delete page
 * DELETE /api/sites/:id/pages/:pageId
 */
router.delete('/:id/pages/:pageId', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const site = await Site.findOne({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    const pageIndex = site.pages.findIndex(p => p._id.toString() === req.params.pageId);
    if (pageIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Page not found' });
    }

    if (site.pages[pageIndex].isHomePage) {
      return res.status(400).json({ ok: false, error: 'Cannot delete homepage' });
    }

    site.pages.splice(pageIndex, 1);
    await site.save();

    res.json({ ok: true, message: 'Page deleted' });
  } catch (error) {
    console.error('Delete page error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// DOMAIN MANAGEMENT (with DomainNameAPI)
// ==========================================

/**
 * Check subdomain availability
 * GET /api/sites/domain/check-subdomain
 */
router.get('/domain/check-subdomain', async (req, res) => {
  try {
    const Site = getSiteModel();
    const { subdomain } = req.query;

    if (!subdomain || subdomain.length < 3) {
      return res.status(400).json({ ok: false, error: 'Subdomain must be at least 3 characters' });
    }

    const reserved = ['www', 'api', 'app', 'admin', 'mail', 'blog', 'help', 'support', 'cybev', 'sites'];
    if (reserved.includes(subdomain.toLowerCase())) {
      return res.json({ ok: true, available: false, reason: 'Reserved subdomain' });
    }

    const exists = await Site.findOne({ subdomain: subdomain.toLowerCase() });
    
    res.json({ 
      ok: true, 
      available: !exists,
      subdomain: subdomain.toLowerCase()
    });
  } catch (error) {
    console.error('Check subdomain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Search available domains for purchase
 * GET /api/sites/domain/search
 */
router.get('/domain/search', verifyToken, async (req, res) => {
  try {
    const { keyword, tlds } = req.query;
    
    if (!keyword || keyword.length < 2) {
      return res.status(400).json({ ok: false, error: 'Keyword must be at least 2 characters' });
    }

    const cleanKeyword = keyword.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    if (!domainService || !domainService.isConfigured()) {
      const defaultTlds = ['com', 'io', 'net', 'org', 'co'];
      const suggestions = defaultTlds.map(tld => ({
        domain: `${cleanKeyword}.${tld}`,
        tld,
        available: null,
        price: null,
        note: 'Domain API not configured'
      }));
      return res.json({ ok: true, suggestions });
    }

    const tldList = tlds ? tlds.split(',') : ['com', 'io', 'net', 'org', 'co'];
    const suggestions = await domainService.suggestDomains(cleanKeyword, tldList);
    
    res.json({ ok: true, suggestions });
  } catch (error) {
    console.error('Search domains error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get domain pricing
 * GET /api/sites/domain/pricing
 */
router.get('/domain/pricing', async (req, res) => {
  try {
    if (!domainService || !domainService.isConfigured()) {
      return res.json({
        ok: true,
        pricing: [
          { tld: 'com', registration: 12.99, renewal: 14.99, currency: 'USD' },
          { tld: 'io', registration: 39.99, renewal: 39.99, currency: 'USD' },
          { tld: 'net', registration: 12.99, renewal: 14.99, currency: 'USD' },
          { tld: 'org', registration: 12.99, renewal: 14.99, currency: 'USD' },
          { tld: 'co', registration: 29.99, renewal: 29.99, currency: 'USD' }
        ],
        note: 'Default pricing'
      });
    }

    const pricing = await domainService.getAllTLDs();
    res.json({ ok: true, pricing });
  } catch (error) {
    console.error('Get pricing error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Register a new domain for site
 * POST /api/sites/:id/domain/register
 */
router.post('/:id/domain/register', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const { domain, years = 1 } = req.body;
    
    if (!domain) {
      return res.status(400).json({ ok: false, error: 'Domain required' });
    }

    const site = await Site.findOne({ _id: req.params.id, owner: req.user.id });
    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ 
        ok: false, 
        error: 'Domain registration not available - API not configured' 
      });
    }

    // Check availability first
    const availability = await domainService.checkAvailability(domain.toLowerCase());
    if (!availability.available) {
      return res.status(400).json({ ok: false, error: 'Domain is not available' });
    }

    // Register the domain
    const result = await domainService.registerDomain(domain.toLowerCase(), years);

    if (result.success) {
      // Setup DNS for CYBEV
      await domainService.setupCYBEVDNS(domain.toLowerCase(), site.subdomain);
      
      // Update site with registered domain
      site.registeredDomain = {
        domain: domain.toLowerCase(),
        registeredAt: new Date(),
        expiresAt: result.expirationDate,
        autoRenew: true
      };
      
      // Also set as custom domain
      site.customDomain = {
        domain: domain.toLowerCase(),
        verified: true, // Auto-verified since we own it
        verifiedAt: new Date(),
        sslEnabled: true
      };
      
      await site.save();

      res.json({
        ok: true,
        domain: domain.toLowerCase(),
        expirationDate: result.expirationDate,
        url: `https://${domain.toLowerCase()}`
      });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Register domain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Update subdomain
 * PUT /api/sites/:id/subdomain
 */
router.put('/:id/subdomain', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const { subdomain } = req.body;

    if (!subdomain || subdomain.length < 3) {
      return res.status(400).json({ ok: false, error: 'Subdomain must be at least 3 characters' });
    }

    const exists = await Site.findOne({ 
      subdomain: subdomain.toLowerCase(),
      _id: { $ne: req.params.id }
    });

    if (exists) {
      return res.status(400).json({ ok: false, error: 'Subdomain already taken' });
    }

    const site = await Site.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { subdomain: subdomain.toLowerCase() },
      { new: true }
    );

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    res.json({ 
      ok: true, 
      subdomain: site.subdomain,
      url: `https://${site.subdomain}.cybev.io`
    });
  } catch (error) {
    console.error('Update subdomain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Connect existing custom domain
 * POST /api/sites/:id/domain/connect
 */
router.post('/:id/domain/connect', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ ok: false, error: 'Domain required' });
    }

    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ ok: false, error: 'Invalid domain format' });
    }

    const existing = await Site.findOne({
      'customDomain.domain': domain.toLowerCase(),
      _id: { $ne: req.params.id }
    });

    if (existing) {
      return res.status(400).json({ ok: false, error: 'Domain already in use' });
    }

    const verificationToken = crypto.randomBytes(16).toString('hex');

    const site = await Site.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { 
        customDomain: {
          domain: domain.toLowerCase(),
          verified: false,
          verificationToken,
          sslEnabled: false
        }
      },
      { new: true }
    );

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    res.json({
      ok: true,
      domain: site.customDomain.domain,
      instructions: {
        step1: 'Add a CNAME record pointing your domain to sites.cybev.io',
        step2: `Add a TXT record: _cybev-verify.${domain} → ${verificationToken}`,
        cname: { name: domain, value: 'sites.cybev.io' },
        txt: { name: `_cybev-verify.${domain}`, value: verificationToken }
      }
    });
  } catch (error) {
    console.error('Connect domain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Verify custom domain
 * POST /api/sites/:id/domain/verify
 */
router.post('/:id/domain/verify', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const site = await Site.findOne({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!site || !site.customDomain?.domain) {
      return res.status(404).json({ ok: false, error: 'Site or domain not found' });
    }

    const dns = require('dns').promises;
    
    try {
      const records = await dns.resolveCname(site.customDomain.domain);
      const hasCorrectCname = records.some(r => r.includes('cybev.io'));
      
      if (!hasCorrectCname) {
        return res.json({
          ok: true,
          verified: false,
          message: 'CNAME record not found. Please add CNAME pointing to sites.cybev.io'
        });
      }

      site.customDomain.verified = true;
      site.customDomain.verifiedAt = new Date();
      site.customDomain.sslEnabled = true;
      await site.save();

      res.json({
        ok: true,
        verified: true,
        url: `https://${site.customDomain.domain}`
      });
    } catch (dnsError) {
      res.json({
        ok: true,
        verified: false,
        message: 'DNS records not found. Please wait for DNS propagation (can take up to 48 hours)'
      });
    }
  } catch (error) {
    console.error('Verify domain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Remove custom domain
 * DELETE /api/sites/:id/domain
 */
router.delete('/:id/domain', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const site = await Site.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $unset: { customDomain: 1 } },
      { new: true }
    );

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    res.json({ ok: true, message: 'Custom domain removed' });
  } catch (error) {
    console.error('Remove domain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// TEMPLATES
// ==========================================

/**
 * Get available templates
 * GET /api/sites/templates/list
 */
router.get('/templates/list', async (req, res) => {
  try {
    const { category } = req.query;

    const templates = [
      { id: 'minimal', name: 'Minimal', category: 'personal', description: 'Clean, simple design' },
      { id: 'portfolio', name: 'Portfolio', category: 'personal', description: 'Showcase your work' },
      { id: 'writer', name: 'Writer', category: 'personal', description: 'Perfect for bloggers' },
      { id: 'corporate', name: 'Corporate', category: 'business', description: 'Professional business' },
      { id: 'agency', name: 'Agency', category: 'business', description: 'Creative agency' },
      { id: 'startup', name: 'Startup', category: 'business', description: 'Modern startup' },
      { id: 'artist', name: 'Artist', category: 'creative', description: 'Visual-focused' },
      { id: 'photographer', name: 'Photographer', category: 'creative', description: 'Gallery layout' },
      { id: 'musician', name: 'Musician', category: 'creative', description: 'Audio-ready dark theme' },
      { id: 'church', name: 'Church', category: 'ministry', description: 'Warm welcoming' },
      { id: 'ministry', name: 'Ministry', category: 'ministry', description: 'Faith-focused' },
      { id: 'devotional', name: 'Devotional', category: 'ministry', description: 'Daily devotional' },
      { id: 'podcast', name: 'Podcast', category: 'media', description: 'Podcast showcase' },
      { id: 'magazine', name: 'Magazine', category: 'media', description: 'News layout' },
      { id: 'video', name: 'Video Blog', category: 'media', description: 'Video-centric' }
    ];

    const filtered = category 
      ? templates.filter(t => t.category === category)
      : templates;

    res.json({ ok: true, templates: filtered });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// AI GENERATION
// ==========================================

/**
 * Generate site with AI
 * POST /api/sites/ai/generate
 */
router.post('/ai/generate', verifyToken, async (req, res) => {
  try {
    const { prompt, category, style } = req.body;

    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt required' });
    }

    let aiService;
    try {
      aiService = require('../services/ai.service');
    } catch (err) {
      console.log('AI service not available');
    }

    let generatedSite = {
      name: 'My Website',
      tagline: 'Welcome to my site',
      description: '',
      pages: []
    };

    if (aiService) {
      const aiPrompt = `Generate a website structure for: "${prompt}"
      
Return JSON only:
{
  "name": "Website name",
  "tagline": "Short tagline",
  "description": "Site description",
  "suggestedTemplate": "minimal|portfolio|corporate|church|podcast",
  "primaryColor": "#hex",
  "pages": [
    {
      "title": "Home",
      "slug": "home",
      "sections": [
        {"type": "hero", "content": {"heading": "...", "subheading": "..."}},
        {"type": "text", "content": {"heading": "About", "text": "..."}}
      ]
    }
  ]
}`;

      try {
        const response = await aiService.generateContent(aiPrompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          generatedSite = JSON.parse(jsonMatch[0]);
        }
      } catch (aiError) {
        console.error('AI generation error:', aiError);
      }
    }

    const Site = getSiteModel();
    const site = new Site({
      owner: req.user.id,
      name: generatedSite.name,
      tagline: generatedSite.tagline,
      description: generatedSite.description,
      category: category || 'personal-blog',
      theme: {
        template: generatedSite.suggestedTemplate || style || 'minimal',
        primaryColor: generatedSite.primaryColor || '#7c3aed'
      },
      pages: generatedSite.pages?.length ? generatedSite.pages.map((p, i) => ({
        ...p,
        isHomePage: i === 0 || p.slug === 'home',
        isPublished: true,
        order: i
      })) : [{
        title: 'Home',
        slug: 'home',
        isHomePage: true,
        isPublished: true,
        sections: [
          {
            type: 'hero',
            content: { heading: generatedSite.name, subheading: generatedSite.tagline },
            order: 0
          }
        ]
      }],
      aiGenerated: {
        isAiGenerated: true,
        prompt,
        generatedAt: new Date()
      }
    });

    await site.save();

    res.status(201).json({
      ok: true,
      site: {
        _id: site._id,
        name: site.name,
        subdomain: site.subdomain,
        url: site.url,
        pages: site.pages.map(p => ({ title: p.title, slug: p.slug }))
      }
    });
  } catch (error) {
    console.error('AI generate site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// PUBLIC SITE RENDERING
// ==========================================

/**
 * Get public site by domain
 * GET /api/sites/public/:domain
 */
router.get('/public/:domain', async (req, res) => {
  try {
    const Site = getSiteModel();
    const { domain } = req.params;

    const site = await Site.findOne({
      $or: [
        { subdomain: domain },
        { 'customDomain.domain': domain, 'customDomain.verified': true }
      ],
      status: 'published'
    }).populate('owner', 'name username avatar');

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    Site.findByIdAndUpdate(site._id, { $inc: { 'stats.views': 1 } }).exec();

    res.json({ ok: true, site });
  } catch (error) {
    console.error('Get public site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
