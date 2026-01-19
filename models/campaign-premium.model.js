// ============================================
// CYBEV Premium Email Campaign Model v3.0
// World-Class Email Marketing Platform
// ============================================

const mongoose = require('mongoose');

// Campaign Schema - Full Featured
const campaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Basic Info
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['email', 'sms', 'whatsapp', 'push', 'automation'], default: 'email' },
  status: { type: String, enum: ['draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'archived'], default: 'draft', index: true },
  
  // Sender
  sender: {
    emailAddressId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailAddress' },
    email: String,
    name: String,
    replyTo: String,
    domain: String,
    domainVerified: { type: Boolean, default: false }
  },
  
  // Content
  content: {
    subject: { type: String, required: true },
    preheader: String,
    blocks: [{ id: String, type: String, content: mongoose.Schema.Types.Mixed, styles: mongoose.Schema.Types.Mixed, mobile: mongoose.Schema.Types.Mixed, conditions: mongoose.Schema.Types.Mixed, order: Number }],
    html: String,
    text: String,
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' },
    personalization: { enabled: { type: Boolean, default: true }, defaultValues: mongoose.Schema.Types.Mixed, dynamicContent: mongoose.Schema.Types.Mixed }
  },
  
  // A/B Testing
  abTest: {
    enabled: { type: Boolean, default: false },
    type: { type: String, enum: ['subject', 'content', 'sender', 'sendTime'], default: 'subject' },
    variants: [{
      id: String, name: String, weight: { type: Number, default: 50 },
      subject: String, preheader: String, senderName: String, senderEmail: String,
      content: mongoose.Schema.Types.Mixed,
      stats: { sent: { type: Number, default: 0 }, delivered: { type: Number, default: 0 }, opens: { type: Number, default: 0 }, uniqueOpens: { type: Number, default: 0 }, clicks: { type: Number, default: 0 }, uniqueClicks: { type: Number, default: 0 }, unsubscribes: { type: Number, default: 0 }, bounces: { type: Number, default: 0 }, conversions: { type: Number, default: 0 }, revenue: { type: Number, default: 0 } },
      openRate: { type: Number, default: 0 }, clickRate: { type: Number, default: 0 }, conversionRate: { type: Number, default: 0 }
    }],
    winnerCriteria: { type: String, enum: ['opens', 'clicks', 'conversions', 'revenue', 'manual'], default: 'opens' },
    testSize: { type: Number, default: 20 },
    testDuration: { type: Number, default: 4 },
    autoSelectWinner: { type: Boolean, default: true },
    winnerVariantId: String,
    winnerSelectedAt: Date
  },
  
  // Audience
  audience: {
    type: { type: String, enum: ['all', 'segment', 'list', 'tags', 'custom', 'behavior'], default: 'all' },
    lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
    includeTags: [String],
    excludeTags: [String],
    tagOperator: { type: String, enum: ['any', 'all'], default: 'any' },
    segments: [{ id: String, name: String, conditions: mongoose.Schema.Types.Mixed, operator: { type: String, enum: ['and', 'or'], default: 'and' } }],
    behavior: {
      hasOpened: { campaigns: [mongoose.Schema.Types.ObjectId], inDays: Number },
      hasClicked: { campaigns: [mongoose.Schema.Types.ObjectId], inDays: Number },
      hasNotOpened: { campaigns: [mongoose.Schema.Types.ObjectId], inDays: Number },
      hasNotClicked: { campaigns: [mongoose.Schema.Types.ObjectId], inDays: Number },
      visitedPage: { urls: [String], inDays: Number },
      purchasedProduct: { productIds: [String], inDays: Number },
      cartAbandoned: { inDays: Number },
      engagementScore: { min: Number, max: Number }
    },
    suppressions: {
      excludeUnsubscribed: { type: Boolean, default: true },
      excludeBounced: { type: Boolean, default: true },
      excludeComplained: { type: Boolean, default: true },
      excludeSentRecently: { days: Number, campaigns: [mongoose.Schema.Types.ObjectId] },
      excludeEmails: [String]
    },
    estimatedSize: { type: Number, default: 0 },
    actualSize: { type: Number, default: 0 }
  },
  
  // Scheduling
  schedule: {
    type: { type: String, enum: ['immediate', 'scheduled', 'optimal', 'recurring'], default: 'immediate' },
    scheduledAt: Date,
    timezone: { type: String, default: 'UTC' },
    sendTimeOptimization: {
      enabled: { type: Boolean, default: false },
      strategy: { type: String, enum: ['engagement', 'timezone', 'custom'], default: 'engagement' },
      useIndividualTimes: { type: Boolean, default: false },
      localTimezone: { type: Boolean, default: false },
      preferredHour: { type: Number, default: 10 },
      sendWindow: { enabled: { type: Boolean, default: false }, startHour: { type: Number, default: 9 }, endHour: { type: Number, default: 17 }, daysOfWeek: [Number] }
    },
    recurring: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly', 'custom'] },
      interval: Number, daysOfWeek: [Number], dayOfMonth: Number, time: String, endDate: Date, maxOccurrences: Number,
      occurrenceCount: { type: Number, default: 0 }, lastSentAt: Date, nextSendAt: Date
    },
    throttle: { enabled: { type: Boolean, default: false }, maxPerHour: { type: Number, default: 10000 }, maxPerDay: { type: Number, default: 100000 } }
  },
  
  // Tracking
  tracking: {
    openTracking: { type: Boolean, default: true },
    clickTracking: { type: Boolean, default: true },
    googleAnalytics: { enabled: { type: Boolean, default: false }, utmSource: String, utmMedium: { type: String, default: 'email' }, utmCampaign: String, utmTerm: String, utmContent: String },
    conversions: { enabled: { type: Boolean, default: false }, goalType: { type: String, enum: ['pageview', 'event', 'purchase', 'signup'] }, goalUrl: String, goalValue: Number, attributionWindow: { type: Number, default: 7 } },
    customPixels: [{ name: String, url: String, position: { type: String, enum: ['top', 'bottom'], default: 'bottom' } }]
  },
  
  // Stats
  stats: {
    recipientCount: { type: Number, default: 0 },
    sent: { type: Number, default: 0 }, delivered: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 }, softBounced: { type: Number, default: 0 }, hardBounced: { type: Number, default: 0 },
    opens: { type: Number, default: 0 }, uniqueOpens: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 }, uniqueClicks: { type: Number, default: 0 },
    unsubscribes: { type: Number, default: 0 }, complaints: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 }, revenue: { type: Number, default: 0 },
    openRate: { type: Number, default: 0 }, clickRate: { type: Number, default: 0 }, clickToOpenRate: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 }, unsubscribeRate: { type: Number, default: 0 }, complaintRate: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 }, revenuePerEmail: { type: Number, default: 0 },
    linkClicks: [{ url: String, text: String, clicks: { type: Number, default: 0 }, uniqueClicks: { type: Number, default: 0 } }],
    devices: { desktop: { type: Number, default: 0 }, mobile: { type: Number, default: 0 }, tablet: { type: Number, default: 0 } },
    emailClients: [{ name: String, count: { type: Number, default: 0 }, percentage: { type: Number, default: 0 } }],
    countries: [{ code: String, name: String, opens: { type: Number, default: 0 }, clicks: { type: Number, default: 0 } }],
    timeline: [{ timestamp: Date, opens: { type: Number, default: 0 }, clicks: { type: Number, default: 0 }, unsubscribes: { type: Number, default: 0 } }],
    lastUpdated: Date
  },
  
  // Sending State
  sending: {
    startedAt: Date, completedAt: Date, progress: { type: Number, default: 0 },
    currentBatch: { type: Number, default: 0 }, totalBatches: { type: Number, default: 0 },
    lastError: String, retryCount: { type: Number, default: 0 },
    isPaused: { type: Boolean, default: false }, pausedAt: Date, resumedAt: Date
  },
  
  // Metadata
  tags: [String], folder: String, notes: String,
  sentAt: Date, pausedAt: Date, cancelledAt: Date, archivedAt: Date
}, { timestamps: true });

campaignSchema.index({ user: 1, status: 1, createdAt: -1 });
campaignSchema.index({ 'schedule.scheduledAt': 1, status: 1 });

// Auto-calculate rates
campaignSchema.pre('save', function(next) {
  const s = this.stats;
  if (s.delivered > 0) {
    s.openRate = Math.round((s.uniqueOpens / s.delivered) * 10000) / 100;
    s.clickRate = Math.round((s.uniqueClicks / s.delivered) * 10000) / 100;
    s.bounceRate = Math.round((s.bounced / s.sent) * 10000) / 100;
    s.unsubscribeRate = Math.round((s.unsubscribes / s.delivered) * 10000) / 100;
  }
  if (s.uniqueOpens > 0) s.clickToOpenRate = Math.round((s.uniqueClicks / s.uniqueOpens) * 10000) / 100;
  s.lastUpdated = new Date();
  next();
});

// Campaign Recipient Schema
const recipientSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailContact' },
  email: { type: String, required: true, lowercase: true },
  name: String,
  mergeData: mongoose.Schema.Types.Mixed,
  variantId: String,
  status: { type: String, enum: ['queued', 'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed', 'skipped'], default: 'queued', index: true },
  skipReason: String,
  messageId: String,
  providerResponse: mongoose.Schema.Types.Mixed,
  queuedAt: { type: Date, default: Date.now },
  sentAt: Date, deliveredAt: Date, bouncedAt: Date, complainedAt: Date, unsubscribedAt: Date, failedAt: Date,
  bounce: { type: { type: String, enum: ['hard', 'soft', 'undetermined'] }, subType: String, diagnosticCode: String, timestamp: Date },
  opens: [{ timestamp: { type: Date, default: Date.now }, ip: String, userAgent: String, device: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'] }, emailClient: String, os: String, browser: String, location: { country: String, countryCode: String, region: String, city: String, latitude: Number, longitude: Number } }],
  firstOpenedAt: Date, lastOpenedAt: Date, openCount: { type: Number, default: 0 },
  clicks: [{ timestamp: { type: Date, default: Date.now }, url: String, linkText: String, ip: String, userAgent: String, device: String, location: mongoose.Schema.Types.Mixed }],
  firstClickedAt: Date, lastClickedAt: Date, clickCount: { type: Number, default: 0 },
  conversions: [{ timestamp: Date, type: String, value: Number, metadata: mongoose.Schema.Types.Mixed }],
  totalConversionValue: { type: Number, default: 0 },
  optimalSendTime: Date, actualSendTime: Date,
  errors: [{ timestamp: Date, type: String, message: String, code: String }],
  retryCount: { type: Number, default: 0 }, lastRetryAt: Date
}, { timestamps: true });

recipientSchema.index({ campaign: 1, status: 1 });
recipientSchema.index({ campaign: 1, email: 1 }, { unique: true });
recipientSchema.index({ messageId: 1 });

// Email Template Schema
const templateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['system', 'user', 'shared', 'marketplace'], default: 'user' },
  category: { type: String, enum: ['newsletter', 'promotional', 'transactional', 'welcome', 'announcement', 'event', 'survey', 'educational', 'abandoned_cart', 're_engagement', 'thank_you', 'receipt', 'notification', 'digest', 'other'], default: 'other' },
  industry: String,
  thumbnail: String,
  previewUrl: String,
  subject: String,
  preheader: String,
  content: { blocks: mongoose.Schema.Types.Mixed, html: String, text: String },
  design: {
    width: { type: Number, default: 600 },
    backgroundColor: { type: String, default: '#f3f4f6' },
    contentBackgroundColor: { type: String, default: '#ffffff' },
    fontFamily: { type: String, default: 'Arial, sans-serif' },
    primaryColor: { type: String, default: '#6366f1' },
    secondaryColor: { type: String, default: '#4f46e5' },
    textColor: { type: String, default: '#1f2937' },
    linkColor: { type: String, default: '#6366f1' }
  },
  mergeTags: [String],
  usageCount: { type: Number, default: 0 },
  lastUsedAt: Date,
  rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  isActive: { type: Boolean, default: true },
  isPublic: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  parentTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' }
}, { timestamps: true });

// Automation Schema
const automationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },
  trigger: {
    type: { type: String, enum: ['subscriber_joined', 'tag_added', 'tag_removed', 'form_submitted', 'link_clicked', 'email_opened', 'purchase_made', 'cart_abandoned', 'date_based', 'api_event', 'manual', 'segment_entered', 'segment_exited'], required: true },
    config: {
      lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
      tags: [String],
      formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form' },
      campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
      linkUrl: String,
      dateField: String,
      daysBefore: Number,
      daysAfter: Number,
      eventName: String,
      segmentId: String
    },
    filters: [{ field: String, operator: String, value: mongoose.Schema.Types.Mixed }]
  },
  steps: [{
    id: { type: String, required: true },
    type: { type: String, enum: ['email', 'sms', 'delay', 'condition', 'split', 'tag_add', 'tag_remove', 'update_contact', 'webhook', 'goal', 'exit', 'move_to_list', 'notify_team'], required: true },
    position: { x: Number, y: Number },
    config: {
      campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
      subject: String,
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' },
      delayType: { type: String, enum: ['duration', 'until_date', 'until_time', 'until_day'] },
      duration: Number,
      durationUnit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'] },
      untilDate: Date, untilTime: String, untilDay: Number,
      conditions: [{ field: String, operator: String, value: mongoose.Schema.Types.Mixed }],
      splitType: { type: String, enum: ['condition', 'random', 'engagement'] },
      splitPercentages: [Number],
      tags: [String],
      updates: mongoose.Schema.Types.Mixed,
      webhookUrl: String, webhookMethod: { type: String, default: 'POST' }, webhookHeaders: mongoose.Schema.Types.Mixed,
      goalType: String, goalValue: Number,
      notifyEmails: [String], notifyMessage: String
    },
    nextSteps: [{ stepId: String, condition: String }],
    stats: { entered: { type: Number, default: 0 }, completed: { type: Number, default: 0 }, failed: { type: Number, default: 0 }, inProgress: { type: Number, default: 0 } }
  }],
  entryStepId: String,
  settings: {
    allowReentry: { type: Boolean, default: false },
    reentryDelay: Number,
    maxEntries: Number,
    goalTracking: { type: Boolean, default: false },
    goalEvent: String,
    exitOnGoal: { type: Boolean, default: true },
    sendOnlyDuring: { enabled: { type: Boolean, default: false }, startHour: Number, endHour: Number, timezone: String, daysOfWeek: [Number] },
    suppressIfCampaignSent: { type: Boolean, default: false },
    suppressionDays: Number
  },
  stats: { totalEntered: { type: Number, default: 0 }, currentlyActive: { type: Number, default: 0 }, completed: { type: Number, default: 0 }, exited: { type: Number, default: 0 }, goalReached: { type: Number, default: 0 }, lastEntryAt: Date },
  activatedAt: Date, pausedAt: Date
}, { timestamps: true });

// Automation Subscriber Schema
const automationSubscriberSchema = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true, index: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailContact', required: true, index: true },
  email: { type: String, required: true, lowercase: true },
  currentStepId: String,
  status: { type: String, enum: ['active', 'waiting', 'completed', 'exited', 'failed', 'paused'], default: 'active' },
  enteredAt: { type: Date, default: Date.now },
  entryCount: { type: Number, default: 1 },
  stepHistory: [{ stepId: String, stepType: String, enteredAt: Date, completedAt: Date, status: { type: String, enum: ['completed', 'skipped', 'failed'] }, result: mongoose.Schema.Types.Mixed, error: String }],
  waitingUntil: Date,
  goalReachedAt: Date, goalValue: Number,
  exitedAt: Date, exitReason: String, exitStepId: String,
  entryData: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Enhanced Contact Schema
const contactSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: { type: String, required: true, lowercase: true },
  firstName: String, lastName: String, name: String,
  phone: String, company: String, jobTitle: String,
  subscribed: { type: Boolean, default: true },
  confirmedAt: Date, unsubscribedAt: Date, unsubscribeReason: String,
  source: { type: String, enum: ['import', 'form', 'api', 'manual', 'integration', 'purchase'], default: 'manual' },
  sourceDetails: { formId: { type: mongoose.Schema.Types.ObjectId }, importId: String, referrer: String, utm: mongoose.Schema.Types.Mixed },
  lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
  tags: [String],
  customFields: mongoose.Schema.Types.Mixed,
  location: { country: String, countryCode: String, region: String, city: String, postalCode: String, timezone: String, latitude: Number, longitude: Number },
  engagement: {
    score: { type: Number, default: 50 },
    level: { type: String, enum: ['cold', 'cool', 'warm', 'hot', 'vip'], default: 'cool' },
    emailsSent: { type: Number, default: 0 }, emailsOpened: { type: Number, default: 0 }, emailsClicked: { type: Number, default: 0 },
    lastEmailSentAt: Date, lastEmailOpenedAt: Date, lastEmailClickedAt: Date,
    openRate: { type: Number, default: 0 }, clickRate: { type: Number, default: 0 },
    lastActivityAt: Date, lastActivityType: String,
    optimalSendTime: { hour: Number, dayOfWeek: Number, timezone: String }
  },
  ecommerce: { totalOrders: { type: Number, default: 0 }, totalSpent: { type: Number, default: 0 }, averageOrderValue: { type: Number, default: 0 }, lastOrderAt: Date, lastOrderValue: Number, predictedLTV: Number },
  deliverability: { bounced: { type: Boolean, default: false }, bounceType: String, bouncedAt: Date, complained: { type: Boolean, default: false }, complainedAt: Date, isValid: { type: Boolean, default: true }, lastValidatedAt: Date },
  signupIp: String, lastIp: String,
  devices: [{ type: { type: String, enum: ['desktop', 'mobile', 'tablet'] }, os: String, browser: String, lastSeenAt: Date }],
  preferredDevice: String, preferredEmailClient: String,
  notes: String
}, { timestamps: true });

contactSchema.index({ user: 1, email: 1 }, { unique: true });
contactSchema.index({ user: 1, subscribed: 1, 'deliverability.bounced': 1 });
contactSchema.index({ user: 1, tags: 1 });
contactSchema.index({ user: 1, 'engagement.score': -1 });

// Auto-calculate engagement
contactSchema.pre('save', function(next) {
  const e = this.engagement;
  if (e.emailsSent > 0) {
    e.openRate = Math.round((e.emailsOpened / e.emailsSent) * 100);
    e.clickRate = Math.round((e.emailsClicked / e.emailsSent) * 100);
  }
  let score = 50;
  if (e.lastActivityAt) {
    const days = (Date.now() - e.lastActivityAt) / (1000 * 60 * 60 * 24);
    if (days < 7) score += 20;
    else if (days < 30) score += 10;
    else if (days > 90) score -= 20;
  }
  score += Math.min(e.openRate / 2, 15);
  score += Math.min(e.clickRate, 15);
  if (this.ecommerce?.totalOrders > 0) score += Math.min(this.ecommerce.totalOrders * 2, 10);
  if (this.deliverability?.bounced) score -= 30;
  if (this.deliverability?.complained) score -= 50;
  if (!this.subscribed) score = 0;
  e.score = Math.max(0, Math.min(100, Math.round(score)));
  if (e.score >= 80) e.level = 'vip';
  else if (e.score >= 60) e.level = 'hot';
  else if (e.score >= 40) e.level = 'warm';
  else if (e.score >= 20) e.level = 'cool';
  else e.level = 'cold';
  next();
});

// Contact List Schema
const listSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  doubleOptIn: { type: Boolean, default: false },
  welcomeEmailId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  defaultTags: [String],
  customFields: [{ key: String, label: String, type: { type: String, enum: ['text', 'number', 'date', 'boolean', 'select', 'multiselect', 'email', 'phone', 'url'] }, required: { type: Boolean, default: false }, options: [String], defaultValue: mongoose.Schema.Types.Mixed }],
  counts: { total: { type: Number, default: 0 }, subscribed: { type: Number, default: 0 }, unsubscribed: { type: Number, default: 0 }, bounced: { type: Number, default: 0 }, cleaned: { type: Number, default: 0 } },
  lastImport: { date: Date, count: Number, source: String, fileName: String }
}, { timestamps: true });

// Segment Schema
const segmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  rules: {
    operator: { type: String, enum: ['and', 'or'], default: 'and' },
    conditions: [{ field: { type: String, required: true }, operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty', 'greater_than', 'less_than', 'between', 'is_true', 'is_false', 'in_list', 'not_in_list', 'before', 'after', 'on', 'within_days', 'not_within_days'], required: true }, value: mongoose.Schema.Types.Mixed, secondValue: mongoose.Schema.Types.Mixed }],
    groups: [{ operator: { type: String, enum: ['and', 'or'] }, conditions: [{ field: String, operator: String, value: mongoose.Schema.Types.Mixed }] }]
  },
  mongoQuery: mongoose.Schema.Types.Mixed,
  cachedCount: { type: Number, default: 0 },
  lastCountedAt: Date,
  isStatic: { type: Boolean, default: false },
  staticContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EmailContact' }]
}, { timestamps: true });

// Subscription Plan Schema
const subscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  displayName: String,
  description: String,
  price: { monthly: Number, yearly: Number, currency: { type: String, default: 'USD' } },
  limits: {
    emailsPerMonth: Number, contacts: Number, lists: Number, automations: Number, customDomains: Number, teamMembers: Number, templates: Number,
    abTesting: { type: Boolean, default: false },
    advancedSegmentation: { type: Boolean, default: false },
    sendTimeOptimization: { type: Boolean, default: false },
    customBranding: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    webhooks: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false }
  },
  isActive: { type: Boolean, default: true },
  sortOrder: Number
}, { timestamps: true });

// User Subscription Schema
const userSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailSubscriptionPlan', required: true },
  planName: String,
  status: { type: String, enum: ['active', 'past_due', 'cancelled', 'trialing'], default: 'active' },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  currentPeriodStart: Date, currentPeriodEnd: Date,
  cancelAtPeriodEnd: { type: Boolean, default: false },
  stripeCustomerId: String, stripeSubscriptionId: String, paymentMethod: String,
  usage: { emailsSent: { type: Number, default: 0 }, emailsRemaining: Number, contacts: { type: Number, default: 0 }, contactsRemaining: Number, lists: { type: Number, default: 0 }, automations: { type: Number, default: 0 }, customDomains: { type: Number, default: 0 }, lastResetAt: Date },
  overage: { enabled: { type: Boolean, default: false }, pricePerEmail: Number, totalOverageThisPeriod: { type: Number, default: 0 } },
  trialEndsAt: Date, trialEmailLimit: Number
}, { timestamps: true });

// Export models
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const CampaignRecipient = mongoose.models.CampaignRecipient || mongoose.model('CampaignRecipient', recipientSchema);
const EmailTemplate = mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', templateSchema);
const Automation = mongoose.models.Automation || mongoose.model('Automation', automationSchema);
const AutomationSubscriber = mongoose.models.AutomationSubscriber || mongoose.model('AutomationSubscriber', automationSubscriberSchema);
const EmailContact = mongoose.models.EmailContact || mongoose.model('EmailContact', contactSchema);
const ContactList = mongoose.models.ContactList || mongoose.model('ContactList', listSchema);
const Segment = mongoose.models.Segment || mongoose.model('Segment', segmentSchema);
const EmailSubscriptionPlan = mongoose.models.EmailSubscriptionPlan || mongoose.model('EmailSubscriptionPlan', subscriptionPlanSchema);
const UserEmailSubscription = mongoose.models.UserEmailSubscription || mongoose.model('UserEmailSubscription', userSubscriptionSchema);

module.exports = { Campaign, CampaignRecipient, EmailTemplate, Automation, AutomationSubscriber, EmailContact, ContactList, Segment, EmailSubscriptionPlan, UserEmailSubscription };
