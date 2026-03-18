// ============================================
// FILE: routes/trafficSimulation.routes.js
// CYBEV Traffic Simulation v2.0 — Admin API + Live Analytics
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
try { trafficService = require('../services/trafficSimulation.service'); } catch (e) { console.log('⚠️ Traffic service not loaded:', e.message); }

// GET /api/traffic/status — Proxy status + config
router.get('/status', auth, isAdmin, async (req, res) => {
  try {
    const proxy = trafficService?.getProxyConfig?.();
    res.json({
      success: true,
      proxyConfigured: !!proxy,
      proxyHost: proxy ? `${proxy.host}:${proxy.port}` : 'Not configured',
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/traffic/live — Live analytics (poll this every 2-3 seconds while running)
router.get('/live', auth, isAdmin, async (req, res) => {
  try {
    if (!trafficService) return res.json({ success: true, stats: null });
    res.json({ success: true, stats: trafficService.getLiveStats() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/traffic/run — Start simulation batch
router.post('/run', auth, isAdmin, async (req, res) => {
  try {
    if (!trafficService) return res.status(500).json({ error: 'Traffic service not loaded' });
    const { articlesCount = 10, visitsPerArticle = 3, concurrency = 15, targetCategory, targetBlogIds } = req.body;

    // Check if already running
    const live = trafficService.getLiveStats();
    if (live.isRunning) {
      return res.status(409).json({ success: false, error: 'Simulation already running', progress: live.progress });
    }

    const totalSessions = articlesCount * visitsPerArticle;
    const estSeconds = Math.ceil(totalSessions / concurrency * 1.5);

    res.json({
      success: true,
      message: `Started: ${totalSessions} sessions (${concurrency} concurrent)`,
      estimatedTime: `${Math.ceil(estSeconds / 60)} min`,
      totalSessions
    });

    trafficService.runTrafficSimulation({ articlesCount, visitsPerArticle, concurrency, targetCategory, targetBlogIds })
      .catch(e => console.error('Traffic error:', e.message));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/traffic/test — Test proxy
router.post('/test', auth, isAdmin, async (req, res) => {
  try {
    if (!trafficService) return res.status(500).json({ error: 'Not loaded' });
    const result = await trafficService.visitPage('https://httpbin.org/ip');
    res.json({ success: true, proxyWorking: result.success, status: result.status, elapsed: result.elapsed + 'ms', error: result.error || null });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/traffic/cron/start
router.post('/cron/start', auth, isAdmin, async (req, res) => {
  try {
    if (!trafficService) return res.status(500).json({ error: 'Not loaded' });
    trafficService.startTrafficCron(req.body?.intervalMinutes || 60);
    res.json({ success: true, message: `Cron started (every ${req.body?.intervalMinutes || 60} min)` });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/traffic/cron/stop
router.post('/cron/stop', auth, isAdmin, async (req, res) => {
  try { trafficService?.stopTrafficCron(); res.json({ success: true }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

console.log('🚗 Traffic simulation routes v2.0 loaded');
module.exports = router;
