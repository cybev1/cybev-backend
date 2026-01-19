// ============================================
// CYBEV Premium Email Campaign Routes v3.0
// Complete API for World-Class Email Platform
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Campaign, CampaignRecipient, EmailTemplate, Automation, AutomationSubscriber, EmailContact, ContactList, Segment, EmailSubscriptionPlan, UserEmailSubscription } = require('../models/campaign-premium.model');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) { res.status(401).json({ error: 'Invalid token' }); }
};

// ==========================================
// DASHBOARD
// ==========================================

router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { period = '30d' } = req.query;
    const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const [campaignAgg, contacts, automations, subscription] = await Promise.all([
      Campaign.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: 1 }, sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } }, totalSent: { $sum: '$stats.sent' }, totalOpens: { $sum: '$stats.uniqueOpens' }, totalClicks: { $sum: '$stats.uniqueClicks' }, totalUnsubscribes: { $sum: '$stats.unsubscribes' }, totalRevenue: { $sum: '$stats.revenue' } } }
      ]),
      EmailContact.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: 1 }, subscribed: { $sum: { $cond: ['$subscribed', 1, 0] } }, new: { $sum: { $cond: [{ $gte: ['$createdAt', startDate] }, 1, 0] } } } }
      ]),
      Automation.countDocuments({ user: userId, status: 'active' }),
      UserEmailSubscription.findOne({ user: userId }).populate('plan')
    ]);
    
    const cs = campaignAgg[0] || { total: 0, sent: 0, totalSent: 0, totalOpens: 0, totalClicks: 0 };
    const ct = contacts[0] || { total: 0, subscribed: 0, new: 0 };
    
    res.json({
      period,
      campaigns: { total: cs.total, sent: cs.sent, draft: await Campaign.countDocuments({ user: userId, status: 'draft' }), scheduled: await Campaign.countDocuments({ user: userId, status: 'scheduled' }) },
      emails: { sent: cs.totalSent, opens: cs.totalOpens, clicks: cs.totalClicks, unsubscribes: cs.totalUnsubscribes || 0, avgOpenRate: cs.totalSent > 0 ? Math.round(cs.totalOpens / cs.totalSent * 100) : 0, avgClickRate: cs.totalSent > 0 ? Math.round(cs.totalClicks / cs.totalSent * 100) : 0 },
      contacts: ct,
      automations: { active: automations, total: await Automation.countDocuments({ user: userId }) },
      revenue: cs.totalRevenue || 0,
      subscription: subscription ? { plan: subscription.planName, status: subscription.status, usage: subscription.usage, limits: subscription.plan?.limits } : null
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Dashboard error' }); }
});

// ==========================================
// CAMPAIGNS CRUD
// ==========================================

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { status, type, tag, search, sortBy = 'createdAt', sortOrder = 'desc', page = 1, limit = 20 } = req.query;
    const query = { user: userId };
    if (status) query.status = status;
    if (type) query.type = type;
    if (tag) query.tags = tag;
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { 'content.subject': { $regex: search, $options: 'i' } }];
    
    const [campaigns, total] = await Promise.all([
      Campaign.find(query).sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 }).skip((page - 1) * limit).limit(parseInt(limit)).select('-content.blocks -content.html'),
      Campaign.countDocuments(query)
    ]);
    res.json({ campaigns, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch campaigns' }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.userId || req.user.id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch campaign' }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const d = req.body;
    
    let estimatedAudience = 0;
    if (d.audience?.type === 'all') estimatedAudience = await EmailContact.countDocuments({ user: userId, subscribed: true, 'deliverability.bounced': { $ne: true } });
    else if (d.audience?.includeTags?.length) estimatedAudience = await EmailContact.countDocuments({ user: userId, subscribed: true, tags: { $in: d.audience.includeTags } });
    
    const campaign = await Campaign.create({
      user: userId, name: d.name || 'Untitled Campaign', description: d.description, type: d.type || 'email',
      sender: d.sender,
      content: { subject: d.content?.subject || d.subject || '', preheader: d.content?.preheader || d.preheader || '', blocks: d.content?.blocks || [], html: d.content?.html || '', text: d.content?.text || '', templateId: d.templateId, personalization: d.personalization || { enabled: true } },
      abTest: d.abTest,
      audience: { type: d.audience?.type || 'all', lists: d.audience?.lists || [], includeTags: d.audience?.includeTags || [], excludeTags: d.audience?.excludeTags || [], segments: d.audience?.segments || [], suppressions: d.audience?.suppressions || { excludeUnsubscribed: true, excludeBounced: true }, estimatedSize: estimatedAudience },
      schedule: d.schedule || { type: 'immediate' },
      tracking: d.tracking || { openTracking: true, clickTracking: true },
      tags: d.tags || [],
      stats: { recipientCount: estimatedAudience }
    });
    res.json({ ok: true, campaign });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create campaign' }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId, status: { $in: ['draft', 'scheduled'] } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or cannot be edited' });
    
    const u = req.body;
    ['name', 'description', 'sender', 'content', 'abTest', 'audience', 'schedule', 'tracking', 'tags', 'folder', 'notes'].forEach(f => {
      if (u[f] !== undefined) {
        if (['content', 'audience', 'schedule'].includes(f) && u[f]) campaign[f] = { ...campaign[f].toObject(), ...u[f] };
        else campaign[f] = u[f];
      }
    });
    await campaign.save();
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to update campaign' }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, user: req.user.userId || req.user.id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    await CampaignRecipient.deleteMany({ campaign: campaign._id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete campaign' }); }
});

router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const original = await Campaign.findOne({ _id: req.params.id, user: req.user.userId || req.user.id });
    if (!original) return res.status(404).json({ error: 'Campaign not found' });
    const copy = original.toObject();
    delete copy._id; delete copy.createdAt; delete copy.updatedAt;
    copy.name = `${original.name} (Copy)`;
    copy.status = 'draft';
    copy.stats = { recipientCount: original.stats.recipientCount };
    copy.sending = {};
    copy.sentAt = null;
    const newCampaign = await Campaign.create(copy);
    res.json({ ok: true, campaign: newCampaign });
  } catch (err) { res.status(500).json({ error: 'Failed to duplicate' }); }
});

// ==========================================
// SENDING
// ==========================================

router.post('/:id/test', auth, async (req, res) => {
  try {
    const { emails, variantId } = req.body;
    const testEmails = Array.isArray(emails) ? emails : [emails];
    if (!testEmails.length || !testEmails[0]) return res.status(400).json({ error: 'Email required' });
    
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.userId || req.user.id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    let subject = campaign.content.subject, html = campaign.content.html;
    if (variantId && campaign.abTest?.enabled) {
      const v = campaign.abTest.variants.find(x => x.id === variantId);
      if (v) { subject = v.subject || subject; html = v.content?.html || html; }
    }
    
    const sesService = require('../services/ses.service');
    const results = [];
    for (const email of testEmails) {
      try {
        const r = await sesService.sendEmail({ to: email, subject: `[TEST] ${subject}`, html, from: `${campaign.sender?.name || 'CYBEV'} <${campaign.sender?.email || process.env.SES_FROM_EMAIL}>`, replyTo: campaign.sender?.replyTo });
        results.push({ email, success: true, messageId: r.messageId });
      } catch (e) { results.push({ email, success: false, error: e.message }); }
    }
    res.json({ ok: true, results, message: `${results.filter(r => r.success).length}/${testEmails.length} sent` });
  } catch (err) { res.status(500).json({ error: 'Failed to send test' }); }
});

router.post('/:id/send', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId, status: { $in: ['draft', 'scheduled'] } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or already sent' });
    if (!campaign.content?.subject) return res.status(400).json({ error: 'Subject required' });
    if (!campaign.content?.html && !campaign.content?.blocks?.length) return res.status(400).json({ error: 'Content required' });
    if (!campaign.sender?.email) return res.status(400).json({ error: 'Sender email required' });
    
    campaign.status = 'sending';
    campaign.sending = { startedAt: new Date(), progress: 0, currentBatch: 0 };
    await campaign.save();
    
    processCampaignSending(campaign._id, userId).catch(console.error);
    res.json({ ok: true, message: 'Campaign sending started' });
  } catch (err) { res.status(500).json({ error: 'Failed to start campaign' }); }
});

router.post('/:id/schedule', auth, async (req, res) => {
  try {
    const { scheduledAt, timezone, sendTimeOptimization } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: 'Schedule time required' });
    if (new Date(scheduledAt) <= new Date()) return res.status(400).json({ error: 'Must be future date' });
    
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user.userId || req.user.id, status: 'draft' },
      { status: 'scheduled', 'schedule.type': sendTimeOptimization?.enabled ? 'optimal' : 'scheduled', 'schedule.scheduledAt': new Date(scheduledAt), 'schedule.timezone': timezone || 'UTC', 'schedule.sendTimeOptimization': sendTimeOptimization },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to schedule' }); }
});

router.post('/:id/pause', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user.userId || req.user.id, status: 'sending' },
      { status: 'paused', pausedAt: new Date(), 'sending.isPaused': true, 'sending.pausedAt': new Date() },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or not sending' });
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to pause' }); }
});

router.post('/:id/resume', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId, status: 'paused' },
      { status: 'sending', 'sending.isPaused': false, 'sending.resumedAt': new Date() },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    processCampaignSending(campaign._id, userId).catch(console.error);
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to resume' }); }
});

router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user.userId || req.user.id, status: { $in: ['scheduled', 'sending', 'paused'] } },
      { status: 'cancelled', cancelledAt: new Date() },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to cancel' }); }
});

// ==========================================
// A/B TESTING
// ==========================================

router.post('/:id/variants', auth, async (req, res) => {
  try {
    const { name, subject, preheader, senderName, content, weight } = req.body;
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.userId || req.user.id, status: 'draft' });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    if (!campaign.abTest) campaign.abTest = { enabled: true, variants: [], type: 'subject' };
    const variantId = `variant_${Date.now()}`;
    campaign.abTest.variants.push({ id: variantId, name: name || String.fromCharCode(65 + campaign.abTest.variants.length), weight: weight || 50, subject, preheader, senderName, content, stats: {} });
    campaign.abTest.enabled = true;
    
    const n = campaign.abTest.variants.length;
    const w = Math.floor(100 / n);
    campaign.abTest.variants.forEach((v, i) => { v.weight = i === n - 1 ? 100 - w * (n - 1) : w; });
    
    await campaign.save();
    res.json({ ok: true, variant: campaign.abTest.variants.find(v => v.id === variantId), campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to create variant' }); }
});

router.put('/:id/abtest', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.userId || req.user.id, status: 'draft' });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    if (!campaign.abTest) campaign.abTest = {};
    const { enabled, type, winnerCriteria, testSize, testDuration, autoSelectWinner, variants } = req.body;
    if (enabled !== undefined) campaign.abTest.enabled = enabled;
    if (type) campaign.abTest.type = type;
    if (winnerCriteria) campaign.abTest.winnerCriteria = winnerCriteria;
    if (testSize !== undefined) campaign.abTest.testSize = testSize;
    if (testDuration !== undefined) campaign.abTest.testDuration = testDuration;
    if (autoSelectWinner !== undefined) campaign.abTest.autoSelectWinner = autoSelectWinner;
    if (variants) campaign.abTest.variants = variants;
    
    await campaign.save();
    res.json({ ok: true, abTest: campaign.abTest });
  } catch (err) { res.status(500).json({ error: 'Failed to update A/B test' }); }
});

router.post('/:id/abtest/select-winner', auth, async (req, res) => {
  try {
    const { variantId } = req.body;
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.userId || req.user.id, 'abTest.enabled': true });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const variant = campaign.abTest.variants.find(v => v.id === variantId);
    if (!variant) return res.status(400).json({ error: 'Variant not found' });
    
    campaign.abTest.winnerVariantId = variantId;
    campaign.abTest.winnerSelectedAt = new Date();
    await campaign.save();
    res.json({ ok: true, winner: variant });
  } catch (err) { res.status(500).json({ error: 'Failed to select winner' }); }
});

// ==========================================
// ANALYTICS
// ==========================================

router.get('/:id/analytics', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.userId || req.user.id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    const [statusBreakdown, topLinks, deviceBreakdown, locationBreakdown] = await Promise.all([
      CampaignRecipient.aggregate([{ $match: { campaign: campaign._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      CampaignRecipient.aggregate([{ $match: { campaign: campaign._id } }, { $unwind: '$clicks' }, { $group: { _id: '$clicks.url', count: { $sum: 1 }, unique: { $addToSet: '$email' } } }, { $project: { url: '$_id', clicks: '$count', uniqueClicks: { $size: '$unique' } } }, { $sort: { clicks: -1 } }, { $limit: 10 }]),
      CampaignRecipient.aggregate([{ $match: { campaign: campaign._id, opens: { $exists: true, $ne: [] } } }, { $unwind: '$opens' }, { $group: { _id: '$opens.device', count: { $sum: 1 } } }]),
      CampaignRecipient.aggregate([{ $match: { campaign: campaign._id, opens: { $exists: true, $ne: [] } } }, { $unwind: '$opens' }, { $group: { _id: '$opens.location.countryCode', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }])
    ]);
    
    res.json({
      campaign: { id: campaign._id, name: campaign.name, status: campaign.status, sentAt: campaign.sentAt, stats: campaign.stats },
      breakdown: { status: statusBreakdown.reduce((a, s) => ({ ...a, [s._id]: s.count }), {}), devices: deviceBreakdown.reduce((a, d) => ({ ...a, [d._id || 'unknown']: d.count }), {}), locations: locationBreakdown },
      topLinks,
      abTest: campaign.abTest?.enabled ? { variants: campaign.abTest.variants.map(v => ({ id: v.id, name: v.name, stats: v.stats, openRate: v.openRate, clickRate: v.clickRate })), winner: campaign.abTest.winnerVariantId } : null
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch analytics' }); }
});

router.get('/:id/recipients', auth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.userId || req.user.id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    const query = { campaign: campaign._id };
    if (status) query.status = status;
    if (search) query.$or = [{ email: { $regex: search, $options: 'i' } }, { name: { $regex: search, $options: 'i' } }];
    
    const [recipients, total] = await Promise.all([
      CampaignRecipient.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)).select('-opens -clicks'),
      CampaignRecipient.countDocuments(query)
    ]);
    res.json({ recipients, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch recipients' }); }
});

// ==========================================
// TEMPLATES
// ==========================================

router.get('/templates', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { category, type, search } = req.query;
    const query = { $or: [{ user: userId }, { type: 'system' }, { isPublic: true }], isActive: true };
    if (category) query.category = category;
    if (type) query.type = type;
    if (search) query.$and = [{ $or: [{ name: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }] }];
    
    const templates = await EmailTemplate.find(query).sort({ usageCount: -1, createdAt: -1 }).select('-content.blocks -content.html');
    res.json({ templates });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch templates' }); }
});

router.get('/templates/:id', auth, async (req, res) => {
  try {
    const template = await EmailTemplate.findOne({ _id: req.params.id, $or: [{ user: req.user.userId || req.user.id }, { type: 'system' }, { isPublic: true }] });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json({ template });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch template' }); }
});

router.post('/templates', auth, async (req, res) => {
  try {
    const d = req.body;
    const template = await EmailTemplate.create({ user: req.user.userId || req.user.id, name: d.name || 'Untitled', description: d.description, type: 'user', category: d.category || 'other', subject: d.subject, preheader: d.preheader, content: d.content, design: d.design, thumbnail: d.thumbnail });
    res.json({ ok: true, template });
  } catch (err) { res.status(500).json({ error: 'Failed to create template' }); }
});

router.put('/templates/:id', auth, async (req, res) => {
  try {
    const template = await EmailTemplate.findOneAndUpdate({ _id: req.params.id, user: req.user.userId || req.user.id }, { $set: req.body }, { new: true });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json({ ok: true, template });
  } catch (err) { res.status(500).json({ error: 'Failed to update template' }); }
});

router.delete('/templates/:id', auth, async (req, res) => {
  try {
    const template = await EmailTemplate.findOneAndDelete({ _id: req.params.id, user: req.user.userId || req.user.id });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete template' }); }
});

// ==========================================
// SEGMENTS
// ==========================================

router.get('/segments', auth, async (req, res) => {
  try {
    const segments = await Segment.find({ user: req.user.userId || req.user.id }).sort({ createdAt: -1 });
    res.json({ segments });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch segments' }); }
});

router.post('/segments', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, rules } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    
    const mongoQuery = buildSegmentQuery(rules, userId);
    const count = await EmailContact.countDocuments(mongoQuery);
    
    const segment = await Segment.create({ user: userId, name, description, rules, mongoQuery, cachedCount: count, lastCountedAt: new Date() });
    res.json({ ok: true, segment });
  } catch (err) { res.status(500).json({ error: 'Failed to create segment' }); }
});

router.post('/segments/preview', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const mongoQuery = buildSegmentQuery(req.body.rules, userId);
    const [count, sample] = await Promise.all([
      EmailContact.countDocuments(mongoQuery),
      EmailContact.find(mongoQuery).limit(5).select('email name tags engagement.score')
    ]);
    res.json({ count, sample });
  } catch (err) { res.status(500).json({ error: 'Failed to preview segment' }); }
});

// ==========================================
// AUTOMATIONS
// ==========================================

router.get('/automations', auth, async (req, res) => {
  try {
    const automations = await Automation.find({ user: req.user.userId || req.user.id }).sort({ createdAt: -1 }).select('-steps');
    res.json({ automations });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch automations' }); }
});

router.get('/automations/:id', auth, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user.userId || req.user.id });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    res.json({ automation });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch automation' }); }
});

router.post('/automations', auth, async (req, res) => {
  try {
    const d = req.body;
    const automation = await Automation.create({ user: req.user.userId || req.user.id, name: d.name || 'New Automation', description: d.description, trigger: d.trigger, steps: d.steps || [], entryStepId: d.entryStepId, settings: d.settings });
    res.json({ ok: true, automation });
  } catch (err) { res.status(500).json({ error: 'Failed to create automation' }); }
});

router.put('/automations/:id', auth, async (req, res) => {
  try {
    const automation = await Automation.findOneAndUpdate({ _id: req.params.id, user: req.user.userId || req.user.id }, { $set: req.body }, { new: true });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    res.json({ ok: true, automation });
  } catch (err) { res.status(500).json({ error: 'Failed to update automation' }); }
});

router.post('/automations/:id/activate', auth, async (req, res) => {
  try {
    const automation = await Automation.findOneAndUpdate({ _id: req.params.id, user: req.user.userId || req.user.id, status: { $in: ['draft', 'paused'] } }, { status: 'active', activatedAt: new Date() }, { new: true });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    res.json({ ok: true, automation });
  } catch (err) { res.status(500).json({ error: 'Failed to activate' }); }
});

router.post('/automations/:id/pause', auth, async (req, res) => {
  try {
    const automation = await Automation.findOneAndUpdate({ _id: req.params.id, user: req.user.userId || req.user.id, status: 'active' }, { status: 'paused', pausedAt: new Date() }, { new: true });
    if (!automation) return res.status(404).json({ error: 'Automation not found' });
    res.json({ ok: true, automation });
  } catch (err) { res.status(500).json({ error: 'Failed to pause' }); }
});

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

router.get('/unsubscribe', async (req, res) => {
  const { email, campaign } = req.query;
  if (!email) return res.status(400).send('Invalid link');
  try {
    if (campaign) {
      const c = await Campaign.findById(campaign);
      if (c?.user) {
        await EmailContact.findOneAndUpdate({ email: email.toLowerCase(), user: c.user }, { subscribed: false, unsubscribedAt: new Date() });
        await Campaign.findByIdAndUpdate(campaign, { $inc: { 'stats.unsubscribes': 1 } });
        await CampaignRecipient.findOneAndUpdate({ campaign, email: email.toLowerCase() }, { status: 'unsubscribed', unsubscribedAt: new Date() });
      }
    }
    res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;}.card{background:white;padding:48px;border-radius:12px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.1);}h1{color:#1f2937;margin:0 0 16px;}p{color:#6b7280;}</style></head><body><div class="card"><h1>✓ Unsubscribed</h1><p>You have been successfully unsubscribed.</p></div></body></html>`);
  } catch (err) { res.status(500).send('Error'); }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function buildSegmentQuery(rules, userId) {
  const base = { user: new mongoose.Types.ObjectId(userId), subscribed: true };
  if (!rules?.conditions?.length) return base;
  
  const conditions = rules.conditions.map(c => {
    const { field, operator, value, secondValue } = c;
    switch (operator) {
      case 'equals': return { [field]: value };
      case 'not_equals': return { [field]: { $ne: value } };
      case 'contains': return { [field]: { $regex: value, $options: 'i' } };
      case 'not_contains': return { [field]: { $not: { $regex: value, $options: 'i' } } };
      case 'is_empty': return { $or: [{ [field]: { $exists: false } }, { [field]: '' }, { [field]: null }] };
      case 'is_not_empty': return { [field]: { $exists: true, $ne: '' } };
      case 'greater_than': return { [field]: { $gt: parseFloat(value) } };
      case 'less_than': return { [field]: { $lt: parseFloat(value) } };
      case 'between': return { [field]: { $gte: parseFloat(value), $lte: parseFloat(secondValue) } };
      case 'in_list': return { [field]: { $in: Array.isArray(value) ? value : [value] } };
      case 'within_days': { const d = new Date(); d.setDate(d.getDate() - parseInt(value)); return { [field]: { $gte: d } }; }
      default: return {};
    }
  });
  return { ...base, [rules.operator === 'or' ? '$or' : '$and']: conditions };
}

async function processCampaignSending(campaignId, userId) {
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.status !== 'sending') return;
    
    const query = { user: new mongoose.Types.ObjectId(userId), subscribed: true };
    if (campaign.audience.suppressions?.excludeBounced) query['deliverability.bounced'] = { $ne: true };
    if (campaign.audience.includeTags?.length) query.tags = { $in: campaign.audience.includeTags };
    if (campaign.audience.excludeTags?.length) query.tags = { ...(query.tags || {}), $nin: campaign.audience.excludeTags };
    if (campaign.audience.lists?.length) query.lists = { $in: campaign.audience.lists };
    
    const contacts = await EmailContact.find(query).select('email firstName lastName name customFields');
    if (!contacts.length) { await Campaign.findByIdAndUpdate(campaignId, { status: 'sent', sentAt: new Date(), 'sending.completedAt': new Date(), 'sending.progress': 100 }); return; }
    
    const recipients = contacts.map(c => ({ campaign: campaignId, contact: c._id, email: c.email, name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim(), mergeData: { email: c.email, firstName: c.firstName, lastName: c.lastName, name: c.name, ...c.customFields }, status: 'queued', queuedAt: new Date() }));
    try { await CampaignRecipient.insertMany(recipients, { ordered: false }); } catch (e) { if (e.code !== 11000) throw e; }
    
    const recipientCount = await CampaignRecipient.countDocuments({ campaign: campaignId });
    await Campaign.findByIdAndUpdate(campaignId, { 'stats.recipientCount': recipientCount, 'audience.actualSize': recipientCount });
    
    if (campaign.abTest?.enabled && campaign.abTest.variants?.length) await assignVariants(campaignId, campaign.abTest);
    
    const sesService = require('../services/ses.service');
    const batchSize = 50;
    const totalBatches = Math.ceil(recipientCount / batchSize);
    let currentBatch = campaign.sending.currentBatch || 0, sent = campaign.stats.sent || 0, failed = campaign.stats.bounced || 0;
    
    while (true) {
      const current = await Campaign.findById(campaignId);
      if (current.status !== 'sending' || current.sending?.isPaused) break;
      
      const batch = await CampaignRecipient.find({ campaign: campaignId, status: 'queued' }).limit(batchSize);
      if (!batch.length) break;
      currentBatch++;
      
      for (const r of batch) {
        try {
          let subject = campaign.content.subject, html = campaign.content.html;
          if (r.variantId && campaign.abTest?.enabled) {
            const v = campaign.abTest.variants.find(x => x.id === r.variantId);
            if (v) { subject = v.subject || subject; html = v.content?.html || html; }
          }
          
          subject = applyMergeTags(subject, r.mergeData);
          html = applyMergeTags(html, r.mergeData);
          if (campaign.tracking?.openTracking) html = addOpenTracking(html, campaignId, r._id);
          if (campaign.tracking?.clickTracking) html = addClickTracking(html, campaignId, r._id);
          html = addUnsubscribeLink(html, campaignId, r.email);
          
          const result = await sesService.sendEmail({ to: r.email, subject, html, from: `${campaign.sender?.name || 'CYBEV'} <${campaign.sender?.email}>`, replyTo: campaign.sender?.replyTo });
          await CampaignRecipient.findByIdAndUpdate(r._id, { status: 'sent', messageId: result.messageId, sentAt: new Date() });
          sent++;
        } catch (e) {
          await CampaignRecipient.findByIdAndUpdate(r._id, { status: 'failed', failedAt: new Date(), $push: { errors: { timestamp: new Date(), type: 'send', message: e.message } } });
          failed++;
        }
      }
      
      await Campaign.findByIdAndUpdate(campaignId, { 'sending.progress': Math.round(currentBatch / totalBatches * 100), 'sending.currentBatch': currentBatch, 'stats.sent': sent, 'stats.delivered': sent - failed, 'stats.bounced': failed });
      await new Promise(r => setTimeout(r, 200));
    }
    
    await Campaign.findByIdAndUpdate(campaignId, { status: 'sent', sentAt: new Date(), 'sending.completedAt': new Date(), 'sending.progress': 100, 'stats.sent': sent, 'stats.delivered': sent - failed });
    await UserEmailSubscription.findOneAndUpdate({ user: userId }, { $inc: { 'usage.emailsSent': sent } });
    console.log(`📧 Campaign ${campaignId} completed: ${sent} sent, ${failed} failed`);
  } catch (err) {
    console.error(`Campaign ${campaignId} error:`, err);
    await Campaign.findByIdAndUpdate(campaignId, { status: 'paused', 'sending.lastError': err.message });
  }
}

async function assignVariants(campaignId, abTest) {
  const recipients = await CampaignRecipient.find({ campaign: campaignId });
  const pool = [];
  abTest.variants.forEach(v => { for (let i = 0; i < v.weight; i++) pool.push(v.id); });
  const ops = recipients.map(r => ({ updateOne: { filter: { _id: r._id }, update: { variantId: pool[Math.floor(Math.random() * pool.length)] } } }));
  await CampaignRecipient.bulkWrite(ops);
}

function applyMergeTags(content, data) {
  if (!content || !data) return content;
  let result = content;
  Object.entries(data).forEach(([k, v]) => { result = result.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'gi'), v || ''); });
  result = result.replace(/\{\{\s*(\w+)\s*\|\s*([^}]+)\s*\}\}/g, (m, k, f) => data[k] || f);
  return result;
}

function addOpenTracking(html, cid, rid) {
  const url = `${process.env.API_URL || 'https://api.cybev.io'}/api/email-webhooks/track/open?c=${cid}&r=${rid}`;
  const pixel = `<img src="${url}" width="1" height="1" style="display:block;width:1px;height:1px;" alt="" />`;
  return html.includes('</body>') ? html.replace('</body>', `${pixel}</body>`) : html + pixel;
}

function addClickTracking(html, cid, rid) {
  const base = `${process.env.API_URL || 'https://api.cybev.io'}/api/email-webhooks/track/click`;
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url) => url.includes('unsubscribe') ? m : `href="${base}?c=${cid}&r=${rid}&url=${encodeURIComponent(url)}"`);
}

function addUnsubscribeLink(html, cid, email) {
  const url = `${process.env.API_URL || 'https://api.cybev.io'}/api/campaigns-premium/unsubscribe?campaign=${cid}&email=${encodeURIComponent(email)}`;
  html = html.replace(/\{\{\s*unsubscribe\s*\}\}/gi, url);
  if (!html.includes('unsubscribe')) {
    const footer = `<p style="text-align:center;font-size:12px;color:#666;margin-top:24px;"><a href="${url}" style="color:#666;">Unsubscribe</a></p>`;
    html = html.includes('</body>') ? html.replace('</body>', `${footer}</body>`) : html + footer;
  }
  return html;
}

module.exports = router;
