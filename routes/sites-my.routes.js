// ============================================
// FILE: routes/sites-my.routes.js
// Sites "My" Routes - MUST LOAD BEFORE sites.routes.js
// FIX: /api/sites/my was being caught by /:id route
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
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
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// Get Site model
const getSite = () => {
  return mongoose.models.Site || require('../models/site.model');
};

// ==========================================
// GET /api/sites/my - Get current user's sites
// CRITICAL: This must be defined before /:id route
// ==========================================
router.get('/my', verifyToken, async (req, res) => {
  try {
    const Site = getSite();

    const sites = await Site.find({ owner: req.user.id })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ ok: true, sites: sites || [] });
  } catch (error) {
    console.error('Get my sites error:', error);
    res.status(500).json({ ok: false, error: error.message, sites: [] });
  }
});

// ==========================================
// GET /api/sites/subdomain/:subdomain - Get site by subdomain
// ==========================================
router.get('/subdomain/:subdomain', async (req, res) => {
  try {
    const Site = getSite();
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

module.exports = router;
