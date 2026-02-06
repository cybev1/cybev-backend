// ============================================
// FILE: models/automation.model.js
// CYBEV Email Automation Models - Workflow Builder
// VERSION: 1.0.0 - Klaviyo-Quality Automations
// ============================================

const mongoose = require('mongoose');

// ==========================================
// AUTOMATION WORKFLOW SCHEMA
// ==========================================

const automationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Basic info
  name: { type: String, required: true },
  description: { type: String },
  
  // Status
  status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },
  
  // Trigger configuration
  trigger: {
    type: { 
      type: String, 
      enum: [
        'list_signup',      // Someone joins a list
        'form_submit',      // Form submission
        'tag_added',        // Tag added to contact
        'purchase',         // Made a purchase
        'abandoned_cart',   // Cart abandoned
        'date_property',    // Birthday, anniversary
        'inactivity',       // No engagement for X days
        'custom_event',     // API-triggered
        'manual'            // Manual enrollment
      ],
      required: true 
    },
    
    // Trigger-specific settings
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form' },
    tagName: String,
    dateProperty: String, // 'birthday', 'signup_date', etc.
    inactivityDays: Number,
    eventName: String,
    
    // Filters
    filters: [{
      field: String,
      operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists'] },
      value: mongoose.Schema.Types.Mixed
    }]
  },
  
  // Workflow steps (nodes)
  steps: [{
    id: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['email', 'delay', 'condition', 'action', 'split'],
      required: true 
    },
    
    // Position in visual builder
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 }
    },
    
    // Connections
    nextSteps: [String], // IDs of next steps
    
    // Step-specific configuration
    config: {
      // For 'email' type
      campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
      subject: String,
      html: String,
      previewText: String,
      fromName: String,
      fromEmail: String,
      
      // For 'delay' type
      delayType: { type: String, enum: ['fixed', 'until_time', 'until_day'] },
      delayValue: Number, // minutes for fixed
      delayUnit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'] },
      untilTime: String, // "09:00"
      untilDay: String, // "monday"
      
      // For 'condition' type
      conditionType: { type: String, enum: ['email_opened', 'email_clicked', 'has_tag', 'custom'] },
      conditionField: String,
      conditionOperator: String,
      conditionValue: mongoose.Schema.Types.Mixed,
      yesPath: String, // Step ID for yes
      noPath: String,  // Step ID for no
      
      // For 'action' type
      actionType: { type: String, enum: ['add_tag', 'remove_tag', 'add_to_list', 'remove_from_list', 'update_field', 'webhook', 'notify'] },
      tagName: String,
      listId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
      fieldName: String,
      fieldValue: String,
      webhookUrl: String,
      notifyEmail: String,
      
      // For 'split' type (A/B test in workflow)
      splitType: { type: String, enum: ['random', 'weighted'] },
      splitPaths: [{
        id: String,
        name: String,
        percentage: Number,
        nextStep: String
      }]
    }
  }],
  
  // Settings
  settings: {
    // Entry limits
    allowReentry: { type: Boolean, default: false },
    reentryDelay: { type: Number, default: 0 }, // days
    maxEntriesPerContact: { type: Number, default: 1 },
    
    // Exit conditions
    exitOnUnsubscribe: { type: Boolean, default: true },
    exitOnPurchase: { type: Boolean, default: false },
    
    // Timing
    sendingWindow: {
      enabled: { type: Boolean, default: false },
      startTime: String, // "09:00"
      endTime: String,   // "17:00"
      timezone: String,
      days: [String]     // ["monday", "tuesday", ...]
    },
    
    // Goals
    goalType: { type: String, enum: ['purchase', 'click', 'custom'] },
    goalValue: Number
  },
  
  // Stats
  stats: {
    totalEntered: { type: Number, default: 0 },
    currentlyActive: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    exitedEarly: { type: Number, default: 0 },
    goalReached: { type: Number, default: 0 },
    emailsSent: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  },
  
  // Timestamps
  lastTriggeredAt: Date,
  activatedAt: Date,
  pausedAt: Date
}, { timestamps: true });

automationSchema.index({ user: 1, status: 1 });

// ==========================================
// AUTOMATION ENROLLMENT SCHEMA
// Tracks contacts in automations
// ==========================================

const automationEnrollmentSchema = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignContact', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'paused', 'completed', 'exited', 'failed'],
    default: 'active',
    index: true
  },
  
  // Current position
  currentStep: String, // Step ID
  
  // History
  history: [{
    stepId: String,
    stepType: String,
    action: { type: String, enum: ['entered', 'completed', 'skipped', 'waiting', 'failed'] },
    timestamp: { type: Date, default: Date.now },
    data: mongoose.Schema.Types.Mixed // Email ID, condition result, etc.
  }],
  
  // Scheduling
  nextActionAt: { type: Date, index: true },
  
  // Entry info
  entryData: mongoose.Schema.Types.Mixed, // Data that triggered the automation
  
  // Exit info
  exitedAt: Date,
  exitReason: String,
  
  // Goal tracking
  goalReached: { type: Boolean, default: false },
  goalReachedAt: Date,
  goalValue: Number
}, { timestamps: true });

automationEnrollmentSchema.index({ automation: 1, contact: 1 }, { unique: true });
automationEnrollmentSchema.index({ status: 1, nextActionAt: 1 });

// ==========================================
// AUTOMATION EMAIL LOG
// Track emails sent by automations
// ==========================================

const automationEmailLogSchema = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true, index: true },
  enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationEnrollment', required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignContact', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  stepId: String,
  
  // Email details
  subject: String,
  previewText: String,
  
  // Status
  status: { type: String, enum: ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'], default: 'sent' },
  
  // Tracking
  sentAt: { type: Date, default: Date.now },
  deliveredAt: Date,
  openedAt: Date,
  clickedAt: Date,
  
  // Links clicked
  clicks: [{
    url: String,
    timestamp: Date
  }],
  
  // Error info
  errorMessage: String,
  
  // Revenue attribution
  revenue: { type: Number, default: 0 },
  orderId: String
}, { timestamps: true });

automationEmailLogSchema.index({ automation: 1, createdAt: -1 });

// ==========================================
// EXPORTS
// ==========================================

const Automation = mongoose.models.Automation || mongoose.model('Automation', automationSchema);
const AutomationEnrollment = mongoose.models.AutomationEnrollment || mongoose.model('AutomationEnrollment', automationEnrollmentSchema);
const AutomationEmailLog = mongoose.models.AutomationEmailLog || mongoose.model('AutomationEmailLog', automationEmailLogSchema);

module.exports = { Automation, AutomationEnrollment, AutomationEmailLog };
