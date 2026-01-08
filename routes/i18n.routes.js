// ============================================
// FILE: routes/i18n.routes.js
// Internationalization API Routes
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Get i18n service
const getI18nService = () => {
  try {
    return require('../services/i18n.service');
  } catch (err) {
    console.error('i18n service not found:', err.message);
    return null;
  }
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

/**
 * Get supported locales
 * GET /api/i18n/locales
 */
router.get('/locales', (req, res) => {
  try {
    const i18n = getI18nService();
    if (!i18n) {
      return res.status(500).json({ ok: false, error: 'i18n service not available' });
    }

    res.json({
      ok: true,
      locales: i18n.getSupportedLocales(),
      default: i18n.defaultLocale
    });
  } catch (error) {
    console.error('Get locales error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get translations for a locale
 * GET /api/i18n/translations/:locale
 */
router.get('/translations/:locale', (req, res) => {
  try {
    const i18n = getI18nService();
    if (!i18n) {
      return res.status(500).json({ ok: false, error: 'i18n service not available' });
    }

    const { locale } = req.params;
    
    if (!i18n.isSupported(locale)) {
      return res.status(400).json({ 
        ok: false, 
        error: `Locale '${locale}' is not supported`,
        supported: i18n.supportedLocales
      });
    }

    res.json({
      ok: true,
      locale,
      translations: i18n.getTranslations(locale)
    });
  } catch (error) {
    console.error('Get translations error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Detect locale from request
 * GET /api/i18n/detect
 */
router.get('/detect', (req, res) => {
  try {
    const i18n = getI18nService();
    if (!i18n) {
      return res.status(500).json({ ok: false, error: 'i18n service not available' });
    }

    const acceptLanguage = req.headers['accept-language'];
    const detectedLocale = i18n.detectLocale(acceptLanguage);

    res.json({
      ok: true,
      detected: detectedLocale,
      header: acceptLanguage
    });
  } catch (error) {
    console.error('Detect locale error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get user's language preference
 * GET /api/i18n/preference
 */
router.get('/preference', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const user = await User.findById(req.user.id).select('language');

    res.json({
      ok: true,
      language: user?.language || 'en'
    });
  } catch (error) {
    console.error('Get language preference error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Update user's language preference
 * PUT /api/i18n/preference
 */
router.put('/preference', verifyToken, async (req, res) => {
  try {
    const i18n = getI18nService();
    const User = mongoose.models.User || require('../models/user.model');
    const { language } = req.body;

    if (!language) {
      return res.status(400).json({ ok: false, error: 'Language is required' });
    }

    if (i18n && !i18n.isSupported(language)) {
      return res.status(400).json({ 
        ok: false, 
        error: `Language '${language}' is not supported` 
      });
    }

    await User.findByIdAndUpdate(req.user.id, { language });

    res.json({
      ok: true,
      language,
      message: 'Language preference updated'
    });
  } catch (error) {
    console.error('Update language preference error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Translate a specific key
 * POST /api/i18n/translate
 */
router.post('/translate', (req, res) => {
  try {
    const i18n = getI18nService();
    if (!i18n) {
      return res.status(500).json({ ok: false, error: 'i18n service not available' });
    }

    const { keys, locale = 'en', params = {} } = req.body;

    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ ok: false, error: 'Keys array is required' });
    }

    const translations = {};
    keys.forEach(key => {
      translations[key] = i18n.t(key, locale, params[key] || {});
    });

    res.json({
      ok: true,
      locale,
      translations
    });
  } catch (error) {
    console.error('Translate error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Format utilities
 * POST /api/i18n/format
 */
router.post('/format', (req, res) => {
  try {
    const i18n = getI18nService();
    if (!i18n) {
      return res.status(500).json({ ok: false, error: 'i18n service not available' });
    }

    const { type, value, locale = 'en', options = {} } = req.body;

    let formatted;
    switch (type) {
      case 'number':
        formatted = i18n.formatNumber(value, locale);
        break;
      case 'date':
        formatted = i18n.formatDate(value, locale, options);
        break;
      case 'relativeTime':
        formatted = i18n.formatRelativeTime(value, locale);
        break;
      default:
        return res.status(400).json({ ok: false, error: 'Invalid format type' });
    }

    res.json({
      ok: true,
      formatted,
      type,
      locale
    });
  } catch (error) {
    console.error('Format error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
