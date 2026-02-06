// ============================================
// FILE: models/form.model.js
// CYBEV Form Builder Models - Pop-ups, Embedded, Landing Pages
// VERSION: 1.0.0 - Klaviyo-Quality Forms
// ============================================

const mongoose = require('mongoose');

// ==========================================
// FORM SCHEMA
// ==========================================

const formSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Basic info
  name: { type: String, required: true },
  description: { type: String },
  
  // Form type
  type: { 
    type: String, 
    enum: ['popup', 'embedded', 'flyout', 'fullscreen', 'banner', 'landing'],
    default: 'popup'
  },
  
  // Status
  status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },
  
  // Design
  design: {
    // Layout
    layout: { type: String, enum: ['single', 'two-column', 'image-left', 'image-right'], default: 'single' },
    width: { type: Number, default: 400 },
    padding: { type: Number, default: 24 },
    borderRadius: { type: Number, default: 12 },
    
    // Colors
    backgroundColor: { type: String, default: '#ffffff' },
    textColor: { type: String, default: '#1f2937' },
    accentColor: { type: String, default: '#7c3aed' },
    
    // Typography
    fontFamily: { type: String, default: 'Inter, sans-serif' },
    headingSize: { type: Number, default: 24 },
    bodySize: { type: Number, default: 14 },
    
    // Image
    image: {
      url: String,
      position: { type: String, enum: ['top', 'left', 'right', 'background'], default: 'top' },
      size: { type: String, enum: ['cover', 'contain', 'auto'], default: 'cover' }
    },
    
    // Custom CSS
    customCSS: String
  },
  
  // Content
  content: {
    heading: { type: String, default: 'Join our newsletter' },
    subheading: { type: String, default: 'Get exclusive updates and offers' },
    successMessage: { type: String, default: 'Thanks for subscribing!' },
    submitButtonText: { type: String, default: 'Subscribe' },
    privacyText: String,
    privacyLink: String
  },
  
  // Form fields
  fields: [{
    id: { type: String, required: true },
    type: { type: String, enum: ['email', 'text', 'phone', 'select', 'checkbox', 'date'], required: true },
    label: { type: String, required: true },
    placeholder: String,
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    options: [String], // For select fields
    validation: {
      pattern: String,
      minLength: Number,
      maxLength: Number
    },
    mapTo: { type: String, enum: ['email', 'firstName', 'lastName', 'phone', 'company', 'custom'] }
  }],
  
  // Targeting & Display Rules
  targeting: {
    // When to show
    trigger: { 
      type: String, 
      enum: ['immediate', 'delay', 'scroll', 'exit', 'click'],
      default: 'delay'
    },
    delay: { type: Number, default: 5 }, // seconds
    scrollPercentage: { type: Number, default: 50 },
    clickSelector: String,
    
    // Frequency
    showOnce: { type: Boolean, default: false },
    showEvery: { type: Number, default: 7 }, // days
    maxShows: { type: Number, default: 3 },
    
    // Pages
    showOn: { type: String, enum: ['all', 'specific', 'exclude'], default: 'all' },
    pageUrls: [String],
    excludeUrls: [String],
    
    // Devices
    devices: {
      desktop: { type: Boolean, default: true },
      tablet: { type: Boolean, default: true },
      mobile: { type: Boolean, default: true }
    },
    
    // Visitor targeting
    visitorType: { type: String, enum: ['all', 'new', 'returning'], default: 'all' },
    
    // Geographic
    countries: [String],
    excludeCountries: [String]
  },
  
  // Integration
  integration: {
    // Where to save contacts
    addToList: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
    addTags: [String],
    
    // Double opt-in
    doubleOptIn: { type: Boolean, default: false },
    confirmationEmailId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    
    // Automation trigger
    triggerAutomation: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation' },
    
    // Webhooks
    webhookUrl: String,
    
    // Third-party
    zapierWebhook: String,
    googleAnalyticsEvent: String
  },
  
  // Embed code (generated)
  embedCode: String,
  shortCode: { type: String, unique: true, sparse: true },
  
  // Stats
  stats: {
    views: { type: Number, default: 0 },
    submissions: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 }
  }
}, { timestamps: true });

// Generate short code for embedding
formSchema.pre('save', function(next) {
  if (!this.shortCode) {
    this.shortCode = 'frm_' + Math.random().toString(36).substring(2, 10);
  }
  
  // Calculate conversion rate
  if (this.stats.views > 0) {
    this.stats.conversionRate = (this.stats.submissions / this.stats.views * 100).toFixed(2);
  }
  
  next();
});

// ==========================================
// FORM SUBMISSION SCHEMA
// ==========================================

const formSubmissionSchema = new mongoose.Schema({
  form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Submitted data
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  email: { type: String, index: true },
  
  // Contact created
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignContact' },
  
  // Source info
  source: {
    url: String,
    referrer: String,
    userAgent: String,
    ip: String,
    country: String,
    city: String,
    device: { type: String, enum: ['desktop', 'tablet', 'mobile'] }
  },
  
  // UTM parameters
  utm: {
    source: String,
    medium: String,
    campaign: String,
    term: String,
    content: String
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'unsubscribed'],
    default: 'pending'
  },
  confirmedAt: Date
}, { timestamps: true });

formSubmissionSchema.index({ form: 1, createdAt: -1 });
formSubmissionSchema.index({ email: 1, form: 1 });

// ==========================================
// EXPORTS
// ==========================================

const Form = mongoose.models.Form || mongoose.model('Form', formSchema);
const FormSubmission = mongoose.models.FormSubmission || mongoose.model('FormSubmission', formSubmissionSchema);

module.exports = { Form, FormSubmission };
