// ============================================
// FILE: cron/automation-processor.js
// CYBEV Automation Queue Processor
// VERSION: 2.0.0 - Phase 6
// ============================================

const { Automation, AutomationSubscriber, AutomationQueue } = require('../models/automation.model');
const { EmailContact } = require('../models/email.model');
const sesService = require('../services/ses.service');

const BATCH_SIZE = parseInt(process.env.AUTOMATION_BATCH_SIZE) || 50;
const PROCESS_INTERVAL = parseInt(process.env.AUTOMATION_PROCESS_INTERVAL) || 60000;

let isProcessing = false;
let processInterval = null;

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;
  
  try {
    const pendingItems = await AutomationQueue.find({
      status: 'pending',
      scheduledAt: { $lte: new Date() }
    })
    .sort({ scheduledAt: 1 })
    .limit(BATCH_SIZE)
    .populate('automation')
    .populate('contact');
    
    if (!pendingItems.length) {
      isProcessing = false;
      return;
    }
    
    console.log(`🔄 Processing ${pendingItems.length} automation items...`);
    
    for (const item of pendingItems) {
      try {
        item.status = 'processing';
        item.lastAttemptAt = new Date();
        item.attempts += 1;
        await item.save();
        
        if (item.automation?.status !== 'active') {
          item.status = 'cancelled';
          await item.save();
          continue;
        }
        
        const subscriber = await AutomationSubscriber.findById(item.subscriber);
        if (!subscriber || subscriber.status !== 'active') {
          item.status = 'cancelled';
          await item.save();
          continue;
        }
        
        const step = item.automation.steps.find(s => s.id === item.stepId);
        if (!step) {
          item.status = 'failed';
          item.error = 'Step not found';
          await item.save();
          continue;
        }
        
        const result = await executeStep(step, subscriber, item.contact, item.automation);
        
        item.status = 'completed';
        item.result = result;
        item.completedAt = new Date();
        await item.save();
        
        subscriber.journey.push({
          stepId: step.id,
          stepType: step.type,
          action: 'completed',
          timestamp: new Date(),
          data: result
        });
        
        const nextStepId = result.nextStep || step.nextStep;
        if (nextStepId) {
          subscriber.currentStep = nextStepId;
          const nextStep = item.automation.steps.find(s => s.id === nextStepId);
          if (nextStep) {
            const delay = calculateDelay(nextStep);
            await AutomationQueue.create({
              automation: item.automation._id,
              subscriber: subscriber._id,
              contact: item.contact._id,
              user: item.user,
              stepId: nextStepId,
              stepType: nextStep.type,
              scheduledAt: new Date(Date.now() + delay)
            });
          }
        } else {
          subscriber.status = 'completed';
          subscriber.completedAt = new Date();
          await Automation.updateOne(
            { _id: item.automation._id },
            { $inc: { 'stats.active': -1, 'stats.completed': 1 } }
          );
        }
        
        await subscriber.save();
        
      } catch (err) {
        console.error('Step execution error:', err);
        item.error = err.message;
        if (item.attempts >= item.maxAttempts) {
          item.status = 'failed';
        } else {
          item.status = 'pending';
          item.scheduledAt = new Date(Date.now() + 300000); // Retry in 5 min
        }
        await item.save();
      }
    }
  } catch (error) {
    console.error('Automation processor error:', error);
  } finally {
    isProcessing = false;
  }
}

async function executeStep(step, subscriber, contact, automation) {
  switch (step.type) {
    case 'send_email':
      return await executeSendEmail(step, contact, automation);
    case 'wait':
      return { success: true, nextStep: step.nextStep };
    case 'condition':
      return await executeCondition(step, subscriber, contact);
    case 'action':
      return await executeAction(step, contact);
    case 'split':
      return executeSplit(step);
    default:
      return { success: false, error: 'Unknown step type' };
  }
}

async function executeSendEmail(step, contact, automation) {
  try {
    const personalizedSubject = personalizeContent(step.email.subject, contact);
    const personalizedHtml = personalizeContent(step.email.content?.html || '', contact);
    
    const result = await sesService.sendEmail({
      to: contact.email,
      from: step.email.fromEmail || automation.settings?.defaultFromEmail,
      fromName: step.email.fromName || automation.settings?.defaultFromName,
      subject: personalizedSubject,
      html: personalizedHtml,
      headers: { automationId: automation._id.toString(), type: 'automation' }
    });
    
    await Automation.updateOne(
      { _id: automation._id },
      { $inc: { 'stats.emailsSent': 1 } }
    );
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeCondition(step, subscriber, contact) {
  let result = false;
  
  switch (step.condition?.type) {
    case 'email_opened':
      const openJourney = subscriber.journey.find(j => 
        j.stepId === step.condition.field && j.data?.opened
      );
      result = !!openJourney;
      break;
    case 'email_clicked':
      const clickJourney = subscriber.journey.find(j => 
        j.stepId === step.condition.field && j.data?.clicked
      );
      result = !!clickJourney;
      break;
    case 'tag_exists':
      result = contact.tags?.includes(step.condition.value);
      break;
    case 'custom_field':
      const fieldValue = contact.customFields?.[step.condition.field];
      result = evaluateCondition(fieldValue, step.condition.operator, step.condition.value);
      break;
  }
  
  return {
    success: true,
    conditionResult: result,
    nextStep: result ? step.condition.trueBranch : step.condition.falseBranch
  };
}

async function executeAction(step, contact) {
  try {
    switch (step.action?.type) {
      case 'add_tag':
        if (!contact.tags.includes(step.action.tag)) {
          contact.tags.push(step.action.tag);
          await contact.save();
        }
        break;
      case 'remove_tag':
        contact.tags = contact.tags.filter(t => t !== step.action.tag);
        await contact.save();
        break;
      case 'update_field':
        if (!contact.customFields) contact.customFields = {};
        contact.customFields[step.action.field] = step.action.value;
        await contact.save();
        break;
      case 'webhook':
        await fetch(step.action.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact: { email: contact.email, name: contact.name } })
        });
        break;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function executeSplit(step) {
  const random = Math.random() * 100;
  const branch = random < (step.split?.ratio || 50) ? 'A' : 'B';
  return {
    success: true,
    splitBranch: branch,
    nextStep: branch === 'A' ? step.split.branchA : step.split.branchB
  };
}

function calculateDelay(step) {
  if (step.type !== 'wait') return 0;
  const multipliers = { minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000 };
  return (step.wait?.duration || 0) * (multipliers[step.wait?.unit] || 60000);
}

function personalizeContent(content, contact) {
  if (!content) return '';
  return content
    .replace(/{{name}}/g, contact.name || 'there')
    .replace(/{{email}}/g, contact.email || '')
    .replace(/{{first_name}}/g, (contact.name || '').split(' ')[0] || 'there')
    .replace(/{{unsubscribe_url}}/g, `${process.env.FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(contact.email)}`);
}

function evaluateCondition(value, operator, compareValue) {
  switch (operator) {
    case 'equals': return value === compareValue;
    case 'not_equals': return value !== compareValue;
    case 'contains': return String(value).includes(compareValue);
    case 'greater_than': return Number(value) > Number(compareValue);
    case 'less_than': return Number(value) < Number(compareValue);
    default: return false;
  }
}

function start() {
  if (processInterval) return;
  console.log('🤖 Automation processor started');
  processInterval = setInterval(processQueue, PROCESS_INTERVAL);
  processQueue(); // Run immediately
}

function stop() {
  if (processInterval) {
    clearInterval(processInterval);
    processInterval = null;
    console.log('🛑 Automation processor stopped');
  }
}

module.exports = { start, stop, processQueue };
