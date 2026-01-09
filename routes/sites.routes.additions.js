// ============================================
// FILE: routes/sites.routes.additions.js
// Additional Site Routes for Website Builder
// ADD THESE TO YOUR EXISTING sites.routes.js
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// GET /api/sites/subdomain/:subdomain - Get site by subdomain
router.get('/subdomain/:subdomain', async (req, res) => {
  try {
    const Site = mongoose.models.Site || require('../models/site.model');
    const { subdomain } = req.params;

    const site = await Site.findOne({ subdomain: subdomain.toLowerCase() })
      .populate('owner', 'name username avatar');

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    res.json({ ok: true, site });
  } catch (error) {
    console.error('Get site by subdomain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sites/my - Get current user's sites
router.get('/my', verifyToken, async (req, res) => {
  try {
    const Site = mongoose.models.Site || require('../models/site.model');

    const sites = await Site.find({ owner: req.user.id })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ ok: true, sites });
  } catch (error) {
    console.error('Get my sites error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/sites/:id/publish - Publish site (with optional feed post)
router.post('/:id/publish', verifyToken, async (req, res) => {
  try {
    const { postToFeed = true } = req.body;
    const Site = mongoose.models.Site || require('../models/site.model');

    const site = await Site.findById(req.params.id);

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    if (site.owner.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    // Update publish status
    site.isPublished = true;
    site.publishedAt = new Date();
    await site.save();

    // Create feed post if enabled
    let feedPost = null;
    if (postToFeed) {
      try {
        const Post = mongoose.models.Post || require('../models/post.model');
        
        feedPost = new Post({
          author: req.user.id,
          content: `🌐 Just launched my new website!\n\n"${site.name}"\n\n${site.description || ''}\n\nCheck it out: https://${site.subdomain}.cybev.io\n\n#Website #CYBEV`,
          media: site.thumbnail ? [{
            type: 'image',
            url: site.thumbnail
          }] : [],
          postType: 'website',
          websiteData: {
            siteId: site._id,
            name: site.name,
            subdomain: site.subdomain,
            url: `https://${site.subdomain}.cybev.io`,
            thumbnail: site.thumbnail
          },
          isPublished: true
        });

        await feedPost.save();
      } catch (err) {
        console.error('Create website feed post error:', err);
      }
    }

    res.json({
      ok: true,
      site,
      feedPost: feedPost ? {
        _id: feedPost._id,
        message: 'Website shared to your feed!'
      } : null
    });

  } catch (error) {
    console.error('Publish site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/sites/:id - Update site
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const Site = mongoose.models.Site || require('../models/site.model');
    const site = await Site.findById(req.params.id);

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    if (site.owner.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const allowedUpdates = [
      'name', 'description', 'subdomain', 'customDomain',
      'sections', 'theme', 'settings', 'seo', 'thumbnail'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        site[field] = req.body[field];
      }
    });

    await site.save();

    res.json({ ok: true, site });
  } catch (error) {
    console.error('Update site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/sites/:id - Delete site
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const Site = mongoose.models.Site || require('../models/site.model');
    const site = await Site.findById(req.params.id);

    if (!site) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }

    if (site.owner.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    await Site.findByIdAndDelete(req.params.id);

    res.json({ ok: true, message: 'Site deleted' });
  } catch (error) {
    console.error('Delete site error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
