// ============================================
// FILE: routes/campaigns.routes.js
// Marketing Campaigns Routes
// VERSION: 1.0.0 - NEW FEATURE
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Simple auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Campaign Schema
const campaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['email', 'sms', 'whatsapp', 'push'], required: true },
  subject: String,
  content: { type: String, required: true },
  audience: { type: String, default: 'all' },
  status: { type: String, enum: ['draft', 'scheduled', 'sending', 'sent', 'paused'], default: 'draft' },
  scheduledAt: Date,
  sentAt: Date,
  recipientCount: { type: Number, default: 0 },
  stats: {
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
  }
}, { timestamps: true });

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);

// Contact Schema (for recipients)
const contactSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: String,
  phone: String,
  name: String,
  tags: [String],
  subscribed: { type: Boolean, default: true },
  source: String,
}, { timestamps: true });

const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);

// ==========================================
// CAMPAIGN ROUTES
// ==========================================

// Get all campaigns
router.get('/', auth, async (req, res) => {
  try {
    const campaigns = await Campaign.find({ 
      user: req.user.userId || req.user.id 
    }).sort({ createdAt: -1 });

    res.json({ campaigns });
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get campaign stats
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const campaigns = await Campaign.find({ user: userId });

    const stats = {
      total: campaigns.length,
      sent: 0,
      opened: 0,
      clicked: 0
    };

    campaigns.forEach(c => {
      stats.sent += c.stats?.sent || 0;
      stats.opened += c.stats?.opened || 0;
      stats.clicked += c.stats?.clicked || 0;
    });

    res.json({ stats });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Create campaign
router.post('/', auth, async (req, res) => {
  try {
    const { name, type, subject, content, audience = 'all' } = req.body;

    if (!name || !type || !content) {
      return res.status(400).json({ error: 'Name, type, and content are required' });
    }

    // Count recipients based on audience
    let recipientCount = 0;
    const userId = req.user.userId || req.user.id;

    if (audience === 'all') {
      recipientCount = await Contact.countDocuments({ user: userId, subscribed: true });
    } else {
      recipientCount = await Contact.countDocuments({ 
        user: userId, 
        subscribed: true,
        tags: audience 
      });
    }

    const campaign = await Campaign.create({
      user: userId,
      name,
      type,
      subject,
      content,
      audience,
      status: 'draft',
      recipientCount
    });

    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Get single campaign
router.get('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.user.userId || req.user.id
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Update campaign
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, subject, content, audience } = req.body;

    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.userId || req.user.id,
        status: 'draft' // Can only update drafts
      },
      { name, subject, content, audience },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found or cannot be edited' });
    }

    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Update campaign error:', err);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Send campaign
router.post('/:id/send', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      user: req.user.userId || req.user.id
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status === 'sent') {
      return res.status(400).json({ error: 'Campaign already sent' });
    }

    // Update status to sending
    campaign.status = 'sending';
    campaign.sentAt = new Date();
    await campaign.save();

    // In production, this would trigger the actual sending process
    // For now, we'll simulate it
    
    // Simulate async sending
    setTimeout(async () => {
      try {
        campaign.status = 'sent';
        campaign.stats.sent = campaign.recipientCount;
        campaign.stats.delivered = Math.floor(campaign.recipientCount * 0.95);
        await campaign.save();
      } catch (err) {
        console.error('Campaign send simulation error:', err);
      }
    }, 3000);

    res.json({ ok: true, message: 'Campaign is being sent' });
  } catch (err) {
    console.error('Send campaign error:', err);
    res.status(500).json({ error: 'Failed to send campaign' });
  }
});

// Schedule campaign
router.post('/:id/schedule', auth, async (req, res) => {
  try {
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'Scheduled time is required' });
    }

    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.userId || req.user.id,
        status: 'draft'
      },
      { 
        status: 'scheduled',
        scheduledAt: new Date(scheduledAt)
      },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found or cannot be scheduled' });
    }

    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Schedule campaign error:', err);
    res.status(500).json({ error: 'Failed to schedule campaign' });
  }
});

// Duplicate campaign
router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const original = await Campaign.findOne({
      _id: req.params.id,
      user: req.user.userId || req.user.id
    });

    if (!original) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = await Campaign.create({
      user: req.user.userId || req.user.id,
      name: `${original.name} (Copy)`,
      type: original.type,
      subject: original.subject,
      content: original.content,
      audience: original.audience,
      status: 'draft',
      recipientCount: original.recipientCount
    });

    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Duplicate campaign error:', err);
    res.status(500).json({ error: 'Failed to duplicate campaign' });
  }
});

// Delete campaign
router.delete('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId || req.user.id
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ==========================================
// CONTACT ROUTES
// ==========================================

// Get contacts
router.get('/contacts', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const contacts = await Contact.find({ 
      user: req.user.userId || req.user.id 
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

    const total = await Contact.countDocuments({ 
      user: req.user.userId || req.user.id 
    });

    res.json({ contacts, total });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Add contact
router.post('/contacts', auth, async (req, res) => {
  try {
    const { email, phone, name, tags } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }

    const contact = await Contact.create({
      user: req.user.userId || req.user.id,
      email,
      phone,
      name,
      tags: tags || [],
      source: 'manual'
    });

    res.json({ ok: true, contact });
  } catch (err) {
    console.error('Add contact error:', err);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// Import contacts (bulk)
router.post('/contacts/import', auth, async (req, res) => {
  try {
    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: 'Contacts array is required' });
    }

    const userId = req.user.userId || req.user.id;
    
    const toInsert = contacts.map(c => ({
      user: userId,
      email: c.email,
      phone: c.phone,
      name: c.name,
      tags: c.tags || [],
      source: 'import'
    }));

    await Contact.insertMany(toInsert, { ordered: false });

    res.json({ ok: true, imported: toInsert.length });
  } catch (err) {
    console.error('Import contacts error:', err);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

module.exports = router;
