// ============================================
// FILE: routes/autoBlog.routes.js
// CYBEV Auto-Blog Campaign Management API
// VERSION: 1.0
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

let verifyToken;
try { verifyToken = require('../middleware/verifyToken'); } catch {
  try { verifyToken = require('../middleware/auth'); } catch {
    verifyToken = (req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token' });
      try { req.user = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'cybev-secret-key'); next(); }
      catch { return res.status(401).json({ error: 'Invalid token' }); }
    };
  }
}

const requireAdmin = async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id || req.user._id);
    if (!user || (user.role !== 'admin' && !user.isAdmin)) return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch { return res.status(500).json({ error: 'Auth check failed' }); }
};

console.log('📝 Auto-Blog routes v1.0 loaded');

// GET /campaigns — List all campaigns
router.get('/campaigns', verifyToken, requireAdmin, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const campaigns = await AutoBlogCampaign.find()
      .populate('assignedUsers', 'username displayName name avatar')
      .populate('createdBy', 'username displayName')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ ok: true, campaigns });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /campaigns — Create new campaign
router.post('/campaigns', verifyToken, requireAdmin, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const data = {
      ...req.body,
      createdBy: req.user.id || req.user._id
    };
    const campaign = await AutoBlogCampaign.create(data);
    console.log(`📝 Auto-Blog campaign created: "${campaign.name}" — ${campaign.articlesPerDay}/day`);
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /campaigns/:id — Update campaign
router.put('/campaigns/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const campaign = await AutoBlogCampaign.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /campaigns/:id
router.delete('/campaigns/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    await AutoBlogCampaign.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /campaigns/:id/toggle — Pause/resume
router.post('/campaigns/:id/toggle', verifyToken, requireAdmin, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const campaign = await AutoBlogCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    campaign.isPaused = !campaign.isPaused;
    await campaign.save();
    res.json({ ok: true, isPaused: campaign.isPaused });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /campaigns/:id/run-now — Trigger immediate generation (fire-and-forget)
router.post('/campaigns/:id/run-now', verifyToken, requireAdmin, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const campaign = await AutoBlogCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    const autoBlogProcessor = require('../cron/auto-blog-processor');
    
    // Override posting hours temporarily
    const origHours = [...campaign.postingHours];
    campaign.postingHours = [new Date().getHours()];
    await campaign.save();
    
    // Respond immediately — generation runs in background
    res.json({ ok: true, message: `Generating ${campaign.articlesPerDay} articles in background. Check back in a few minutes.` });

    // Run in background (don't await)
    autoBlogProcessor.runNow()
      .then(() => AutoBlogCampaign.findByIdAndUpdate(campaign._id, { postingHours: origHours }))
      .catch(err => {
        console.error('Run-now background error:', err.message);
        AutoBlogCampaign.findByIdAndUpdate(campaign._id, { postingHours: origHours }).catch(() => {});
      });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /stats — Overall auto-blog stats
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    let Blog;
    try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }

    const [campaigns, totalAIBlogs, todayBlogs] = await Promise.all([
      AutoBlogCampaign.find().lean(),
      Blog.countDocuments({ isAIGenerated: true }),
      Blog.countDocuments({ isAIGenerated: true, createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } })
    ]);

    const totalArticles = campaigns.reduce((s, c) => s + (c.totalArticlesGenerated || 0), 0);
    const activeCampaigns = campaigns.filter(c => c.isActive && !c.isPaused).length;
    const totalPerDay = campaigns.filter(c => c.isActive && !c.isPaused).reduce((s, c) => s + c.articlesPerDay, 0);

    res.json({
      ok: true,
      stats: {
        totalCampaigns: campaigns.length,
        activeCampaigns,
        pausedCampaigns: campaigns.filter(c => c.isPaused).length,
        totalArticlesGenerated: totalArticles,
        totalAIBlogsInDB: totalAIBlogs,
        articlesGeneratedToday: todayBlogs,
        projectedDailyOutput: totalPerDay,
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /special-users — List available special users for assignment
router.get('/special-users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const { limit = 50, search } = req.query;
    const filter = { isSynthetic: true };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } },
      { displayName: { $regex: search, $options: 'i' } }
    ];
    const users = await User.find(filter)
      .select('_id name displayName username avatar syntheticMeta.country')
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean();
    res.json({ ok: true, users, total: await User.countDocuments(filter) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
