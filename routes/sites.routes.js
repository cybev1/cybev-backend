// ============================================
// FILE: routes/sites.routes.js
// Website Builder API Routes
// VERSION: 1.0
// Squarespace-like site management
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Get Site model
const getSiteModel = () => {
  return mongoose.models.Site || require('../models/site.model');
};

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

    // Check user's site limit (e.g., 5 sites for free users)
    const existingSites = await Site.countDocuments({ owner: req.user.id });
    const maxSites = 10; // Adjust based on plan
    
    if (existingSites >= maxSites) {
      return res.status(403).json({ 
        ok: false, 
        error: `You can create up to ${maxSites} sites` 
      });
    }

    // Create default homepage
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
          content: {
            heading: 'Latest Posts',
            count: 6
          },
          settings: { padding: 'medium' },
          order: 2
        },
        {
          type: 'contact-form',
          content: {
            heading: 'Get in Touch',
            submitText: 'Send Message'
          },
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
      theme: {
        template: template || 'minimal'
      },
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

    // Generate slug if not provided
    const pageSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Check for duplicate slug
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

    // Update fields
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

    // Don't allow deleting homepage
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
// DOMAIN MANAGEMENT
// ==========================================

/**
 * Check subdomain availability
 * GET /api/sites/domain/check
 */
router.get('/domain/check', async (req, res) => {
  try {
    const Site = getSiteModel();
    const { subdomain } = req.query;

    if (!subdomain || subdomain.length < 3) {
      return res.status(400).json({ ok: false, error: 'Subdomain must be at least 3 characters' });
    }

    // Reserved subdomains
    const reserved = ['www', 'api', 'app', 'admin', 'mail', 'blog', 'help', 'support', 'cybev'];
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

    // Check availability
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
 * Add custom domain
 * POST /api/sites/:id/domain
 */
router.post('/:id/domain', verifyToken, async (req, res) => {
  try {
    const Site = getSiteModel();
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ ok: false, error: 'Domain required' });
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ ok: false, error: 'Invalid domain format' });
    }

    // Check if domain already in use
    const existing = await Site.findOne({
      'customDomain.domain': domain.toLowerCase(),
      _id: { $ne: req.params.id }
    });

    if (existing) {
      return res.status(400).json({ ok: false, error: 'Domain already in use' });
    }

    // Generate verification token
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
      verification: {
        type: 'CNAME',
        name: '_cybev-verify',
        value: verificationToken,
        instructions: `Add a CNAME record: _cybev-verify.${domain} → ${verificationToken}.verify.cybev.io`
      },
      cname: {
        type: 'CNAME',
        name: domain,
        value: 'sites.cybev.io',
        instructions: `Add a CNAME record: ${domain} → sites.cybev.io`
      }
    });
  } catch (error) {
    console.error('Add domain error:', error);
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

    // In production, you would actually verify DNS records here
    // For now, we'll simulate verification
    const dns = require('dns').promises;
    
    try {
      // Check CNAME record
      const records = await dns.resolveCname(site.customDomain.domain);
      const hasCorrectCname = records.some(r => r.includes('cybev.io'));
      
      if (!hasCorrectCname) {
        return res.json({
          ok: true,
          verified: false,
          message: 'CNAME record not found. Please add CNAME pointing to sites.cybev.io'
        });
      }

      // Mark as verified
      site.customDomain.verified = true;
      site.customDomain.verifiedAt = new Date();
      site.customDomain.sslEnabled = true; // In production, trigger SSL provisioning
      await site.save();

      res.json({
        ok: true,
        verified: true,
        url: `https://${site.customDomain.domain}`
      });
    } catch (dnsError) {
      // DNS lookup failed
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
 * GET /api/sites/templates
 */
router.get('/templates/list', async (req, res) => {
  try {
    const { category } = req.query;

    const templates = [
      // Personal
      { id: 'minimal', name: 'Minimal', category: 'personal', preview: '/templates/minimal.jpg', description: 'Clean, simple design for personal blogs' },
      { id: 'portfolio', name: 'Portfolio', category: 'personal', preview: '/templates/portfolio.jpg', description: 'Showcase your work beautifully' },
      { id: 'writer', name: 'Writer', category: 'personal', preview: '/templates/writer.jpg', description: 'Perfect for authors and bloggers' },
      
      // Business
      { id: 'corporate', name: 'Corporate', category: 'business', preview: '/templates/corporate.jpg', description: 'Professional business website' },
      { id: 'agency', name: 'Agency', category: 'business', preview: '/templates/agency.jpg', description: 'Creative agency template' },
      { id: 'startup', name: 'Startup', category: 'business', preview: '/templates/startup.jpg', description: 'Modern startup landing page' },
      
      // Creative
      { id: 'artist', name: 'Artist', category: 'creative', preview: '/templates/artist.jpg', description: 'Visual-focused for artists' },
      { id: 'photographer', name: 'Photographer', category: 'creative', preview: '/templates/photographer.jpg', description: 'Gallery-centric layout' },
      { id: 'musician', name: 'Musician', category: 'creative', preview: '/templates/musician.jpg', description: 'Audio-ready with dark theme' },
      
      // Ministry
      { id: 'church', name: 'Church', category: 'ministry', preview: '/templates/church.jpg', description: 'Warm, welcoming church website' },
      { id: 'ministry', name: 'Ministry', category: 'ministry', preview: '/templates/ministry.jpg', description: 'Ministry and nonprofit template' },
      { id: 'devotional', name: 'Devotional', category: 'ministry', preview: '/templates/devotional.jpg', description: 'Daily devotional blog' },
      
      // Media
      { id: 'podcast', name: 'Podcast', category: 'media', preview: '/templates/podcast.jpg', description: 'Podcast showcase template' },
      { id: 'magazine', name: 'Magazine', category: 'media', preview: '/templates/magazine.jpg', description: 'News and magazine layout' },
      { id: 'video', name: 'Video Blog', category: 'media', preview: '/templates/video.jpg', description: 'Video-centric vlog template' }
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
    const { 
      prompt, 
      category, 
      style,
      includePages = ['home', 'about', 'contact'],
      generateContent = true 
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt required' });
    }

    // Get AI service
    let aiService;
    try {
      aiService = require('../services/ai.service');
    } catch (err) {
      console.log('AI service not available, using fallback');
    }

    // Generate site structure and content with AI
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

    // Create the site
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
            content: {
              heading: generatedSite.name,
              subheading: generatedSite.tagline
            },
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

/**
 * Generate content for a section with AI
 * POST /api/sites/ai/content
 */
router.post('/ai/content', verifyToken, async (req, res) => {
  try {
    const { sectionType, context, tone = 'professional' } = req.body;

    let aiService;
    try {
      aiService = require('../services/ai.service');
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'AI service not available' });
    }

    const prompt = `Generate content for a ${sectionType} section on a website.
Context: ${context}
Tone: ${tone}

Return JSON with appropriate fields for this section type.`;

    const response = await aiService.generateContent(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      res.json({ ok: true, content: JSON.parse(jsonMatch[0]) });
    } else {
      res.json({ ok: true, content: { text: response } });
    }
  } catch (error) {
    console.error('AI content error:', error);
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

    const site = await Site.findByDomain(domain);

    if (!site || site.status !== 'published') {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    // Increment view count
    Site.findByIdAndUpdate(site._id, { $inc: { 'stats.views': 1 } }).exec();

    res.json({ ok: true, site });
  } catch (error) {
    console.error('Get public site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get public page
 * GET /api/sites/public/:domain/:slug
 */
router.get('/public/:domain/:slug', async (req, res) => {
  try {
    const Site = getSiteModel();
    const { domain, slug } = req.params;

    const site = await Site.findByDomain(domain);

    if (!site || site.status !== 'published') {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    const page = site.getPageBySlug(slug);
    if (!page || !page.isPublished) {
      return res.status(404).json({ ok: false, error: 'Page not found' });
    }

    res.json({ ok: true, page, site: { name: site.name, theme: site.theme } });
  } catch (error) {
    console.error('Get public page error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
