// ============================================
// FILE: models/moderation.model.js
// Content Moderation Models
// VERSION: 1.0
// ============================================

const mongoose = require('mongoose');

// ==========================================
// CONTENT REPORT MODEL
// ==========================================

const contentReportSchema = new mongoose.Schema({
  // Reporter
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Reported content
  contentType: {
    type: String,
    enum: ['post', 'blog', 'comment', 'message', 'user', 'group', 'event', 'live-stream', 'nft'],
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  contentAuthor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Snapshot of content at report time
  contentSnapshot: {
    text: String,
    media: [String],
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Report reason
  reason: {
    type: String,
    enum: [
      'spam',
      'harassment',
      'hate-speech',
      'violence',
      'nudity',
      'self-harm',
      'misinformation',
      'copyright',
      'impersonation',
      'scam',
      'illegal-content',
      'underage',
      'other'
    ],
    required: true
  },
  reasonDetails: String,
  
  // AI Analysis
  aiAnalysis: {
    flagged: Boolean,
    categories: [{
      name: String,
      score: Number,
      flagged: Boolean
    }],
    toxicityScore: Number,
    spamScore: Number,
    nsfwScore: Number,
    analyzedAt: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'reviewing', 'resolved', 'dismissed', 'escalated'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Resolution
  resolution: {
    action: {
      type: String,
      enum: ['no-action', 'warning', 'content-removed', 'user-suspended', 'user-banned', 'escalated']
    },
    moderator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String,
    resolvedAt: Date
  },
  
  // Related reports (duplicates)
  relatedReports: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContentReport'
  }]
}, {
  timestamps: true
});

// Indexes
contentReportSchema.index({ status: 1, priority: -1, createdAt: -1 });
contentReportSchema.index({ contentType: 1, contentId: 1 });
contentReportSchema.index({ reporter: 1 });
contentReportSchema.index({ contentAuthor: 1 });
contentReportSchema.index({ reason: 1 });

// ==========================================
// MODERATION ACTION MODEL
// ==========================================

const moderationActionSchema = new mongoose.Schema({
  // Target
  targetType: {
    type: String,
    enum: ['user', 'content'],
    required: true
  },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetContent: {
    contentType: String,
    contentId: mongoose.Schema.Types.ObjectId
  },
  
  // Action taken
  action: {
    type: String,
    enum: [
      'warning',
      'content-hidden',
      'content-removed',
      'account-restricted',
      'account-suspended',
      'account-banned',
      'appeal-approved',
      'appeal-denied',
      'restriction-lifted'
    ],
    required: true
  },
  
  // Duration (for temporary actions)
  duration: {
    type: Number, // hours
    default: 0 // 0 = permanent
  },
  expiresAt: Date,
  
  // Details
  reason: {
    type: String,
    required: true
  },
  internalNotes: String,
  
  // Reference to report
  report: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContentReport'
  },
  
  // Moderator
  moderator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked'],
    default: 'active'
  },
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revokedAt: Date,
  
  // Appeal
  appeal: {
    submitted: Boolean,
    submittedAt: Date,
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied']
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    response: String
  }
}, {
  timestamps: true
});

// Indexes
moderationActionSchema.index({ targetUser: 1, status: 1 });
moderationActionSchema.index({ action: 1, status: 1 });
moderationActionSchema.index({ expiresAt: 1 }, { sparse: true });
moderationActionSchema.index({ moderator: 1 });

// ==========================================
// WORD FILTER MODEL
// ==========================================

const wordFilterSchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  category: {
    type: String,
    enum: ['profanity', 'slur', 'spam', 'scam', 'illegal', 'custom'],
    default: 'custom'
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  action: {
    type: String,
    enum: ['flag', 'block', 'replace'],
    default: 'flag'
  },
  replacement: String, // For 'replace' action
  isRegex: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

wordFilterSchema.index({ category: 1, isActive: 1 });
wordFilterSchema.index({ severity: 1 });

// ==========================================
// AUTO-MODERATION RULE MODEL
// ==========================================

const autoModerationRuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  
  // Rule type
  type: {
    type: String,
    enum: [
      'spam-detection',
      'rate-limit',
      'link-filter',
      'media-filter',
      'keyword-filter',
      'ai-toxicity',
      'duplicate-detection',
      'account-age'
    ],
    required: true
  },
  
  // Conditions
  conditions: {
    // Spam detection
    maxPostsPerHour: Number,
    maxCommentsPerMinute: Number,
    maxDuplicateContent: Number,
    
    // Link filter
    blockNewAccountLinks: Boolean,
    newAccountDays: Number,
    allowedDomains: [String],
    blockedDomains: [String],
    
    // Media filter
    requireMediaApproval: Boolean,
    blockExplicitContent: Boolean,
    
    // AI thresholds
    toxicityThreshold: Number,
    spamThreshold: Number,
    nsfwThreshold: Number,
    
    // Account restrictions
    minAccountAgeDays: Number,
    minFollowers: Number,
    requireVerifiedEmail: Boolean
  },
  
  // Action when triggered
  action: {
    type: String,
    enum: ['flag', 'hold', 'block', 'shadow-ban', 'notify-mods'],
    default: 'flag'
  },
  
  // Scope
  applyTo: {
    type: String,
    enum: ['all', 'new-users', 'unverified', 'reported-users'],
    default: 'all'
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Stats
  stats: {
    triggered: { type: Number, default: 0 },
    lastTriggered: Date
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

autoModerationRuleSchema.index({ type: 1, isActive: 1 });

// ==========================================
// USER TRUST SCORE MODEL
// ==========================================

const userTrustScoreSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Overall score (0-100)
  score: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  
  // Component scores
  components: {
    accountAge: { type: Number, default: 0 },
    emailVerified: { type: Number, default: 0 },
    contentQuality: { type: Number, default: 0 },
    reportHistory: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
    followerRatio: { type: Number, default: 0 }
  },
  
  // Flags
  flags: {
    isNewAccount: Boolean,
    hasWarnings: Boolean,
    hasSuspensions: Boolean,
    isReportedFrequently: Boolean,
    isHighQualityContributor: Boolean,
    isVerified: Boolean
  },
  
  // History
  history: [{
    score: Number,
    reason: String,
    changedAt: Date
  }],
  
  lastCalculated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

userTrustScoreSchema.index({ score: -1 });
userTrustScoreSchema.index({ user: 1 });

// Export models
const ContentReport = mongoose.model('ContentReport', contentReportSchema);
const ModerationAction = mongoose.model('ModerationAction', moderationActionSchema);
const WordFilter = mongoose.model('WordFilter', wordFilterSchema);
const AutoModerationRule = mongoose.model('AutoModerationRule', autoModerationRuleSchema);
const UserTrustScore = mongoose.model('UserTrustScore', userTrustScoreSchema);

module.exports = {
  ContentReport,
  ModerationAction,
  WordFilter,
  AutoModerationRule,
  UserTrustScore
};
