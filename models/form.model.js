// ============================================
// FILE: models/form.model.js
// Google Forms-like Feature for Campaigns
// VERSION: 1.0.0
// ============================================

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ==========================================
// FORM SCHEMA - Like Google Forms
// ==========================================
const FormSchema = new Schema({
  // Basic Info
  title: { type: String, required: true, trim: true, maxLength: 200 },
  description: { type: String, maxLength: 2000 },
  slug: { type: String, unique: true, lowercase: true },
  
  // Owner
  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Organization link (optional - for church forms)
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  
  // Type
  type: {
    type: String,
    enum: ['survey', 'registration', 'feedback', 'quiz', 'campaign', 'event_rsvp', 'testimony', 'prayer_request', 'general'],
    default: 'general'
  },
  
  // Fields/Questions
  fields: [{
    id: { type: String, required: true }, // unique field ID
    type: {
      type: String,
      enum: ['text', 'textarea', 'email', 'phone', 'number', 'date', 'time', 'datetime', 
             'select', 'multiselect', 'radio', 'checkbox', 'rating', 'scale', 
             'file', 'image', 'signature', 'location', 'url'],
      default: 'text'
    },
    label: { type: String, required: true },
    placeholder: String,
    helpText: String,
    required: { type: Boolean, default: false },
    
    // For select, radio, checkbox, multiselect
    options: [{
      label: String,
      value: String
    }],
    
    // For scale/rating
    scaleMin: { type: Number, default: 1 },
    scaleMax: { type: Number, default: 5 },
    scaleLabels: { min: String, max: String },
    
    // Validation
    validation: {
      minLength: Number,
      maxLength: Number,
      min: Number,
      max: Number,
      pattern: String,
      patternMessage: String
    },
    
    // Conditional logic
    conditional: {
      showIf: {
        fieldId: String,
        operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than'] },
        value: Schema.Types.Mixed
      }
    },
    
    // Layout
    width: { type: String, enum: ['full', 'half', 'third'], default: 'full' },
    order: { type: Number, default: 0 }
  }],
  
  // Sections (for multi-page forms)
  sections: [{
    id: String,
    title: String,
    description: String,
    fieldIds: [String],
    order: { type: Number, default: 0 }
  }],
  
  // Branding
  branding: {
    logo: String,
    headerImage: String,
    backgroundColor: { type: String, default: '#ffffff' },
    primaryColor: { type: String, default: '#7c3aed' },
    fontFamily: { type: String, default: 'Inter' }
  },
  
  // Settings
  settings: {
    // Access
    isPublic: { type: Boolean, default: true },
    requireLogin: { type: Boolean, default: false },
    allowAnonymous: { type: Boolean, default: true },
    oneResponsePerUser: { type: Boolean, default: false },
    
    // Messages
    confirmationMessage: { type: String, default: 'Thank you for your submission!' },
    closedMessage: { type: String, default: 'This form is no longer accepting responses.' },
    
    // Redirect
    redirectUrl: String,
    
    // Notifications
    emailNotifications: { type: Boolean, default: true },
    notifyEmails: [String],
    
    // Limits
    maxResponses: Number,
    startDate: Date,
    endDate: Date,
    
    // Features
    showProgressBar: { type: Boolean, default: true },
    shuffleFields: { type: Boolean, default: false },
    editAfterSubmit: { type: Boolean, default: false }
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'published', 'closed', 'archived'],
    default: 'draft'
  },
  
  // Stats
  stats: {
    views: { type: Number, default: 0 },
    starts: { type: Number, default: 0 },
    completions: { type: Number, default: 0 },
    avgCompletionTime: Number // seconds
  },
  
  // Metadata
  publishedAt: Date,
  closedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
FormSchema.index({ creator: 1, status: 1 });
FormSchema.index({ organization: 1 });
FormSchema.index({ slug: 1 });
FormSchema.index({ status: 1, 'settings.isPublic': 1 });

// Pre-save: Generate slug
FormSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('title')) {
    const baseSlug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    
    let slug = baseSlug;
    let counter = 1;
    
    while (await mongoose.models.Form.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  
  this.updatedAt = new Date();
  next();
});

// ==========================================
// FORM RESPONSE SCHEMA
// ==========================================
const FormResponseSchema = new Schema({
  // Form reference
  form: { type: Schema.Types.ObjectId, ref: 'Form', required: true },
  
  // Respondent
  respondent: { type: Schema.Types.ObjectId, ref: 'User' }, // null if anonymous
  email: String, // for anonymous respondents
  
  // Responses
  responses: [{
    fieldId: { type: String, required: true },
    value: Schema.Types.Mixed, // can be string, number, array, etc.
    displayValue: String // human-readable value
  }],
  
  // Metadata
  ipAddress: String,
  userAgent: String,
  device: String,
  location: {
    city: String,
    country: String,
    coordinates: { lat: Number, lng: Number }
  },
  
  // Timing
  startedAt: Date,
  completedAt: Date,
  completionTime: Number, // seconds
  
  // Status
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'abandoned'],
    default: 'completed'
  },
  
  // For quiz/scored forms
  score: Number,
  maxScore: Number,
  
  createdAt: { type: Date, default: Date.now }
});

// Indexes
FormResponseSchema.index({ form: 1, createdAt: -1 });
FormResponseSchema.index({ form: 1, respondent: 1 });
FormResponseSchema.index({ form: 1, status: 1 });

// ==========================================
// EXPORT MODELS
// ==========================================
module.exports = {
  Form: mongoose.model('Form', FormSchema),
  FormResponse: mongoose.model('FormResponse', FormResponseSchema)
};
