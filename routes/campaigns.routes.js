// ============================================
// FILE: campaigns.routes.js
// PATH: cybev-backend/routes/campaigns.routes.js
// PURPOSE: AI Campaign Suite - Email, SMS, WhatsApp Marketing
// VERSION: 1.0.0
// GITHUB: https://github.com/cybev1/cybev-backend
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// Campaign Schema
const campaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['email', 'sms', 'whatsapp', 'push'], default: 'email' },
  status: { type: String, enum: ['draft', 'scheduled', 'sending', 'active', 'paused', 'completed', 'failed'], default: 'draft' },
  content: {
    subject: String,
    preheader: String,
    body: String,
    template: String,
    ctaText: String,
    ctaUrl: String,
    media: [String],
    aiGenerated: Boolean
  },
  audience: {
    type: { type: String, enum: ['all', 'list', 'segment', 'form'], default: 'all' },
    listId: mongoose.Schema.Types.ObjectId,
    estimatedCount: Number
  },
  schedule: {
    sendAt: Date,
    timezone: { type: String, default: 'UTC' },
    aiOptimized: Boolean
  },
  stats: {
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  sentAt: Date,
  completedAt: Date
});

// Contact List Schema
const contactListSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  contactCount: { type: Number, default: 0 },
  tags: [String],
  createdAt: { type: Date, default: Date.now }
});

// Contact Schema
const contactSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: String,
  phone: String,
  name: String,
  firstName: String,
  lastName: String,
  lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
  tags: [String],
  customFields: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['active', 'unsubscribed', 'bounced'], default: 'active' },
  engagement: {
    lastOpened: Date,
    lastClicked: Date,
    totalOpens: { type: Number, default: 0 },
    totalClicks: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});
contactSchema.index({ user: 1, email: 1 }, { unique: true, sparse: true });

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const ContactList = mongoose.models.ContactList || mongoose.model('ContactList', contactListSchema);
const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);

// GET /api/campaigns - Get campaigns
router.get('/', auth, async (req, res) => {
  try {
    const { status, type, limit = 20, skip = 0 } = req.query;
    const query = { user: req.user.id };
    if (status && status !== 'all') query.status = status;
    if (type && type !== 'all') query.type = type;

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));
    const total = await Campaign.countDocuments(query);

    res.json({ ok: true, campaigns, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/campaigns/stats - Overall stats
router.get('/stats', auth, async (req, res) => {
  try {
    const campaigns = await Campaign.find({ user: req.user.id });
    const contacts = await Contact.countDocuments({ user: req.user.id });
    const lists = await ContactList.countDocuments({ user: req.user.id });

    const totals = campaigns.reduce((acc, c) => ({
      sent: acc.sent + (c.stats?.sent || 0),
      opened: acc.opened + (c.stats?.opened || 0),
      clicked: acc.clicked + (c.stats?.clicked || 0),
      revenue: acc.revenue + (c.stats?.revenue || 0)
    }), { sent: 0, opened: 0, clicked: 0, revenue: 0 });

    res.json({
      ok: true,
      stats: {
        totalSent: totals.sent,
        avgOpenRate: totals.sent > 0 ? Math.round((totals.opened / totals.sent) * 100) : 0,
        avgClickRate: totals.opened > 0 ? Math.round((totals.clicked / totals.opened) * 100) : 0,
        totalRevenue: totals.revenue,
        totalContacts: contacts,
        totalLists: lists
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/campaigns - Create campaign
router.post('/', auth, async (req, res) => {
  try {
    const { name, type, content, audience, schedule } = req.body;
    
    let estimatedCount = 0;
    if (audience?.type === 'all') {
      estimatedCount = await Contact.countDocuments({ user: req.user.id, status: 'active' });
    } else if (audience?.listId) {
      estimatedCount = await Contact.countDocuments({ user: req.user.id, lists: audience.listId, status: 'active' });
    }

    const campaign = new Campaign({
      user: req.user.id,
      name,
      type: type || 'email',
      content,
      audience: { ...audience, estimatedCount },
      schedule,
      status: schedule?.sendAt ? 'scheduled' : 'draft'
    });

    await campaign.save();
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/campaigns/:id - Get campaign
router.get('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/campaigns/:id - Update campaign
router.put('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    if (['sending', 'completed'].includes(campaign.status)) {
      return res.status(400).json({ ok: false, error: 'Cannot edit campaign in progress' });
    }

    const { name, content, audience, schedule } = req.body;
    if (name) campaign.name = name;
    if (content) campaign.content = { ...campaign.content, ...content };
    if (audience) campaign.audience = { ...campaign.audience, ...audience };
    if (schedule) campaign.schedule = { ...campaign.schedule, ...schedule };

    await campaign.save();
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/campaigns/:id - Delete campaign
router.delete('/:id', auth, async (req, res) => {
  try {
    await Campaign.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.json({ ok: true, message: 'Campaign deleted' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/campaigns/:id/send - Send campaign
router.post('/:id/send', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.id });
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    campaign.status = 'sending';
    campaign.sentAt = new Date();
    await campaign.save();

    // In production, queue actual sending job
    res.json({ ok: true, message: 'Campaign sending started', campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Contact routes
router.get('/contacts/lists', auth, async (req, res) => {
  try {
    const lists = await ContactList.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ ok: true, lists });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/contacts/lists', auth, async (req, res) => {
  try {
    const { name, description, tags } = req.body;
    const list = new ContactList({ user: req.user.id, name, description, tags });
    await list.save();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/contacts', auth, async (req, res) => {
  try {
    const { list, status, search, limit = 50, skip = 0 } = req.query;
    const query = { user: req.user.id };
    if (list) query.lists = list;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const contacts = await Contact.find(query).sort({ createdAt: -1 }).skip(parseInt(skip)).limit(parseInt(limit));
    const total = await Contact.countDocuments(query);
    res.json({ ok: true, contacts, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/contacts', auth, async (req, res) => {
  try {
    const { email, phone, name, firstName, lastName, lists, tags } = req.body;
    const contact = await Contact.findOneAndUpdate(
      { user: req.user.id, email },
      { phone, name, firstName, lastName, lists, tags },
      { upsert: true, new: true }
    );
    res.json({ ok: true, contact });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/contacts/import', auth, async (req, res) => {
  try {
    const { contacts, listId } = req.body;
    let imported = 0;

    for (const c of contacts) {
      try {
        await Contact.findOneAndUpdate(
          { user: req.user.id, email: c.email },
          { ...c, lists: listId ? [listId] : [] },
          { upsert: true }
        );
        imported++;
      } catch {}
    }

    if (listId) {
      await ContactList.findByIdAndUpdate(listId, { $inc: { contactCount: imported } });
    }

    res.json({ ok: true, imported });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
