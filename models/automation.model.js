// ============================================
// FILE: models/automation.model.js
// CYBEV Email Automation/Workflow Models
// VERSION: 2.0.0 - Phase 6
// ============================================

const mongoose = require('mongoose');

// ==========================================
// AUTOMATION WORKFLOW MODEL
// Email sequences, drip campaigns, triggers
// ==========================================

const automationStepSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['send_email', 'wait', 'condition', 'action', 'split'],
    required: true 
  },
  
  // For send_email type
  email: {
    subject: String,
    preheader: String,
    content: {
      blocks: [mongoose.Schema.Types.Mixed],
      html: String
    },
    fromName: String,
    fromEmail: String
  },
  
  // For wait type
  wait: {
    duration: Number, // in minutes
    unit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'] }
  },
  
  // For condition type
  condition: {
    type: { 
      type: String, 
      enum: ['email_opened', 'email_clicked', 'tag_exists', 'custom_field', 'time_delay']
    },
    field: String,
    operator: String, // equals, not_equals, contains, greater_than, etc.
    value: mongoose.Schema.Types.Mixed,
    // Branching
    trueBranch: String, // step id
    falseBranch: String
  },
  
  // For action type
  action: {
    type: { 
      type: String, 
      enum: ['add_tag', 'remove_tag', 'update_field', 'webhook', 'notify']
    },
    tag: String,
    field: String,
    value: mongoose.Schema.Types.Mixed,
    webhookUrl: String,
    notificationEmail: String
  },
  
  // For A/B split type
  split: {
    ratio: { type: Number, default: 50 }, // percentage for branch A
    branchA: String,
    branchB: String
  },
  
  // Next step (for linear flow)
  nextStep: String,
  
  // Position for visual editor
  position: {
    x: Number,
    y: Number
  }
}, { _id: false });

const automationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  name: { type: String, required: true },
  description: String,
  
  // Trigger configuration
  trigger: {
    type: { 
      type: String, 
      enum: [
        'signup',           // New subscriber signup
        'tag_added',        // Tag added to contact
        'tag_removed',      // Tag removed
        'form_submitted',   // Form submission
        'purchase',         // Purchase made
        'date',             // Specific date (birthday, anniversary)
        'api',              // API trigger
        'manual',           // Manual enrollment
        'no_activity'       // Inactivity trigger
      ],
      required: true
    },
    tag: String,           // For tag_added/removed triggers
    formId: String,        // For form_submitted
    dateField: String,     // For date trigger (field name on contact)
    inactivityDays: Number // For no_activity trigger
  },
  
  // Workflow steps
  steps: [automationStepSchema],
  entryStep: String, // First step id
  
  // Status
  status: { 
    type: String, 
    enum: ['draft', 'active', 'paused', 'archived'], 
    default: 'draft' 
  },
  
  // Settings
  settings: {
    allowReEntry: { type: Boolean, default: false }, // Can contact re-enter?
    reEntryDelay: Number, // Days before re-entry allowed
    exitOnUnsubscribe: { type: Boolean, default: true },
    sendingWindow: {
      enabled: { type: Boolean, default: false },
      startHour: Number,
      endHour: Number,
      timezone: String,
      excludeWeekends: Boolean
    },
    goalTracking: {
      enabled: { type: Boolean, default: false },
      goalTag: String,
      exitOnGoal: { type: Boolean, default: true }
    }
  },
  
  // Stats
  stats: {
    enrolled: { type: Number, default: 0 },
    active: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    converted: { type: Number, default: 0 },
    exited: { type: Number, default: 0 },
    emailsSent: { type: Number, default: 0 },
    opens: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 }
  },
  
  // Version control for A/B testing
  version: { type: Number, default: 1 },
  
  activatedAt: Date,
  pausedAt: Date
}, { timestamps: true });

automationSchema.index({ user: 1, status: 1 });
automationSchema.index({ 'trigger.type': 1, status: 1 });

// ==========================================
// AUTOMATION SUBSCRIBER MODEL
// Tracks contacts in automations
// ==========================================

const automationSubscriberSchema = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailContact', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Current position in automation
  currentStep: String,
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'paused', 'completed', 'exited', 'failed'],
    default: 'active'
  },
  
  // Journey tracking
  journey: [{
    stepId: String,
    stepType: String,
    action: String, // 'entered', 'completed', 'skipped', 'failed'
    timestamp: { type: Date, default: Date.now },
    data: mongoose.Schema.Types.Mixed // Email open, click data, etc.
  }],
  
  // Trigger data
  triggerData: mongoose.Schema.Types.Mixed,
  
  // Next action scheduled
  nextActionAt: { type: Date, index: true },
  
  // A/B test tracking
  splitBranch: String,
  
  // Exit reason
  exitReason: String,
  
  // Entry count (for re-entry tracking)
  entryCount: { type: Number, default: 1 },
  lastEntryAt: Date,
  
  completedAt: Date,
  exitedAt: Date
}, { timestamps: true });

automationSubscriberSchema.index({ automation: 1, status: 1, nextActionAt: 1 });
automationSubscriberSchema.index({ contact: 1, automation: 1 });
automationSubscriberSchema.index({ user: 1, status: 1 });

// ==========================================
// AUTOMATION QUEUE MODEL
// Scheduled automation actions
// ==========================================

const automationQueueSchema = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true, index: true },
  subscriber: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationSubscriber', required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailContact', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Step to execute
  stepId: { type: String, required: true },
  stepType: String,
  
  // Scheduled execution
  scheduledAt: { type: Date, required: true, index: true },
  
  // Processing status
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Retry logic
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  lastAttemptAt: Date,
  error: String,
  
  // Result
  result: mongoose.Schema.Types.Mixed,
  
  processedAt: Date,
  completedAt: Date
}, { timestamps: true });

automationQueueSchema.index({ status: 1, scheduledAt: 1 });
automationQueueSchema.index({ user: 1, status: 1 });

// ==========================================
// AUTOMATION TEMPLATES
// Pre-built automation workflows
// ==========================================

const automationTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: { 
    type: String, 
    enum: ['welcome', 'nurture', 'sales', 'engagement', 'retention', 'custom'],
    default: 'custom'
  },
  
  // Template data
  trigger: mongoose.Schema.Types.Mixed,
  steps: [automationStepSchema],
  entryStep: String,
  settings: mongoose.Schema.Types.Mixed,
  
  // Metadata
  isSystem: { type: Boolean, default: false }, // Built-in templates
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Usage stats
  usageCount: { type: Number, default: 0 }
}, { timestamps: true });

// ==========================================
// EMAIL SUBSCRIPTION PLAN MODEL
// Monetization tiers for email platform
// ==========================================

const emailSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Plan details
  plan: {
    type: String,
    enum: ['free', 'pro', 'business', 'enterprise'],
    default: 'free'
  },
  
  // Limits
  limits: {
    emailAddresses: { type: Number, default: 1 },
    customDomains: { type: Number, default: 0 },
    monthlyEmails: { type: Number, default: 500 },
    contacts: { type: Number, default: 500 },
    automations: { type: Number, default: 1 },
    hasFullInbox: { type: Boolean, default: false },
    hasAbTesting: { type: Boolean, default: false },
    hasApiAccess: { type: Boolean, default: false },
    hasPrioritySupport: { type: Boolean, default: false }
  },
  
  // Usage tracking
  usage: {
    emailAddresses: { type: Number, default: 0 },
    customDomains: { type: Number, default: 0 },
    emailsSentThisMonth: { type: Number, default: 0 },
    contacts: { type: Number, default: 0 },
    automations: { type: Number, default: 0 }
  },
  
  // Billing
  billing: {
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false }
  },
  
  // Reset usage monthly
  lastUsageReset: Date
}, { timestamps: true });

emailSubscriptionSchema.index({ user: 1 });
emailSubscriptionSchema.index({ plan: 1 });

// Plan limits lookup
emailSubscriptionSchema.statics.PLAN_LIMITS = {
  free: {
    emailAddresses: 1,
    customDomains: 0,
    monthlyEmails: 500,
    contacts: 500,
    automations: 1,
    hasFullInbox: false,
    hasAbTesting: false,
    hasApiAccess: false,
    hasPrioritySupport: false
  },
  pro: {
    emailAddresses: 5,
    customDomains: 1,
    monthlyEmails: 10000,
    contacts: 5000,
    automations: 10,
    hasFullInbox: true,
    hasAbTesting: false,
    hasApiAccess: false,
    hasPrioritySupport: true
  },
  business: {
    emailAddresses: 999999,
    customDomains: 5,
    monthlyEmails: 100000,
    contacts: 50000,
    automations: 999999,
    hasFullInbox: true,
    hasAbTesting: true,
    hasApiAccess: true,
    hasPrioritySupport: true
  },
  enterprise: {
    emailAddresses: 999999,
    customDomains: 999999,
    monthlyEmails: 999999,
    contacts: 999999,
    automations: 999999,
    hasFullInbox: true,
    hasAbTesting: true,
    hasApiAccess: true,
    hasPrioritySupport: true
  }
};

// ==========================================
// EXPORT MODELS
// ==========================================

const Automation = mongoose.models.Automation || mongoose.model('Automation', automationSchema);
const AutomationSubscriber = mongoose.models.AutomationSubscriber || mongoose.model('AutomationSubscriber', automationSubscriberSchema);
const AutomationQueue = mongoose.models.AutomationQueue || mongoose.model('AutomationQueue', automationQueueSchema);
const AutomationTemplate = mongoose.models.AutomationTemplate || mongoose.model('AutomationTemplate', automationTemplateSchema);
const EmailSubscription = mongoose.models.EmailSubscription || mongoose.model('EmailSubscription', emailSubscriptionSchema);

module.exports = {
  Automation,
  AutomationSubscriber,
  AutomationQueue,
  AutomationTemplate,
  EmailSubscription
};
