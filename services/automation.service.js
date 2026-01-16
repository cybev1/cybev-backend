// ============================================
// FILE: services/automation.service.js
// CYBEV Automation Execution Service
// VERSION: 1.0.0 - Process drip campaigns & workflows
// ============================================

const mongoose = require('mongoose');
const { AutomationWorkflow, AutomationSubscriber, AutomationQueue, AutomationLog } = require('../models/automation.model');
const sesService = require('./ses.service');

// ==========================================
// WORKFLOW MANAGEMENT
// ==========================================

/**
 * Activate a workflow
 */
async function activateWorkflow(workflowId, userId) {
  const workflow = await AutomationWorkflow.findOne({ _id: workflowId, user: userId });
  if (!workflow) throw new Error('Workflow not found');
  
  if (workflow.status === 'active') {
    return { success: true, message: 'Workflow already active' };
  }
  
  // Validate workflow has at least one step
  if (!workflow.steps || workflow.steps.length === 0) {
    throw new Error('Workflow must have at least one step');
  }
  
  workflow.status = 'active';
  workflow.activatedAt = new Date();
  await workflow.save();
  
  await logAutomationEvent(workflow._id, null, userId, 'workflow_activated', {});
  
  return { success: true, workflow };
}

/**
 * Pause a workflow
 */
async function pauseWorkflow(workflowId, userId) {
  const workflow = await AutomationWorkflow.findOne({ _id: workflowId, user: userId });
  if (!workflow) throw new Error('Workflow not found');
  
  workflow.status = 'paused';
  workflow.pausedAt = new Date();
  await workflow.save();
  
  // Pause all pending queue items
  await AutomationQueue.updateMany(
    { automation: workflowId, status: 'pending' },
    { status: 'cancelled' }
  );
  
  await logAutomationEvent(workflow._id, null, userId, 'workflow_paused', {});
  
  return { success: true, workflow };
}

/**
 * Add a contact to an automation
 */
async function addSubscriberToAutomation(workflowId, contact, triggerData = {}) {
  const workflow = await AutomationWorkflow.findById(workflowId);
  if (!workflow) throw new Error('Workflow not found');
  if (workflow.status !== 'active') throw new Error('Workflow is not active');
  
  const email = contact.email.toLowerCase();
  const userId = workflow.user;
  
  // Check entry conditions
  const canEnter = await checkEntryConditions(workflow, email);
  if (!canEnter.allowed) {
    return { success: false, reason: canEnter.reason };
  }
  
  // Check if already in automation
  const existing = await AutomationSubscriber.findOne({
    automation: workflowId,
    email,
    status: 'active'
  });
  
  if (existing && !workflow.entryConditions.allowReentry) {
    return { success: false, reason: 'Contact already in automation' };
  }
  
  // Get first step
  const firstStep = workflow.steps.find(s => s.order === 0) || workflow.steps[0];
  if (!firstStep) throw new Error('Workflow has no steps');
  
  // Create subscriber
  const subscriber = await AutomationSubscriber.create({
    automation: workflowId,
    contact: contact._id,
    user: userId,
    email,
    name: contact.name,
    status: 'active',
    currentStep: {
      stepId: firstStep.stepId,
      enteredAt: new Date()
    },
    triggerData,
    firstEnteredAt: new Date(),
    lastEnteredAt: new Date()
  });
  
  // Update workflow stats
  await AutomationWorkflow.findByIdAndUpdate(workflowId, {
    $inc: { 'stats.totalEntered': 1, 'stats.currentlyActive': 1 }
  });
  
  // Log entry
  await logAutomationEvent(workflowId, subscriber._id, userId, 'subscriber_entered', {
    email,
    triggerData
  });
  
  // Schedule first step execution
  await scheduleStepExecution(subscriber, firstStep, workflow);
  
  return { success: true, subscriber };
}

/**
 * Check if contact can enter automation
 */
async function checkEntryConditions(workflow, email) {
  const conditions = workflow.entryConditions;
  
  // Check max entries
  if (conditions.maxEntriesPerContact > 0) {
    const entryCount = await AutomationSubscriber.countDocuments({
      automation: workflow._id,
      email
    });
    if (entryCount >= conditions.maxEntriesPerContact) {
      return { allowed: false, reason: 'Max entries reached' };
    }
  }
  
  // Check reentry wait period
  if (!conditions.allowReentry || conditions.reentryWaitDays > 0) {
    const lastEntry = await AutomationSubscriber.findOne({
      automation: workflow._id,
      email
    }).sort({ lastEnteredAt: -1 });
    
    if (lastEntry) {
      if (!conditions.allowReentry) {
        return { allowed: false, reason: 'Reentry not allowed' };
      }
      
      const daysSinceLastEntry = (Date.now() - lastEntry.lastEnteredAt) / (1000 * 60 * 60 * 24);
      if (daysSinceLastEntry < conditions.reentryWaitDays) {
        return { allowed: false, reason: `Must wait ${conditions.reentryWaitDays} days between entries` };
      }
    }
  }
  
  // Check exclude tags
  if (conditions.excludeTags && conditions.excludeTags.length > 0) {
    const { EmailContact } = require('../models/email.model');
    const contact = await EmailContact.findOne({ user: workflow.user, email });
    if (contact && contact.tags) {
      const hasExcludedTag = conditions.excludeTags.some(t => contact.tags.includes(t));
      if (hasExcludedTag) {
        return { allowed: false, reason: 'Contact has excluded tag' };
      }
    }
  }
  
  return { allowed: true };
}

/**
 * Schedule a step for execution
 */
async function scheduleStepExecution(subscriber, step, workflow) {
  let scheduledFor = new Date();
  
  // Calculate schedule based on step type
  if (step.type === 'wait' && step.wait) {
    scheduledFor = calculateWaitTime(step.wait, workflow.settings.timezone);
  } else if (step.type === 'send_email') {
    // Check send window
    if (workflow.settings.sendWindow?.enabled) {
      scheduledFor = getNextSendWindowTime(workflow.settings.sendWindow, workflow.settings.timezone);
    }
  }
  
  // Create queue item
  await AutomationQueue.create({
    automation: workflow._id,
    subscriber: subscriber._id,
    user: workflow.user,
    stepId: step.stepId,
    stepType: step.type,
    scheduledFor,
    status: 'pending'
  });
  
  // Update subscriber next action
  await AutomationSubscriber.findByIdAndUpdate(subscriber._id, {
    'nextAction.stepId': step.stepId,
    'nextAction.scheduledFor': scheduledFor,
    'nextAction.type': step.type
  });
}

/**
 * Calculate wait time based on wait configuration
 */
function calculateWaitTime(waitConfig, timezone) {
  const now = new Date();
  
  switch (waitConfig.type) {
    case 'delay':
      const multipliers = { minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000 };
      return new Date(now.getTime() + waitConfig.delay.value * multipliers[waitConfig.delay.unit]);
      
    case 'until_date':
      return new Date(waitConfig.untilDate);
      
    case 'until_time':
      const [hours, minutes] = waitConfig.untilTime.split(':');
      const targetTime = new Date(now);
      targetTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      if (targetTime <= now) targetTime.setDate(targetTime.getDate() + 1);
      return targetTime;
      
    case 'until_day':
      const targetDay = new Date(now);
      while (targetDay.getDay() !== waitConfig.untilDay) {
        targetDay.setDate(targetDay.getDate() + 1);
      }
      return targetDay;
      
    default:
      return now;
  }
}

/**
 * Get next time within send window
 */
function getNextSendWindowTime(sendWindow, timezone) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  
  // If within window and on valid day, send now
  if (currentHour >= sendWindow.startHour && 
      currentHour < sendWindow.endHour &&
      sendWindow.daysOfWeek.includes(currentDay)) {
    return now;
  }
  
  // Find next valid time
  let targetTime = new Date(now);
  
  // If past end hour, move to next day
  if (currentHour >= sendWindow.endHour) {
    targetTime.setDate(targetTime.getDate() + 1);
  }
  
  // Set to start hour
  targetTime.setHours(sendWindow.startHour, 0, 0, 0);
  
  // Find next valid day
  while (!sendWindow.daysOfWeek.includes(targetTime.getDay())) {
    targetTime.setDate(targetTime.getDate() + 1);
  }
  
  return targetTime;
}

// ==========================================
// STEP EXECUTION
// ==========================================

/**
 * Execute a queued step
 */
async function executeQueuedStep(queueItem) {
  const subscriber = await AutomationSubscriber.findById(queueItem.subscriber);
  if (!subscriber || subscriber.status !== 'active') {
    await AutomationQueue.findByIdAndUpdate(queueItem._id, { status: 'cancelled' });
    return { success: false, reason: 'Subscriber not active' };
  }
  
  const workflow = await AutomationWorkflow.findById(queueItem.automation);
  if (!workflow || workflow.status !== 'active') {
    await AutomationQueue.findByIdAndUpdate(queueItem._id, { status: 'cancelled' });
    return { success: false, reason: 'Workflow not active' };
  }
  
  const step = workflow.steps.find(s => s.stepId === queueItem.stepId);
  if (!step) {
    await AutomationQueue.findByIdAndUpdate(queueItem._id, { status: 'failed', error: 'Step not found' });
    return { success: false, reason: 'Step not found' };
  }
  
  // Mark as processing
  await AutomationQueue.findByIdAndUpdate(queueItem._id, {
    status: 'processing',
    lastAttemptAt: new Date(),
    $inc: { attempts: 1 }
  });
  
  try {
    let result;
    let nextStepId = null;
    
    switch (step.type) {
      case 'send_email':
        result = await executeEmailStep(step, subscriber, workflow);
        break;
        
      case 'wait':
        result = { success: true, waited: true };
        break;
        
      case 'condition':
        result = await executeConditionStep(step, subscriber, workflow);
        nextStepId = result.branch;
        break;
        
      case 'add_tag':
      case 'remove_tag':
        result = await executeTagStep(step, subscriber);
        break;
        
      case 'add_to_list':
      case 'remove_from_list':
        result = await executeListStep(step, subscriber);
        break;
        
      case 'webhook':
        result = await executeWebhookStep(step, subscriber);
        break;
        
      case 'notification':
        result = await executeNotificationStep(step, subscriber, workflow);
        break;
        
      case 'update_contact':
        result = await executeUpdateContactStep(step, subscriber);
        break;
        
      case 'split_test':
        result = await executeSplitTestStep(step, subscriber);
        nextStepId = result.nextStepId;
        break;
        
      default:
        result = { success: true };
    }
    
    // Update queue item
    await AutomationQueue.findByIdAndUpdate(queueItem._id, {
      status: 'completed',
      completedAt: new Date(),
      result
    });
    
    // Record in history
    subscriber.history.push({
      stepId: step.stepId,
      stepType: step.type,
      enteredAt: subscriber.currentStep.enteredAt,
      completedAt: new Date(),
      status: 'completed',
      data: result
    });
    
    // Update step stats
    await AutomationWorkflow.findOneAndUpdate(
      { _id: workflow._id, 'steps.stepId': step.stepId },
      { $inc: { 'steps.$.stats.completed': 1 } }
    );
    
    // Log completion
    await logAutomationEvent(workflow._id, subscriber._id, workflow.user, 'step_completed', {
      stepId: step.stepId,
      stepType: step.type,
      result
    });
    
    // Move to next step
    await moveToNextStep(subscriber, workflow, step, nextStepId);
    
    return { success: true, result };
    
  } catch (error) {
    console.error('Step execution error:', error);
    
    // Update queue with error
    await AutomationQueue.findByIdAndUpdate(queueItem._id, {
      status: 'failed',
      error: error.message
    });
    
    // Record failure in history
    subscriber.history.push({
      stepId: step.stepId,
      stepType: step.type,
      enteredAt: subscriber.currentStep.enteredAt,
      completedAt: new Date(),
      status: 'failed',
      error: error.message
    });
    await subscriber.save();
    
    // Log error
    await logAutomationEvent(workflow._id, subscriber._id, workflow.user, 'step_failed', {
      stepId: step.stepId,
      stepType: step.type,
      error: error.message
    });
    
    // Update step stats
    await AutomationWorkflow.findOneAndUpdate(
      { _id: workflow._id, 'steps.stepId': step.stepId },
      { $inc: { 'steps.$.stats.failed': 1 } }
    );
    
    return { success: false, error: error.message };
  }
}

/**
 * Execute email sending step
 */
async function executeEmailStep(step, subscriber, workflow) {
  const { EmailTemplate } = require('../models/campaign.model');
  const { EmailAddress } = require('../models/email.model');
  
  // Get template if using one
  let html = step.email.content?.html;
  let text = step.email.content?.text;
  let subject = step.email.subject;
  
  if (step.email.templateId) {
    const template = await EmailTemplate.findById(step.email.templateId);
    if (template) {
      html = template.content.html;
      text = template.content.text;
      subject = subject || template.subject;
    }
  }
  
  // Personalize content
  const personalizedHtml = personalizeContent(html, subscriber);
  const personalizedSubject = personalizeContent(subject, subscriber);
  
  // Get sender
  let fromEmail = step.email.sender?.email;
  let fromName = step.email.sender?.name;
  
  if (step.email.sender?.emailAddress) {
    const emailAddr = await EmailAddress.findById(step.email.sender.emailAddress);
    if (emailAddr) {
      fromEmail = emailAddr.email;
      fromName = emailAddr.displayName || fromEmail.split('@')[0];
    }
  }
  
  // Add tracking
  const trackingId = `auto_${workflow._id}_${subscriber._id}_${step.stepId}`;
  const trackedHtml = addEmailTracking(personalizedHtml, trackingId);
  
  // Send email
  const result = await sesService.sendEmail({
    to: subscriber.email,
    from: fromEmail || sesService.DEFAULT_FROM_EMAIL,
    fromName: fromName || 'CYBEV',
    subject: personalizedSubject,
    html: trackedHtml,
    text: text,
    headers: {
      type: 'automation',
      automationId: workflow._id.toString(),
      stepId: step.stepId
    }
  });
  
  // Update subscriber email stats
  await AutomationSubscriber.findByIdAndUpdate(subscriber._id, {
    $inc: { 'emailInteractions.sent': 1 }
  });
  
  // Update workflow stats
  await AutomationWorkflow.findByIdAndUpdate(workflow._id, {
    $inc: { 'stats.emailsSent': 1 }
  });
  
  // Log email sent
  await logAutomationEvent(workflow._id, subscriber._id, workflow.user, 'email_sent', {
    stepId: step.stepId,
    messageId: result.messageId,
    to: subscriber.email,
    subject: personalizedSubject
  });
  
  return { success: true, messageId: result.messageId };
}

/**
 * Personalize content with merge tags
 */
function personalizeContent(content, subscriber) {
  if (!content) return content;
  
  const replacements = {
    '{{name}}': subscriber.name || 'there',
    '{{first_name}}': (subscriber.name || 'there').split(' ')[0],
    '{{email}}': subscriber.email,
    '{{unsubscribe_url}}': `${process.env.FRONTEND_URL || 'https://cybev.io'}/unsubscribe?email=${encodeURIComponent(subscriber.email)}&auto=${subscriber.automation}`
  };
  
  let result = content;
  for (const [tag, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(tag, 'g'), value);
  }
  
  return result;
}

/**
 * Add tracking pixel and link tracking to email
 */
function addEmailTracking(html, trackingId) {
  if (!html) return html;
  
  const baseUrl = process.env.API_URL || 'https://api.cybev.io';
  
  // Add tracking pixel
  const trackingPixel = `<img src="${baseUrl}/api/email/track/open/${trackingId}" width="1" height="1" style="display:none;" />`;
  html = html.replace('</body>', `${trackingPixel}</body>`);
  
  // Wrap links with tracking
  html = html.replace(
    /<a\s+href=["']([^"']+)["']/gi,
    (match, url) => {
      if (url.includes('unsubscribe') || url.startsWith('#')) return match;
      const trackedUrl = `${baseUrl}/api/email/track/click/${trackingId}?url=${encodeURIComponent(url)}`;
      return `<a href="${trackedUrl}"`;
    }
  );
  
  return html;
}

/**
 * Execute condition step
 */
async function executeConditionStep(step, subscriber, workflow) {
  const condition = step.condition;
  let result = false;
  
  switch (condition.type) {
    case 'opened_email':
      // Check if subscriber opened a specific email in this automation
      const openedStep = subscriber.history.find(h => 
        h.stepId === condition.emailStepId && h.stepType === 'send_email'
      );
      if (openedStep) {
        const { AutomationLog } = require('../models/automation.model');
        const openLog = await AutomationLog.findOne({
          subscriber: subscriber._id,
          event: 'email_opened',
          'data.stepId': condition.emailStepId
        });
        result = !!openLog;
      }
      break;
      
    case 'clicked_link':
      const clickLog = await AutomationLog.findOne({
        subscriber: subscriber._id,
        event: 'email_clicked',
        'data.url': { $regex: condition.linkUrl, $options: 'i' }
      });
      result = !!clickLog;
      break;
      
    case 'has_tag':
      const { EmailContact } = require('../models/email.model');
      const contact = await EmailContact.findOne({ user: workflow.user, email: subscriber.email });
      result = contact?.tags?.includes(condition.tag) || false;
      break;
      
    case 'random':
      result = Math.random() * 100 < condition.randomPercent;
      break;
      
    case 'custom_field':
      const contactForField = await require('../models/email.model').EmailContact.findOne({ 
        user: workflow.user, 
        email: subscriber.email 
      });
      const fieldValue = contactForField?.customFields?.[condition.field];
      
      switch (condition.operator) {
        case 'equals':
          result = fieldValue == condition.value;
          break;
        case 'not_equals':
          result = fieldValue != condition.value;
          break;
        case 'contains':
          result = String(fieldValue || '').includes(condition.value);
          break;
        case 'greater_than':
          result = Number(fieldValue) > Number(condition.value);
          break;
        case 'less_than':
          result = Number(fieldValue) < Number(condition.value);
          break;
      }
      break;
  }
  
  // Log condition evaluation
  await logAutomationEvent(workflow._id, subscriber._id, workflow.user, 'condition_evaluated', {
    stepId: step.stepId,
    conditionType: condition.type,
    result
  });
  
  return {
    success: true,
    result,
    branch: result ? condition.trueBranch : condition.falseBranch
  };
}

/**
 * Execute tag step
 */
async function executeTagStep(step, subscriber) {
  const { EmailContact } = require('../models/email.model');
  
  const action = step.tag.action;
  const tags = step.tag.tags;
  
  if (action === 'add') {
    await EmailContact.findOneAndUpdate(
      { email: subscriber.email, user: subscriber.user },
      { $addToSet: { tags: { $each: tags } } }
    );
  } else {
    await EmailContact.findOneAndUpdate(
      { email: subscriber.email, user: subscriber.user },
      { $pull: { tags: { $in: tags } } }
    );
  }
  
  await logAutomationEvent(subscriber.automation, subscriber._id, subscriber.user, 
    action === 'add' ? 'tag_added' : 'tag_removed', { tags });
  
  return { success: true, action, tags };
}

/**
 * Execute list step
 */
async function executeListStep(step, subscriber) {
  const { ContactList } = require('../models/campaign.model');
  const { EmailContact } = require('../models/email.model');
  
  // This would involve your list membership logic
  // For now, just log the action
  return { success: true, action: step.list.action, listId: step.list.listId };
}

/**
 * Execute webhook step
 */
async function executeWebhookStep(step, subscriber) {
  const webhook = step.webhook;
  
  const payload = {
    ...webhook.payload,
    email: subscriber.email,
    name: subscriber.name,
    automationId: subscriber.automation,
    timestamp: new Date().toISOString()
  };
  
  const response = await fetch(webhook.url, {
    method: webhook.method,
    headers: {
      'Content-Type': 'application/json',
      ...webhook.headers
    },
    body: webhook.method !== 'GET' ? JSON.stringify(payload) : undefined
  });
  
  return {
    success: response.ok,
    statusCode: response.status,
    response: await response.text().catch(() => null)
  };
}

/**
 * Execute notification step
 */
async function executeNotificationStep(step, subscriber, workflow) {
  const notification = step.notification;
  
  const message = personalizeContent(notification.message, subscriber);
  
  switch (notification.type) {
    case 'email':
      await sesService.sendEmail({
        to: notification.recipient,
        subject: `Automation Notification: ${workflow.name}`,
        html: `<p>${message}</p><p><small>Contact: ${subscriber.email}</small></p>`
      });
      break;
      
    // Add slack/sms handlers as needed
  }
  
  return { success: true, type: notification.type };
}

/**
 * Execute update contact step
 */
async function executeUpdateContactStep(step, subscriber) {
  const { EmailContact } = require('../models/email.model');
  
  await EmailContact.findOneAndUpdate(
    { email: subscriber.email, user: subscriber.user },
    { $set: step.updateContact.fields }
  );
  
  return { success: true, fields: Object.keys(step.updateContact.fields) };
}

/**
 * Execute split test step
 */
async function executeSplitTestStep(step, subscriber) {
  const variants = step.splitTest.variants;
  const random = Math.random() * 100;
  
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.percentage;
    if (random <= cumulative) {
      return { success: true, variant: variant.name, nextStepId: variant.nextStepId };
    }
  }
  
  // Fallback to first variant
  return { success: true, variant: variants[0].name, nextStepId: variants[0].nextStepId };
}

/**
 * Move subscriber to next step
 */
async function moveToNextStep(subscriber, workflow, currentStep, forcedNextStepId = null) {
  // Determine next step
  let nextStep = null;
  
  if (forcedNextStepId) {
    nextStep = workflow.steps.find(s => s.stepId === forcedNextStepId);
  } else {
    // Find step with next order number
    const nextOrder = currentStep.order + 1;
    nextStep = workflow.steps.find(s => s.order === nextOrder);
  }
  
  if (!nextStep) {
    // Workflow completed
    subscriber.status = 'completed';
    subscriber.currentStep = null;
    subscriber.nextAction = null;
    await subscriber.save();
    
    await AutomationWorkflow.findByIdAndUpdate(workflow._id, {
      $inc: { 'stats.completed': 1, 'stats.currentlyActive': -1 }
    });
    
    await logAutomationEvent(workflow._id, subscriber._id, workflow.user, 'subscriber_exited', {
      reason: 'completed',
      email: subscriber.email
    });
    
    return;
  }
  
  // Update current step
  subscriber.currentStep = {
    stepId: nextStep.stepId,
    enteredAt: new Date()
  };
  await subscriber.save();
  
  // Update step entered stats
  await AutomationWorkflow.findOneAndUpdate(
    { _id: workflow._id, 'steps.stepId': nextStep.stepId },
    { $inc: { 'steps.$.stats.entered': 1 } }
  );
  
  // Schedule next step
  await scheduleStepExecution(subscriber, nextStep, workflow);
}

// ==========================================
// TRIGGER HANDLERS
// ==========================================

/**
 * Queue automation execution (called from triggers)
 */
async function queueAutomationExecution(automationId, triggerData) {
  const workflow = await AutomationWorkflow.findById(automationId);
  if (!workflow || workflow.status !== 'active') return;
  
  // Get contact from trigger data
  const { EmailContact } = require('../models/email.model');
  const contact = await EmailContact.findOne({
    user: workflow.user,
    email: triggerData.contactEmail
  });
  
  if (!contact) {
    // Create contact if doesn't exist
    const newContact = await EmailContact.create({
      user: workflow.user,
      email: triggerData.contactEmail,
      name: triggerData.contactName,
      source: 'automation'
    });
    return addSubscriberToAutomation(automationId, newContact, triggerData);
  }
  
  return addSubscriberToAutomation(automationId, contact, triggerData);
}

/**
 * Handle list subscription trigger
 */
async function handleListSubscription(listId, contact) {
  const workflows = await AutomationWorkflow.find({
    status: 'active',
    'trigger.type': 'list_subscribe',
    'trigger.listId': listId
  });
  
  for (const workflow of workflows) {
    await addSubscriberToAutomation(workflow._id, contact, { trigger: 'list_subscribe', listId });
  }
}

/**
 * Handle tag added trigger
 */
async function handleTagAdded(userId, email, tag) {
  const workflows = await AutomationWorkflow.find({
    user: userId,
    status: 'active',
    'trigger.type': 'tag_added',
    'trigger.tag': tag
  });
  
  for (const workflow of workflows) {
    const { EmailContact } = require('../models/email.model');
    const contact = await EmailContact.findOne({ user: userId, email });
    if (contact) {
      await addSubscriberToAutomation(workflow._id, contact, { trigger: 'tag_added', tag });
    }
  }
}

// ==========================================
// LOGGING
// ==========================================

async function logAutomationEvent(automationId, subscriberId, userId, event, data) {
  try {
    await AutomationLog.create({
      automation: automationId,
      subscriber: subscriberId,
      user: userId,
      event,
      email: data.email,
      stepId: data.stepId,
      stepType: data.stepType,
      data,
      metadata: data.metadata
    });
  } catch (error) {
    console.error('Automation log error:', error);
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Workflow management
  activateWorkflow,
  pauseWorkflow,
  addSubscriberToAutomation,
  
  // Step execution
  executeQueuedStep,
  
  // Triggers
  queueAutomationExecution,
  handleListSubscription,
  handleTagAdded,
  
  // Logging
  logAutomationEvent
};
