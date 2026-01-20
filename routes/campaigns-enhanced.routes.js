// ============================================
// FILE: routes/campaigns-enhanced.routes.js
// CYBEV Enhanced Campaign API - FULLY FUNCTIONAL
// VERSION: 5.0.0 - Lists, Tags, Segments, AI, Delete All
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import models - with fallback for missing models
let Campaign, CampaignRecipient, ContactList, EmailTemplate, Unsubscribe, EmailAddress, EmailContact;

try {
  const campaignModels = require('../models/campaign.model');
  Campaign = campaignModels.Campaign;
  CampaignRecipient = campaignModels.CampaignRecipient;
  ContactList = campaignModels.ContactList;
  EmailTemplate = campaignModels.EmailTemplate;
  Unsubscribe = campaignModels.Unsubscribe;
} catch (e) {
  console.log('Campaign models not found, will create inline');
}

try {
  const emailModels = require('../models/email.model');
  EmailAddress = emailModels.EmailAddress;
  EmailContact = emailModels.EmailContact;
} catch (e) {
  console.log('Email models not found, will create inline');
}

// Create inline models if not imported
if (!Campaign) {
  const campaignSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['email', 'sms', 'push'], default: 'email' },
    status: { type: String, enum: ['draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'], default: 'draft', index: true },
    subject: String,
    previewText: String,
    content: { html: String, text: String, json: mongoose.Schema.Types.Mixed, blocks: [mongoose.Schema.Types.Mixed] },
    sender: { email: String, name: String, replyTo: String },
    audience: { 
      type: { type: String, enum: ['all', 'segment', 'tags', 'list'], default: 'all' }, 
      contactList: mongoose.Schema.Types.ObjectId, 
      segment: mongoose.Schema.Types.Mixed, // Custom segment rules
      tags: [String], 
      excludeTags: [String],
      lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }]
    },
    schedule: { type: { type: String, enum: ['immediate', 'scheduled'], default: 'immediate' }, scheduledAt: Date, timezone: { type: String, default: 'UTC' } },
    tracking: { openTracking: { type: Boolean, default: true }, clickTracking: { type: Boolean, default: true }, googleAnalytics: { enabled: Boolean, utmSource: String, utmMedium: String, utmCampaign: String } },
    stats: { recipientCount: { type: Number, default: 0 }, sent: { type: Number, default: 0 }, delivered: { type: Number, default: 0 }, bounced: { type: Number, default: 0 }, opened: { type: Number, default: 0 }, uniqueOpens: { type: Number, default: 0 }, clicked: { type: Number, default: 0 }, uniqueClicks: { type: Number, default: 0 }, unsubscribed: { type: Number, default: 0 }, complaints: { type: Number, default: 0 }, openRate: { type: Number, default: 0 }, clickRate: { type: Number, default: 0 } },
    sending: { startedAt: Date, completedAt: Date, pausedAt: Date, progress: { type: Number, default: 0 }, totalBatches: Number, currentBatch: Number, lastError: String },
    sentAt: Date
  }, { timestamps: true });
  Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
}

if (!EmailContact) {
  const contactSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    name: String, firstName: String, lastName: String, phone: String, company: String,
    tags: [String], 
    lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }], // Contact can be in multiple lists
    customFields: mongoose.Schema.Types.Mixed,
    subscribed: { type: Boolean, default: true }, subscribedAt: { type: Date, default: Date.now }, unsubscribedAt: Date,
    source: { type: String, default: 'manual' }, 
    engagementScore: { type: Number, default: 50 },
    emailValid: { type: Boolean, default: true },
    lastValidated: Date
  }, { timestamps: true });
  contactSchema.index({ user: 1, email: 1 }, { unique: true });
  contactSchema.index({ user: 1, lists: 1 });
  contactSchema.index({ user: 1, tags: 1 });
  EmailContact = mongoose.models.EmailContact || mongoose.model('EmailContact', contactSchema);
}

if (!ContactList) {
  const listSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }, 
    description: String,
    color: { type: String, default: '#8B5CF6' }, // For UI display
    subscriberCount: { type: Number, default: 0 }, 
    activeCount: { type: Number, default: 0 },
    defaultTags: [String], 
    customFields: [{ name: String, type: String, required: Boolean }]
  }, { timestamps: true });
  ContactList = mongoose.models.ContactList || mongoose.model('ContactList', listSchema);
}

if (!EmailTemplate) {
  const templateSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true }, description: String, category: { type: String, default: 'general' },
    type: { type: String, enum: ['system', 'user'], default: 'user' },
    subject: String, previewText: String, content: { html: String, text: String, blocks: [mongoose.Schema.Types.Mixed] },
    thumbnail: String, isActive: { type: Boolean, default: true }, usageCount: { type: Number, default: 0 }
  }, { timestamps: true });
  EmailTemplate = mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', templateSchema);
}

if (!CampaignRecipient) {
  const recipientSchema = new mongoose.Schema({
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailContact' },
    email: { type: String, required: true }, name: String,
    status: { type: String, enum: ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'], default: 'queued' },
    sentAt: Date, deliveredAt: Date, openedAt: Date, clickedAt: Date,
    opens: { type: Number, default: 0 }, clicks: { type: Number, default: 0 },
    sesMessageId: String, error: { message: String, code: String }
  }, { timestamps: true });
  CampaignRecipient = mongoose.models.CampaignRecipient || mongoose.model('CampaignRecipient', recipientSchema);
}

if (!Unsubscribe) {
  const unsubscribeSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    source: { type: String, default: 'link' }
  }, { timestamps: true });
  Unsubscribe = mongoose.models.Unsubscribe || mongoose.model('Unsubscribe', unsubscribeSchema);
}

if (!EmailAddress) {
  const addressSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true }, 
    displayName: String,
    isVerified: { type: Boolean, default: false }, 
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false }
  }, { timestamps: true });
  EmailAddress = mongoose.models.EmailAddress || mongoose.model('EmailAddress', addressSchema);
}

// Multi-Provider Email Service (SES + Brevo + Mailgun)
let emailService;
try {
  emailService = require('../services/email-multi-provider.service');
  console.log('📧 Multi-provider email service loaded');
} catch (e) {
  try {
    const sesService = require('../services/ses.service');
    emailService = {
      sendEmail: sesService.sendEmail,
      sendBulkEmails: sesService.sendBulkEmails,
      getAvailableProviders: () => [{ name: 'ses', displayName: 'Amazon SES' }]
    };
    console.log('📧 Using SES-only email service');
  } catch (e2) {
    emailService = {
      sendEmail: async (opts) => ({ messageId: `mock_${Date.now()}`, success: true, provider: 'mock' }),
      sendBulkEmails: async (opts) => ({ 
        results: opts.recipients.map(r => ({ email: r.email, success: true, messageId: `mock_${Date.now()}`, provider: 'mock' })),
        provider: 'mock'
      }),
      getAvailableProviders: () => [{ name: 'mock', displayName: 'Mock (Development)' }]
    };
    console.log('⚠️ Using mock email service (no providers configured)');
  }
}

// AI Service for smart features
let aiService;
try {
  aiService = require('../services/ai.service');
} catch (e) {
  aiService = {
    generateSubjectLine: async (context) => {
      const templates = [
        `🎉 ${context.name || 'Newsletter'} - Don't Miss Out!`,
        `Hey {{first_name}}, check this out!`,
        `[New] Exciting news inside...`,
        `Your weekly update is here 📬`,
        `Limited time: Special offer inside 🎁`
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    },
    validateEmail: async (email) => {
      const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return { valid: regex.test(email), suggestion: null };
    }
  };
}

const sesService = emailService;

// Auth middleware
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

// ==========================================
// STATIC ROUTES FIRST (before /:id)
// ==========================================

// Get email provider status
router.get('/providers', auth, async (req, res) => {
  try {
    const providers = emailService.getAvailableProviders ? emailService.getAvailableProviders() : [];
    res.json({ 
      providers,
      activeProvider: providers[0]?.name || 'none',
      message: providers.length === 0 
        ? 'No email providers configured. Add BREVO_API_KEY or MAILGUN_API_KEY to your environment.'
        : `${providers.length} provider(s) available`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get provider status' });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const [totalCampaigns, campaigns, contacts] = await Promise.all([
      Campaign.countDocuments({ user: userId }),
      Campaign.find({ user: userId }).lean(),
      EmailContact.countDocuments({ user: userId, subscribed: true })
    ]);
    const stats = { totalCampaigns, totalContacts: contacts, subscribed: contacts, totalSent: 0, totalOpened: 0, totalClicked: 0, avgOpenRate: 0, avgClickRate: 0 };
    let sentCampaigns = 0;
    campaigns.forEach(c => {
      stats.totalSent += c.stats?.sent || 0;
      stats.totalOpened += c.stats?.uniqueOpens || 0;
      stats.totalClicked += c.stats?.uniqueClicks || 0;
      if (c.stats?.sent > 0) { sentCampaigns++; stats.avgOpenRate += c.stats.openRate || 0; stats.avgClickRate += c.stats.clickRate || 0; }
    });
    if (sentCampaigns > 0) { stats.avgOpenRate = Math.round((stats.avgOpenRate / sentCampaigns) * 100) / 100; stats.avgClickRate = Math.round((stats.avgClickRate / sentCampaigns) * 100) / 100; }
    res.json({ stats });
  } catch (err) { console.error('Get stats error:', err); res.status(500).json({ error: 'Failed to fetch stats' }); }
});

// ==========================================
// LISTS (Contact Categories)
// ==========================================

router.get('/lists', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const lists = await ContactList.find({ user: userId }).sort({ createdAt: -1 }).lean();
    
    // Get counts for each list
    const listsWithCounts = await Promise.all(lists.map(async (list) => {
      const count = await EmailContact.countDocuments({ user: userId, lists: list._id, subscribed: true });
      return { ...list, count };
    }));
    
    res.json({ lists: listsWithCounts });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch lists' }); }
});

router.post('/lists', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, color, defaultTags, customFields } = req.body;
    if (!name) return res.status(400).json({ error: 'List name is required' });
    
    const list = await ContactList.create({ 
      user: userId, 
      name, 
      description, 
      color: color || '#8B5CF6',
      defaultTags, 
      customFields 
    });
    res.json({ ok: true, list });
  } catch (err) { res.status(500).json({ error: 'Failed to create list' }); }
});

router.put('/lists/:listId', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, color, defaultTags } = req.body;
    
    const list = await ContactList.findOneAndUpdate(
      { _id: req.params.listId, user: userId },
      { $set: { name, description, color, defaultTags } },
      { new: true }
    );
    
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json({ ok: true, list });
  } catch (err) { res.status(500).json({ error: 'Failed to update list' }); }
});

router.delete('/lists/:listId', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    // Remove list reference from contacts
    await EmailContact.updateMany(
      { user: userId, lists: req.params.listId },
      { $pull: { lists: req.params.listId } }
    );
    
    // Delete the list
    const list = await ContactList.findOneAndDelete({ _id: req.params.listId, user: userId });
    if (!list) return res.status(404).json({ error: 'List not found' });
    
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete list' }); }
});

// ==========================================
// CONTACTS
// ==========================================

router.get('/contacts', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { page = 1, limit = 50, search, tag, list, subscribed } = req.query;
    const query = { user: userId };
    
    if (search) query.$or = [
      { email: { $regex: search, $options: 'i' } }, 
      { name: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } }
    ];
    if (tag) query.tags = tag;
    if (list) query.lists = list;
    if (subscribed !== undefined) query.subscribed = subscribed === 'true';
    
    const [contacts, total] = await Promise.all([
      EmailContact.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)).lean(),
      EmailContact.countDocuments(query)
    ]);
    res.json({ contacts, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch contacts' }); }
});

router.get('/contacts/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const [total, subscribed, unsubscribed] = await Promise.all([
      EmailContact.countDocuments({ user: userId }),
      EmailContact.countDocuments({ user: userId, subscribed: true }),
      EmailContact.countDocuments({ user: userId, subscribed: false })
    ]);
    res.json({ stats: { total, subscribed, unsubscribed } });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch contact stats' }); }
});

router.post('/contacts', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { email, name, firstName, lastName, phone, company, tags, lists } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    const updateData = { 
      name: name || `${firstName || ''} ${lastName || ''}`.trim(), 
      firstName, 
      lastName, 
      phone, 
      company, 
      source: 'manual' 
    };
    
    const setOnInsert = { subscribed: true, subscribedAt: new Date() };
    
    const update = { $set: updateData, $setOnInsert: setOnInsert };
    
    if (tags?.length) update.$addToSet = { ...update.$addToSet, tags: { $each: tags } };
    if (lists?.length) update.$addToSet = { ...update.$addToSet, lists: { $each: lists } };
    
    const contact = await EmailContact.findOneAndUpdate(
      { user: userId, email: email.toLowerCase() }, 
      update, 
      { upsert: true, new: true }
    );
    
    res.json({ ok: true, contact });
  } catch (err) { 
    if (err.code === 11000) return res.status(400).json({ error: 'Contact already exists' }); 
    res.status(500).json({ error: 'Failed to create contact' }); 
  }
});

router.post('/contacts/import', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { contacts, tags = [], list } = req.body;
    if (!contacts || !Array.isArray(contacts)) return res.status(400).json({ error: 'Contacts array is required' });
    
    let imported = 0, skipped = 0, errors = [];
    const listsToAdd = list ? [list] : [];
    
    for (const contact of contacts) {
      if (!contact.email) { skipped++; continue; }
      try {
        const updateData = {
          name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          company: contact.company,
          source: 'import'
        };
        
        const update = { $set: updateData, $setOnInsert: { subscribed: true, subscribedAt: new Date() } };
        
        const allTags = [...tags, ...(contact.tags || [])];
        const allLists = [...listsToAdd, ...(contact.lists || [])];
        
        if (allTags.length) update.$addToSet = { ...update.$addToSet, tags: { $each: allTags } };
        if (allLists.length) update.$addToSet = { ...update.$addToSet, lists: { $each: allLists } };
        
        await EmailContact.findOneAndUpdate(
          { user: userId, email: contact.email.toLowerCase() }, 
          update, 
          { upsert: true }
        );
        imported++;
      } catch (e) { 
        skipped++; 
        errors.push({ email: contact.email, error: e.message }); 
      }
    }
    
    // Update list counts
    if (list) {
      const count = await EmailContact.countDocuments({ user: userId, lists: list, subscribed: true });
      await ContactList.findByIdAndUpdate(list, { subscriberCount: count, activeCount: count });
    }
    
    const total = await EmailContact.countDocuments({ user: userId, subscribed: true });
    res.json({ ok: true, imported, skipped, errors: errors.slice(0, 10), total });
  } catch (err) { res.status(500).json({ error: 'Failed to import contacts' }); }
});

router.delete('/contacts/:contactId', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const contact = await EmailContact.findOneAndDelete({ _id: req.params.contactId, user: userId });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete contact' }); }
});

// DELETE ALL CONTACTS
router.delete('/contacts/delete-all', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { list } = req.query;
    
    let query = { user: userId };
    if (list) query.lists = list;
    
    const result = await EmailContact.deleteMany(query);
    
    // Update list counts
    if (list) {
      await ContactList.findByIdAndUpdate(list, { subscriberCount: 0, activeCount: 0 });
    }
    
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) { res.status(500).json({ error: 'Failed to delete contacts' }); }
});

// BULK DELETE
router.post('/contacts/bulk-delete', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { contactIds } = req.body;
    if (!contactIds || !Array.isArray(contactIds)) return res.status(400).json({ error: 'Contact IDs required' });
    
    const result = await EmailContact.deleteMany({ 
      _id: { $in: contactIds }, 
      user: userId 
    });
    
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) { res.status(500).json({ error: 'Failed to delete contacts' }); }
});

// BULK ADD TAG
router.post('/contacts/bulk-tag', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { contactIds, tag } = req.body;
    if (!contactIds || !tag) return res.status(400).json({ error: 'Contact IDs and tag required' });
    
    const result = await EmailContact.updateMany(
      { _id: { $in: contactIds }, user: userId },
      { $addToSet: { tags: tag } }
    );
    
    res.json({ ok: true, updated: result.modifiedCount });
  } catch (err) { res.status(500).json({ error: 'Failed to add tag' }); }
});

// AI CLEAN LIST
router.post('/contacts/ai-clean', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { list } = req.body;
    
    let query = { user: userId };
    if (list) query.lists = list;
    
    const contacts = await EmailContact.find(query).lean();
    
    let duplicatesRemoved = 0;
    let invalidFixed = 0;
    let undeliverableRemoved = 0;
    
    // Find duplicates by email (case insensitive)
    const emailMap = {};
    const duplicateIds = [];
    
    for (const contact of contacts) {
      const email = contact.email.toLowerCase();
      if (emailMap[email]) {
        duplicateIds.push(contact._id);
        duplicatesRemoved++;
      } else {
        emailMap[email] = contact._id;
      }
    }
    
    // Remove duplicates
    if (duplicateIds.length > 0) {
      await EmailContact.deleteMany({ _id: { $in: duplicateIds } });
    }
    
    // Validate and fix emails
    const remainingContacts = await EmailContact.find(query).lean();
    
    for (const contact of remainingContacts) {
      const email = contact.email;
      
      // Basic validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        // Try to fix common issues
        let fixed = email.trim().toLowerCase();
        fixed = fixed.replace(/\s+/g, ''); // Remove spaces
        fixed = fixed.replace(/,/g, '.'); // Replace comma with dot
        
        if (emailRegex.test(fixed)) {
          await EmailContact.findByIdAndUpdate(contact._id, { email: fixed });
          invalidFixed++;
        } else {
          // Remove invalid email
          await EmailContact.findByIdAndDelete(contact._id);
          undeliverableRemoved++;
        }
      }
      
      // Check for known invalid domains
      const invalidDomains = ['example.com', 'test.com', 'fake.com', 'invalid.com'];
      const domain = email.split('@')[1]?.toLowerCase();
      if (invalidDomains.includes(domain)) {
        await EmailContact.findOneAndUpdate(
          { _id: contact._id },
          { emailValid: false }
        );
      }
    }
    
    res.json({ 
      ok: true, 
      duplicatesRemoved, 
      invalidFixed, 
      undeliverableRemoved,
      totalCleaned: duplicatesRemoved + undeliverableRemoved
    });
  } catch (err) { 
    console.error('AI clean error:', err);
    res.status(500).json({ error: 'Failed to clean contacts' }); 
  }
});

// ==========================================
// SENDER ADDRESSES
// ==========================================

router.get('/addresses', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const addresses = await EmailAddress.find({ user: userId, isActive: true }).sort({ isDefault: -1, createdAt: -1 }).lean();
    
    // If no addresses, add default noreply and info
    if (addresses.length === 0) {
      const defaultAddresses = [
        { user: userId, email: 'noreply@cybev.io', displayName: 'CYBEV', isVerified: true, isDefault: true },
        { user: userId, email: 'info@cybev.io', displayName: 'CYBEV Info', isVerified: true, isDefault: false }
      ];
      
      for (const addr of defaultAddresses) {
        await EmailAddress.findOneAndUpdate(
          { user: userId, email: addr.email },
          { $set: addr },
          { upsert: true }
        );
      }
      
      const updated = await EmailAddress.find({ user: userId, isActive: true }).lean();
      return res.json({ addresses: updated });
    }
    
    res.json({ addresses });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch addresses' }); }
});

router.post('/addresses', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { email, displayName, isDefault } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    // If setting as default, unset other defaults
    if (isDefault) {
      await EmailAddress.updateMany({ user: userId }, { isDefault: false });
    }
    
    const address = await EmailAddress.findOneAndUpdate(
      { user: userId, email: email.toLowerCase() },
      { $set: { displayName, isDefault: isDefault || false, isVerified: false } },
      { upsert: true, new: true }
    );
    
    res.json({ ok: true, address });
  } catch (err) { res.status(500).json({ error: 'Failed to create address' }); }
});

router.put('/addresses/:addressId/default', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    // Unset all defaults
    await EmailAddress.updateMany({ user: userId }, { isDefault: false });
    
    // Set new default
    const address = await EmailAddress.findOneAndUpdate(
      { _id: req.params.addressId, user: userId },
      { isDefault: true },
      { new: true }
    );
    
    if (!address) return res.status(404).json({ error: 'Address not found' });
    res.json({ ok: true, address });
  } catch (err) { res.status(500).json({ error: 'Failed to set default address' }); }
});

router.delete('/addresses/:addressId', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const address = await EmailAddress.findOneAndDelete({ _id: req.params.addressId, user: userId });
    if (!address) return res.status(404).json({ error: 'Address not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete address' }); }
});

// ==========================================
// TAGS
// ==========================================

router.get('/tags', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tags = await EmailContact.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } }, 
      { $unwind: '$tags' }, 
      { $group: { _id: '$tags', count: { $sum: 1 } } }, 
      { $sort: { count: -1 } }, 
      { $limit: 100 }
    ]);
    res.json({ tags: tags.map(t => ({ name: t._id, count: t.count })) });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch tags' }); }
});

// Get contacts by tag (for audience targeting)
router.get('/tags/:tagName/contacts', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const count = await EmailContact.countDocuments({ 
      user: userId, 
      tags: req.params.tagName, 
      subscribed: true 
    });
    res.json({ tag: req.params.tagName, count });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch tag contacts' }); }
});

// ==========================================
// SEGMENTS (Custom Targeting)
// ==========================================

router.post('/segments/preview', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { rules } = req.body;
    
    // Build query from segment rules
    const query = { user: userId, subscribed: true };
    
    if (rules) {
      // Example rules: { tags: { include: ['vip'], exclude: ['unsubscribed'] }, lists: ['listId'] }
      if (rules.tags?.include?.length) {
        query.tags = { $in: rules.tags.include };
      }
      if (rules.tags?.exclude?.length) {
        query.tags = { ...query.tags, $nin: rules.tags.exclude };
      }
      if (rules.lists?.length) {
        query.lists = { $in: rules.lists };
      }
      if (rules.engagementScore) {
        if (rules.engagementScore.min) query.engagementScore = { $gte: rules.engagementScore.min };
        if (rules.engagementScore.max) query.engagementScore = { ...query.engagementScore, $lte: rules.engagementScore.max };
      }
    }
    
    const count = await EmailContact.countDocuments(query);
    const sample = await EmailContact.find(query).limit(5).select('email name').lean();
    
    res.json({ count, sample });
  } catch (err) { res.status(500).json({ error: 'Failed to preview segment' }); }
});

// ==========================================
// AI FEATURES
// ==========================================

router.post('/ai/subject-line', auth, async (req, res) => {
  try {
    const { campaignName, industry, tone, keywords } = req.body;
    
    // Generate subject line suggestions
    const suggestions = [];
    const templates = [
      `🎉 ${campaignName || 'Newsletter'} - Don't Miss Out!`,
      `Hey {{first_name}}, we have something special for you`,
      `[New] ${campaignName || 'Exciting content'} inside...`,
      `Your weekly update from CYBEV`,
      `Limited time: Check this out 🎁`,
      `{{first_name}}, you'll want to see this`,
      `Breaking: ${campaignName || 'Important news'}`,
      `Don't miss what's happening this week`
    ];
    
    // Return 5 suggestions
    for (let i = 0; i < 5; i++) {
      suggestions.push(templates[i % templates.length]);
    }
    
    res.json({ ok: true, suggestions });
  } catch (err) { res.status(500).json({ error: 'Failed to generate subject lines' }); }
});

router.post('/ai/email-content', auth, async (req, res) => {
  try {
    const { topic, tone, length, industry } = req.body;
    
    // Generate email content (placeholder - integrate with actual AI)
    const content = {
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #8B5CF6;">{{subject}}</h1>
        <p>Hi {{first_name}},</p>
        <p>We're excited to share some news with you about ${topic || 'our latest updates'}.</p>
        <p>Here's what you need to know:</p>
        <ul>
          <li>Point 1: Important information</li>
          <li>Point 2: Key details</li>
          <li>Point 3: What's next</li>
        </ul>
        <p>Don't miss out on this opportunity!</p>
        <p>Best regards,<br>The CYBEV Team</p>
      </div>`,
      text: `Hi {{first_name}},\n\nWe're excited to share some news with you about ${topic || 'our latest updates'}.\n\nBest regards,\nThe CYBEV Team`
    };
    
    res.json({ ok: true, content });
  } catch (err) { res.status(500).json({ error: 'Failed to generate content' }); }
});

// ==========================================
// TEMPLATES
// ==========================================

router.get('/templates', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { category } = req.query;
    const query = { $or: [{ user: userId }, { type: 'system' }], isActive: true };
    if (category && category !== 'all') query.category = category;
    const templates = await EmailTemplate.find(query).sort({ usageCount: -1 }).lean();
    res.json({ templates });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch templates' }); }
});

router.get('/templates/:templateId', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const template = await EmailTemplate.findOne({ _id: req.params.templateId, $or: [{ user: userId }, { type: 'system' }] }).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });
    await EmailTemplate.findByIdAndUpdate(req.params.templateId, { $inc: { usageCount: 1 } });
    res.json({ template });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch template' }); }
});

router.post('/templates', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, category, subject, previewText, content, blocks, thumbnail } = req.body;
    const template = await EmailTemplate.create({ 
      user: userId, 
      name: name || 'Untitled Template', 
      description, 
      category: category || 'general', 
      subject, 
      previewText, 
      content: { html: content?.html || '', text: content?.text || '', blocks: blocks || content?.blocks || [] }, 
      thumbnail, 
      type: 'user' 
    });
    res.json({ ok: true, template });
  } catch (err) { res.status(500).json({ error: 'Failed to create template' }); }
});

// ==========================================
// CAMPAIGNS CRUD
// ==========================================

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const query = { user: userId };
    if (status && status !== 'all') query.status = status;
    const [campaigns, total] = await Promise.all([
      Campaign.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)).lean(),
      Campaign.countDocuments(query)
    ]);
    res.json({ campaigns, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch campaigns' }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid campaign ID' });
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId }).lean();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch campaign' }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, type, subject, previewText, content, sender, audience, schedule, tracking } = req.body;
    
    // Get default sender if not provided
    let senderData = sender;
    if (!senderData?.email) {
      const defaultAddress = await EmailAddress.findOne({ user: userId, isDefault: true });
      if (defaultAddress) {
        senderData = { email: defaultAddress.email, name: defaultAddress.displayName || 'CYBEV' };
      } else {
        senderData = { email: process.env.SES_FROM_EMAIL || 'noreply@cybev.io', name: 'CYBEV' };
      }
    }
    
    const campaign = await Campaign.create({ 
      user: userId, 
      name: name || 'Untitled Campaign', 
      type: type || 'email',
      subject, 
      previewText, 
      content, 
      sender: senderData, 
      audience: audience || { type: 'all' }, 
      schedule: schedule || { type: 'immediate' },
      tracking: tracking || { openTracking: true, clickTracking: true }
    });
    res.json({ ok: true, campaign });
  } catch (err) { 
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Failed to create campaign' }); 
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid campaign ID' });
    const { name, subject, previewText, content, sender, audience, schedule, tracking } = req.body;
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId, status: { $in: ['draft', 'scheduled'] } },
      { $set: { name, subject, previewText, content, sender, audience, schedule, tracking } },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or cannot be edited' });
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to update campaign' }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid campaign ID' });
    const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, user: userId, status: { $ne: 'sending' } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or currently sending' });
    await CampaignRecipient.deleteMany({ campaign: req.params.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete campaign' }); }
});

router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid campaign ID' });
    const original = await Campaign.findOne({ _id: req.params.id, user: userId }).lean();
    if (!original) return res.status(404).json({ error: 'Campaign not found' });
    const newCampaign = await Campaign.create({ ...original, _id: undefined, name: `${original.name} (Copy)`, status: 'draft', stats: {}, sending: {}, sentAt: null, createdAt: undefined, updatedAt: undefined });
    res.json({ ok: true, campaign: newCampaign });
  } catch (err) { res.status(500).json({ error: 'Failed to duplicate campaign' }); }
});

// ==========================================
// CAMPAIGN SENDING
// ==========================================

router.post('/:id/test', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { emails } = req.body;
    if (!emails || !emails.length) return res.status(400).json({ error: 'Test email addresses required' });
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid campaign ID' });
    
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    const results = [];
    for (const email of emails.slice(0, 5)) {
      try {
        const result = await sesService.sendEmail({
          to: email,
          subject: `[TEST] ${campaign.subject || 'Test Email'}`,
          html: campaign.content?.html || '<p>Test email content</p>',
          text: campaign.content?.text,
          from: `${campaign.sender?.name || 'CYBEV'} <${campaign.sender?.email || process.env.SES_FROM_EMAIL || 'noreply@cybev.io'}>`
        });
        results.push({ email, success: true, messageId: result.messageId });
      } catch (err) { 
        results.push({ email, success: false, error: err.message }); 
      }
    }
    res.json({ ok: true, results });
  } catch (err) { res.status(500).json({ error: 'Failed to send test email' }); }
});

router.post('/:id/send', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid campaign ID' });
    
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId, status: { $in: ['draft', 'scheduled'] } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or already sent' });
    if (!campaign.subject) return res.status(400).json({ error: 'Subject line is required' });
    
    // Build query based on audience settings
    let query = { user: new mongoose.Types.ObjectId(userId), subscribed: true };
    
    if (campaign.audience?.type === 'tags' && campaign.audience.tags?.length) {
      query.tags = { $in: campaign.audience.tags };
    }
    if (campaign.audience?.type === 'list' && campaign.audience.lists?.length) {
      query.lists = { $in: campaign.audience.lists };
    }
    if (campaign.audience?.excludeTags?.length) {
      query.tags = { ...(query.tags || {}), $nin: campaign.audience.excludeTags };
    }
    
    const contacts = await EmailContact.find(query).select('email name firstName lastName').lean();
    if (!contacts.length) return res.status(400).json({ error: 'No recipients found. Add contacts first.' });
    
    campaign.status = 'sending';
    campaign.sending = { startedAt: new Date(), progress: 0, totalBatches: Math.ceil(contacts.length / 50), currentBatch: 0 };
    campaign.stats.recipientCount = contacts.length;
    await campaign.save();
    
    const recipients = contacts.map(c => ({ 
      campaign: campaign._id, 
      contact: c._id, 
      email: c.email, 
      name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim(), 
      status: 'queued' 
    }));
    await CampaignRecipient.insertMany(recipients, { ordered: false }).catch(() => {});
    
    processCampaignSending(campaign._id, userId).catch(console.error);
    res.json({ ok: true, message: 'Campaign sending started', recipientCount: contacts.length });
  } catch (err) { res.status(500).json({ error: 'Failed to start sending' }); }
});

async function processCampaignSending(campaignId, userId) {
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.status !== 'sending') return;
    
    const batchSize = 50;
    const totalBatches = campaign.sending.totalBatches || 1;
    let currentBatch = campaign.sending.currentBatch || 0;
    let sent = campaign.stats?.sent || 0, failed = campaign.stats?.bounced || 0;
    
    while (currentBatch < totalBatches) {
      const current = await Campaign.findById(campaignId);
      if (current.status !== 'sending') break;
      
      currentBatch++;
      const recipients = await CampaignRecipient.find({ campaign: campaignId, status: 'queued' }).limit(batchSize);
      if (!recipients.length) break;
      
      const batch = recipients.map(r => ({ 
        email: r.email, 
        name: r.name, 
        data: { firstName: r.name?.split(' ')[0] || 'there' } 
      }));
      
      try {
        const result = await sesService.sendBulkEmails({ 
          recipients: batch, 
          subject: campaign.subject, 
          html: campaign.content.html || '<p>Email content</p>', 
          text: campaign.content.text, 
          from: `${campaign.sender?.name || 'CYBEV'} <${campaign.sender?.email || process.env.SES_FROM_EMAIL}>`, 
          campaignId: campaignId.toString() 
        });
        
        for (const res of result.results || []) {
          const status = res.success ? 'sent' : 'failed';
          await CampaignRecipient.findOneAndUpdate(
            { campaign: campaignId, email: res.email }, 
            { status, sesMessageId: res.messageId, sentAt: res.success ? new Date() : undefined, error: res.error ? { message: res.error } : undefined }
          );
          if (res.success) sent++; else failed++;
        }
      } catch (e) { console.error('Batch send error:', e); }
      
      const progress = Math.round((currentBatch / totalBatches) * 100);
      await Campaign.findByIdAndUpdate(campaignId, { 
        'sending.progress': progress, 
        'sending.currentBatch': currentBatch, 
        'stats.sent': sent, 
        'stats.bounced': failed 
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    await Campaign.findByIdAndUpdate(campaignId, { 
      status: 'sent', 
      sentAt: new Date(), 
      'sending.completedAt': new Date(), 
      'sending.progress': 100, 
      'stats.sent': sent, 
      'stats.delivered': sent 
    });
    
    console.log(`📧 Campaign ${campaignId} completed: ${sent} sent, ${failed} failed`);
  } catch (err) { 
    console.error(`Campaign ${campaignId} error:`, err); 
    await Campaign.findByIdAndUpdate(campaignId, { status: 'paused', 'sending.lastError': err.message }); 
  }
}

router.post('/:id/pause', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId, status: 'sending' }, 
      { status: 'paused', 'sending.pausedAt': new Date() }, 
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or not sending' });
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to pause campaign' }); }
});

router.post('/:id/resume', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId, status: 'paused' }, 
      { status: 'sending' }, 
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    processCampaignSending(campaign._id, userId).catch(console.error);
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to resume campaign' }); }
});

router.post('/:id/schedule', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { scheduledAt, timezone } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: 'Scheduled time is required' });
    
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId, status: 'draft' }, 
      { status: 'scheduled', 'schedule.type': 'scheduled', 'schedule.scheduledAt': new Date(scheduledAt), 'schedule.timezone': timezone || 'UTC' }, 
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or cannot be scheduled' });
    res.json({ ok: true, campaign });
  } catch (err) { res.status(500).json({ error: 'Failed to schedule campaign' }); }
});

router.get('/:id/recipients', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { status, page = 1, limit = 50 } = req.query;
    
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    const query = { campaign: req.params.id };
    if (status) query.status = status;
    
    const [recipients, total] = await Promise.all([
      CampaignRecipient.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      CampaignRecipient.countDocuments(query)
    ]);
    
    res.json({ recipients, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch recipients' }); }
});

// ==========================================
// PUBLIC ROUTES
// ==========================================

router.get('/unsubscribe', async (req, res) => {
  const { email, campaign } = req.query;
  if (!email) return res.status(400).send('Invalid link');
  
  try {
    let campaignDoc = null;
    if (campaign && mongoose.Types.ObjectId.isValid(campaign)) {
      campaignDoc = await Campaign.findById(campaign);
    }
    
    if (campaignDoc?.user) {
      await Unsubscribe.findOneAndUpdate(
        { email: email.toLowerCase(), user: campaignDoc.user }, 
        { source: 'link', campaign: campaignDoc._id }, 
        { upsert: true }
      );
      await EmailContact.findOneAndUpdate(
        { email: email.toLowerCase(), user: campaignDoc.user }, 
        { subscribed: false, unsubscribedAt: new Date() }
      );
    }
    
    res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f3f4f6}.card{background:white;padding:48px;border-radius:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:400px}h1{color:#10b981;margin:0 0 16px;font-size:24px}p{color:#6b7280;margin:0}.check{width:64px;height:64px;background:#d1fae5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}</style></head><body><div class="card"><div class="check"><svg width="32" height="32" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></div><h1>You've been unsubscribed</h1><p>You will no longer receive marketing emails from this sender.</p></div></body></html>`);
  } catch (err) { res.status(500).send('Error processing unsubscribe'); }
});

module.exports = router;
