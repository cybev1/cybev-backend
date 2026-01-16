// ============================================
// FILE: routes/automation.routes.js
// CYBEV Automation API - Drip Campaigns & Workflows
// VERSION: 1.0.0 - Full Automation Platform
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { AutomationWorkflow, AutomationSubscriber, AutomationQueue, AutomationLog } = require('../models/automation.model');
const automationService = require('../services/automation.service');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// WORKFLOW MANAGEMENT
// ==========================================

// List all automations
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { status, type, page = 1, limit = 20 } = req.query;
    
    const query = { user: userId };
    if (status) query.status = status;
    if (type) query.type = type;
    
    const [automations, total] = await Promise.all([
      AutomationWorkflow.find(query)
        .select('-steps.email.content -editorState')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      AutomationWorkflow.countDocuments(query)
    ]);
    
    res.json({
      automations,
      pagination: { page: parseInt(page), limit: parseInt(limit), total }
    });
  } catch (err) {
    console.error('List automations error:', err);
    res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

// Get single automation
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const automation = await AutomationWorkflow.findOne({ _id: req.params.id, user: userId })
      .populate('steps.email.templateId', 'name thumbnail')
      .populate('steps.email.sender.emailAddress', 'email displayName');
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    res.json({ automation });
  } catch (err) {
    console.error('Get automation error:', err);
    res.status(500).json({ error: 'Failed to fetch automation' });
  }
});

// Create automation
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, type, trigger, entryConditions, exitConditions, settings, steps, editorState } = req.body;
    
    // Validate steps have unique IDs
    if (steps && steps.length > 0) {
      const stepIds = steps.map(s => s.stepId);
      if (new Set(stepIds).size !== stepIds.length) {
        return res.status(400).json({ error: 'Step IDs must be unique' });
      }
    }
    
    const automation = await AutomationWorkflow.create({
      user: userId,
      name,
      description,
      type: type || 'drip',
      trigger: trigger || { type: 'manual' },
      entryConditions: entryConditions || {},
      exitConditions: exitConditions || {},
      settings: settings || {},
      steps: (steps || []).map((step, index) => ({
        ...step,
        stepId: step.stepId || `step_${Date.now()}_${index}`,
        order: step.order !== undefined ? step.order : index
      })),
      editorState,
      status: 'draft'
    });
    
    res.json({ ok: true, automation });
  } catch (err) {
    console.error('Create automation error:', err);
    res.status(500).json({ error: 'Failed to create automation' });
  }
});

// Update automation
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, description, type, trigger, entryConditions, exitConditions, settings, steps, editorState } = req.body;
    
    const automation = await AutomationWorkflow.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    // Can only edit if draft or paused
    if (!['draft', 'paused'].includes(automation.status)) {
      return res.status(400).json({ error: 'Cannot edit active automation. Pause it first.' });
    }
    
    // Update fields
    if (name) automation.name = name;
    if (description !== undefined) automation.description = description;
    if (type) automation.type = type;
    if (trigger) automation.trigger = trigger;
    if (entryConditions) automation.entryConditions = entryConditions;
    if (exitConditions) automation.exitConditions = exitConditions;
    if (settings) automation.settings = settings;
    if (editorState) automation.editorState = editorState;
    
    if (steps) {
      automation.steps = steps.map((step, index) => ({
        ...step,
        stepId: step.stepId || `step_${Date.now()}_${index}`,
        order: step.order !== undefined ? step.order : index,
        stats: automation.steps.find(s => s.stepId === step.stepId)?.stats || { entered: 0, completed: 0, failed: 0 }
      }));
    }
    
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
    const userId = req.user.userId || req.user.id;
    
    const automation = await AutomationWorkflow.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    // Stop all active subscribers
    await AutomationSubscriber.updateMany(
      { automation: automation._id, status: 'active' },
      { status: 'exited', exitReason: 'automation_deleted', exitedAt: new Date() }
    );
    
    // Cancel pending queue items
    await AutomationQueue.updateMany(
      { automation: automation._id, status: 'pending' },
      { status: 'cancelled' }
    );
    
    // Archive instead of delete
    automation.status = 'archived';
    await automation.save();
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete automation error:', err);
    res.status(500).json({ error: 'Failed to delete automation' });
  }
});

// ==========================================
// WORKFLOW CONTROLS
// ==========================================

// Activate automation
router.post('/:id/activate', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await automationService.activateWorkflow(req.params.id, userId);
    res.json(result);
  } catch (err) {
    console.error('Activate automation error:', err);
    res.status(500).json({ error: err.message || 'Failed to activate automation' });
  }
});

// Pause automation
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await automationService.pauseWorkflow(req.params.id, userId);
    res.json(result);
  } catch (err) {
    console.error('Pause automation error:', err);
    res.status(500).json({ error: err.message || 'Failed to pause automation' });
  }
});

// Duplicate automation
router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const original = await AutomationWorkflow.findOne({ _id: req.params.id, user: userId });
    if (!original) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    const duplicate = await AutomationWorkflow.create({
      user: userId,
      name: `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      trigger: original.trigger,
      entryConditions: original.entryConditions,
      exitConditions: original.exitConditions,
      settings: original.settings,
      steps: original.steps.map(step => ({
        ...step.toObject(),
        stepId: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        stats: { entered: 0, completed: 0, failed: 0 }
      })),
      editorState: original.editorState,
      status: 'draft'
    });
    
    res.json({ ok: true, automation: duplicate });
  } catch (err) {
    console.error('Duplicate automation error:', err);
    res.status(500).json({ error: 'Failed to duplicate automation' });
  }
});

// ==========================================
// SUBSCRIBERS MANAGEMENT
// ==========================================

// Add subscriber manually
router.post('/:id/subscribers', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { email, name, triggerData } = req.body;
    
    const automation = await AutomationWorkflow.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    // Get or create contact
    const { EmailContact } = require('../models/email.model');
    let contact = await EmailContact.findOne({ user: userId, email: email.toLowerCase() });
    
    if (!contact) {
      contact = await EmailContact.create({
        user: userId,
        email: email.toLowerCase(),
        name,
        source: 'automation'
      });
    }
    
    const result = await automationService.addSubscriberToAutomation(
      automation._id, 
      contact, 
      { ...triggerData, source: 'manual' }
    );
    
    res.json(result);
  } catch (err) {
    console.error('Add subscriber error:', err);
    res.status(500).json({ error: err.message || 'Failed to add subscriber' });
  }
});

// List subscribers
router.get('/:id/subscribers', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { status, page = 1, limit = 50 } = req.query;
    
    const automation = await AutomationWorkflow.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    const query = { automation: automation._id };
    if (status) query.status = status;
    
    const [subscribers, total] = await Promise.all([
      AutomationSubscriber.find(query)
        .select('-history')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      AutomationSubscriber.countDocuments(query)
    ]);
    
    res.json({
      subscribers,
      pagination: { page: parseInt(page), limit: parseInt(limit), total }
    });
  } catch (err) {
    console.error('List subscribers error:', err);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

// Get subscriber details
router.get('/:id/subscribers/:subscriberId', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const subscriber = await AutomationSubscriber.findOne({
      _id: req.params.subscriberId,
      user: userId
    }).populate('contact');
    
    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    
    res.json({ subscriber });
  } catch (err) {
    console.error('Get subscriber error:', err);
    res.status(500).json({ error: 'Failed to fetch subscriber' });
  }
});

// Remove subscriber from automation
router.delete('/:id/subscribers/:subscriberId', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const subscriber = await AutomationSubscriber.findOne({
      _id: req.params.subscriberId,
      automation: req.params.id,
      user: userId
    });
    
    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    
    subscriber.status = 'exited';
    subscriber.exitReason = 'manual_removal';
    subscriber.exitedAt = new Date();
    await subscriber.save();
    
    // Cancel pending queue items
    await AutomationQueue.updateMany(
      { subscriber: subscriber._id, status: 'pending' },
      { status: 'cancelled' }
    );
    
    // Update automation stats
    await AutomationWorkflow.findByIdAndUpdate(req.params.id, {
      $inc: { 'stats.currentlyActive': -1, 'stats.exited': 1 }
    });
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Remove subscriber error:', err);
    res.status(500).json({ error: 'Failed to remove subscriber' });
  }
});

// ==========================================
// ANALYTICS & LOGS
// ==========================================

// Get automation stats
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const automation = await AutomationWorkflow.findOne({ _id: req.params.id, user: userId });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    
    // Get additional computed stats
    const [
      activeCount,
      completedCount,
      averageTime
    ] = await Promise.all([
      AutomationSubscriber.countDocuments({ automation: automation._id, status: 'active' }),
      AutomationSubscriber.countDocuments({ automation: automation._id, status: 'completed' }),
      AutomationSubscriber.aggregate([
        { $match: { automation: automation._id, status: 'completed' } },
        { $project: { duration: { $subtract: ['$updatedAt', '$firstEnteredAt'] } } },
        { $group: { _id: null, avgDuration: { $avg: '$duration' } } }
      ])
    ]);
    
    res.json({
      stats: {
        ...automation.stats,
        currentlyActive: activeCount,
        completed: completedCount,
        averageCompletionTime: averageTime[0]?.avgDuration || 0
      },
      stepStats: automation.steps.map(step => ({
        stepId: step.stepId,
        name: step.name,
        type: step.type,
        stats: step.stats
      }))
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get activity log
router.get('/:id/logs', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { event, page = 1, limit = 50 } = req.query;
    
    const query = { automation: req.params.id, user: userId };
    if (event) query.event = event;
    
    const [logs, total] = await Promise.all([
      AutomationLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      AutomationLog.countDocuments(query)
    ]);
    
    res.json({
      logs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total }
    });
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ==========================================
// TEMPLATES
// ==========================================

// Get automation templates (prebuilt workflows)
router.get('/templates/list', auth, async (req, res) => {
  try {
    const templates = [
      {
        id: 'welcome-series',
        name: 'Welcome Email Series',
        description: 'Send a series of welcome emails to new subscribers',
        type: 'drip',
        trigger: { type: 'list_subscribe' },
        stepsCount: 4,
        thumbnail: '/templates/welcome-series.png'
      },
      {
        id: 'abandoned-cart',
        name: 'Abandoned Cart Recovery',
        description: 'Follow up with users who abandoned their cart',
        type: 'trigger',
        trigger: { type: 'api' },
        stepsCount: 3,
        thumbnail: '/templates/abandoned-cart.png'
      },
      {
        id: 're-engagement',
        name: 'Re-engagement Campaign',
        description: 'Win back inactive subscribers',
        type: 'trigger',
        trigger: { type: 'no_activity' },
        stepsCount: 5,
        thumbnail: '/templates/re-engagement.png'
      },
      {
        id: 'birthday',
        name: 'Birthday Wishes',
        description: 'Send birthday greetings and offers',
        type: 'trigger',
        trigger: { type: 'date_based', dateField: 'birthday' },
        stepsCount: 2,
        thumbnail: '/templates/birthday.png'
      },
      {
        id: 'onboarding',
        name: 'User Onboarding',
        description: 'Guide new users through your product',
        type: 'drip',
        trigger: { type: 'tag_added', tag: 'new_user' },
        stepsCount: 6,
        thumbnail: '/templates/onboarding.png'
      }
    ];
    
    res.json({ templates });
  } catch (err) {
    console.error('Get templates error:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create from template
router.post('/templates/:templateId/create', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { templateId } = req.params;
    const { name } = req.body;
    
    // Template definitions (would be in database in production)
    const templateConfigs = {
      'welcome-series': {
        name: 'Welcome Email Series',
        type: 'drip',
        trigger: { type: 'list_subscribe' },
        steps: [
          { stepId: 'step_1', order: 0, type: 'send_email', name: 'Welcome Email', email: { subject: 'Welcome to {{company}}!' } },
          { stepId: 'step_2', order: 1, type: 'wait', name: 'Wait 2 days', wait: { type: 'delay', delay: { value: 2, unit: 'days' } } },
          { stepId: 'step_3', order: 2, type: 'send_email', name: 'Getting Started', email: { subject: 'Getting Started Guide' } },
          { stepId: 'step_4', order: 3, type: 'wait', name: 'Wait 3 days', wait: { type: 'delay', delay: { value: 3, unit: 'days' } } },
          { stepId: 'step_5', order: 4, type: 'send_email', name: 'Tips & Tricks', email: { subject: 'Tips to get the most out of {{company}}' } }
        ]
      },
      'abandoned-cart': {
        name: 'Abandoned Cart Recovery',
        type: 'trigger',
        trigger: { type: 'api' },
        steps: [
          { stepId: 'step_1', order: 0, type: 'wait', name: 'Wait 1 hour', wait: { type: 'delay', delay: { value: 1, unit: 'hours' } } },
          { stepId: 'step_2', order: 1, type: 'send_email', name: 'Cart Reminder', email: { subject: 'You left something behind!' } },
          { stepId: 'step_3', order: 2, type: 'wait', name: 'Wait 1 day', wait: { type: 'delay', delay: { value: 1, unit: 'days' } } },
          { stepId: 'step_4', order: 3, type: 'condition', name: 'Purchased?', condition: { type: 'has_tag', tag: 'purchased', trueBranch: null, falseBranch: 'step_5' } },
          { stepId: 'step_5', order: 4, type: 'send_email', name: 'Discount Offer', email: { subject: '10% off your cart - expires soon!' } }
        ]
      }
    };
    
    const config = templateConfigs[templateId];
    if (!config) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const automation = await AutomationWorkflow.create({
      user: userId,
      name: name || config.name,
      type: config.type,
      trigger: config.trigger,
      steps: config.steps,
      status: 'draft'
    });
    
    res.json({ ok: true, automation });
  } catch (err) {
    console.error('Create from template error:', err);
    res.status(500).json({ error: 'Failed to create from template' });
  }
});

module.exports = router;
