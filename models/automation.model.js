// ============================================
// FILE: models/automation.model.js
// CYBEV Automation & Workflow Models
// VERSION: 1.0.0 - Drip Campaigns, Triggers, Sequences
// ============================================

const mongoose = require('mongoose');

// ==========================================
// AUTOMATION WORKFLOW MODEL
// Main automation definition
// ==========================================

const automationWorkflowSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Basic info
  name: { type: String, required: true },
  description: String,
  
  // Status
  status: { 
    type: String, 
    enum: ['draft', 'active', 'paused', 'completed', 'archived'],
    default: 'draft',
    index: true
  },
  
  // Workflow type
  type: {
    type: String,
    enum: ['drip', 'trigger', 'sequence', 'workflow'],
    default: 'drip'
  },
  
  // Trigger configuration
  trigger: {
    type: {
      type: String,
      enum: [
        'manual',           // Manually add contacts
        'list_subscribe',   // When someone subscribes to a list
        'tag_added',        // When tag is added to contact
        'email_received',   // When email is received
        'form_submit',      // When form is submitted
        'date_based',       // Anniversary, birthday, etc.
        'api',              // API trigger
        'segment_enter',    // When contact enters a segment
        'link_clicked',     // When specific link is clicked
        'email_opened',     // When email is opened
        'no_activity'       // After X days of no activity
      ],
      default: 'manual'
    },
    
    // Specific trigger settings based on type
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
    tag: String,
    formId: String,
    dateField: String, // For date_based triggers (e.g., 'birthday', 'signup_date')
    segmentId: String,
    linkUrl: String,
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    inactivityDays: Number,
    
    // Conditions for trigger
    conditions: {
      fromContains: String,
      subjectContains: String,
      labels: [String],
      customConditions: mongoose.Schema.Types.Mixed
    }
  },
  
  // Entry conditions (who can enter)
  entryConditions: {
    allowReentry: { type: Boolean, default: false },
    reentryWaitDays: { type: Number, default: 0 },
    maxEntriesPerContact: { type: Number, default: 1 },
    filterSegment: String,
    filterTags: [String],
    excludeTags: [String]
  },
  
  // Exit conditions
  exitConditions: {
    onUnsubscribe: { type: Boolean, default: true },
    onBounce: { type: Boolean, default: true },
    onComplaint: { type: Boolean, default: true },
    goalAchieved: {
      enabled: { type: Boolean, default: false },
      type: { type: String, enum: ['link_click', 'tag_added', 'purchase', 'custom'] },
      value: String
    }
  },
  
  // Schedule/timing settings
  settings: {
    timezone: { type: String, default: 'UTC' },
    // Send window - only send during these hours
    sendWindow: {
      enabled: { type: Boolean, default: false },
      startHour: { type: Number, default: 9 },
      endHour: { type: Number, default: 17 },
      daysOfWeek: { type: [Number], default: [1, 2, 3, 4, 5] } // Mon-Fri
    },
    // Throttling
    maxSendsPerHour: { type: Number, default: 1000 },
    maxSendsPerDay: { type: Number, default: 10000 }
  },
  
  // Steps in the workflow
  steps: [{
    stepId: { type: String, required: true }, // Unique ID for this step
    order: { type: Number, required: true },
    
    // Step type
    type: {
      type: String,
      enum: [
        'send_email',
        'wait',
        'condition',
        'add_tag',
        'remove_tag',
        'add_to_list',
        'remove_from_list',
        'webhook',
        'notification',
        'update_contact',
        'goal_check',
        'split_test'
      ],
      required: true
    },
    
    // Step name
    name: String,
    
    // Wait step config
    wait: {
      type: { type: String, enum: ['delay', 'until_date', 'until_time', 'until_day'] },
      delay: {
        value: Number,
        unit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'] }
      },
      untilDate: Date,
      untilTime: String, // HH:MM format
      untilDay: { type: Number, min: 0, max: 6 } // Day of week (0=Sunday)
    },
    
    // Email step config
    email: {
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' },
      subject: String,
      previewText: String,
      content: {
        html: String,
        text: String,
        json: mongoose.Schema.Types.Mixed
      },
      sender: {
        emailAddress: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailAddress' },
        email: String,
        name: String
      }
    },
    
    // Condition step config
    condition: {
      type: { 
        type: String, 
        enum: ['opened_email', 'clicked_link', 'has_tag', 'in_segment', 'custom_field', 'random'] 
      },
      emailStepId: String, // For opened_email condition
      linkUrl: String,
      tag: String,
      segment: String,
      field: String,
      operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than'] },
      value: String,
      randomPercent: Number, // For A/B split
      
      // Branches
      trueBranch: String, // stepId to go to if true
      falseBranch: String // stepId to go to if false
    },
    
    // Tag step config
    tag: {
      action: { type: String, enum: ['add', 'remove'] },
      tags: [String]
    },
    
    // List step config
    list: {
      action: { type: String, enum: ['add', 'remove'] },
      listId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }
    },
    
    // Webhook step config
    webhook: {
      url: String,
      method: { type: String, enum: ['GET', 'POST', 'PUT'], default: 'POST' },
      headers: mongoose.Schema.Types.Mixed,
      payload: mongoose.Schema.Types.Mixed
    },
    
    // Notification step config
    notification: {
      type: { type: String, enum: ['email', 'slack', 'sms'] },
      recipient: String,
      message: String
    },
    
    // Update contact step config
    updateContact: {
      fields: mongoose.Schema.Types.Mixed
    },
    
    // Split test config
    splitTest: {
      variants: [{
        name: String,
        percentage: Number,
        nextStepId: String
      }]
    },
    
    // Step status tracking
    stats: {
      entered: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 }
    }
  }],
  
  // Visual editor state (for frontend drag-drop)
  editorState: {
    nodes: mongoose.Schema.Types.Mixed,
    edges: mongoose.Schema.Types.Mixed,
    viewport: mongoose.Schema.Types.Mixed
  },
  
  // Overall stats
  stats: {
    totalEntered: { type: Number, default: 0 },
    currentlyActive: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    goalReached: { type: Number, default: 0 },
    exited: { type: Number, default: 0 },
    emailsSent: { type: Number, default: 0 },
    emailsOpened: { type: Number, default: 0 },
    emailsClicked: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 }
  },
  
  // Timestamps
  activatedAt: Date,
  pausedAt: Date,
  completedAt: Date
  
}, { timestamps: true });

automationWorkflowSchema.index({ user: 1, status: 1 });
automationWorkflowSchema.index({ 'trigger.type': 1, status: 1 });

// ==========================================
// AUTOMATION SUBSCRIBER MODEL
// Track contacts going through automation
// ==========================================

const automationSubscriberSchema = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationWorkflow', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailContact' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Contact info (denormalized for quick access)
  email: { type: String, required: true, index: true },
  name: String,
  
  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'exited', 'failed', 'paused'],
    default: 'active',
    index: true
  },
  
  // Current position
  currentStep: {
    stepId: String,
    enteredAt: Date
  },
  
  // Next scheduled action
  nextAction: {
    stepId: String,
    scheduledFor: { type: Date, index: true },
    type: String
  },
  
  // Trigger data (what triggered this subscriber)
  triggerData: mongoose.Schema.Types.Mixed,
  
  // History of steps completed
  history: [{
    stepId: String,
    stepType: String,
    enteredAt: Date,
    completedAt: Date,
    status: { type: String, enum: ['completed', 'skipped', 'failed'] },
    data: mongoose.Schema.Types.Mixed, // Step-specific data (email sent, condition result, etc.)
    error: String
  }],
  
  // Email interaction tracking for this automation
  emailInteractions: {
    sent: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    lastOpenedAt: Date,
    lastClickedAt: Date
  },
  
  // Entry tracking
  entryCount: { type: Number, default: 1 },
  firstEnteredAt: Date,
  lastEnteredAt: Date,
  
  // Exit info
  exitReason: String,
  exitedAt: Date,
  goalReachedAt: Date
  
}, { timestamps: true });

automationSubscriberSchema.index({ automation: 1, status: 1 });
automationSubscriberSchema.index({ automation: 1, email: 1 });
automationSubscriberSchema.index({ 'nextAction.scheduledFor': 1, status: 1 });
automationSubscriberSchema.index({ user: 1, email: 1, automation: 1 });

// ==========================================
// AUTOMATION QUEUE MODEL
// Queue for scheduled automation actions
// ==========================================

const automationQueueSchema = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationWorkflow', required: true, index: true },
  subscriber: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationSubscriber', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Step to execute
  stepId: { type: String, required: true },
  stepType: { type: String, required: true },
  
  // Scheduling
  scheduledFor: { type: Date, required: true, index: true },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Processing info
  attempts: { type: Number, default: 0 },
  lastAttemptAt: Date,
  error: String,
  
  // Result data
  result: mongoose.Schema.Types.Mixed,
  
  completedAt: Date
  
}, { timestamps: true });

automationQueueSchema.index({ scheduledFor: 1, status: 1 });
automationQueueSchema.index({ automation: 1, subscriber: 1 });

// ==========================================
// AUTOMATION LOG MODEL
// Detailed activity logging
// ==========================================

const automationLogSchema = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationWorkflow', required: true, index: true },
  subscriber: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationSubscriber' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Event type
  event: {
    type: String,
    enum: [
      'workflow_activated',
      'workflow_paused',
      'workflow_completed',
      'subscriber_entered',
      'subscriber_exited',
      'step_started',
      'step_completed',
      'step_failed',
      'email_sent',
      'email_opened',
      'email_clicked',
      'condition_evaluated',
      'tag_added',
      'tag_removed',
      'webhook_called',
      'goal_reached',
      'error'
    ],
    required: true
  },
  
  // Step info
  stepId: String,
  stepType: String,
  
  // Contact info
  email: String,
  
  // Event data
  data: mongoose.Schema.Types.Mixed,
  
  // Error info
  error: String,
  
  // IP/User agent (for opens/clicks)
  metadata: {
    ip: String,
    userAgent: String,
    location: mongoose.Schema.Types.Mixed
  }
  
}, { timestamps: true });

automationLogSchema.index({ automation: 1, createdAt: -1 });
automationLogSchema.index({ automation: 1, event: 1 });
automationLogSchema.index({ subscriber: 1, createdAt: -1 });

// ==========================================
// EXPORT MODELS
// ==========================================

const AutomationWorkflow = mongoose.models.AutomationWorkflow || mongoose.model('AutomationWorkflow', automationWorkflowSchema);
const AutomationSubscriber = mongoose.models.AutomationSubscriber || mongoose.model('AutomationSubscriber', automationSubscriberSchema);
const AutomationQueue = mongoose.models.AutomationQueue || mongoose.model('AutomationQueue', automationQueueSchema);
const AutomationLog = mongoose.models.AutomationLog || mongoose.model('AutomationLog', automationLogSchema);

module.exports = {
  AutomationWorkflow,
  AutomationSubscriber,
  AutomationQueue,
  AutomationLog
};
