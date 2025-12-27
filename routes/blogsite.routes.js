const express = require('express');
const router = express.Router();
const BlogSite = require('../models/blogsite.model');
const Blog = require('../models/blog.model');
const { requireAuth } = require('../middleware/auth');

// Helpers
function slugify(input = '') {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Create a blog site
router.post('/', requireAuth, async (req, res) => {
  try {
    const owner = req.user._id;
    const { name, slug, description = '', templateKey = 'minimal', branding = {}, domain = {} } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    const finalSlug = slugify(slug || name);
    if (!finalSlug) return res.status(400).json({ error: 'Invalid slug.' });

    const exists = await BlogSite.findOne({ slug: finalSlug });
    if (exists) return res.status(409).json({ error: 'This slug is already taken.' });

    const site = await BlogSite.create({
      owner,
      name: String(name).trim(),
      slug: finalSlug,
      description: String(description || '').trim(),
      templateKey: String(templateKey || 'minimal').trim(),
      branding: {
        logoUrl: branding?.logoUrl || '',
        coverImageUrl: branding?.coverImageUrl || '',
        primaryColor: branding?.primaryColor || ''
      },
      domain: {
        subdomain: domain?.subdomain || '',
        customDomain: domain?.customDomain || '',
        verified: Boolean(domain?.verified || false)
      }
    });

    return res.status(201).json({ site });
  } catch (err) {
    console.error('Create BlogSite error:', err);
    return res.status(500).json({ error: 'Failed to create blog site.' });
  }
});

// My sites
router.get('/my', requireAuth, async (req, res) => {
  try {
    const sites = await BlogSite.find({ owner: req.user._id }).sort({ createdAt: -1 }).lean();
    return res.json({ sites });
  } catch (err) {
    console.error('List my BlogSites error:', err);
    return res.status(500).json({ error: 'Failed to list your blog sites.' });
  }
});

// Update a site
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const site = await BlogSite.findOne({ _id: req.params.id, owner: req.user._id });
    if (!site) return res.status(404).json({ error: 'Site not found.' });

    const { name, description, templateKey, branding, domain, isPublished } = req.body || {};

    if (name !== undefined) site.name = String(name).trim();
    if (description !== undefined) site.description = String(description || '').trim();
    if (templateKey !== undefined) site.templateKey = String(templateKey || '').trim() || 'minimal';
    if (branding) {
      site.branding.logoUrl = branding.logoUrl ?? site.branding.logoUrl;
      site.branding.coverImageUrl = branding.coverImageUrl ?? site.branding.coverImageUrl;
      site.branding.primaryColor = branding.primaryColor ?? site.branding.primaryColor;
    }
    if (domain) {
      site.domain.subdomain = domain.subdomain ?? site.domain.subdomain;
      site.domain.customDomain = domain.customDomain ?? site.domain.customDomain;
      site.domain.verified = domain.verified ?? site.domain.verified;
    }
    if (isPublished !== undefined) site.isPublished = Boolean(isPublished);

    await site.save();
    return res.json({ site });
  } catch (err) {
    console.error('Update BlogSite error:', err);
    return res.status(500).json({ error: 'Failed to update blog site.' });
  }
});

// Public: get site by slug
router.get('/public/:slug', async (req, res) => {
  try {
    const site = await BlogSite.findOne({ slug: req.params.slug }).lean();
    if (!site || !site.isPublished) return res.status(404).json({ error: 'Site not found.' });
    return res.json({ site });
  } catch (err) {
    console.error('Get public BlogSite error:', err);
    return res.status(500).json({ error: 'Failed to load blog site.' });
  }
});

// Public: get posts for site
router.get('/public/:slug/posts', async (req, res) => {
  try {
    const site = await BlogSite.findOne({ slug: req.params.slug }).lean();
    if (!site || !site.isPublished) return res.status(404).json({ error: 'Site not found.' });

    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const posts = await Blog.find({ site: site._id, status: 'published' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'username displayName avatar')
      .lean();

    return res.json({ site, posts });
  } catch (err) {
    console.error('Get BlogSite posts error:', err);
    return res.status(500).json({ error: 'Failed to load blog posts.' });
  }
});

module.exports = router;
