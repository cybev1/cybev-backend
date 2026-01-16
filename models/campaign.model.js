// ============================================
// FILE: models/campaign.model.js
// CYBEV Campaign Models - Enhanced Email Marketing
// VERSION: 2.0.0 - Full Campaign Platform
// ============================================

const mongoose = require('mongoose');

// ==========================================
// CAMPAIGN MODEL
// Email marketing campaigns
// ==========================================

const campaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Basic info
  name: { type: String, required: true },
  description: String,
  
  // Type
  type: { 
    type: String, 
    enum: ['email', 'sms', 'whatsapp', 'push'], 
    default: 'email' 
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'], 
    default: 'draft',
    index: true
  },
  
  // Sender settings
  sender: {
    emailAddress: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailAddress' },
    email: String, // Denormalized for quick access
    name: String,
    replyTo: String
  },
  
  // Content
  subject: String,
  previewText: String, // Preview text shown in inbox
  content: {
    html: String,
    text: String,
    json: mongoose.Schema.Types.Mixed, // For drag-drop editor state
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' }
  },
  
  // A/B Testing
  abTest: {
    enabled: { type: Boolean, default: false },
    variants: [{
      name: String, // 'A', 'B', 'C'
      subject: String,
      content: {
        html: String,
        text: String
      },
      percentage: { type: Number, default: 50 }, // Split percentage
      stats: {
        sent: { type: Number, default: 0 },
        opened: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 }
      }
    }],
    winnerCriteria: { 
      type: String, 
      enum: ['opens', 'clicks', 'manual'],
      default: 'opens'
    },
    testDuration: { type: Number, default: 4 }, // Hours before picking winner
    winner: String // 'A', 'B', etc.
  },
  
  // Audience targeting
  audience: {
    type: { 
      type: String, 
      enum: ['all', 'segment', 'list', 'tags', 'custom'],
      default: 'all'
    },
    contactList: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
    segments: [String],
    tags: [String],
    excludeTags: [String],
    filters: mongoose.Schema.Types.Mixed // Custom filters
  },
  
  // Scheduling
  schedule: {
    type: { 
      type: String, 
      enum: ['immediate', 'scheduled', 'optimal'],
      default: 'immediate'
    },
    scheduledAt: Date,
    timezone: { type: String, default: 'UTC' },
    // Send time optimization
    optimizeForTimezone: { type: Boolean, default: false },
    sendWindow: {
      startHour: { type: Number, default: 9 },
      endHour: { type: Number, default: 17 }
    }
  },
  
  // Tracking settings
  tracking: {
    openTracking: { type: Boolean, default: true },
    clickTracking: { type: Boolean, default: true },
    googleAnalytics: {
      enabled: { type: Boolean, default: false },
      utmSource: String,
      utmMedium: String,
      utmCampaign: String
    }
  },
  
  // Stats
  stats: {
    // Audience
    recipientCount: { type: Number, default: 0 },
    
    // Delivery
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    softBounced: { type: Number, default: 0 },
    
    // Engagement
    opened: { type: Number, default: 0 },
    uniqueOpens: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    uniqueClicks: { type: Number, default: 0 },
    
    // Negative
    unsubscribed: { type: Number, default: 0 },
    complained: { type: Number, default: 0 },
    
    // Calculated
    openRate: { type: Number, default: 0 },
    clickRate: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
    unsubscribeRate: { type: Number, default: 0 },
    
    // Last updated
    lastUpdated: Date
  },
  
  // Sending progress
  sending: {
    startedAt: Date,
    completedAt: Date,
    progress: { type: Number, default: 0 }, // 0-100
    currentBatch: { type: Number, default: 0 },
    totalBatches: { type: Number, default: 0 },
    lastError: String,
    retryCount: { type: Number, default: 0 }
  },
  
  // Timestamps
  sentAt: Date,
  pausedAt: Date,
  cancelledAt: Date
  
}, { timestamps: true });

// Indexes
campaignSchema.index({ user: 1, status: 1, createdAt: -1 });
campaignSchema.index({ 'schedule.scheduledAt': 1, status: 1 });

// Calculate rates before saving
campaignSchema.pre('save', function(next) {
  if (this.stats.sent > 0) {
    this.stats.openRate = Math.round((this.stats.uniqueOpens / this.stats.sent) * 10000) / 100;
    this.stats.clickRate = Math.round((this.stats.uniqueClicks / this.stats.sent) * 10000) / 100;
    this.stats.bounceRate = Math.round((this.stats.bounced / this.stats.sent) * 10000) / 100;
    this.stats.unsubscribeRate = Math.round((this.stats.unsubscribed / this.stats.sent) * 10000) / 100;
  }
  this.stats.lastUpdated = new Date();
  next();
});

// ==========================================
// CAMPAIGN RECIPIENT MODEL
// Track individual recipients and their engagement
// ==========================================

const campaignRecipientSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailContact' },
  
  // Recipient info
  email: { type: String, required: true, index: true },
  name: String,
  
  // Personalization data
  mergeData: mongoose.Schema.Types.Mixed,
  
  // A/B test variant
  variant: String, // 'A', 'B', etc.
  
  // Delivery status
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed'],
    default: 'pending',
    index: true
  },
  
  // SES tracking
  sesMessageId: String,
  
  // Timestamps
  sentAt: Date,
  deliveredAt: Date,
  bouncedAt: Date,
  
  // Engagement tracking
  opens: [{
    timestamp: Date,
    ip: String,
    userAgent: String,
    location: {
      country: String,
      city: String
    }
  }],
  clicks: [{
    timestamp: Date,
    url: String,
    ip: String,
    userAgent: String
  }],
  
  // First engagement
  firstOpenedAt: Date,
  firstClickedAt: Date,
  
  // Error info
  error: {
    type: String,
    message: String,
    timestamp: Date
  }
  
}, { timestamps: true });

// Compound indexes for efficient queries
campaignRecipientSchema.index({ campaign: 1, status: 1 });
campaignRecipientSchema.index({ campaign: 1, email: 1 }, { unique: true });
campaignRecipientSchema.index({ sesMessageId: 1 });

// ==========================================
// CONTACT LIST MODEL
// Mailing lists for campaigns
// ==========================================

const contactListSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  name: { type: String, required: true },
  description: String,
  
  // Stats
  subscriberCount: { type: Number, default: 0 },
  activeCount: { type: Number, default: 0 },
  unsubscribedCount: { type: Number, default: 0 },
  
  // Settings
  doubleOptIn: { type: Boolean, default: false },
  welcomeEmail: {
    enabled: { type: Boolean, default: false },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' }
  },
  
  // Default tags for new subscribers
  defaultTags: [String],
  
  // Custom fields schema
  customFields: [{
    name: String,
    type: { type: String, enum: ['text', 'number', 'date', 'boolean', 'select'] },
    required: Boolean,
    options: [String] // For select type
  }],
  
  // Import history
  lastImport: {
    date: Date,
    count: Number,
    source: String
  }
  
}, { timestamps: true });

contactListSchema.index({ user: 1, name: 1 });

// ==========================================
// EMAIL TEMPLATE MODEL
// Reusable email templates
// ==========================================

const emailTemplateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // null for system templates
  
  name: { type: String, required: true },
  description: String,
  
  // Template type
  type: { 
    type: String, 
    enum: ['system', 'user', 'shared'],
    default: 'user'
  },
  
  // Category
  category: { 
    type: String, 
    enum: ['newsletter', 'promotional', 'transactional', 'welcome', 'notification', 'other'],
    default: 'other'
  },
  
  // Content
  subject: String,
  previewText: String,
  content: {
    html: String,
    text: String,
    json: mongoose.Schema.Types.Mixed // Drag-drop editor state
  },
  
  // Thumbnail preview
  thumbnail: String, // URL to preview image
  
  // Design info
  design: {
    width: { type: Number, default: 600 },
    backgroundColor: { type: String, default: '#ffffff' },
    fontFamily: { type: String, default: 'Arial, sans-serif' }
  },
  
  // Stats
  usageCount: { type: Number, default: 0 },
  lastUsed: Date,
  
  // Is active
  isActive: { type: Boolean, default: true }
  
}, { timestamps: true });

emailTemplateSchema.index({ user: 1, type: 1 });
emailTemplateSchema.index({ category: 1, isActive: 1 });

// ==========================================
// UNSUBSCRIBE MODEL
// Track unsubscribes for compliance
// ==========================================

const unsubscribeSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  
  // Who owns this list
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Source
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  source: { 
    type: String, 
    enum: ['link', 'complaint', 'manual', 'bounce', 'import'],
    default: 'link'
  },
  
  // Reason (if provided)
  reason: String,
  feedback: String,
  
  // Scope
  scope: {
    type: String,
    enum: ['all', 'campaign', 'list'],
    default: 'all'
  },
  list: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
  
  // IP for compliance
  ip: String,
  userAgent: String
  
}, { timestamps: true });

unsubscribeSchema.index({ user: 1, email: 1 }, { unique: true });

// ==========================================
// EXPORT MODELS
// ==========================================

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const CampaignRecipient = mongoose.models.CampaignRecipient || mongoose.model('CampaignRecipient', campaignRecipientSchema);
const ContactList = mongoose.models.ContactList || mongoose.model('ContactList', contactListSchema);
const EmailTemplate = mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', emailTemplateSchema);
const Unsubscribe = mongoose.models.Unsubscribe || mongoose.model('Unsubscribe', unsubscribeSchema);

module.exports = {
  Campaign,
  CampaignRecipient,
  ContactList,
  EmailTemplate,
  Unsubscribe
};
