// ============================================
// FILE: routes/trafficSimulation.routes.js
// CYBEV Traffic Simulation — Admin API
// VERSION: 1.0
// ============================================
const express = require('express');
const router = express.Router();

let auth, isAdmin;
try { const m = require('../middleware/verifyToken'); auth = m.authenticateToken || m; isAdmin = m.isAdmin; }
catch { try { const m = require('../middleware/auth.middleware'); auth = m.authenticateToken || m; isAdmin = m.isAdmin; }
catch { try { const m = require('../middleware/auth'); auth = m.authenticateToken || m; isAdmin = m.isAdmin; }
catch { auth = (req, res, next) => { const t = req.headers.authorization?.replace('Bearer ', ''); if (!t) return res.status(401).json({ error: 'No token' }); try { const jwt = require('jsonwebtoken'); req.user = jwt.verify(t, process.env.JWT_SECRET || 'cybev_secret_key_2024'); req.user.id = req.user.userId || req.user.id; next(); } catch { return res.status(401).json({ error: 'Invalid token' }); } }; isAdmin = null; }}}
if (!isAdmin) isAdmin = (req, res, next) => { if (req.user?.role === 'admin' || req.user?.isAdmin) return next(); res.status(403).json({ error: 'Admin only' }); };

let trafficService;
try { trafficService = require('../services/trafficSimulation.service'); } catch (e) { console.log('⚠️ Traffic simulation service not loaded:', e.message); }

// GET /api/traffic/status — Check proxy and cron status
router.get('/status', auth, isAdmin, async (req, res) => {
  try {
    const proxyConfig = trafficService?.getProxyConfig?.();
    res.json({
      success: true,
      proxyConfigured: !!proxyConfig,
      proxyHost: proxyConfig?.host || 'Not configured',
      envVars: {
        BRIGHTDATA_HOST: !!process.env.BRIGHTDATA_HOST,
        BRIGHTDATA_USERNAME: !!process.env.BRIGHTDATA_USERNAME,
        BRIGHTDATA_PASSWORD: !!process.env.BRIGHTDATA_PASSWORD,
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/traffic/run — Run a traffic simulation batch (fire-and-forget)
router.post('/run', auth, isAdmin, async (req, res) => {
  try {
    if (!trafficService) return res.status(500).json({ error: 'Traffic service not loaded' });

    const {
      articlesCount = 10,
      visitsPerArticle = 3,
      targetCategory,
      targetBlogIds,
      useProxy = true
    } = req.body;

    res.json({
      success: true,
      message: `Traffic simulation started: ${articlesCount} articles × ${visitsPerArticle} visits`,
      estimatedTime: `${articlesCount * visitsPerArticle * 10}s`
    });

    // Run in background
    trafficService.runTrafficSimulation({
      articlesCount,
      visitsPerArticle,
      targetCategory,
      targetBlogIds,
      useProxy
    }).then(result => {
      console.log('🚗 Traffic batch result:', JSON.stringify(result.stats || {}));
    }).catch(e => {
      console.error('🚗 Traffic batch error:', e.message);
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/traffic/cron/start — Start automatic traffic cron
router.post('/cron/start', auth, isAdmin, async (req, res) => {
  try {
    if (!trafficService) return res.status(500).json({ error: 'Traffic service not loaded' });
    const { intervalMinutes = 60 } = req.body;
    trafficService.startTrafficCron(intervalMinutes);
    res.json({ success: true, message: `Traffic cron started (every ${intervalMinutes} min)` });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/traffic/cron/stop — Stop automatic traffic cron
router.post('/cron/stop', auth, isAdmin, async (req, res) => {
  try {
    if (!trafficService) return res.status(500).json({ error: 'Traffic service not loaded' });
    trafficService.stopTrafficCron();
    res.json({ success: true, message: 'Traffic cron stopped' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/traffic/test — Test proxy connection
router.post('/test', auth, isAdmin, async (req, res) => {
  try {
    if (!trafficService) return res.status(500).json({ error: 'Traffic service not loaded' });
    const result = await trafficService.visitPage('https://httpbin.org/ip');
    res.json({
      success: true,
      proxyWorking: result.success,
      status: result.status,
      elapsed: result.elapsed + 'ms',
      error: result.error || null
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

console.log('🚗 Traffic simulation routes loaded');
module.exports = router;
