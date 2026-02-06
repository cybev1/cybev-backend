// ============================================
// FILE: routes/campaigns-ab-revenue.routes.js
// CYBEV A/B Testing & Revenue Tracking API
// VERSION: 1.0.0 - Advanced Campaign Features
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Email AI Service
let emailAI = null;
try {
  emailAI = require('../services/email-ai.service');
  console.log('✅ Email AI Service loaded');
} catch (err) {
  console.warn('⚠️ Email AI Service not available');
}

// ==========================================
// A/B TEST SCHEMA (Add to campaign.model.js)
// ==========================================

const abTestSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  name: { type: String, required: true },
  status: { type: String, enum: ['draft', 'running', 'completed', 'cancelled'], default: 'draft' },
  
  // Test configuration
  testType: { type: String, enum: ['subject', 'content', 'sendTime', 'fromName'], required: true },
  
  // Variants
  variants: [{
    id: String,
    name: String,
    
    // For subject tests
    subject: String,
    
    // For content tests
    html: String,
    
    // For send time tests
    sendTime: Date,
    
    // For from name tests
    fromName: String,
    
    // Stats
    stats: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      converted: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }
  }],
  
  // Test settings
  settings: {
    splitPercentage: { type: Number, default: 50 }, // % of audience for test
    winnerCriteria: { type: String, enum: ['openRate', 'clickRate', 'conversionRate', 'revenue'], default: 'openRate' },
    testDuration: { type: Number, default: 4 }, // hours before declaring winner
    autoSendWinner: { type: Boolean, default: true },
    minimumSampleSize: { type: Number, default: 100 }
  },
  
  // Results
  winner: {
    variantId: String,
    declaredAt: Date,
    confidence: Number, // Statistical confidence %
    improvement: Number // % improvement over control
  },
  
  // Timing
  startedAt: Date,
  completedAt: Date
}, { timestamps: true });

const ABTest = mongoose.models.ABTest || mongoose.model('ABTest', abTestSchema);

// ==========================================
// REVENUE TRACKING SCHEMA
// ==========================================

const revenueEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Attribution
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', index: true },
  email: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationEmailLog' },
  
  // Contact
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignContact', index: true },
  email: { type: String, index: true },
  
  // Order details
  orderId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  
  // Items
  items: [{
    name: String,
    sku: String,
    quantity: Number,
    price: Number
  }],
  
  // Attribution window
  attributionType: { type: String, enum: ['direct', 'influenced', 'last_touch'], default: 'last_touch' },
  attributionWindow: { type: Number, default: 7 }, // days
  
  // Source tracking
  source: {
    type: { type: String, enum: ['email_click', 'form_submit', 'api', 'manual'] },
    clickedAt: Date,
    linkUrl: String
  },
  
  // Custom data
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

revenueEventSchema.index({ user: 1, createdAt: -1 });
revenueEventSchema.index({ campaign: 1, createdAt: -1 });

const RevenueEvent = mongoose.models.RevenueEvent || mongoose.model('RevenueEvent', revenueEventSchema);

// ==========================================
// AUTHENTICATION
// ==========================================

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const getUserId = (req) => req.user.userId || req.user.id || req.user._id;

// ==========================================
// AI-POWERED ENDPOINTS
// ==========================================

// Generate subject lines with AI
router.post('/ai/subject-lines', auth, async (req, res) => {
  try {
    const { topic, content, tone, industry, emoji, count, existingSubject, targetAudience } = req.body;
    
    if (!topic && !content && !existingSubject) {
      return res.status(400).json({ error: 'Provide topic, content, or existing subject' });
    }
    
    if (!emailAI) {
      // Fallback to basic suggestions if AI not available
      return res.json({
        ok: true,
        subjectLines: [
          { subject: `${topic || 'Newsletter'} - Don't miss this!`, technique: 'urgency', predictedOpenRate: 'medium' },
          { subject: `New: ${topic || 'Updates'} inside`, technique: 'curiosity', predictedOpenRate: 'medium' },
          { subject: `Quick question about ${topic || 'this'}`, technique: 'question', predictedOpenRate: 'high' },
          { subject: `[Important] ${topic || 'Update'} for you`, technique: 'importance', predictedOpenRate: 'medium' },
          { subject: `Here's what you need to know`, technique: 'benefit', predictedOpenRate: 'medium' }
        ],
        source: 'fallback'
      });
    }
    
    const result = await emailAI.generateSubjectLines({
      topic: topic || content?.substring(0, 200),
      tone: tone || 'professional',
      industry: industry || 'general',
      emoji: emoji !== false,
      count: count || 5,
      existingSubject,
      targetAudience
    });
    
    res.json({ ok: true, ...result, source: 'ai' });
  } catch (err) {
    console.error('AI subject generation error:', err);
    res.status(500).json({ error: 'Failed to generate subject lines' });
  }
});

// Generate email content with AI
router.post('/ai/email-content', auth, async (req, res) => {
  try {
    const { type, subject, topic, tone, length, brandName, ctaText, ctaUrl } = req.body;
    
    if (!topic && !subject) {
      return res.status(400).json({ error: 'Provide topic or subject' });
    }
    
    if (!emailAI) {
      return res.status(503).json({ error: 'AI service not configured' });
    }
    
    const result = await emailAI.generateEmailContent({
      type: type || 'newsletter',
      subject,
      topic,
      tone: tone || 'professional',
      length: length || 'medium',
      brandName: brandName || 'CYBEV',
      ctaText: ctaText || 'Learn More',
      ctaUrl: ctaUrl || '#'
    });
    
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('AI content generation error:', err);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// Suggest A/B test variants
router.post('/ai/ab-suggestions', auth, async (req, res) => {
  try {
    const { originalSubject, originalContent, testElement, variantCount } = req.body;
    
    if (!emailAI) {
      return res.status(503).json({ error: 'AI service not configured' });
    }
    
    const result = await emailAI.generateABTestVariants({
      originalSubject,
      originalContent,
      testElement: testElement || 'subject',
      variantCount: variantCount || 2
    });
    
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('AI A/B suggestion error:', err);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// Optimize send time
router.post('/ai/send-time', auth, async (req, res) => {
  try {
    const { audience, industry, timezone, campaignType } = req.body;
    
    if (!emailAI) {
      // Fallback recommendations
      return res.json({
        ok: true,
        bestTimes: [
          { day: 'Tuesday', time: '10:00 AM', confidence: 'high', reasoning: 'Peak engagement for most industries' },
          { day: 'Thursday', time: '2:00 PM', confidence: 'medium', reasoning: 'Second-best day for opens' }
        ],
        source: 'fallback'
      });
    }
    
    const result = await emailAI.optimizeSendTime({
      audience,
      industry,
      timezone: timezone || 'UTC',
      campaignType
    });
    
    res.json({ ok: true, ...result, source: 'ai' });
  } catch (err) {
    console.error('AI send time error:', err);
    res.status(500).json({ error: 'Failed to optimize send time' });
  }
});

// Improve email copy
router.post('/ai/improve-copy', auth, async (req, res) => {
  try {
    const { currentCopy, goal, tone } = req.body;
    
    if (!currentCopy) {
      return res.status(400).json({ error: 'Provide current copy to improve' });
    }
    
    if (!emailAI) {
      return res.status(503).json({ error: 'AI service not configured' });
    }
    
    const result = await emailAI.improveEmailCopy({
      currentCopy,
      goal: goal || 'engagement',
      tone: tone || 'professional'
    });
    
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('AI improve copy error:', err);
    res.status(500).json({ error: 'Failed to improve copy' });
  }
});

// Suggest automation workflow
router.post('/ai/automation-suggestion', auth, async (req, res) => {
  try {
    const { triggerType, industry, goals } = req.body;
    
    if (!emailAI) {
      return res.status(503).json({ error: 'AI service not configured' });
    }
    
    const result = await emailAI.suggestAutomationWorkflow({
      triggerType: triggerType || 'signup',
      industry: industry || 'general',
      goals: goals || ['engagement']
    });
    
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('AI automation suggestion error:', err);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});

// ==========================================
// A/B TESTING ENDPOINTS
// ==========================================

// Create A/B test
router.post('/ab-test', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { campaignId, name, testType, variants, settings } = req.body;
    
    if (!campaignId || !testType || !variants || variants.length < 2) {
      return res.status(400).json({ error: 'Campaign, test type, and at least 2 variants required' });
    }
    
    const test = new ABTest({
      campaign: campaignId,
      user: userId,
      name: name || `A/B Test - ${testType}`,
      testType,
      variants: variants.map((v, i) => ({
        id: `variant_${i}`,
        name: v.name || (i === 0 ? 'Control' : `Variant ${String.fromCharCode(65 + i)}`),
        ...v,
        stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 }
      })),
      settings: settings || {}
    });
    
    await test.save();
    res.json({ ok: true, test });
  } catch (err) {
    console.error('Create A/B test error:', err);
    res.status(500).json({ error: 'Failed to create A/B test' });
  }
});

// Get A/B tests
router.get('/ab-tests', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { campaignId, status } = req.query;
    
    const query = { user: userId };
    if (campaignId) query.campaign = campaignId;
    if (status) query.status = status;
    
    const tests = await ABTest.find(query)
      .sort({ createdAt: -1 })
      .populate('campaign', 'name subject');
    
    res.json({ ok: true, tests });
  } catch (err) {
    console.error('Get A/B tests error:', err);
    res.status(500).json({ error: 'Failed to fetch A/B tests' });
  }
});

// Get single A/B test
router.get('/ab-test/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const test = await ABTest.findOne({ _id: req.params.id, user: userId })
      .populate('campaign', 'name subject');
    
    if (!test) {
      return res.status(404).json({ error: 'A/B test not found' });
    }
    
    res.json({ ok: true, test });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch A/B test' });
  }
});

// Start A/B test
router.post('/ab-test/:id/start', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const test = await ABTest.findOne({ _id: req.params.id, user: userId });
    if (!test) {
      return res.status(404).json({ error: 'A/B test not found' });
    }
    
    if (test.status !== 'draft') {
      return res.status(400).json({ error: 'Test already started or completed' });
    }
    
    test.status = 'running';
    test.startedAt = new Date();
    await test.save();
    
    // TODO: Actually send test emails with variant distribution
    
    res.json({ ok: true, test });
  } catch (err) {
    console.error('Start A/B test error:', err);
    res.status(500).json({ error: 'Failed to start test' });
  }
});

// Declare winner manually
router.post('/ab-test/:id/declare-winner', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { variantId } = req.body;
    
    const test = await ABTest.findOne({ _id: req.params.id, user: userId });
    if (!test) {
      return res.status(404).json({ error: 'A/B test not found' });
    }
    
    const variant = test.variants.find(v => v.id === variantId);
    if (!variant) {
      return res.status(400).json({ error: 'Invalid variant ID' });
    }
    
    const control = test.variants[0];
    const controlRate = control.stats.sent > 0 ? control.stats.opened / control.stats.sent : 0;
    const variantRate = variant.stats.sent > 0 ? variant.stats.opened / variant.stats.sent : 0;
    
    test.winner = {
      variantId,
      declaredAt: new Date(),
      confidence: 95, // Would calculate actual statistical significance
      improvement: controlRate > 0 ? ((variantRate - controlRate) / controlRate * 100).toFixed(1) : 0
    };
    test.status = 'completed';
    test.completedAt = new Date();
    
    await test.save();
    res.json({ ok: true, test });
  } catch (err) {
    console.error('Declare winner error:', err);
    res.status(500).json({ error: 'Failed to declare winner' });
  }
});

// ==========================================
// REVENUE TRACKING ENDPOINTS
// ==========================================

// Record revenue event
router.post('/revenue', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId, amount, currency, email, items, campaignId, automationId, metadata } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Order ID and amount required' });
    }
    
    // Check for duplicate
    const existing = await RevenueEvent.findOne({ orderId });
    if (existing) {
      return res.status(400).json({ error: 'Order already recorded' });
    }
    
    // Find contact by email
    let contact = null;
    if (email) {
      const CampaignContact = mongoose.models.CampaignContact;
      if (CampaignContact) {
        contact = await CampaignContact.findOne({ user: userId, email });
      }
    }
    
    const event = new RevenueEvent({
      user: userId,
      orderId,
      amount,
      currency: currency || 'USD',
      email,
      contact: contact?._id,
      campaign: campaignId,
      automation: automationId,
      items: items || [],
      source: {
        type: campaignId || automationId ? 'email_click' : 'api'
      },
      metadata
    });
    
    await event.save();
    
    // Update campaign revenue if linked
    if (campaignId) {
      const Campaign = mongoose.models.Campaign;
      if (Campaign) {
        await Campaign.updateOne(
          { _id: campaignId },
          { $inc: { 'stats.revenue': amount } }
        );
      }
    }
    
    console.log(`💰 Revenue recorded: $${amount} for order ${orderId}`);
    res.json({ ok: true, event });
  } catch (err) {
    console.error('Record revenue error:', err);
    res.status(500).json({ error: 'Failed to record revenue' });
  }
});

// Get revenue overview
router.get('/revenue/overview', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    switch (period) {
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      case 'all': startDate = new Date(0); break;
      default: startDate.setDate(now.getDate() - 30);
    }
    
    const events = await RevenueEvent.find({
      user: userId,
      createdAt: { $gte: startDate }
    }).sort({ createdAt: -1 });
    
    // Calculate totals
    const totalRevenue = events.reduce((sum, e) => sum + e.amount, 0);
    const orderCount = events.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
    
    // Group by day
    const dailyRevenue = {};
    events.forEach(e => {
      const day = e.createdAt.toISOString().split('T')[0];
      dailyRevenue[day] = (dailyRevenue[day] || 0) + e.amount;
    });
    
    // Attribution breakdown
    const emailAttributed = events.filter(e => e.campaign || e.automation);
    const emailRevenue = emailAttributed.reduce((sum, e) => sum + e.amount, 0);
    
    // Top campaigns by revenue
    const campaignRevenue = {};
    events.filter(e => e.campaign).forEach(e => {
      campaignRevenue[e.campaign.toString()] = (campaignRevenue[e.campaign.toString()] || 0) + e.amount;
    });
    
    res.json({
      ok: true,
      overview: {
        period,
        totalRevenue,
        orderCount,
        avgOrderValue: avgOrderValue.toFixed(2),
        emailAttributedRevenue: emailRevenue,
        emailAttributionRate: totalRevenue > 0 ? (emailRevenue / totalRevenue * 100).toFixed(1) : 0,
        dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({ date, amount })),
        topCampaigns: Object.entries(campaignRevenue)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, amount]) => ({ campaignId: id, revenue: amount }))
      }
    });
  } catch (err) {
    console.error('Get revenue overview error:', err);
    res.status(500).json({ error: 'Failed to fetch revenue overview' });
  }
});

// Get revenue by campaign
router.get('/revenue/by-campaign/:campaignId', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const events = await RevenueEvent.find({
      user: userId,
      campaign: req.params.campaignId
    }).sort({ createdAt: -1 });
    
    const totalRevenue = events.reduce((sum, e) => sum + e.amount, 0);
    
    res.json({
      ok: true,
      campaignId: req.params.campaignId,
      totalRevenue,
      orderCount: events.length,
      avgOrderValue: events.length > 0 ? (totalRevenue / events.length).toFixed(2) : 0,
      events: events.slice(0, 50)
    });
  } catch (err) {
    console.error('Get campaign revenue error:', err);
    res.status(500).json({ error: 'Failed to fetch campaign revenue' });
  }
});

module.exports = router;
