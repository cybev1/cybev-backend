// ============================================
// FILE: routes/campaigns-enhanced.routes.js
// CYBEV Enhanced Campaign API - FIXED
// VERSION: 2.1.0 - Fixed populate errors
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
// CAMPAIGN CRUD - FIXED (no populate errors)
// ==========================================

// Get all campaigns
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { status, type, page = 1, limit = 20 } = req.query;
    
    const query = { user: userId };
    if (status) query.status = status;
    if (type) query.type = type;
    
    // FIXED: Removed problematic populate - sender data is already embedded
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
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
      Campaign.find({ user: userId }).lean(),
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

// Get single campaign - FIXED
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    // FIXED: Removed problematic populates
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId }).lean();
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Manually fetch contact list if needed
    if (campaign.audience?.contactList) {
      try {
        const list = await ContactList.findById(campaign.audience.contactList).select('name subscriberCount').lean();
        if (list) campaign.audience.contactListData = list;
      } catch (e) {}
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
    
    // Build sender data directly (no reference)
    let senderData = {
      email: sender?.email || process.env.SES_FROM_EMAIL || 'info@cybev.io',
      name: sender?.name || 'CYBEV',
      replyTo: sender?.replyTo
    };
    
    // If emailAddressId provided, fetch the email
    if (sender?.emailAddressId) {
      const emailAddr = await EmailAddress.findOne({ 
        _id: sender.emailAddressId, 
        user: userId,
        isActive: true 
      });
      if (emailAddr) {
        senderData = {
          email: emailAddr.email,
          name: sender.name || emailAddr.displayName || 'CYBEV',
          replyTo: sender.replyTo || emailAddr.email
        };
      }
    }
    
    // Calculate recipient count
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
        json: content?.json,
        blocks: content?.blocks || []
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
    
    const original = await Campaign.findOne({ _id: req.params.id, user: userId }).lean();
    if (!original) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const copy = {
      ...original,
      _id: undefined,
      name: `${original.name} (Copy)`,
      status: 'draft',
      createdAt: undefined,
      updatedAt: undefined,
      sentAt: undefined,
      stats: { recipientCount: original.stats?.recipientCount || 0 },
      sending: undefined
    };
    
    const campaign = await Campaign.create(copy);
    res.json({ ok: true, campaign });
  } catch (err) {
    console.error('Duplicate campaign error:', err);
    res.status(500).json({ error: 'Failed to duplicate campaign' });
  }
});

// ==========================================
// SENDING
// ==========================================

// Send test email
router.post('/:id/test', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { emails } = req.body;
    
    const testEmails = Array.isArray(emails) ? emails : [emails];
    if (!testEmails.length || !testEmails[0]) {
      return res.status(400).json({ error: 'Test email address required' });
    }
    
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId });
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const results = [];
    for (const email of testEmails) {
      try {
        const result = await sesService.sendEmail({
          to: email,
          subject: `[TEST] ${campaign.subject || 'Test Campaign'}`,
          html: campaign.content?.html || '<p>Test email content</p>',
          text: campaign.content?.text,
          from: `${campaign.sender?.name || 'CYBEV'} <${campaign.sender?.email || process.env.SES_FROM_EMAIL}>`,
          replyTo: campaign.sender?.replyTo
        });
        results.push({ email, success: true, messageId: result.messageId });
      } catch (err) {
        results.push({ email, success: false, error: err.message });
      }
    }
    
    res.json({ ok: true, results });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Send campaign now
router.post('/:id/send', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const campaign = await Campaign.findOne({ 
      _id: req.params.id, 
      user: userId,
      status: { $in: ['draft', 'scheduled'] }
    });
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found or already sent' });
    }
    
    if (!campaign.subject) {
      return res.status(400).json({ error: 'Subject line is required' });
    }
    
    if (!campaign.content?.html && !campaign.content?.blocks?.length) {
      return res.status(400).json({ error: 'Email content is required' });
    }
    
    // Build recipient list
    let query = { user: new mongoose.Types.ObjectId(userId), subscribed: true };
    
    if (campaign.audience?.type === 'tags' && campaign.audience.tags?.length) {
      query.tags = { $in: campaign.audience.tags };
    }
    if (campaign.audience?.excludeTags?.length) {
      query.tags = { ...(query.tags || {}), $nin: campaign.audience.excludeTags };
    }
    
    const contacts = await EmailContact.find(query).select('email name firstName lastName').lean();
    
    if (!contacts.length) {
      return res.status(400).json({ error: 'No recipients found' });
    }
    
    // Update campaign status
    campaign.status = 'sending';
    campaign.sending = {
      startedAt: new Date(),
      progress: 0,
      totalBatches: Math.ceil(contacts.length / 50),
      currentBatch: 0
    };
    campaign.stats.recipientCount = contacts.length;
    await campaign.save();
    
    // Create recipient records
    const recipients = contacts.map(c => ({
      campaign: campaign._id,
      contact: c._id,
      email: c.email,
      name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim(),
      status: 'queued'
    }));
    
    await CampaignRecipient.insertMany(recipients, { ordered: false }).catch(() => {});
    
    // Start sending in background
    processCampaignSending(campaign._id, userId).catch(console.error);
    
    res.json({ 
      ok: true, 
      message: 'Campaign sending started',
      recipientCount: contacts.length
    });
  } catch (err) {
    console.error('Send campaign error:', err);
    res.status(500).json({ error: 'Failed to start sending' });
  }
});

// Background sending process
async function processCampaignSending(campaignId, userId) {
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.status !== 'sending') return;
    
    const batchSize = 50;
    const totalBatches = campaign.sending.totalBatches || 1;
    let currentBatch = campaign.sending.currentBatch || 0;
    let sent = campaign.stats?.sent || 0;
    let failed = campaign.stats?.bounced || 0;
    
    while (currentBatch < totalBatches) {
      // Check if paused
      const current = await Campaign.findById(campaignId);
      if (current.status !== 'sending') break;
      
      currentBatch++;
      const recipients = await CampaignRecipient.find({
        campaign: campaignId,
        status: 'queued'
      }).limit(batchSize);
      
      if (!recipients.length) break;
      
      // Prepare batch
      const batch = recipients.map(r => ({
        email: r.email,
        name: r.name,
        data: { firstName: r.name?.split(' ')[0] || 'there' }
      }));
      
      // Send batch
      const result = await sesService.sendBulkEmails({
        recipients: batch,
        subject: campaign.subject,
        html: campaign.content.html,
        text: campaign.content.text,
        from: `${campaign.sender?.name || 'CYBEV'} <${campaign.sender?.email || process.env.SES_FROM_EMAIL}>`,
        campaignId: campaignId.toString()
      });
      
      // Update recipient statuses
      for (const res of result.results || []) {
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
      
      // Update progress
      const progress = Math.round((currentBatch / totalBatches) * 100);
      await Campaign.findByIdAndUpdate(campaignId, {
        'sending.progress': progress,
        'sending.currentBatch': currentBatch,
        'stats.sent': sent,
        'stats.bounced': failed
      });
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Mark complete
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

// Pause campaign
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId, status: 'sending' },
      { status: 'paused', 'sending.pausedAt': new Date() },
      { new: true }
    );
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found or not sending' });
    }
    
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

// Resume campaign
router.post('/:id/resume', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId, status: 'paused' },
      { status: 'sending' },
      { new: true }
    );
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    processCampaignSending(campaign._id, userId).catch(console.error);
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resume campaign' });
  }
});

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

router.get('/templates/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const template = await EmailTemplate.findOne({
      _id: req.params.id,
      $or: [{ user: userId }, { type: 'system' }]
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ template });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/templates', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, category, subject, previewText, content, design, blocks } = req.body;
    
    const template = await EmailTemplate.create({
      user: userId, 
      name, 
      description, 
      category, 
      subject, 
      previewText, 
      content: {
        ...content,
        blocks: blocks || content?.blocks || []
      },
      design, 
      type: 'user'
    });
    
    res.json({ ok: true, template });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/templates/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const updates = req.body;
    
    const template = await EmailTemplate.findOneAndUpdate(
      { _id: req.params.id, user: userId, type: 'user' },
      { $set: updates },
      { new: true }
    );
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found or cannot be edited' });
    }
    
    res.json({ ok: true, template });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/templates/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const template = await EmailTemplate.findOneAndDelete({ 
      _id: req.params.id, 
      user: userId,
      type: 'user'
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template' });
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
      <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f3f4f6; }
          .card { background: white; padding: 48px; border-radius: 16px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 400px; }
          h1 { color: #10b981; margin: 0 0 16px; font-size: 24px; }
          p { color: #6b7280; margin: 0; }
          .check { width: 64px; height: 64px; background: #d1fae5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
          .check svg { width: 32px; height: 32px; color: #10b981; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="check">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          </div>
          <h1>You've been unsubscribed</h1>
          <p>You will no longer receive marketing emails from this sender.</p>
        </div>
      </body>
      </html>
    `);
  } catch { res.status(500).send('Error'); }
});

module.exports = router;
