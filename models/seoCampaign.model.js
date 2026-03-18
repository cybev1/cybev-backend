// ============================================
// FILE: models/seoCampaign.model.js
// CYBEV SEO Command Center — Data Models
// VERSION: 1.0
// ============================================
const mongoose = require('mongoose');

// ─── Keyword Tracking ───
const keywordSchema = new mongoose.Schema({
  keyword: { type: String, required: true, index: true },
  searchVolume: { type: Number, default: 0 },
  difficulty: { type: Number, min: 0, max: 100, default: 50 },
  cpc: { type: Number, default: 0 },
  intent: { type: String, enum: ['informational', 'commercial', 'transactional', 'navigational'], default: 'informational' },
  currentRank: { type: Number, default: 0 },
  previousRank: { type: Number, default: 0 },
  bestRank: { type: Number, default: 0 },
  targetUrl: String,
  targetBlogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
  rankHistory: [{
    rank: Number,
    url: String,
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    date: { type: Date, default: Date.now }
  }],
  serpFeatures: [{
    type: String,
    enum: ['featured_snippet', 'people_also_ask', 'knowledge_panel', 'video', 'image_pack', 'local_pack', 'top_stories', 'faq_rich_result']
  }],
  status: { type: String, enum: ['tracking', 'ranking', 'lost', 'new'], default: 'new' },
  cluster: String,
  relatedKeywords: [String],
  lastChecked: Date
}, { _id: true, timestamps: true });

// ─── Content Cluster ───
const contentClusterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  pillarKeyword: { type: String, required: true },
  pillarBlogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
  supportingKeywords: [String],
  supportingBlogIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Blog' }],
  internalLinks: [{
    fromBlog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
    toBlog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
    anchorText: String,
    addedAt: { type: Date, default: Date.now }
  }],
  topicalAuthority: { type: Number, min: 0, max: 100, default: 0 },
  totalArticles: { type: Number, default: 0 },
  totalImpressions: { type: Number, default: 0 },
  totalClicks: { type: Number, default: 0 },
  status: { type: String, enum: ['planning', 'building', 'complete', 'optimizing'], default: 'planning' }
}, { _id: true, timestamps: true });

// ─── Programmatic Page Template ───
const programmaticTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  templateType: { type: String, enum: ['city_niche', 'topic_variation', 'comparison', 'listicle', 'faq', 'how_to', 'review'], default: 'city_niche' },
  titleTemplate: { type: String, required: true },
  promptTemplate: { type: String, required: true },
  variables: [{ name: String, values: [String] }],
  category: String,
  tone: { type: String, default: 'professional' },
  socialLinks: [{
    platform: { type: String, enum: ['youtube', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'website'] },
    url: String,
    anchorStyle: { type: String, enum: ['natural', 'cta', 'resource', 'mention'], default: 'natural' }
  }],
  schemaType: { type: String, enum: ['article', 'faq', 'howto', 'video', 'event', 'product', 'review'], default: 'article' },
  generatedCount: { type: Number, default: 0 },
  maxPages: { type: Number, default: 500 },
  status: { type: String, enum: ['draft', 'active', 'paused', 'completed'], default: 'draft' }
}, { _id: true, timestamps: true });

// ─── Social Channel ───
const socialChannelSchema = new mongoose.Schema({
  platform: { type: String, enum: ['youtube', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'website', 'podcast'], required: true },
  url: { type: String, required: true },
  handle: String,
  name: String,
  promotionStyle: { type: String, enum: ['subtle', 'moderate', 'aggressive'], default: 'moderate' },
  enabled: { type: Boolean, default: true }
}, { _id: false });

// ─── Content Refresh Queue ───
const contentRefreshSchema = new mongoose.Schema({
  blogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
  reason: { type: String, enum: ['ranking_drop', 'stale_content', 'keyword_opportunity', 'competitor_outranked', 'scheduled'], default: 'scheduled' },
  originalRank: Number,
  currentRank: Number,
  suggestedChanges: [String],
  refreshedAt: Date,
  status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'queued' }
}, { _id: true, timestamps: true });

// ─── Competitor ───
const competitorSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  name: String,
  keywords: [String],
  overlappingKeywords: [{ keyword: String, theirRank: Number, ourRank: Number }],
  keywordGaps: [{ keyword: String, theirRank: Number, volume: Number, difficulty: Number }],
  lastAnalyzed: Date
}, { _id: true, timestamps: true });

// ═══════════════════════════════════════════
// MAIN SEO CAMPAIGN MODEL
// ═══════════════════════════════════════════
const seoCampaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  type: {
    type: String,
    enum: ['content_campaign', 'keyword_tracking', 'programmatic_seo', 'content_cluster', 'competitor_spy', 'content_refresh', 'social_seo'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'failed'],
    default: 'draft'
  },

  // ─── Target niche/industry ───
  niche: String,
  targetAudience: String,
  targetRegions: [String],
  targetLanguages: [{ type: String, default: 'en' }],

  // ─── Keywords ───
  keywords: [keywordSchema],

  // ─── Content Clusters ───
  contentClusters: [contentClusterSchema],

  // ─── Programmatic SEO Templates ───
  programmaticTemplates: [programmaticTemplateSchema],

  // ─── Social Channels to promote ───
  socialChannels: [socialChannelSchema],

  // ─── Content Refresh Queue ───
  contentRefreshQueue: [contentRefreshSchema],

  // ─── Competitors ───
  competitors: [competitorSchema],

  // ─── Campaign Settings ───
  settings: {
    articlesPerDay: { type: Number, default: 3, min: 1, max: 50 },
    autoInterlink: { type: Boolean, default: true },
    autoSchemaMarkup: { type: Boolean, default: true },
    autoSocialPromotion: { type: Boolean, default: true },
    autoContentRefresh: { type: Boolean, default: true },
    refreshIntervalDays: { type: Number, default: 30 },
    useSpecialUsers: { type: Boolean, default: false },
    randomizeAuthors: { type: Boolean, default: true },
    tone: { type: String, default: 'professional' },
    minWordCount: { type: Number, default: 1200 },
    maxWordCount: { type: Number, default: 3000 },
    includeFAQ: { type: Boolean, default: true },
    includeTableOfContents: { type: Boolean, default: true },
    includeImages: { type: Boolean, default: true },
    imagesPerArticle: { type: Number, default: 3 },
    internalLinksPerArticle: { type: Number, default: 5 },
    socialMentionsPerArticle: { type: Number, default: 2 }
  },

  // ─── Stats ───
  stats: {
    totalArticlesGenerated: { type: Number, default: 0 },
    totalKeywordsTracked: { type: Number, default: 0 },
    totalImpressions: { type: Number, default: 0 },
    totalClicks: { type: Number, default: 0 },
    averageCTR: { type: Number, default: 0 },
    averagePosition: { type: Number, default: 0 },
    keywordsInTop10: { type: Number, default: 0 },
    keywordsInTop3: { type: Number, default: 0 },
    totalProgrammaticPages: { type: Number, default: 0 },
    domainAuthority: { type: Number, default: 0 },
    totalBacklinks: { type: Number, default: 0 },
    contentFreshness: { type: Number, min: 0, max: 100, default: 100 }
  },

  // ─── Google Search Console ───
  gscConnected: { type: Boolean, default: false },
  gscSiteUrl: String,
  gscAccessToken: String,
  gscRefreshToken: String,
  gscLastSync: Date,

  // ─── Scheduling ───
  nextRunAt: Date,
  lastRunAt: Date,
  cronExpression: { type: String, default: '0 */6 * * *' },

  isAdmin: { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

seoCampaignSchema.index({ user: 1, type: 1 });
seoCampaignSchema.index({ status: 1, nextRunAt: 1 });
seoCampaignSchema.index({ 'keywords.keyword': 1 });

module.exports = mongoose.model('SEOCampaign', seoCampaignSchema);
