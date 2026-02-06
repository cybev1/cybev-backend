// ============================================
// FILE: routes/automations.routes.js
// CYBEV Email Automation API - Workflow Builder
// VERSION: 1.0.0 - Klaviyo-Quality Automations
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import models
const { Automation, AutomationEnrollment, AutomationEmailLog } = require('../models/automation.model');

// Email service
let emailService = null;
try {
  emailService = require('../services/email-multi-provider.service');
} catch (err) {
  console.warn('⚠️ Email service not available for automations');
}

// ==========================================
// AUTHENTICATION MIDDLEWARE
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
// AUTOMATION TEMPLATES
// ==========================================

const AUTOMATION_TEMPLATES = [
  {
    id: 'welcome_series',
    name: 'Welcome Series',
    description: 'Onboard new subscribers with a 3-email welcome sequence',
    icon: '👋',
    category: 'engagement',
    trigger: { type: 'list_signup' },
    steps: [
      { id: 'email1', type: 'email', config: { subject: 'Welcome to {{company}}! 🎉', delayType: 'fixed', delayValue: 0 } },
      { id: 'delay1', type: 'delay', config: { delayType: 'fixed', delayValue: 2, delayUnit: 'days' } },
      { id: 'email2', type: 'email', config: { subject: 'Here\'s what you can do with {{company}}' } },
      { id: 'delay2', type: 'delay', config: { delayType: 'fixed', delayValue: 3, delayUnit: 'days' } },
      { id: 'email3', type: 'email', config: { subject: 'Quick tip to get the most out of {{company}}' } }
    ]
  },
  {
    id: 'abandoned_cart',
    name: 'Abandoned Cart Recovery',
    description: 'Recover lost sales with timely reminders',
    icon: '🛒',
    category: 'ecommerce',
    trigger: { type: 'abandoned_cart' },
    steps: [
      { id: 'delay1', type: 'delay', config: { delayType: 'fixed', delayValue: 1, delayUnit: 'hours' } },
      { id: 'email1', type: 'email', config: { subject: 'You left something behind 🛒' } },
      { id: 'condition1', type: 'condition', config: { conditionType: 'email_clicked', yesPath: 'end', noPath: 'delay2' } },
      { id: 'delay2', type: 'delay', config: { delayType: 'fixed', delayValue: 24, delayUnit: 'hours' } },
      { id: 'email2', type: 'email', config: { subject: 'Your cart is waiting - 10% off inside!' } }
    ]
  },
  {
    id: 'birthday',
    name: 'Birthday Celebration',
    description: 'Send personalized birthday wishes and offers',
    icon: '🎂',
    category: 'engagement',
    trigger: { type: 'date_property', dateProperty: 'birthday' },
    steps: [
      { id: 'email1', type: 'email', config: { subject: 'Happy Birthday, {{firstName}}! 🎉 Here\'s a gift for you' } }
    ]
  },
  {
    id: 'win_back',
    name: 'Win-Back Campaign',
    description: 'Re-engage inactive subscribers',
    icon: '💔',
    category: 'engagement',
    trigger: { type: 'inactivity', inactivityDays: 30 },
    steps: [
      { id: 'email1', type: 'email', config: { subject: 'We miss you! Here\'s 20% off to come back' } },
      { id: 'delay1', type: 'delay', config: { delayType: 'fixed', delayValue: 5, delayUnit: 'days' } },
      { id: 'condition1', type: 'condition', config: { conditionType: 'email_opened', yesPath: 'end', noPath: 'email2' } },
      { id: 'email2', type: 'email', config: { subject: 'Last chance: Your special offer expires soon' } }
    ]
  },
  {
    id: 'post_purchase',
    name: 'Post-Purchase Follow-up',
    description: 'Thank customers and request reviews',
    icon: '📦',
    category: 'ecommerce',
    trigger: { type: 'purchase' },
    steps: [
      { id: 'email1', type: 'email', config: { subject: 'Thank you for your order! 🎉' } },
      { id: 'delay1', type: 'delay', config: { delayType: 'fixed', delayValue: 7, delayUnit: 'days' } },
      { id: 'email2', type: 'email', config: { subject: 'How are you enjoying your purchase?' } },
      { id: 'delay2', type: 'delay', config: { delayType: 'fixed', delayValue: 14, delayUnit: 'days' } },
      { id: 'email3', type: 'email', config: { subject: 'Leave a review and get 10% off your next order' } }
    ]
  },
  {
    id: 'event_reminder',
    name: 'Event Reminder',
    description: 'Send reminders before an event',
    icon: '📅',
    category: 'engagement',
    trigger: { type: 'date_property', dateProperty: 'event_date' },
    steps: [
      { id: 'email1', type: 'email', config: { subject: 'Reminder: {{event_name}} is in 7 days!', delayValue: -7, delayUnit: 'days' } },
      { id: 'email2', type: 'email', config: { subject: '{{event_name}} is tomorrow!', delayValue: -1, delayUnit: 'days' } },
      { id: 'email3', type: 'email', config: { subject: '{{event_name}} starts now!', delayValue: 0 } }
    ]
  }
];

// ==========================================
// AUTOMATION CRUD
// ==========================================

// Get all automations
router.get('/', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { status } = req.query;
    
    const query = { user: userId };
    if (status) query.status = status;
    
    const automations = await Automation.find(query)
      .sort({ createdAt: -1 })
      .populate('trigger.listId', 'name')
      .populate('trigger.formId', 'name');
    
    res.json({ ok: true, automations });
  } catch (err) {
    console.error('Get automations error:', err);
    res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

// Get automation templates
router.get('/templates', auth, async (req, res) => {
  res.json({ ok: true, templates: AUTOMATION_TEMPLATES });
});

// Get single automation
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const automation = await Automation.findOne({ _id: req.params.id, user: userId })
      .populate('trigger.listId', 'name')
      .populate('trigger.formId', 'name');
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    res.json({ ok: true, automation });
  } catch (err) {
    console.error('Get automation error:', err);
    res.status(500).json({ error: 'Failed to fetch automation' });
  }
});

// Create automation (from scratch or template)
router.post('/', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, description, templateId, trigger, steps, settings } = req.body;
    
    let automationData = {
      user: userId,
      name: name || 'New Automation',
      description,
      status: 'draft'
    };
    
    // If using template
    if (templateId) {
      const template = AUTOMATION_TEMPLATES.find(t => t.id === templateId);
      if (template) {
        automationData.name = name || template.name;
        automationData.description = description || template.description;
        automationData.trigger = { ...template.trigger };
        automationData.steps = template.steps.map((step, i) => ({
          ...step,
          id: `step_${Date.now()}_${i}`,
          position: { x: 250, y: 100 + (i * 120) }
        }));
      }
    } else {
      automationData.trigger = trigger || { type: 'list_signup' };
      automationData.steps = steps || [];
    }
    
    automationData.settings = settings || {};
    
    const automation = new Automation(automationData);
    await automation.save();
    
    console.log(`✅ Automation "${automation.name}" created for user ${userId}`);
    res.json({ ok: true, automation });
  } catch (err) {
    console.error('Create automation error:', err);
    res.status(500).json({ error: 'Failed to create automation' });
  }
});

// Update automation
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const updates = req.body;
    
    const automation = await Automation.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    // Can't update active automation's steps
    if (automation.status === 'active' && updates.steps) {
      return res.status(400).json({ error: 'Pause automation before editing workflow' });
    }
    
    const allowedUpdates = ['name', 'description', 'trigger', 'steps', 'settings'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        automation[field] = updates[field];
      }
    });
    
    await automation.save();
    res.json({ ok: true, automation });
  } catch (err) {
    console.error('Update automation error:', err);
    res.status(500).json({ error: 'Failed to update automation' });
  }
});

// Delete automation
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const automation = await Automation.findOneAndDelete({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    // Delete enrollments and logs
    await AutomationEnrollment.deleteMany({ automation: req.params.id });
    await AutomationEmailLog.deleteMany({ automation: req.params.id });
    
    res.json({ ok: true, message: 'Automation deleted' });
  } catch (err) {
    console.error('Delete automation error:', err);
    res.status(500).json({ error: 'Failed to delete automation' });
  }
});

// ==========================================
// AUTOMATION STATUS OPERATIONS
// ==========================================

// Activate automation
router.post('/:id/activate', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const automation = await Automation.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    // Validate automation has required elements
    if (!automation.trigger?.type) {
      return res.status(400).json({ error: 'Automation must have a trigger configured' });
    }
    
    if (!automation.steps || automation.steps.length === 0) {
      return res.status(400).json({ error: 'Automation must have at least one step' });
    }
    
    automation.status = 'active';
    automation.activatedAt = new Date();
    await automation.save();
    
    console.log(`✅ Automation "${automation.name}" activated`);
    res.json({ ok: true, automation });
  } catch (err) {
    console.error('Activate automation error:', err);
    res.status(500).json({ error: 'Failed to activate automation' });
  }
});

// Pause automation
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const automation = await Automation.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { status: 'paused', pausedAt: new Date() },
      { new: true }
    );
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    res.json({ ok: true, automation });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pause automation' });
  }
});

// Duplicate automation
router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const original = await Automation.findOne({ _id: req.params.id, user: userId });
    if (!original) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    const duplicate = new Automation({
      ...original.toObject(),
      _id: undefined,
      name: `${original.name} (Copy)`,
      status: 'draft',
      stats: {
        totalEntered: 0,
        currentlyActive: 0,
        completed: 0,
        exitedEarly: 0,
        goalReached: 0,
        emailsSent: 0,
        revenue: 0
      },
      createdAt: undefined,
      updatedAt: undefined,
      activatedAt: undefined,
      pausedAt: undefined,
      lastTriggeredAt: undefined
    });
    
    await duplicate.save();
    res.json({ ok: true, automation: duplicate });
  } catch (err) {
    console.error('Duplicate automation error:', err);
    res.status(500).json({ error: 'Failed to duplicate automation' });
  }
});

// ==========================================
// ENROLLMENT OPERATIONS
// ==========================================

// Get enrollments for an automation
router.get('/:id/enrollments', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { status, page = 1, limit = 50 } = req.query;
    
    // Verify ownership
    const automation = await Automation.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    const query = { automation: req.params.id };
    if (status) query.status = status;
    
    const enrollments = await AutomationEnrollment.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('contact', 'email firstName lastName');
    
    const total = await AutomationEnrollment.countDocuments(query);
    
    res.json({
      ok: true,
      enrollments,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Get enrollments error:', err);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// Manually enroll a contact
router.post('/:id/enroll', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { contactId, contactIds } = req.body;
    
    const automation = await Automation.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    if (automation.status !== 'active') {
      return res.status(400).json({ error: 'Automation must be active to enroll contacts' });
    }
    
    const idsToEnroll = contactIds || (contactId ? [contactId] : []);
    if (idsToEnroll.length === 0) {
      return res.status(400).json({ error: 'No contacts specified' });
    }
    
    const results = [];
    for (const cId of idsToEnroll) {
      try {
        // Check if already enrolled
        const existing = await AutomationEnrollment.findOne({
          automation: automation._id,
          contact: cId
        });
        
        if (existing && !automation.settings.allowReentry) {
          results.push({ contactId: cId, status: 'skipped', reason: 'Already enrolled' });
          continue;
        }
        
        // Create enrollment
        const enrollment = new AutomationEnrollment({
          automation: automation._id,
          contact: cId,
          user: userId,
          status: 'active',
          currentStep: automation.steps[0]?.id,
          history: [{
            stepId: 'entry',
            action: 'entered',
            timestamp: new Date()
          }],
          nextActionAt: new Date()
        });
        
        await enrollment.save();
        
        // Update automation stats
        await Automation.updateOne(
          { _id: automation._id },
          { 
            $inc: { 'stats.totalEntered': 1, 'stats.currentlyActive': 1 },
            lastTriggeredAt: new Date()
          }
        );
        
        results.push({ contactId: cId, status: 'enrolled' });
      } catch (err) {
        results.push({ contactId: cId, status: 'error', reason: err.message });
      }
    }
    
    res.json({ ok: true, results });
  } catch (err) {
    console.error('Enroll contacts error:', err);
    res.status(500).json({ error: 'Failed to enroll contacts' });
  }
});

// Remove enrollment
router.delete('/:id/enrollments/:enrollmentId', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Verify automation ownership
    const automation = await Automation.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    const enrollment = await AutomationEnrollment.findOneAndUpdate(
      { _id: req.params.enrollmentId, automation: req.params.id },
      { status: 'exited', exitedAt: new Date(), exitReason: 'Manual removal' },
      { new: true }
    );
    
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    
    // Update stats
    await Automation.updateOne(
      { _id: automation._id },
      { $inc: { 'stats.currentlyActive': -1, 'stats.exitedEarly': 1 } }
    );
    
    res.json({ ok: true, enrollment });
  } catch (err) {
    console.error('Remove enrollment error:', err);
    res.status(500).json({ error: 'Failed to remove enrollment' });
  }
});

// ==========================================
// AUTOMATION ANALYTICS
// ==========================================

// Get automation analytics
router.get('/:id/analytics', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { period = '30d' } = req.query;
    
    const automation = await Automation.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    switch (period) {
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      default: startDate.setDate(now.getDate() - 30);
    }
    
    // Get email stats
    const emailLogs = await AutomationEmailLog.find({
      automation: req.params.id,
      createdAt: { $gte: startDate }
    });
    
    const emailStats = {
      sent: emailLogs.length,
      delivered: emailLogs.filter(e => e.status !== 'failed' && e.status !== 'bounced').length,
      opened: emailLogs.filter(e => e.status === 'opened' || e.status === 'clicked').length,
      clicked: emailLogs.filter(e => e.status === 'clicked').length
    };
    
    // Step performance
    const stepPerformance = {};
    automation.steps.filter(s => s.type === 'email').forEach(step => {
      const stepLogs = emailLogs.filter(l => l.stepId === step.id);
      stepPerformance[step.id] = {
        name: step.config?.subject || step.id,
        sent: stepLogs.length,
        opened: stepLogs.filter(l => l.status === 'opened' || l.status === 'clicked').length,
        clicked: stepLogs.filter(l => l.status === 'clicked').length,
        openRate: stepLogs.length > 0 ? (stepLogs.filter(l => l.status === 'opened' || l.status === 'clicked').length / stepLogs.length * 100).toFixed(1) : 0,
        clickRate: stepLogs.length > 0 ? (stepLogs.filter(l => l.status === 'clicked').length / stepLogs.length * 100).toFixed(1) : 0
      };
    });
    
    // Revenue (if tracked)
    const totalRevenue = emailLogs.reduce((sum, log) => sum + (log.revenue || 0), 0);
    
    res.json({
      ok: true,
      analytics: {
        period,
        overview: automation.stats,
        emailStats,
        stepPerformance,
        revenue: totalRevenue,
        conversionRate: automation.stats.totalEntered > 0 
          ? (automation.stats.goalReached / automation.stats.totalEntered * 100).toFixed(1) 
          : 0
      }
    });
  } catch (err) {
    console.error('Get automation analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
