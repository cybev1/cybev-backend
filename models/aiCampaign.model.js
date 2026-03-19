// ============================================
// FILE: models/aiCampaign.model.js
// PATH: cybev-backend/models/aiCampaign.model.js
// PURPOSE: AI Campaign Planner - 30-day content calendars
// VERSION: 1.0.0
// ============================================

const mongoose = require('mongoose');

// Individual content piece within a day
const contentPieceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['blog', 'social_post', 'video_script', 'graphics_prompt', 'music_prompt', 'reel_script', 'story'],
    required: true
  },
  platform: {
    type: String,
    enum: ['cybev', 'facebook', 'instagram', 'youtube', 'tiktok', 'twitter', 'linkedin', 'all'],
    default: 'all'
  },
  title: { type: String },
  caption: { type: String },
  content: { type: String }, // Full blog content or script
  hashtags: [String],
  mediaPrompt: { type: String }, // AI prompt for generating image/video/music
  mediaUrl: { type: String }, // Generated asset URL (after creation)
  mediaType: { type: String, enum: ['image', 'video', 'audio', 'none'], default: 'none' },
  seoKeywords: [String],
  callToAction: { type: String },
  tone: { type: String },
  status: {
    type: String,
    enum: ['planned', 'generating', 'ready', 'published', 'failed', 'skipped'],
    default: 'planned'
  },
  scheduledTime: { type: String, default: '09:00' }, // HH:mm
  publishedAt: Date,
  publishResult: {
    postId: String,
    postUrl: String,
    platform: String,
    error: String
  },
  generationMeta: {
    model: String,
    tokensUsed: Number,
    creditsUsed: Number,
    generatedAt: Date
  }
}, { _id: true });

// One day in the campaign calendar
const calendarDaySchema = new mongoose.Schema({
  dayNumber: { type: Number, required: true }, // 1-30
  date: { type: Date, required: true },
  theme: { type: String }, // Day's content theme
  content: [contentPieceSchema],
  notes: { type: String },
  isPublished: { type: Boolean, default: false }
}, { _id: true });

// Main campaign schema
const aiCampaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String },
  
  // Campaign configuration
  niche: { type: String, required: true }, // e.g., "fitness", "ministry", "tech", "cooking"
  targetAudience: { type: String },
  brandVoice: { type: String, default: 'professional' }, // professional, casual, inspirational, humorous, educational
  goals: [{ type: String }], // e.g., ["grow followers", "drive traffic", "sell product"]
  
  // Content mix preferences (percentage per day)
  contentMix: {
    blogs: { type: Number, default: 20 },       // % of days with blog posts
    socialPosts: { type: Number, default: 40 },  // % with social posts
    videoScripts: { type: Number, default: 15 }, // % with video content
    graphics: { type: Number, default: 15 },     // % with graphics
    music: { type: Number, default: 5 },         // % with music
    reels: { type: Number, default: 5 }          // % with short-form video
  },

  // Platforms to target
  platforms: [{
    type: String,
    enum: ['cybev', 'facebook', 'instagram', 'youtube', 'tiktok', 'twitter', 'linkedin']
  }],

  // Schedule
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  durationDays: { type: Number, default: 30 },
  postsPerDay: { type: Number, default: 2, min: 1, max: 10 },
  postingTimes: [{ type: String }], // ["09:00", "14:00", "19:00"]
  timezone: { type: String, default: 'UTC' },

  // The calendar
  calendar: [calendarDaySchema],

  // Auto-publish settings
  autoPublish: { type: Boolean, default: false },
  autoGenerateAssets: { type: Boolean, default: false }, // Auto-create images/videos via AI Studio

  // Status
  status: {
    type: String,
    enum: ['draft', 'generating', 'ready', 'active', 'paused', 'completed', 'failed'],
    default: 'draft'
  },

  // Stats
  stats: {
    totalPieces: { type: Number, default: 0 },
    generated: { type: Number, default: 0 },
    published: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    totalCreditsUsed: { type: Number, default: 0 },
    totalReach: { type: Number, default: 0 },
    totalEngagement: { type: Number, default: 0 }
  },

  // AI generation metadata
  generationLog: [{
    action: String,
    timestamp: { type: Date, default: Date.now },
    details: String,
    creditsUsed: Number
  }],

  lastGeneratedAt: Date,
  lastPublishedAt: Date
}, {
  timestamps: true
});

// Indexes
aiCampaignSchema.index({ user: 1, status: 1 });
aiCampaignSchema.index({ user: 1, createdAt: -1 });
aiCampaignSchema.index({ status: 1, 'calendar.date': 1 }); // For cron processor

module.exports = mongoose.model('AICampaign', aiCampaignSchema);
