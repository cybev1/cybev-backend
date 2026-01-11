// ============================================
// FILE: routes/whatsapp.routes.js
// WhatsApp Integration API Routes
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// WhatsApp Template Model
const WhatsAppTemplateSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'ChurchOrg' },
  name: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['welcome', 'followup', 'reminder', 'birthday', 'anniversary', 'invitation'],
    default: 'welcome'
  },
  message: { type: String, required: true },
  triggers: [{ 
    type: String, 
    enum: [
      'new_soul', 'soul_day_3', 'soul_day_7', 'soul_day_14', 
      'first_timer', 'service_reminder', 'event_reminder',
      'birthday', 'membership_anniversary'
    ]
  }],
  delay: { type: Number, default: 0 }, // Days to wait before sending
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

WhatsAppTemplateSchema.index({ organization: 1, active: 1 });
WhatsAppTemplateSchema.index({ triggers: 1, active: 1 });

const WhatsAppTemplate = mongoose.models.WhatsAppTemplate || mongoose.model('WhatsAppTemplate', WhatsAppTemplateSchema);

// WhatsApp Message Log Model
const WhatsAppLogSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'ChurchOrg' },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppTemplate' },
  templateName: String,
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipientPhone: String,
  recipientName: String,
  message: String,
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending'
  },
  errorMessage: String,
  messageId: String, // WhatsApp message ID
  sentAt: { type: Date, default: Date.now },
  deliveredAt: Date,
  readAt: Date
});

WhatsAppLogSchema.index({ organization: 1, sentAt: -1 });
WhatsAppLogSchema.index({ recipient: 1, sentAt: -1 });
WhatsAppLogSchema.index({ status: 1 });

const WhatsAppLog = mongoose.models.WhatsAppLog || mongoose.model('WhatsAppLog', WhatsAppLogSchema);

// WhatsApp Settings Model
const WhatsAppSettingsSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'ChurchOrg', unique: true },
  connected: { type: Boolean, default: false },
  phoneNumberId: String,
  businessAccountId: String,
  accessToken: String, // Encrypted in production
  webhookSecret: String,
  settings: {
    autoWelcome: { type: Boolean, default: true },
    followUpReminders: { type: Boolean, default: true },
    eventReminders: { type: Boolean, default: true },
    birthdayMessages: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const WhatsAppSettings = mongoose.models.WhatsAppSettings || mongoose.model('WhatsAppSettings', WhatsAppSettingsSchema);

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/auth.middleware');
  if (verifyToken.verifyToken) verifyToken = verifyToken.verifyToken;
} catch (e) {
  verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: 'No token' });
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret');
      next();
    } catch (err) {
      res.status(401).json({ ok: false, error: 'Invalid token' });
    }
  };
}

// ==========================================
// GET /api/church/whatsapp/status - Connection status
// ==========================================
router.get('/status', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { orgId } = req.query;

    let settings = null;
    if (orgId) {
      settings = await WhatsAppSettings.findOne({ organization: new ObjectId(orgId) });
    }

    res.json({
      ok: true,
      connected: settings?.connected || false,
      settings: settings?.settings || {
        autoWelcome: true,
        followUpReminders: true,
        eventReminders: true,
        birthdayMessages: true
      }
    });
  } catch (err) {
    console.error('WhatsApp status error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/whatsapp/templates - Create template
// ==========================================
router.post('/templates', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, category, message, triggers, delay, active, organizationId } = req.body;

    if (!name || !message) {
      return res.status(400).json({ ok: false, error: 'Name and message are required' });
    }

    const template = new WhatsAppTemplate({
      organization: organizationId,
      name,
      category: category || 'welcome',
      message,
      triggers: triggers || [],
      delay: delay || 0,
      active: active !== false,
      createdBy: userId
    });

    await template.save();

    console.log(`📱 WhatsApp template created: ${name}`);

    res.status(201).json({ ok: true, template });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/whatsapp/templates - List templates
// ==========================================
router.get('/templates', verifyToken, async (req, res) => {
  try {
    const { orgId, category, active } = req.query;

    const query = {};
    if (orgId) query.organization = new ObjectId(orgId);
    if (category) query.category = category;
    if (active !== undefined) query.active = active === 'true';

    const templates = await WhatsAppTemplate.find(query)
      .populate('createdBy', 'name username')
      .sort({ createdAt: -1 });

    res.json({ ok: true, templates });
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// PUT /api/church/whatsapp/templates/:id - Update template
// ==========================================
router.put('/templates/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const template = await WhatsAppTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }

    const allowedFields = ['name', 'category', 'message', 'triggers', 'delay', 'active'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        template[field] = updates[field];
      }
    });

    template.updatedAt = new Date();
    await template.save();

    res.json({ ok: true, template });
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// DELETE /api/church/whatsapp/templates/:id - Delete template
// ==========================================
router.delete('/templates/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    await WhatsAppTemplate.findByIdAndDelete(id);

    res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/whatsapp/logs - Message logs
// ==========================================
router.get('/logs', verifyToken, async (req, res) => {
  try {
    const { orgId, status, page = 1, limit = 50 } = req.query;

    const query = {};
    if (orgId) query.organization = new ObjectId(orgId);
    if (status) query.status = status;

    const logs = await WhatsAppLog.find(query)
      .populate('template', 'name category')
      .populate('recipient', 'name username profilePicture')
      .sort({ sentAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await WhatsAppLog.countDocuments(query);

    // Stats
    const stats = await WhatsAppLog.aggregate([
      { $match: orgId ? { organization: new ObjectId(orgId) } : {} },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsObj = {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      queued: 0
    };
    stats.forEach(s => {
      if (s._id === 'pending') statsObj.queued = s.count;
      else if (s._id) statsObj[s._id] = s.count;
    });

    res.json({
      ok: true,
      logs,
      stats: statsObj,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/whatsapp/send - Send message
// ==========================================
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { templateId, recipientPhone, recipientName, variables, organizationId } = req.body;

    if (!recipientPhone) {
      return res.status(400).json({ ok: false, error: 'Recipient phone is required' });
    }

    let message = '';
    let templateName = 'Custom Message';

    if (templateId) {
      const template = await WhatsAppTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({ ok: false, error: 'Template not found' });
      }
      message = template.message;
      templateName = template.name;

      // Replace variables
      if (variables) {
        Object.keys(variables).forEach(key => {
          message = message.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
        });
      }
    } else if (req.body.message) {
      message = req.body.message;
    } else {
      return res.status(400).json({ ok: false, error: 'Template or message required' });
    }

    // Create log entry
    const log = new WhatsAppLog({
      organization: organizationId,
      template: templateId,
      templateName,
      recipientPhone,
      recipientName,
      message,
      status: 'pending'
    });

    await log.save();

    // TODO: Integrate with WhatsApp Business API
    // For now, simulate sending
    setTimeout(async () => {
      log.status = 'sent';
      log.messageId = `msg_${Date.now()}`;
      await log.save();
    }, 1000);

    console.log(`📱 WhatsApp message queued to ${recipientPhone}`);

    res.json({ ok: true, log, messageId: log._id });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/whatsapp/settings - Update settings
// ==========================================
router.post('/settings', verifyToken, async (req, res) => {
  try {
    const { organizationId, settings, phoneNumberId, businessAccountId } = req.body;

    if (!organizationId) {
      return res.status(400).json({ ok: false, error: 'Organization ID required' });
    }

    let whatsappSettings = await WhatsAppSettings.findOne({ organization: new ObjectId(organizationId) });

    if (!whatsappSettings) {
      whatsappSettings = new WhatsAppSettings({
        organization: organizationId
      });
    }

    if (settings) whatsappSettings.settings = { ...whatsappSettings.settings, ...settings };
    if (phoneNumberId) whatsappSettings.phoneNumberId = phoneNumberId;
    if (businessAccountId) whatsappSettings.businessAccountId = businessAccountId;

    whatsappSettings.updatedAt = new Date();
    await whatsappSettings.save();

    res.json({ ok: true, settings: whatsappSettings });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/whatsapp/webhook/:orgId - Webhook endpoint
// ==========================================
router.post('/webhook/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    const payload = req.body;

    console.log(`📱 WhatsApp webhook received for org ${orgId}:`, JSON.stringify(payload).slice(0, 200));

    // Handle different webhook events
    if (payload.entry) {
      for (const entry of payload.entry) {
        for (const change of entry.changes || []) {
          if (change.value?.statuses) {
            // Message status updates
            for (const status of change.value.statuses) {
              await WhatsAppLog.findOneAndUpdate(
                { messageId: status.id },
                { 
                  status: status.status,
                  deliveredAt: status.status === 'delivered' ? new Date() : undefined,
                  readAt: status.status === 'read' ? new Date() : undefined
                }
              );
            }
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Webhook verification (GET)
router.get('/webhook/:orgId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verify token (in production, check against stored secret)
  if (mode === 'subscribe') {
    console.log('📱 WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// ==========================================
// Trigger Handler - Called by other routes
// ==========================================
async function triggerWhatsAppMessage(trigger, data) {
  try {
    const { organizationId, recipientPhone, recipientName, variables } = data;

    // Find matching templates
    const templates = await WhatsAppTemplate.find({
      organization: organizationId,
      triggers: trigger,
      active: true
    });

    for (const template of templates) {
      // Apply delay if set
      const sendAt = new Date(Date.now() + (template.delay * 24 * 60 * 60 * 1000));
      
      let message = template.message;
      if (variables) {
        Object.keys(variables).forEach(key => {
          message = message.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
        });
      }

      const log = new WhatsAppLog({
        organization: organizationId,
        template: template._id,
        templateName: template.name,
        recipientPhone,
        recipientName,
        message,
        status: template.delay > 0 ? 'pending' : 'sent',
        sentAt: template.delay > 0 ? sendAt : new Date()
      });

      await log.save();

      console.log(`📱 WhatsApp message triggered: ${trigger} -> ${recipientPhone}`);
    }
  } catch (err) {
    console.error('Trigger WhatsApp error:', err);
  }
}

// Export trigger function for use in other routes
router.triggerMessage = triggerWhatsAppMessage;

console.log('📱 WhatsApp routes loaded');

module.exports = router;
