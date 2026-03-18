// ============================================
// FILE: routes/userAutoBlog.routes.js
// User Auto-Blog API — lets users create their own auto-blog
// Respects plan limits (free=1/week, paid=more/day)
// VERSION: 1.0
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

let verifyToken;
try { verifyToken = require('../middleware/verifyToken'); } catch {
  verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    try { req.user = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'cybev-secret-key'); next(); }
    catch { return res.status(401).json({ error: 'Invalid token' }); }
  };
}

console.log('📝 User Auto-Blog routes v1.0 loaded');

// Helper: get user plan limits
async function getUserLimits(userId) {
  const Wallet = mongoose.model('Wallet');
  const wallet = await Wallet.findOne({ user: userId }).lean();
  const plan = wallet?.subscription?.plan || 'free';
  const plans = Wallet.PLANS || {};
  const limits = plans[plan]?.limits || {};
  return { plan, limits, wallet };
}

// GET /my-campaigns
router.get('/my-campaigns', verifyToken, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const campaigns = await AutoBlogCampaign.find({ createdBy: req.user.id })
      .sort({ createdAt: -1 }).lean();
    res.json({ ok: true, campaigns });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /campaigns — create user auto-blog
router.post('/campaigns', verifyToken, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const { plan, limits } = await getUserLimits(req.user.id);

    // Check if user already has a campaign
    const existing = await AutoBlogCampaign.countDocuments({ createdBy: req.user.id });
    const maxCampaigns = plan === 'free' ? 1 : plan === 'starter' ? 2 : plan === 'pro' ? 5 : 10;
    if (existing >= maxCampaigns) {
      return res.status(400).json({ error: `Your ${plan} plan allows ${maxCampaigns} auto-blog campaign(s). Upgrade for more.` });
    }

    const maxPerDay = limits.autoBlogPerDay || 0;
    const articlesPerDay = plan === 'free' ? 0 : Math.min(req.body.articlesPerDay || 1, maxPerDay);

    // Free plan: special schedule (1 per week = post on Mondays at 10am)
    const postingHours = plan === 'free' ? [10] : (req.body.postingHours || [8, 12, 16, 20]);

    const campaign = await AutoBlogCampaign.create({
      name: req.body.name || 'My Auto-Blog',
      articlesPerDay: plan === 'free' ? 1 : articlesPerDay,
      randomUserCount: 0, // user's own account
      assignedUsers: [req.user.id], // write as this user
      topics: req.body.topics || [],
      categories: req.body.categories || ['general'],
      tones: req.body.tones || ['conversational'],
      articleLength: req.body.articleLength || 'medium',
      includeSEO: req.body.includeSEO !== false,
      includeImages: req.body.includeImages !== false,
      postingHours,
      isActive: true,
      createdBy: req.user.id,
    });

    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /campaigns/:id/toggle — pause/resume
router.post('/campaigns/:id/toggle', verifyToken, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const campaign = await AutoBlogCampaign.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    campaign.isPaused = !campaign.isPaused;
    await campaign.save();
    res.json({ ok: true, isPaused: campaign.isPaused });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /campaigns/:id
router.delete('/campaigns/:id', verifyToken, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    await AutoBlogCampaign.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /campaigns/:id/run-now — generate one article immediately
router.post('/campaigns/:id/run-now', verifyToken, async (req, res) => {
  try {
    const AutoBlogCampaign = mongoose.model('AutoBlogCampaign');
    const campaign = await AutoBlogCampaign.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    const { plan, limits } = await getUserLimits(req.user.id);

    // Check daily limit
    let Blog;
    try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = await Blog.countDocuments({
      author: req.user.id, isAIGenerated: true, createdAt: { $gte: todayStart }
    });

    const maxPerDay = plan === 'free' ? 1 : (limits.autoBlogPerDay || 1);
    // Free users: check weekly limit
    if (plan === 'free') {
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
      const weekCount = await Blog.countDocuments({
        author: req.user.id, isAIGenerated: true, createdAt: { $gte: weekStart }
      });
      if (weekCount >= 1) {
        return res.status(400).json({ error: 'Free plan limit: 1 AI article per week. Upgrade for daily articles!' });
      }
    } else if (todayCount >= maxPerDay) {
      return res.status(400).json({ error: `Daily limit reached (${maxPerDay}/day on ${plan} plan). Upgrade for more!` });
    }

    // Respond immediately, generate in background
    res.json({ ok: true, message: 'Generating your article now! Check your blog in 1-2 minutes.' });

    // Background generation
    const autoBlogProcessor = require('../cron/auto-blog-processor');
    const origHours = [...campaign.postingHours];
    campaign.postingHours = [new Date().getHours()];
    campaign.articlesPerDay = 1; // just generate 1
    await campaign.save();

    autoBlogProcessor.runNow()
      .then(() => AutoBlogCampaign.findByIdAndUpdate(campaign._id, {
        postingHours: origHours,
        articlesPerDay: plan === 'free' ? 1 : (limits.autoBlogPerDay || 1)
      }))
      .catch(() => AutoBlogCampaign.findByIdAndUpdate(campaign._id, { postingHours: origHours }).catch(() => {}));

  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
