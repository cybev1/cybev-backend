const express = require('express');
const BlogSite = require('../models/blogSite.model');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get current user's blog-site settings
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const site = await BlogSite.findOne({ owner: req.user.id });
    return res.json(site || null);
  } catch (err) {
    console.error('GET /api/blogsite/me error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Create/update current user's blog-site settings (upsert)
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const payload = {
      siteName: req.body.siteName,
      tagline: req.body.tagline,
      description: req.body.description,
      logoUrl: req.body.logoUrl,
      coverImageUrl: req.body.coverImageUrl,
      templateId: req.body.templateId,
      theme: req.body.theme,
      socialLinks: req.body.socialLinks,
      customDomain: req.body.customDomain,
      subdomain: req.body.subdomain,
    };

    // Remove undefined keys so we don't overwrite with undefined
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    const site = await BlogSite.findOneAndUpdate(
      { owner: req.user.id },
      { $set: payload, $setOnInsert: { owner: req.user.id } },
      { new: true, upsert: true }
    );

    return res.json(site);
  } catch (err) {
    console.error('PUT /api/blogsite/me error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Public: get a user's blog-site settings
router.get('/user/:userId', async (req, res) => {
  try {
    const site = await BlogSite.findOne({ owner: req.params.userId }).lean();
    return res.json(site || null);
  } catch (err) {
    console.error('GET /api/blogsite/user/:userId error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
