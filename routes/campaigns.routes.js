/**
 * Campaigns Routes - Email/SMS/WhatsApp/Push Marketing
 * CYBEV Studio v2.0
 * GitHub: https://github.com/cybev1/cybev-backend/routes/campaigns.routes.js
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ============================================
// SCHEMAS
// ============================================

const campaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['email', 'sms', 'whatsapp', 'push'], required: true },
  status: { type: String, enum: ['draft', 'scheduled', 'sending', 'sent', 'paused', 'failed'], default: 'draft' },
  subject: String,
  content: { type: String, required: true },
  htmlContent: String,
  templateId: String,
  audienceType: { type: String, enum: ['all', 'list', 'segment'], default: 'all' },
  contactListId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
  scheduledAt: Date,
  sentAt: Date,
  stats: {
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 }
  },
  settings: {
    trackOpens: { type: Boolean, default: true },
    trackClicks: { type: Boolean, default: true },
    replyTo: String,
    fromName: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const contactListSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  contactCount: { type: Number, default: 0 },
  tags: [String],
  createdAt: { type: Date, default: Date.now }
});

const contactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  listId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
  email: String,
  phone: String,
  firstName: String,
  lastName: String,
  fullName: String,
  company: String,
  tags: [String],
  customFields: { type: Map, of: String },
  status: { type: String, enum: ['active', 'unsubscribed', 'bounced'], default: 'active' },
  source: String,
  createdAt: { type: Date, default: Date.now }
});

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const ContactList = mongoose.models.ContactList || mongoose.model('ContactList', contactListSchema);
const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);

// ============================================
// CAMPAIGN ROUTES
// ============================================

// Get all campaigns
router.get('/', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { status, type, page = 1, limit = 20 } = req.query;

    const query = { userId };
    if (status) query.status = status;
    if (type) query.type = type;

    const total = await Campaign.countDocuments(query);
    const campaigns = await Campaign.find(query)
      .populate('contactListId', 'name contactCount')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ 
      campaigns,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get campaign stats summary
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];

    const stats = await Campaign.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          totalSent: { $sum: '$stats.sent' },
          totalDelivered: { $sum: '$stats.delivered' },
          totalOpened: { $sum: '$stats.opened' },
          totalClicked: { $sum: '$stats.clicked' }
        }
      }
    ]);

    const byType = await Campaign.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const byStatus = await Campaign.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      summary: stats[0] || { totalCampaigns: 0, totalSent: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0 },
      byType: byType.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {})
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create campaign
router.post('/', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const campaignData = { ...req.body, userId };

    const campaign = new Campaign(campaignData);
    await campaign.save();

    res.json({ campaign });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single campaign
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;

    const campaign = await Campaign.findOne({ _id: id, userId })
      .populate('contactListId');

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update campaign
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;

    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, userId },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete campaign
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;

    await Campaign.deleteOne({ _id: id, userId });

    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send campaign
router.post('/:id/send', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { id } = req.params;
    const { scheduledAt } = req.body;

    const campaign = await Campaign.findOne({ _id: id, userId });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (scheduledAt) {
      campaign.status = 'scheduled';
      campaign.scheduledAt = new Date(scheduledAt);
    } else {
      campaign.status = 'sending';
      // TODO: Trigger actual sending via queue/worker
    }

    await campaign.save();

    res.json({ campaign, message: scheduledAt ? 'Campaign scheduled' : 'Campaign sending started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTACT LIST ROUTES
// ============================================

// Get all contact lists
router.get('/contacts/lists', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];

    const lists = await ContactList.find({ userId }).sort({ createdAt: -1 });

    res.json({ lists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create contact list
router.post('/contacts/lists', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { name, description, tags } = req.body;

    const list = new ContactList({ userId, name, description, tags });
    await list.save();

    res.json({ list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTACT ROUTES
// ============================================

// Get contacts
router.get('/contacts', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { listId, status, search, page = 1, limit = 50 } = req.query;

    const query = { userId };
    if (listId) query.listId = listId;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Contact.countDocuments(query);
    const contacts = await Contact.find(query)
      .populate('listId', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      contacts,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add contact
router.post('/contacts', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const contactData = { ...req.body, userId };

    if (contactData.firstName && contactData.lastName) {
      contactData.fullName = `${contactData.firstName} ${contactData.lastName}`;
    }

    const contact = new Contact(contactData);
    await contact.save();

    // Update list count
    if (contactData.listId) {
      await ContactList.findByIdAndUpdate(contactData.listId, { $inc: { contactCount: 1 } });
    }

    res.json({ contact });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import contacts
router.post('/contacts/import', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { listId, contacts } = req.body;

    const contactDocs = contacts.map(c => ({
      ...c,
      userId,
      listId,
      fullName: c.firstName && c.lastName ? `${c.firstName} ${c.lastName}` : c.fullName
    }));

    const result = await Contact.insertMany(contactDocs, { ordered: false });

    // Update list count
    if (listId) {
      await ContactList.findByIdAndUpdate(listId, { $inc: { contactCount: result.length } });
    }

    res.json({ imported: result.length, message: `${result.length} contacts imported` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
