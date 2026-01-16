// ============================================
// FILE: cron/automation-processor.js
// CYBEV Automation Queue Processor
// VERSION: 1.0.0 - Process scheduled automation steps
// ============================================

const mongoose = require('mongoose');
const { AutomationQueue, AutomationWorkflow, AutomationSubscriber } = require('../models/automation.model');
const automationService = require('../services/automation.service');

// Configuration
const BATCH_SIZE = parseInt(process.env.AUTOMATION_BATCH_SIZE || '50');
const PROCESS_INTERVAL = parseInt(process.env.AUTOMATION_PROCESS_INTERVAL || '10000'); // 10 seconds
const MAX_RETRIES = parseInt(process.env.AUTOMATION_MAX_RETRIES || '3');

let isProcessing = false;
let processInterval = null;

/**
 * Process pending automation queue items
 */
async function processQueue() {
  if (isProcessing) {
    console.log('⚡ Automation processor already running, skipping...');
    return;
  }
  
  isProcessing = true;
  
  try {
    const now = new Date();
    
    // Find pending items that are due
    const pendingItems = await AutomationQueue.find({
      status: 'pending',
      scheduledFor: { $lte: now }
    })
    .sort({ scheduledFor: 1 })
    .limit(BATCH_SIZE)
    .lean();
    
    if (pendingItems.length === 0) {
      isProcessing = false;
      return;
    }
    
    console.log(`⚡ Processing ${pendingItems.length} automation queue items`);
    
    // Process items in parallel with concurrency limit
    const CONCURRENCY = 10;
    for (let i = 0; i < pendingItems.length; i += CONCURRENCY) {
      const batch = pendingItems.slice(i, i + CONCURRENCY);
      
      await Promise.all(batch.map(async (item) => {
        try {
          // Check if automation is still active
          const workflow = await AutomationWorkflow.findById(item.automation);
          if (!workflow || workflow.status !== 'active') {
            await AutomationQueue.findByIdAndUpdate(item._id, { status: 'cancelled' });
            return;
          }
          
          // Check if subscriber is still active
          const subscriber = await AutomationSubscriber.findById(item.subscriber);
          if (!subscriber || subscriber.status !== 'active') {
            await AutomationQueue.findByIdAndUpdate(item._id, { status: 'cancelled' });
            return;
          }
          
          // Execute the step
          await automationService.executeQueuedStep(item);
          
        } catch (error) {
          console.error(`⚡ Error processing queue item ${item._id}:`, error);
          
          // Check retry count
          if (item.attempts >= MAX_RETRIES) {
            await AutomationQueue.findByIdAndUpdate(item._id, {
              status: 'failed',
              error: error.message
            });
            
            // Mark subscriber as failed
            await AutomationSubscriber.findByIdAndUpdate(item.subscriber, {
              status: 'failed',
              exitReason: `Step failed after ${MAX_RETRIES} retries: ${error.message}`
            });
          } else {
            // Schedule retry with exponential backoff
            const retryDelay = Math.pow(2, item.attempts) * 60000; // 1min, 2min, 4min...
            await AutomationQueue.findByIdAndUpdate(item._id, {
              status: 'pending',
              scheduledFor: new Date(Date.now() + retryDelay),
              error: error.message,
              $inc: { attempts: 1 }
            });
          }
        }
      }));
    }
    
    console.log(`⚡ Processed ${pendingItems.length} automation queue items`);
    
  } catch (error) {
    console.error('⚡ Automation processor error:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Process scheduled date-based triggers
 */
async function processDateTriggers() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Find automations with date-based triggers
    const automations = await AutomationWorkflow.find({
      status: 'active',
      'trigger.type': 'date_based'
    });
    
    for (const automation of automations) {
      const dateField = automation.trigger.dateField;
      if (!dateField) continue;
      
      // Find contacts whose date field matches today
      const { EmailContact } = require('../models/email.model');
      
      // Build query based on date field
      const dayMonth = now.toISOString().substring(5, 10); // MM-DD
      
      const contacts = await EmailContact.find({
        user: automation.user,
        subscribed: true,
        [`customFields.${dateField}`]: { 
          $regex: dayMonth // Match MM-DD portion of date
        }
      });
      
      for (const contact of contacts) {
        // Check if already entered today
        const existingEntry = await AutomationSubscriber.findOne({
          automation: automation._id,
          email: contact.email,
          lastEnteredAt: { 
            $gte: new Date(today),
            $lt: new Date(new Date(today).getTime() + 86400000)
          }
        });
        
        if (!existingEntry) {
          await automationService.addSubscriberToAutomation(
            automation._id,
            contact,
            { trigger: 'date_based', dateField, date: today }
          );
        }
      }
    }
  } catch (error) {
    console.error('⚡ Date trigger processor error:', error);
  }
}

/**
 * Process inactivity-based triggers
 */
async function processInactivityTriggers() {
  try {
    // Find automations with inactivity triggers
    const automations = await AutomationWorkflow.find({
      status: 'active',
      'trigger.type': 'no_activity',
      'trigger.inactivityDays': { $gt: 0 }
    });
    
    for (const automation of automations) {
      const inactivityDays = automation.trigger.inactivityDays;
      const cutoffDate = new Date(Date.now() - inactivityDays * 86400000);
      
      const { EmailContact } = require('../models/email.model');
      
      // Find inactive contacts
      const inactiveContacts = await EmailContact.find({
        user: automation.user,
        subscribed: true,
        $or: [
          { lastContacted: { $lt: cutoffDate } },
          { lastContacted: null, createdAt: { $lt: cutoffDate } }
        ]
      });
      
      for (const contact of inactiveContacts) {
        // Check if already in this automation
        const existing = await AutomationSubscriber.findOne({
          automation: automation._id,
          email: contact.email,
          status: { $in: ['active', 'completed'] }
        });
        
        if (!existing) {
          await automationService.addSubscriberToAutomation(
            automation._id,
            contact,
            { trigger: 'no_activity', inactivityDays }
          );
        }
      }
    }
  } catch (error) {
    console.error('⚡ Inactivity trigger processor error:', error);
  }
}

/**
 * Clean up old queue items and logs
 */
async function cleanupOldData() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
    
    // Delete completed/cancelled queue items older than 30 days
    const queueResult = await AutomationQueue.deleteMany({
      status: { $in: ['completed', 'cancelled', 'failed'] },
      updatedAt: { $lt: thirtyDaysAgo }
    });
    
    // Delete old logs (keep 90 days)
    const { AutomationLog } = require('../models/automation.model');
    const logResult = await AutomationLog.deleteMany({
      createdAt: { $lt: ninetyDaysAgo }
    });
    
    if (queueResult.deletedCount > 0 || logResult.deletedCount > 0) {
      console.log(`⚡ Cleanup: Deleted ${queueResult.deletedCount} queue items, ${logResult.deletedCount} logs`);
    }
  } catch (error) {
    console.error('⚡ Cleanup error:', error);
  }
}

/**
 * Update usage statistics
 */
async function updateUsageStats() {
  try {
    const { UserEmailSubscription } = require('../models/email-subscription.model');
    
    // Reset daily counters at midnight UTC
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 15) {
      await UserEmailSubscription.updateMany(
        {},
        { 'usage.emailsSentToday': 0 }
      );
      console.log('⚡ Reset daily email counters');
    }
    
    // Reset monthly counters on 1st of month
    if (now.getUTCDate() === 1 && now.getUTCHours() === 0 && now.getUTCMinutes() < 15) {
      await UserEmailSubscription.updateMany(
        {},
        { 
          'usage.emailsSentThisMonth': 0,
          'usage.campaignsSentThisMonth': 0,
          'usage.usageResetDate': now
        }
      );
      console.log('⚡ Reset monthly email counters');
    }
  } catch (error) {
    console.error('⚡ Usage stats update error:', error);
  }
}

// ==========================================
// SCHEDULER
// ==========================================

/**
 * Start the automation processor
 */
function start() {
  console.log('⚡ Starting automation processor...');
  
  // Main queue processor - runs frequently
  processInterval = setInterval(processQueue, PROCESS_INTERVAL);
  
  // Date triggers - run daily at midnight UTC
  const scheduleDaily = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(0, 0, 0, 0);
    if (midnight <= now) midnight.setUTCDate(midnight.getUTCDate() + 1);
    
    const delay = midnight - now;
    setTimeout(() => {
      processDateTriggers();
      processInactivityTriggers();
      cleanupOldData();
      scheduleDaily(); // Schedule next day
    }, delay);
  };
  scheduleDaily();
  
  // Usage stats - run every 15 minutes
  setInterval(updateUsageStats, 15 * 60 * 1000);
  
  // Run initial processing
  setTimeout(processQueue, 5000);
  
  console.log('⚡ Automation processor started');
}

/**
 * Stop the automation processor
 */
function stop() {
  console.log('⚡ Stopping automation processor...');
  if (processInterval) {
    clearInterval(processInterval);
    processInterval = null;
  }
}

module.exports = {
  start,
  stop,
  processQueue,
  processDateTriggers,
  processInactivityTriggers,
  cleanupOldData,
  updateUsageStats
};
