// ============================================
// FILE: models/email.model.js
// CYBEV Email Models - Gmail-like Email System
// VERSION: 1.0.0 - Full Inbox Support
// ============================================

const mongoose = require('mongoose');

// ==========================================
// EMAIL ADDRESS MODEL
// User's email addresses (cybev.io + custom)
// ==========================================

const emailAddressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Email address details
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  domain: { type: String, required: true, index: true },
  localPart: { type: String, required: true }, // part before @
  
  // Type: cybev (free) or custom (verified domain)
  type: { type: String, enum: ['cybev', 'custom'], default: 'cybev' },
  
  // For custom domains
  senderDomain: { type: mongoose.Schema.Types.ObjectId, ref: 'SenderDomain' },
  
  // Status
  isActive: { type: Boolean, default: true },
  isPrimary: { type: Boolean, default: false }, // Primary email for receiving
  
  // Display settings
  displayName: { type: String }, // "John Doe"
  signature: { type: String }, // Email signature HTML
  
  // Stats
  stats: {
    sent: { type: Number, default: 0 },
    received: { type: Number, default: 0 },
    lastSentAt: Date,
    lastReceivedAt: Date
  }
}, { timestamps: true });

emailAddressSchema.index({ user: 1, isPrimary: 1 });

// ==========================================
// SENDER DOMAIN MODEL
// Custom domains for sending emails
// ==========================================

const senderDomainSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Domain info
  domain: { type: String, required: true, lowercase: true, index: true },
  
  // Verification status
  status: { 
    type: String, 
    enum: ['pending', 'verifying', 'verified', 'failed', 'suspended'], 
    default: 'pending' 
  },
  
  // DNS verification records
  verification: {
    txtRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    spfRecord: {
      name: String,
      value: { type: String, default: 'v=spf1 include:amazonses.com ~all' },
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    dkimRecords: [{
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    }],
    dmarcRecord: {
      name: String,
      value: { type: String, default: 'v=DMARC1; p=none; rua=mailto:dmarc@cybev.io' },
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    mxRecords: [{  // For receiving emails
      name: String,
      value: String,
      priority: Number,
      verified: { type: Boolean, default: false }
    }]
  },
  
  // SES specific
  sesIdentityArn: String,
  dkimTokens: [String],
  
  // Settings
  settings: {
    allowReceiving: { type: Boolean, default: false }, // MX records configured
    defaultFromName: String,
    replyToEmail: String,
    catchAll: { type: Boolean, default: false } // Receive all emails to any address
  },
  
  // Verification attempts
  lastVerificationAttempt: Date,
  verificationAttempts: { type: Number, default: 0 },
  verifiedAt: Date,
  
  // Usage stats
  stats: {
    emailsSent: { type: Number, default: 0 },
    emailsReceived: { type: Number, default: 0 },
    bounces: { type: Number, default: 0 },
    complaints: { type: Number, default: 0 }
  }
}, { timestamps: true });

senderDomainSchema.index({ user: 1, status: 1 });
senderDomainSchema.index({ domain: 1 }, { unique: true });

// ==========================================
// EMAIL MESSAGE MODEL
// Individual emails (inbox, sent, drafts)
// ==========================================

const emailMessageSchema = new mongoose.Schema({
  // Owner and email address
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  emailAddress: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailAddress', index: true },
  
  // Message ID (for threading)
  messageId: { type: String, unique: true, sparse: true, index: true },
  inReplyTo: String, // Parent message ID
  references: [String], // Thread message IDs
  
  // Thread grouping
  threadId: { type: String, index: true },
  threadPosition: { type: Number, default: 0 },
  
  // Folder/status
  folder: { 
    type: String, 
    enum: ['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive'],
    default: 'inbox',
    index: true
  },
  
  // Direction
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  
  // Addresses
  from: {
    email: { type: String, required: true },
    name: String
  },
  to: [{
    email: { type: String, required: true },
    name: String
  }],
  cc: [{
    email: String,
    name: String
  }],
  bcc: [{
    email: String,
    name: String
  }],
  replyTo: {
    email: String,
    name: String
  },
  
  // Content
  subject: { type: String, default: '(No Subject)' },
  bodyText: String,
  bodyHtml: String,
  snippet: String, // Preview text (first 200 chars)
  
  // Attachments
  attachments: [{
    filename: String,
    contentType: String,
    size: Number,
    url: String, // S3 URL
    contentId: String // For inline images
  }],
  
  // Status flags
  isRead: { type: Boolean, default: false, index: true },
  isStarred: { type: Boolean, default: false, index: true },
  isImportant: { type: Boolean, default: false },
  isDraft: { type: Boolean, default: false },
  
  // Labels/Tags
  labels: [{ type: String, index: true }],
  
  // Campaign association
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  
  // Tracking (for sent emails)
  tracking: {
    opens: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    firstOpenedAt: Date,
    lastOpenedAt: Date,
    clickedLinks: [{
      url: String,
      clicks: Number,
      firstClickedAt: Date
    }]
  },
  
  // Delivery status (for outbound)
  delivery: {
    status: { 
      type: String, 
      enum: ['pending', 'sent', 'delivered', 'bounced', 'complained', 'failed'],
      default: 'pending'
    },
    sesMessageId: String,
    sentAt: Date,
    deliveredAt: Date,
    bouncedAt: Date,
    bounceType: String,
    bounceMessage: String
  },
  
  // Metadata
  headers: mongoose.Schema.Types.Mixed, // Raw email headers
  rawSize: Number, // Size in bytes
  
  // Scheduling
  scheduledAt: Date,
  
  // Soft delete
  deletedAt: Date
}, { timestamps: true });

// Indexes for efficient queries
emailMessageSchema.index({ user: 1, folder: 1, createdAt: -1 });
emailMessageSchema.index({ user: 1, threadId: 1 });
emailMessageSchema.index({ user: 1, isRead: 1 });
emailMessageSchema.index({ user: 1, labels: 1 });
emailMessageSchema.index({ 'from.email': 1 });
emailMessageSchema.index({ 'to.email': 1 });
emailMessageSchema.index({ subject: 'text', bodyText: 'text' }); // Full-text search

// Virtual for thread messages count
emailMessageSchema.virtual('isThread').get(function() {
  return this.threadPosition > 0 || this.references?.length > 0;
});

// Generate snippet from body
emailMessageSchema.pre('save', function(next) {
  if (this.bodyText && !this.snippet) {
    this.snippet = this.bodyText.substring(0, 200).replace(/\s+/g, ' ').trim();
  } else if (this.bodyHtml && !this.snippet) {
    const text = this.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    this.snippet = text.substring(0, 200);
  }
  next();
});

// ==========================================
// EMAIL THREAD MODEL
// Group emails into conversations
// ==========================================

const emailThreadSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  threadId: { type: String, required: true, unique: true, index: true },
  
  // Thread info
  subject: String,
  participants: [{
    email: String,
    name: String
  }],
  
  // Latest message info (for listing)
  lastMessage: {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailMessage' },
    snippet: String,
    from: {
      email: String,
      name: String
    },
    date: Date
  },
  
  // Stats
  messageCount: { type: Number, default: 1 },
  unreadCount: { type: Number, default: 0 },
  
  // Status
  folder: { type: String, default: 'inbox', index: true },
  isStarred: { type: Boolean, default: false },
  labels: [String],
  
  // Soft delete
  deletedAt: Date
}, { timestamps: true });

emailThreadSchema.index({ user: 1, folder: 1, 'lastMessage.date': -1 });

// ==========================================
// EMAIL LABEL MODEL
// Custom labels/folders
// ==========================================

const emailLabelSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  name: { type: String, required: true },
  color: { type: String, default: '#6366f1' }, // Tailwind purple
  
  // System labels can't be deleted
  isSystem: { type: Boolean, default: false },
  
  // Stats
  messageCount: { type: Number, default: 0 },
  unreadCount: { type: Number, default: 0 }
}, { timestamps: true });

emailLabelSchema.index({ user: 1, name: 1 }, { unique: true });

// ==========================================
// EMAIL CONTACT MODEL
// Address book / contacts for autocomplete
// ==========================================

const emailContactSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  email: { type: String, required: true, lowercase: true },
  name: String,
  
  // Source of contact
  source: { 
    type: String, 
    enum: ['manual', 'sent', 'received', 'import'],
    default: 'manual'
  },
  
  // Interaction stats
  lastContacted: Date,
  contactCount: { type: Number, default: 0 },
  
  // For campaign contacts (extended fields)
  phone: String,
  company: String,
  tags: [String],
  customFields: mongoose.Schema.Types.Mixed,
  
  // Subscription status
  subscribed: { type: Boolean, default: true },
  unsubscribedAt: Date,
  unsubscribeReason: String
}, { timestamps: true });

emailContactSchema.index({ user: 1, email: 1 }, { unique: true });
emailContactSchema.index({ user: 1, tags: 1 });
emailContactSchema.index({ email: 'text', name: 'text' });

// ==========================================
// EXPORT MODELS
// ==========================================

const EmailAddress = mongoose.models.EmailAddress || mongoose.model('EmailAddress', emailAddressSchema);
const SenderDomain = mongoose.models.SenderDomain || mongoose.model('SenderDomain', senderDomainSchema);
const EmailMessage = mongoose.models.EmailMessage || mongoose.model('EmailMessage', emailMessageSchema);
const EmailThread = mongoose.models.EmailThread || mongoose.model('EmailThread', emailThreadSchema);
const EmailLabel = mongoose.models.EmailLabel || mongoose.model('EmailLabel', emailLabelSchema);
const EmailContact = mongoose.models.EmailContact || mongoose.model('EmailContact', emailContactSchema);

module.exports = {
  EmailAddress,
  SenderDomain,
  EmailMessage,
  EmailThread,
  EmailLabel,
  EmailContact
};
