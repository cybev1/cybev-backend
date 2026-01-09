// ============================================
// FILE: models/domain.model.js
// Domain Registration Model - v6.4
// ============================================

const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  domain: { type: String, required: true, unique: true, lowercase: true, index: true },
  tld: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'active', 'expired', 'suspended', 'transferring', 'cancelled'], 
    default: 'pending' 
  },
  registeredAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true },
  renewedAt: Date,
  autoRenew: { type: Boolean, default: true },
  
  // Renewal reminder tracking
  remindersSent: {
    thirtyDays: { type: Boolean, default: false },
    sevenDays: { type: Boolean, default: false },
    oneDayBefore: { type: Boolean, default: false },
    expired: { type: Boolean, default: false }
  },
  
  // Payment info (supports Paystack, Flutterwave, Stripe)
  payment: {
    provider: { type: String, enum: ['paystack', 'flutterwave', 'stripe', 'manual'] },
    transactionId: String,
    reference: String,
    amount: Number,
    currency: { type: String, default: 'USD' },
    paidAt: Date,
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'] },
    // Provider-specific data
    sessionId: String,     // Stripe session ID
    flwRef: String,        // Flutterwave reference
    channel: String        // Payment channel (card, bank, mobile_money, etc.)
  },
  
  period: { type: Number, default: 1, min: 1, max: 10 }, // years
  
  // Registrar details
  registrar: {
    orderId: String,
    authCode: String,
    locked: { type: Boolean, default: true },
    privacyProtection: { type: Boolean, default: true }
  },
  
  linkedSite: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
  
  // DNS configuration
  dns: {
    preset: { type: String, default: 'cybev' },
    records: [{
      id: String,
      type: { type: String, enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'] },
      name: String,
      value: String,
      ttl: { type: Number, default: 3600 },
      priority: Number
    }],
    nameservers: [String],
    configured: { type: Boolean, default: false }
  },
  
  pricing: {
    registration: Number,
    renewal: Number,
    currency: { type: String, default: 'USD' }
  },
  
  // Transfer info
  transfer: {
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'] },
    authCode: String,
    initiatedAt: Date,
    completedAt: Date
  },
  
  meta: {
    source: { type: String, enum: ['registration', 'transfer'], default: 'registration' },
    premium: { type: Boolean, default: false },
    notes: String
  }
}, { timestamps: true });

// Indexes
domainSchema.index({ expiresAt: 1 });
domainSchema.index({ owner: 1, status: 1 });

// Virtual: days until expiry
domainSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  return Math.ceil((new Date(this.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
});

// Virtual: is expired
domainSchema.virtual('isExpired').get(function() {
  return this.expiresAt ? new Date() > new Date(this.expiresAt) : false;
});

// Method: needs renewal
domainSchema.methods.needsRenewal = function(daysThreshold = 30) {
  const days = this.daysUntilExpiry;
  return days !== null && days <= daysThreshold && days > 0;
};

// Method: mark reminder sent
domainSchema.methods.markReminderSent = async function(type) {
  this.remindersSent[type] = true;
  await this.save();
};

// Static: find expiring soon
domainSchema.statics.findExpiringSoon = async function(days = 30) {
  const now = new Date();
  const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return this.find({
    status: 'active',
    expiresAt: { $lte: threshold, $gte: now }
  }).populate('owner', 'name email');
};

// Pre-save: extract TLD
domainSchema.pre('save', function(next) {
  if (this.domain && !this.tld) {
    const parts = this.domain.split('.');
    this.tld = parts[parts.length - 1];
  }
  next();
});

module.exports = mongoose.model('Domain', domainSchema);
