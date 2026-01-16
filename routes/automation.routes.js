// ============================================
// FILE: routes/automation.routes.js
// CYBEV Email Automation API Routes
// VERSION: 2.0.0 - Phase 6
// ============================================

const express = require('express');
const router = express.Router();
const { Automation, AutomationSubscriber, AutomationQueue, AutomationTemplate, EmailSubscription } = require('../models/automation.model');
const { EmailContact } = require('../models/email.model');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// AUTOMATION CRUD
// ==========================================

// Get all automations
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { user: req.user._id };
    if (status) query.status = status;
    
    const automations = await Automation.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Automation.countDocuments(query);
    
    res.json({
      success: true,
      automations,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get automations error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single automation
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }
    res.json({ success: true, automation });
  } catch (error) {
    console.error('Get automation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create automation
router.post('/', verifyToken, async (req, res) => {
  try {
    // Check limit
    const subscription = await EmailSubscription.findOne({ user: req.user._id });
    const currentCount = await Automation.countDocuments({ user: req.user._id, status: { $ne: 'archived' } });
    const limit = subscription?.limits?.automations || 1;
    
    if (currentCount >= limit) {
      return res.status(403).json({ 
        success: false, 
        message: `You've reached your automation limit (${limit}). Upgrade to create more.` 
      });
    }
    
    const automation = new Automation({
      user: req.user._id,
      name: req.body.name || 'New Automation',
      description: req.body.description,
      trigger: req.body.trigger || { type: 'manual' },
      steps: req.body.steps || [],
      entryStep: req.body.entryStep,
      settings: req.body.settings || {},
      status: 'draft'
    });
    
    await automation.save();
    
    // Update usage
    if (subscription) {
      subscription.usage.automations = currentCount + 1;
      await subscription.save();
    }
    
    res.json({ success: true, automation });
  } catch (error) {
    console.error('Create automation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update automation
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }
    
    // Can't update active automation's core structure
    if (automation.status === 'active' && (req.body.trigger || req.body.steps)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Pause the automation before editing trigger or steps' 
      });
    }
    
    const updates = ['name', 'description', 'trigger', 'steps', 'entryStep', 'settings'];
    updates.forEach(field => {
      if (req.body[field] !== undefined) automation[field] = req.body[field];
    });
    
    automation.version += 1;
    await automation.save();
    
    res.json({ success: true, automation });
  } catch (error) {
    console.error('Update automation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete automation
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }
    
    // Archive instead of delete if has subscribers
    const subscriberCount = await AutomationSubscriber.countDocuments({ automation: automation._id });
    if (subscriberCount > 0) {
      automation.status = 'archived';
      await automation.save();
    } else {
      await automation.deleteOne();
    }
    
    res.json({ success: true, message: 'Automation deleted' });
  } catch (error) {
    console.error('Delete automation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// AUTOMATION STATUS CONTROL
// ==========================================

// Activate automation
router.post('/:id/activate', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }
    
    // Validate automation has required components
    if (!automation.trigger?.type) {
      return res.status(400).json({ success: false, message: 'Automation needs a trigger' });
    }
    if (!automation.steps?.length || !automation.entryStep) {
      return res.status(400).json({ success: false, message: 'Automation needs at least one step' });
    }
    
    automation.status = 'active';
    automation.activatedAt = new Date();
    await automation.save();
    
    res.json({ success: true, automation, message: 'Automation activated' });
  } catch (error) {
    console.error('Activate automation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Pause automation
router.post('/:id/pause', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }
    
    automation.status = 'paused';
    automation.pausedAt = new Date();
    await automation.save();
    
    // Cancel pending queue items
    await AutomationQueue.updateMany(
      { automation: automation._id, status: 'pending' },
      { status: 'cancelled' }
    );
    
    res.json({ success: true, automation, message: 'Automation paused' });
  } catch (error) {
    console.error('Pause automation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// SUBSCRIBER MANAGEMENT
// ==========================================

// Get automation subscribers
router.get('/:id/subscribers', verifyToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = { automation: req.params.id, user: req.user._id };
    if (status) query.status = status;
    
    const subscribers = await AutomationSubscriber.find(query)
      .populate('contact', 'email name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await AutomationSubscriber.countDocuments(query);
    
    res.json({
      success: true,
      subscribers,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get subscribers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add subscriber to automation (manual enrollment)
router.post('/:id/subscribers', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }
    
    if (automation.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Automation must be active to add subscribers' });
    }
    
    const { contactId, contactIds } = req.body;
    const idsToAdd = contactIds || (contactId ? [contactId] : []);
    
    if (!idsToAdd.length) {
      return res.status(400).json({ success: false, message: 'Provide contactId or contactIds' });
    }
    
    const results = [];
    for (const cId of idsToAdd) {
      try {
        // Check if already enrolled
        const existing = await AutomationSubscriber.findOne({ 
          automation: automation._id, 
          contact: cId,
          status: { $in: ['active', 'paused'] }
        });
        
        if (existing) {
          results.push({ contactId: cId, success: false, reason: 'Already enrolled' });
          continue;
        }
        
        // Check re-entry settings
        if (!automation.settings.allowReEntry) {
          const previousEntry = await AutomationSubscriber.findOne({
            automation: automation._id,
            contact: cId
          });
          if (previousEntry) {
            results.push({ contactId: cId, success: false, reason: 'Re-entry not allowed' });
            continue;
          }
        }
        
        // Create subscriber
        const subscriber = new AutomationSubscriber({
          automation: automation._id,
          contact: cId,
          user: req.user._id,
          currentStep: automation.entryStep,
          status: 'active',
          journey: [{
            stepId: automation.entryStep,
            stepType: 'entry',
            action: 'entered',
            timestamp: new Date()
          }],
          triggerData: { source: 'manual' },
          lastEntryAt: new Date()
        });
        
        await subscriber.save();
        
        // Schedule first step
        const firstStep = automation.steps.find(s => s.id === automation.entryStep);
        if (firstStep) {
          const queueItem = new AutomationQueue({
            automation: automation._id,
            subscriber: subscriber._id,
            contact: cId,
            user: req.user._id,
            stepId: firstStep.id,
            stepType: firstStep.type,
            scheduledAt: new Date()
          });
          await queueItem.save();
        }
        
        // Update stats
        automation.stats.enrolled += 1;
        automation.stats.active += 1;
        
        results.push({ contactId: cId, success: true, subscriberId: subscriber._id });
      } catch (err) {
        results.push({ contactId: cId, success: false, reason: err.message });
      }
    }
    
    await automation.save();
    
    res.json({ success: true, results });
  } catch (error) {
    console.error('Add subscribers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remove subscriber from automation
router.delete('/:id/subscribers/:subscriberId', verifyToken, async (req, res) => {
  try {
    const subscriber = await AutomationSubscriber.findOne({
      _id: req.params.subscriberId,
      automation: req.params.id,
      user: req.user._id
    });
    
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }
    
    subscriber.status = 'exited';
    subscriber.exitReason = 'manual_removal';
    subscriber.exitedAt = new Date();
    subscriber.journey.push({
      stepId: subscriber.currentStep,
      stepType: 'exit',
      action: 'removed',
      timestamp: new Date()
    });
    await subscriber.save();
    
    // Cancel pending actions
    await AutomationQueue.updateMany(
      { subscriber: subscriber._id, status: 'pending' },
      { status: 'cancelled' }
    );
    
    // Update automation stats
    await Automation.updateOne(
      { _id: req.params.id },
      { $inc: { 'stats.active': -1, 'stats.exited': 1 } }
    );
    
    res.json({ success: true, message: 'Subscriber removed' });
  } catch (error) {
    console.error('Remove subscriber error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// ANALYTICS
// ==========================================

// Get automation analytics
router.get('/:id/analytics', verifyToken, async (req, res) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, message: 'Automation not found' });
    }
    
    // Get step-by-step analytics
    const stepAnalytics = await AutomationSubscriber.aggregate([
      { $match: { automation: automation._id } },
      { $unwind: '$journey' },
      { $group: {
        _id: '$journey.stepId',
        entered: { $sum: { $cond: [{ $eq: ['$journey.action', 'entered'] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$journey.action', 'completed'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$journey.action', 'failed'] }, 1, 0] } }
      }}
    ]);
    
    // Get daily enrollment trend
    const enrollmentTrend = await AutomationSubscriber.aggregate([
      { $match: { automation: automation._id } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);
    
    res.json({
      success: true,
      stats: automation.stats,
      stepAnalytics,
      enrollmentTrend
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// TEMPLATES
// ==========================================

// Get automation templates
router.get('/templates/list', verifyToken, async (req, res) => {
  try {
    const { category } = req.query;
    const query = {};
    if (category) query.category = category;
    
    const templates = await AutomationTemplate.find(query).sort({ usageCount: -1 });
    res.json({ success: true, templates });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create automation from template
router.post('/templates/:templateId/use', verifyToken, async (req, res) => {
  try {
    const template = await AutomationTemplate.findById(req.params.templateId);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    
    const automation = new Automation({
      user: req.user._id,
      name: req.body.name || `${template.name} Copy`,
      description: template.description,
      trigger: template.trigger,
      steps: template.steps,
      entryStep: template.entryStep,
      settings: template.settings,
      status: 'draft'
    });
    
    await automation.save();
    
    // Update template usage count
    template.usageCount += 1;
    await template.save();
    
    res.json({ success: true, automation });
  } catch (error) {
    console.error('Use template error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
