// ============================================
// FILE: routes/campaigns-enhanced.routes.js
// CYBEV Enhanced Campaign API
// VERSION: 2.0.0 - Full Email Marketing Platform
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import models
const { Campaign, CampaignRecipient, ContactList, EmailTemplate, Unsubscribe } = require('../models/campaign.model');
const { EmailAddress, EmailContact } = require('../models/email.model');
const sesService = require('../services/ses.service');

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
// CAMPAIGN CRUD
// ==========================================

// Get all campaigns
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { status, type, page = 1, limit = 20 } = req.query;
    
    const query = { user: userId };
    if (status) query.status = status;
    if (type) query.type = type;
    
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('sender.emailAddress', 'email displayName'),
      Campaign.countDocuments(query)
    ]);
    
    res.json({ 
      campaigns, 
      pagination: { page: parseInt(page), limit: parseInt(limit), total }
    });
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get campaign stats summary
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const [totalCampaigns, campaigns, contacts] = await Promise.all([
      Campaign.countDocuments({ user: userId }),
      Campaign.find({ user: userId }),
      EmailContact.countDocuments({ user: userId, subscribed: true })
    ]);
    
    const stats = {
      totalCampaigns,
      totalContacts: contacts,
      totalSent: 0,
      totalOpened: 0,
      totalClicked: 0,
      avgOpenRate: 0,
      avgClickRate: 0
    };
    
    let sentCampaigns = 0;
    campaigns.forEach(c => {
      stats.totalSent += c.stats?.sent || 0;
      stats.totalOpened += c.stats?.uniqueOpens || 0;
      stats.totalClicked += c.stats?.uniqueClicks || 0;
      if (c.stats?.sent > 0) {
        sentCampaigns++;
        stats.avgOpenRate += c.stats.openRate || 0;
        stats.avgClickRate += c.stats.clickRate || 0;
      }
    });
    
    if (sentCampaigns > 0) {
      stats.avgOpenRate = Math.round((stats.avgOpenRate / sentCampaigns) * 100) / 100;
      stats.avgClickRate = Math.round((stats.avgClickRate / sentCampaigns) * 100) / 100;
    }
    
    res.json({ stats });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get single campaign
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId })
      .populate('sender.emailAddress', 'email displayName')
      .populate('audience.contactList', 'name subscriberCount');
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    res.json({ campaign });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Create campaign
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { 
      name, type = 'email', subject, previewText,
      content, sender, audience, schedule, tracking, abTest
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Campaign name is required' });
    }
    
    let senderData = {};
    if (sender?.emailAddressId) {
      const emailAddr = await EmailAddress.findOne({ 
        _id: sender.emailAddressId, 
        user: userId,
        isActive: true 
      });
      if (emailAddr) {
        senderData = {
          emailAddress: emailAddr._id,
          email: emailAddr.email,
          name: sender.name || emailAddr.displayName,
          replyTo: sender.replyTo || emailAddr.email
        };
      }
    }
    
    let recipientCount = 0;
    if (audience?.type === 'all') {
      recipientCount = await EmailContact.countDocuments({ user: userId, subscribed: true });
    } else if (audience?.contactList) {
      const list = await ContactList.findById(audience.contactList);
      recipientCount = list?.activeCount || 0;
    } else if (audience?.tags?.length > 0) {
      recipientCount = await EmailContact.countDocuments({ 
        user: userId, 
        subscribed: true,
        tags: { $in: audience.tags }
      });
    }
    
    const campaign = await Campaign.create({
      user: userId,
      name,
      type,
      subject,
      previewText,
      content: {
        html: content?.html || '',
        text: content?.text || '',
        json: content?.json
      },
      sender: senderData,
      audience: {
        type: audience?.type || 'all',
        contactList: audience?.contactList,
        tags: audience?.tags || [],
        excludeTags: audience?.excludeTags || []
      },
      schedule: {
        type: schedule?.type || 'immediate',
        scheduledAt: schedule?.scheduledAt,
        timezone: schedule?.timezone || 'UTC'
      },
      tracking: {
        openTracking: tracking?.openTracking !== false,
        clickTracking: tracking?.clickTracking !== false,
        googleAnalytics: tracking?.googleAnalytics
      },
      abTest: abTest?.enabled ? abTest : undefined,
      stats: { recipientCount }
    });
    
    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const updates = req.body;
    
    const campaign = await Campaign.findOne({ 
      _id: req.params.id, 
      user: userId,
      status: { $in: ['draft', 'scheduled'] }
    });
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found or cannot be edited' });
    }
    
    const allowedFields = ['name', 'subject', 'previewText', 'content', 'sender', 'audience', 'schedule', 'tracking', 'abTest'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        campaign[field] = updates[field];
      }
    });
    
    await campaign.save();
    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Update campaign error:', err);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, user: userId });
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    await CampaignRecipient.deleteMany({ campaign: campaign._id });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Duplicate campaign
router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const original = await Campaign.findOne({ _id: req.params.id, user: userId });
    if (!original) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const duplicate = await Campaign.create({
      user: userId,
      name: `${original.name} (Copy)`,
      type: original.type,
      subject: original.subject,
      previewText: original.previewText,
      content: original.content,
      sender: original.sender,
      audience: original.audience,
      tracking: original.tracking,
      abTest: original.abTest,
      status: 'draft'
    });
    
    res.json({ ok: true, campaign: duplicate });
  } catch (err) {
    console.error('Duplicate campaign error:', err);
    res.status(500).json({ error: 'Failed to duplicate campaign' });
  }
});

// ==========================================
// CAMPAIGN SENDING
// ==========================================

// Send campaign
router.post('/:id/send', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const campaign = await Campaign.findOne({ 
      _id: req.params.id, 
      user: userId,
      status: { $in: ['draft', 'scheduled'] }
    }).populate('sender.emailAddress');
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found or already sent' });
    }
    
    if (!campaign.sender?.email) {
      return res.status(400).json({ error: 'No sender email configured' });
    }
    
    if (!campaign.content?.html && !campaign.content?.text) {
      return res.status(400).json({ error: 'Campaign has no content' });
    }
    
    let recipients = [];
    const unsubscribed = await Unsubscribe.find({ user: userId }).distinct('email');
    
    if (campaign.audience.type === 'all') {
      recipients = await EmailContact.find({ 
        user: userId, 
        subscribed: true,
        email: { $nin: unsubscribed }
      }).select('email name customFields');
    } else if (campaign.audience.contactList) {
      recipients = await EmailContact.find({ 
        user: userId,
        subscribed: true,
        email: { $nin: unsubscribed }
      }).select('email name customFields');
    } else if (campaign.audience.tags?.length > 0) {
      recipients = await EmailContact.find({ 
        user: userId, 
        subscribed: true,
        tags: { $in: campaign.audience.tags },
        email: { $nin: unsubscribed }
      }).select('email name customFields');
    }
    
    if (campaign.audience.excludeTags?.length > 0) {
      const excludeEmails = await EmailContact.find({
        user: userId,
        tags: { $in: campaign.audience.excludeTags }
      }).distinct('email');
      recipients = recipients.filter(r => !excludeEmails.includes(r.email));
    }
    
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients found for this campaign' });
    }
    
    campaign.status = 'sending';
    campaign.sending = {
      startedAt: new Date(),
      progress: 0,
      totalBatches: Math.ceil(recipients.length / 50)
    };
    campaign.stats.recipientCount = recipients.length;
    await campaign.save();
    
    const recipientDocs = recipients.map(r => ({
      campaign: campaign._id,
      contact: r._id,
      email: r.email,
      name: r.name,
      mergeData: r.customFields,
      status: 'pending'
    }));
    
    await CampaignRecipient.insertMany(recipientDocs, { ordered: false });
    
    sendCampaignEmails(campaign._id).catch(err => {
      console.error('Background send error:', err);
    });
    
    res.json({ 
      ok: true, 
      message: 'Campaign sending started',
      recipientCount: recipients.length
    });
  } catch (err) {
    console.error('Send campaign error:', err);
    res.status(500).json({ error: 'Failed to send campaign' });
  }
});

// Background sending function
async function sendCampaignEmails(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return;
  
  const BATCH_SIZE = 50;
  let currentBatch = 0;
  let sent = 0;
  let failed = 0;
  
  try {
    const recipients = await CampaignRecipient.find({ 
      campaign: campaignId, 
      status: 'pending' 
    });
    
    const totalBatches = Math.ceil(recipients.length / BATCH_SIZE);
    
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      currentBatch++;
      const batch = recipients.slice(i, i + BATCH_SIZE);
      
      const emailBatch = batch.map(r => ({
        email: r.email,
        name: r.name,
        data: {
          name: r.name || 'there',
          email: r.email,
          ...r.mergeData
        }
      }));
      
      const result = await sesService.sendBulkEmail({
        recipients: emailBatch,
        from: campaign.sender.email,
        fromName: campaign.sender.name,
        subject: campaign.subject,
        html: campaign.content.html,
        text: campaign.content.text,
        campaignId: campaignId.toString()
      });
      
      for (const res of result.results) {
        const status = res.success ? 'sent' : 'failed';
        await CampaignRecipient.findOneAndUpdate(
          { campaign: campaignId, email: res.email },
          { 
            status,
            sesMessageId: res.messageId,
            sentAt: res.success ? new Date() : undefined,
            error: res.error ? { message: res.error } : undefined
          }
        );
        
        if (res.success) sent++;
        else failed++;
      }
      
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
    await Campaign.findByIdAndUpdate(campaignId, {
      status: 'paused',
      'sending.lastError': err.message
    });
  }
}

// Schedule campaign
router.post('/:id/schedule', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { scheduledAt, timezone } = req.body;
    
    if (!scheduledAt) {
      return res.status(400).json({ error: 'Scheduled time is required' });
    }
    
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId, status: 'draft' },
      { 
        status: 'scheduled',
        'schedule.type': 'scheduled',
        'schedule.scheduledAt': new Date(scheduledAt),
        'schedule.timezone': timezone || 'UTC'
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

// Get campaign recipients
router.get('/:id/recipients', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { status, page = 1, limit = 50 } = req.query;
    
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId });
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const query = { campaign: req.params.id };
    if (status) query.status = status;
    
    const [recipients, total, statusCounts] = await Promise.all([
      CampaignRecipient.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      CampaignRecipient.countDocuments(query),
      CampaignRecipient.aggregate([
        { $match: { campaign: campaign._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);
    
    res.json({
      recipients,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
      statusCounts: statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {})
    });
  } catch (err) {
    console.error('Get recipients error:', err);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

// ==========================================
// CONTACT LISTS
// ==========================================

router.get('/lists', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const lists = await ContactList.find({ user: userId }).sort({ createdAt: -1 });
    res.json({ lists });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

router.post('/lists', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, defaultTags, customFields } = req.body;
    
    const list = await ContactList.create({
      user: userId,
      name,
      description,
      defaultTags,
      customFields
    });
    
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create list' });
  }
});

router.post('/lists/:id/import', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { contacts } = req.body;
    
    const list = await ContactList.findOne({ _id: req.params.id, user: userId });
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    let imported = 0, skipped = 0;
    
    for (const contact of contacts || []) {
      if (!contact.email) { skipped++; continue; }
      
      try {
        await EmailContact.findOneAndUpdate(
          { user: userId, email: contact.email.toLowerCase() },
          {
            $set: { name: contact.name, phone: contact.phone, company: contact.company, source: 'import' },
            $addToSet: { tags: { $each: list.defaultTags || [] } }
          },
          { upsert: true }
        );
        imported++;
      } catch { skipped++; }
    }
    
    list.subscriberCount = await EmailContact.countDocuments({ user: userId });
    list.activeCount = await EmailContact.countDocuments({ user: userId, subscribed: true });
    list.lastImport = { date: new Date(), count: imported, source: 'csv' };
    await list.save();
    
    res.json({ ok: true, imported, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

// ==========================================
// TEMPLATES
// ==========================================

router.get('/templates', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { category } = req.query;
    
    const query = {
      $or: [{ user: userId }, { type: 'system' }],
      isActive: true
    };
    if (category) query.category = category;
    
    const templates = await EmailTemplate.find(query).sort({ usageCount: -1 });
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/templates', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, category, subject, previewText, content, design } = req.body;
    
    const template = await EmailTemplate.create({
      user: userId, name, description, category, subject, previewText, content, design, type: 'user'
    });
    
    res.json({ ok: true, template });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Public unsubscribe
router.get('/unsubscribe', async (req, res) => {
  const { email, campaign } = req.query;
  if (!email) return res.status(400).send('Invalid link');
  
  try {
    const campaignDoc = campaign ? await Campaign.findById(campaign) : null;
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
    
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Unsubscribed</title></head>
      <body style="font-family:Arial;text-align:center;padding:50px;">
        <h1>You've been unsubscribed</h1>
        <p>You will no longer receive emails from this sender.</p>
      </body></html>
    `);
  } catch { res.status(500).send('Error'); }
});

module.exports = router;
