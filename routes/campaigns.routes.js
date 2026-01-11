// ============================================
// FILE: routes/campaigns.routes.js
// PURPOSE: AI Campaign Suite Backend
// Email, SMS, WhatsApp, Push campaigns
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// ==========================================
// MODELS
// ==========================================

// Campaign Schema
const campaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['email', 'sms', 'whatsapp', 'push'], required: true },
  status: { 
    type: String, 
    enum: ['draft', 'scheduled', 'sending', 'active', 'paused', 'completed', 'failed'],
    default: 'draft'
  },
  content: {
    subject: String,
    preheader: String,
    body: { type: String, required: true },
    template: String,
    ctaText: String,
    ctaUrl: String,
    media: [{ url: String, type: String }],
    aiGenerated: { type: Boolean, default: false }
  },
  audience: {
    type: { type: String, enum: ['all', 'segment', 'list', 'form'], default: 'all' },
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
    segmentId: String,
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form' },
    estimatedCount: { type: Number, default: 0 }
  },
  schedule: {
    sendAt: Date,
    timezone: { type: String, default: 'UTC' },
    aiOptimized: { type: Boolean, default: false }
  },
  stats: {
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    converted: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  },
  abTest: {
    enabled: { type: Boolean, default: false },
    variants: [{
      name: String,
      subject: String,
      content: String,
      percentage: Number,
      stats: {
        sent: Number,
        opened: Number,
        clicked: Number
      }
    }],
    winner: String
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
  email: { type: String, required: true },
  phone: String,
  name: String,
  firstName: String,
  lastName: String,
  lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
  tags: [String],
  source: {
    type: { type: String, enum: ['form', 'import', 'api', 'manual', 'funnel'], default: 'manual' },
    id: mongoose.Schema.Types.ObjectId,
    campaign: mongoose.Schema.Types.ObjectId
  },
  customFields: mongoose.Schema.Types.Mixed,
  score: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'unsubscribed', 'bounced', 'complained'], default: 'active' },
  engagement: {
    lastOpened: Date,
    lastClicked: Date,
    totalOpens: { type: Number, default: 0 },
    totalClicks: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

// Campaign Event Schema (for tracking)
const campaignEventSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  type: { type: String, enum: ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'converted'] },
  metadata: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const ContactList = mongoose.models.ContactList || mongoose.model('ContactList', contactListSchema);
const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);
const CampaignEvent = mongoose.models.CampaignEvent || mongoose.model('CampaignEvent', campaignEventSchema);

// ==========================================
// CAMPAIGN ROUTES
// ==========================================

// GET /api/campaigns - Get user's campaigns
router.get('/', auth, async (req, res) => {
  try {
    const { status, type, limit = 20, skip = 0 } = req.query;
    
    const query = { user: req.user.id };
    if (status) query.status = status;
    if (type) query.type = type;

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Campaign.countDocuments(query);

    res.json({ ok: true, campaigns, total });
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/campaigns/stats - Get overall stats
router.get('/stats', auth, async (req, res) => {
  try {
    const campaigns = await Campaign.find({ user: req.user.id });
    
    const totalSent = campaigns.reduce((sum, c) => sum + (c.stats?.sent || 0), 0);
    const totalOpened = campaigns.reduce((sum, c) => sum + (c.stats?.opened || 0), 0);
    const totalClicked = campaigns.reduce((sum, c) => sum + (c.stats?.clicked || 0), 0);
    const totalRevenue = campaigns.reduce((sum, c) => sum + (c.stats?.revenue || 0), 0);

    const totalContacts = await Contact.countDocuments({ user: req.user.id, status: 'active' });
    const totalLists = await ContactList.countDocuments({ user: req.user.id });

    res.json({
      ok: true,
      stats: {
        totalSent,
        avgOpenRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
        avgClickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
        totalRevenue,
        totalContacts,
        totalLists,
        totalFunnels: 0, // TODO: Add funnel count
        totalTemplates: 0 // TODO: Add template count
      }
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/campaigns - Create campaign
router.post('/', auth, async (req, res) => {
  try {
    const { name, type, content, audience, schedule, status } = req.body;

    if (!name || !type || !content?.body) {
      return res.status(400).json({ ok: false, error: 'Name, type, and content are required' });
    }

    // Estimate audience count
    let estimatedCount = 0;
    if (audience?.type === 'all') {
      estimatedCount = await Contact.countDocuments({ user: req.user.id, status: 'active' });
    } else if (audience?.listId) {
      estimatedCount = await Contact.countDocuments({ 
        user: req.user.id, 
        lists: audience.listId,
        status: 'active'
      });
    }

    const campaign = new Campaign({
      user: req.user.id,
      name,
      type,
      content,
      audience: {
        ...audience,
        estimatedCount
      },
      schedule,
      status: status || 'draft'
    });

    await campaign.save();

    // If status is 'sending', queue the campaign
    if (status === 'sending') {
      // TODO: Add to send queue
      // await sendQueue.add({ campaignId: campaign._id });
    }

    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/campaigns/:id - Get campaign details
router.get('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/campaigns/:id - Update campaign
router.put('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    if (['sending', 'completed'].includes(campaign.status)) {
      return res.status(400).json({ ok: false, error: 'Cannot edit campaign in progress or completed' });
    }

    const { name, content, audience, schedule, status } = req.body;

    if (name) campaign.name = name;
    if (content) campaign.content = { ...campaign.content, ...content };
    if (audience) campaign.audience = { ...campaign.audience, ...audience };
    if (schedule) campaign.schedule = { ...campaign.schedule, ...schedule };
    if (status) campaign.status = status;

    await campaign.save();

    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Update campaign error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/campaigns/:id - Delete campaign
router.delete('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    
    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Delete related events
    await CampaignEvent.deleteMany({ campaign: campaign._id });

    res.json({ ok: true, message: 'Campaign deleted' });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/campaigns/:id/send - Send campaign now
router.post('/:id/send', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({ ok: false, error: 'Campaign cannot be sent' });
    }

    campaign.status = 'sending';
    campaign.sentAt = new Date();
    await campaign.save();

    // Queue for sending
    // TODO: Add to send queue

    res.json({ ok: true, message: 'Campaign queued for sending', campaign });
  } catch (err) {
    console.error('Send campaign error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/campaigns/:id/pause - Pause campaign
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    if (campaign.status !== 'sending') {
      return res.status(400).json({ ok: false, error: 'Campaign is not sending' });
    }

    campaign.status = 'paused';
    await campaign.save();

    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Pause campaign error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/campaigns/:id/stats - Get campaign stats
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user.id });
    
    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Get detailed event breakdown
    const events = await CampaignEvent.aggregate([
      { $match: { campaign: mongoose.Types.ObjectId(req.params.id) } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const eventMap = events.reduce((acc, e) => {
      acc[e._id] = e.count;
      return acc;
    }, {});

    res.json({
      ok: true,
      stats: {
        ...campaign.stats,
        events: eventMap
      }
    });
  } catch (err) {
    console.error('Get campaign stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// CONTACT ROUTES
// ==========================================

// GET /api/contacts - Get contacts
router.get('/contacts', auth, async (req, res) => {
  try {
    const { list, status, limit = 50, skip = 0, search } = req.query;
    
    const query = { user: req.user.id };
    if (list) query.lists = list;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Contact.countDocuments(query);

    res.json({ ok: true, contacts, total });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/contacts - Add contact
router.post('/contacts', auth, async (req, res) => {
  try {
    const { email, phone, name, firstName, lastName, lists, tags, customFields } = req.body;

    if (!email) {
      return res.status(400).json({ ok: false, error: 'Email is required' });
    }

    // Check if contact exists
    let contact = await Contact.findOne({ user: req.user.id, email });
    
    if (contact) {
      // Update existing contact
      if (lists) contact.lists = [...new Set([...contact.lists.map(l => l.toString()), ...lists])];
      if (tags) contact.tags = [...new Set([...contact.tags, ...tags])];
      if (phone) contact.phone = phone;
      if (name) contact.name = name;
      if (firstName) contact.firstName = firstName;
      if (lastName) contact.lastName = lastName;
      if (customFields) contact.customFields = { ...contact.customFields, ...customFields };
      await contact.save();
    } else {
      // Create new contact
      contact = new Contact({
        user: req.user.id,
        email,
        phone,
        name: name || `${firstName || ''} ${lastName || ''}`.trim(),
        firstName,
        lastName,
        lists: lists || [],
        tags: tags || [],
        customFields: customFields || {}
      });
      await contact.save();

      // Update list counts
      if (lists?.length) {
        await ContactList.updateMany(
          { _id: { $in: lists } },
          { $inc: { contactCount: 1 } }
        );
      }
    }

    res.json({ ok: true, contact });
  } catch (err) {
    console.error('Add contact error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/contacts/import - Import contacts
router.post('/contacts/import', auth, async (req, res) => {
  try {
    const { contacts, listId } = req.body;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ ok: false, error: 'Contacts array is required' });
    }

    let imported = 0;
    let updated = 0;
    let failed = 0;

    for (const contactData of contacts) {
      try {
        if (!contactData.email) {
          failed++;
          continue;
        }

        const existing = await Contact.findOne({ user: req.user.id, email: contactData.email });
        
        if (existing) {
          if (listId) {
            existing.lists = [...new Set([...existing.lists.map(l => l.toString()), listId])];
            await existing.save();
          }
          updated++;
        } else {
          const contact = new Contact({
            user: req.user.id,
            email: contactData.email,
            name: contactData.name,
            phone: contactData.phone,
            lists: listId ? [listId] : [],
            source: { type: 'import' }
          });
          await contact.save();
          imported++;
        }
      } catch (e) {
        failed++;
      }
    }

    // Update list count
    if (listId) {
      const count = await Contact.countDocuments({ user: req.user.id, lists: listId });
      await ContactList.findByIdAndUpdate(listId, { contactCount: count });
    }

    res.json({ ok: true, imported, updated, failed });
  } catch (err) {
    console.error('Import contacts error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/contacts/lists - Get contact lists
router.get('/contacts/lists', auth, async (req, res) => {
  try {
    const lists = await ContactList.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ ok: true, lists });
  } catch (err) {
    console.error('Get lists error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/contacts/lists - Create list
router.post('/contacts/lists', auth, async (req, res) => {
  try {
    const { name, description, tags } = req.body;

    if (!name) {
      return res.status(400).json({ ok: false, error: 'Name is required' });
    }

    const list = new ContactList({
      user: req.user.id,
      name,
      description,
      tags: tags || []
    });

    await list.save();

    res.json({ ok: true, list });
  } catch (err) {
    console.error('Create list error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// AI GENERATION ROUTES
// ==========================================

// POST /api/ai/generate-campaign - Generate campaign content with AI
router.post('/ai/generate-campaign', auth, async (req, res) => {
  try {
    const { type, field, context } = req.body;

    // TODO: Integrate with OpenAI or Claude API
    // For now, return placeholder content
    
    let generated = '';

    switch (field) {
      case 'subject':
        const subjects = [
          "🚀 Don't miss this exclusive update!",
          "You're invited: Something special inside",
          "Quick update that will make your day",
          `${context.name ? context.name + ': ' : ''}Your weekly highlights`
        ];
        generated = subjects[Math.floor(Math.random() * subjects.length)];
        break;

      case 'content':
        generated = `Hi there!\n\nWe're excited to share this update with you. Here's what you need to know:\n\n[Add your main content here]\n\nWe believe this will help you achieve your goals and make great progress.\n\nBest regards,\nThe Team`;
        break;

      default:
        generated = 'AI-generated content placeholder';
    }

    res.json({ ok: true, generated });
  } catch (err) {
    console.error('AI generation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// TRACKING ROUTES (Public)
// ==========================================

// GET /api/campaigns/track/open/:campaignId/:contactId
router.get('/track/open/:campaignId/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;

    // Record open event
    await CampaignEvent.create({
      campaign: campaignId,
      contact: contactId,
      type: 'opened'
    });

    // Update campaign stats
    await Campaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.opened': 1 } });

    // Update contact engagement
    await Contact.findByIdAndUpdate(contactId, {
      $set: { 'engagement.lastOpened': new Date() },
      $inc: { 'engagement.totalOpens': 1 }
    });

    // Return transparent 1x1 pixel
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });
    res.end(pixel);
  } catch (err) {
    console.error('Track open error:', err);
    res.status(200).end();
  }
});

// GET /api/campaigns/track/click/:campaignId/:contactId
router.get('/track/click/:campaignId/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;
    const { url } = req.query;

    // Record click event
    await CampaignEvent.create({
      campaign: campaignId,
      contact: contactId,
      type: 'clicked',
      metadata: { url }
    });

    // Update campaign stats
    await Campaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.clicked': 1 } });

    // Update contact engagement
    await Contact.findByIdAndUpdate(contactId, {
      $set: { 'engagement.lastClicked': new Date() },
      $inc: { 'engagement.totalClicks': 1 }
    });

    // Redirect to destination
    res.redirect(url || '/');
  } catch (err) {
    console.error('Track click error:', err);
    res.redirect(req.query.url || '/');
  }
});

module.exports = router;
