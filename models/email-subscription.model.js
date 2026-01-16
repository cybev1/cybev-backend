// ============================================
// FILE: models/email-subscription.model.js
// CYBEV Email Platform Subscription & Limits
// VERSION: 1.0.0 - Monetization Tiers
// ============================================

const mongoose = require('mongoose');

// ==========================================
// EMAIL SUBSCRIPTION PLAN MODEL
// Defines available plans and limits
// ==========================================

const emailPlanSchema = new mongoose.Schema({
  planId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  
  price: {
    monthly: { type: Number, default: 0 },
    yearly: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' }
  },
  
  limits: {
    cybevAddresses: { type: Number, default: 1 },
    customDomains: { type: Number, default: 0 },
    addressesPerDomain: { type: Number, default: 1 },
    emailsPerMonth: { type: Number, default: 500 },
    emailsPerDay: { type: Number, default: 50 },
    contacts: { type: Number, default: 500 },
    contactLists: { type: Number, default: 3 },
    campaignsPerMonth: { type: Number, default: 5 },
    recipientsPerCampaign: { type: Number, default: 500 },
    automations: { type: Number, default: 1 },
    automationSteps: { type: Number, default: 5 },
    activeAutomationSubscribers: { type: Number, default: 100 },
    templates: { type: Number, default: 5 },
    attachmentStorageMB: { type: Number, default: 100 },
    fullInbox: { type: Boolean, default: false },
    inboxRetentionDays: { type: Number, default: 30 }
  },
  
  features: {
    sendEmail: { type: Boolean, default: true },
    receiveEmail: { type: Boolean, default: false },
    customDomain: { type: Boolean, default: false },
    campaigns: { type: Boolean, default: true },
    abTesting: { type: Boolean, default: false },
    sendTimeOptimization: { type: Boolean, default: false },
    advancedAnalytics: { type: Boolean, default: false },
    automations: { type: Boolean, default: false },
    advancedAutomations: { type: Boolean, default: false },
    conditionalLogic: { type: Boolean, default: false },
    dragDropEditor: { type: Boolean, default: true },
    customHtml: { type: Boolean, default: false },
    templateLibrary: { type: Boolean, default: true },
    apiAccess: { type: Boolean, default: false },
    webhooks: { type: Boolean, default: false },
    zapierIntegration: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    dedicatedManager: { type: Boolean, default: false },
    removeBranding: { type: Boolean, default: false },
    customBranding: { type: Boolean, default: false }
  },
  
  isPopular: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  stripeProductId: String,
  stripePriceIdMonthly: String,
  stripePriceIdYearly: String
  
}, { timestamps: true });

// ==========================================
// USER EMAIL SUBSCRIPTION MODEL
// ==========================================

const userEmailSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  
  plan: { type: String, default: 'free', index: true },
  planDetails: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailPlan' },
  
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'none'], default: 'none' },
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  paymentStatus: {
    type: String,
    enum: ['active', 'past_due', 'cancelled', 'trialing', 'none'],
    default: 'none'
  },
  
  trialEndsAt: Date,
  hasUsedTrial: { type: Boolean, default: false },
  
  usage: {
    emailsSentThisMonth: { type: Number, default: 0 },
    emailsSentToday: { type: Number, default: 0 },
    lastEmailSentDate: Date,
    totalContacts: { type: Number, default: 0 },
    contactListsCount: { type: Number, default: 0 },
    campaignsSentThisMonth: { type: Number, default: 0 },
    activeAutomations: { type: Number, default: 0 },
    activeAutomationSubscribers: { type: Number, default: 0 },
    attachmentStorageUsedMB: { type: Number, default: 0 },
    usageResetDate: Date
  },
  
  overage: {
    allowOverage: { type: Boolean, default: false },
    overageEmailPrice: { type: Number, default: 0.001 },
    overageEmailsSent: { type: Number, default: 0 },
    overageCharge: { type: Number, default: 0 }
  },
  
  planHistory: [{
    plan: String,
    startedAt: Date,
    endedAt: Date,
    reason: String
  }],
  
  cancelAtPeriodEnd: { type: Boolean, default: false },
  cancelledAt: Date,
  cancellationReason: String,
  
  addons: {
    extraEmails: { type: Number, default: 0 },
    extraContacts: { type: Number, default: 0 },
    extraStorage: { type: Number, default: 0 }
  }
  
}, { timestamps: true });

// ==========================================
// USAGE LOG MODEL
// ==========================================

const usageLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  period: { type: String, required: true },
  emailsSent: { type: Number, default: 0 },
  emailsReceived: { type: Number, default: 0 },
  campaignsSent: { type: Number, default: 0 },
  contactsAdded: { type: Number, default: 0 },
  automationEmailsSent: { type: Number, default: 0 },
  opens: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  bounces: { type: Number, default: 0 },
  complaints: { type: Number, default: 0 },
  unsubscribes: { type: Number, default: 0 },
  peakStorageMB: { type: Number, default: 0 },
  dailyStats: [{
    date: Date,
    emailsSent: Number,
    opens: Number,
    clicks: Number
  }]
}, { timestamps: true });

usageLogSchema.index({ user: 1, period: 1 }, { unique: true });

// ==========================================
// STATIC METHODS - Initialize Plans
// ==========================================

emailPlanSchema.statics.initializeDefaultPlans = async function() {
  const plans = [
    {
      planId: 'free',
      name: 'Free',
      description: 'Get started with email marketing',
      price: { monthly: 0, yearly: 0 },
      limits: {
        cybevAddresses: 1, customDomains: 0, emailsPerMonth: 500, emailsPerDay: 50,
        contacts: 500, contactLists: 3, campaignsPerMonth: 5, recipientsPerCampaign: 500,
        automations: 1, automationSteps: 5, activeAutomationSubscribers: 100,
        templates: 5, attachmentStorageMB: 100, fullInbox: false, inboxRetentionDays: 30
      },
      features: {
        sendEmail: true, receiveEmail: false, customDomain: false, campaigns: true,
        abTesting: false, advancedAnalytics: false, automations: true, advancedAutomations: false,
        dragDropEditor: true, customHtml: false, templateLibrary: true, apiAccess: false,
        webhooks: false, prioritySupport: false, removeBranding: false
      },
      displayOrder: 1
    },
    {
      planId: 'pro',
      name: 'Pro',
      description: 'For growing creators and businesses',
      price: { monthly: 9.99, yearly: 99.99 },
      limits: {
        cybevAddresses: 5, customDomains: 1, addressesPerDomain: 5,
        emailsPerMonth: 10000, emailsPerDay: 1000, contacts: 5000, contactLists: 20,
        campaignsPerMonth: 50, recipientsPerCampaign: 5000, automations: 10,
        automationSteps: 20, activeAutomationSubscribers: 2500, templates: 50,
        attachmentStorageMB: 1000, fullInbox: true, inboxRetentionDays: 90
      },
      features: {
        sendEmail: true, receiveEmail: true, customDomain: true, campaigns: true,
        abTesting: true, advancedAnalytics: true, automations: true, advancedAutomations: true,
        conditionalLogic: true, dragDropEditor: true, customHtml: true, templateLibrary: true,
        apiAccess: false, webhooks: true, prioritySupport: true, removeBranding: true
      },
      isPopular: true,
      displayOrder: 2
    },
    {
      planId: 'business',
      name: 'Business',
      description: 'For teams and high-volume senders',
      price: { monthly: 29.99, yearly: 299.99 },
      limits: {
        cybevAddresses: -1, customDomains: 5, addressesPerDomain: 20,
        emailsPerMonth: 100000, emailsPerDay: 10000, contacts: 50000, contactLists: 100,
        campaignsPerMonth: -1, recipientsPerCampaign: 50000, automations: -1,
        automationSteps: -1, activeAutomationSubscribers: 25000, templates: -1,
        attachmentStorageMB: 10000, fullInbox: true, inboxRetentionDays: 365
      },
      features: {
        sendEmail: true, receiveEmail: true, customDomain: true, campaigns: true,
        abTesting: true, sendTimeOptimization: true, advancedAnalytics: true,
        automations: true, advancedAutomations: true, conditionalLogic: true,
        dragDropEditor: true, customHtml: true, templateLibrary: true,
        apiAccess: true, webhooks: true, zapierIntegration: true,
        prioritySupport: true, removeBranding: true, customBranding: true
      },
      displayOrder: 3
    },
    {
      planId: 'enterprise',
      name: 'Enterprise',
      description: 'Custom solutions for large organizations',
      price: { monthly: 99.99, yearly: 999.99 },
      limits: {
        cybevAddresses: -1, customDomains: -1, addressesPerDomain: -1,
        emailsPerMonth: -1, emailsPerDay: -1, contacts: -1, contactLists: -1,
        campaignsPerMonth: -1, recipientsPerCampaign: -1, automations: -1,
        automationSteps: -1, activeAutomationSubscribers: -1, templates: -1,
        attachmentStorageMB: -1, fullInbox: true, inboxRetentionDays: -1
      },
      features: {
        sendEmail: true, receiveEmail: true, customDomain: true, campaigns: true,
        abTesting: true, sendTimeOptimization: true, advancedAnalytics: true,
        automations: true, advancedAutomations: true, conditionalLogic: true,
        dragDropEditor: true, customHtml: true, templateLibrary: true,
        apiAccess: true, webhooks: true, zapierIntegration: true,
        prioritySupport: true, dedicatedManager: true, removeBranding: true, customBranding: true
      },
      displayOrder: 4
    }
  ];
  
  for (const plan of plans) {
    await this.findOneAndUpdate({ planId: plan.planId }, plan, { upsert: true, new: true });
  }
  console.log('📧 Email plans initialized');
};

// ==========================================
// INSTANCE METHODS
// ==========================================

userEmailSubscriptionSchema.methods.checkLimit = function(limitName, currentValue) {
  const plan = this.planDetails;
  if (!plan) return { allowed: true };
  const limit = plan.limits[limitName];
  if (limit === -1) return { allowed: true, unlimited: true };
  return { allowed: currentValue < limit, current: currentValue, limit, remaining: Math.max(0, limit - currentValue) };
};

userEmailSubscriptionSchema.methods.hasFeature = function(featureName) {
  if (!this.planDetails) return false;
  return this.planDetails.features[featureName] === true;
};

userEmailSubscriptionSchema.methods.incrementUsage = async function(field, amount = 1) {
  const update = { $inc: {} };
  update.$inc[`usage.${field}`] = amount;
  
  if (field === 'emailsSentToday') {
    const today = new Date().toDateString();
    const lastSentDate = this.usage.lastEmailSentDate?.toDateString();
    if (lastSentDate !== today) {
      update.$set = { 'usage.emailsSentToday': amount, 'usage.lastEmailSentDate': new Date() };
      delete update.$inc['usage.emailsSentToday'];
    } else {
      update.$set = { 'usage.lastEmailSentDate': new Date() };
    }
  }
  
  return await this.model('UserEmailSubscription').findByIdAndUpdate(this._id, update, { new: true });
};

// ==========================================
// EXPORT MODELS
// ==========================================

const EmailPlan = mongoose.models.EmailPlan || mongoose.model('EmailPlan', emailPlanSchema);
const UserEmailSubscription = mongoose.models.UserEmailSubscription || mongoose.model('UserEmailSubscription', userEmailSubscriptionSchema);
const UsageLog = mongoose.models.UsageLog || mongoose.model('UsageLog', usageLogSchema);

module.exports = { EmailPlan, UserEmailSubscription, UsageLog };
