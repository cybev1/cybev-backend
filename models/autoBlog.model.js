// ============================================
// FILE: models/autoBlog.model.js
// CYBEV Auto-Blog Campaign System
// Stores campaign configs for Special Users auto-posting
// VERSION: 1.0
// ============================================
const mongoose = require('mongoose');

const autoBlogCampaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  
  // How many articles per day
  articlesPerDay: { type: Number, default: 5, min: 1, max: 100 },
  
  // Which special users to use (empty = pick random)
  assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // OR just pick N random special users
  randomUserCount: { type: Number, default: 10 },
  
  // Topics — if empty, AI picks random trending topics
  topics: [{ type: String, trim: true }],
  
  // Categories to rotate through
  categories: {
    type: [String],
    default: ['technology', 'business', 'health', 'entertainment', 'sports', 'science', 'lifestyle', 'news', 'education', 'faith', 'travel', 'food', 'music', 'culture', 'finance']
  },
  
  // Niches — controls the writing style/focus
  niches: {
    type: [String],
    default: ['general']
  },
  
  // Tone options
  tones: {
    type: [String],
    default: ['conversational', 'informative', 'inspiring', 'analytical', 'storytelling']
  },
  
  // Article length
  articleLength: { type: String, enum: ['short', 'medium', 'long'], default: 'medium' },
  
  // Social media links to promote in articles (optional)
  socialLinks: {
    youtube: String,
    facebook: String,
    instagram: String,
    tiktok: String,
    twitter: String,
    website: String
  },
  
  // Include social promo in articles?
  includeSocialPromo: { type: Boolean, default: false },
  socialPromoText: { type: String, default: '' },
  
  // Include SEO optimization
  includeSEO: { type: Boolean, default: true },
  
  // Include featured images from Pexels/Unsplash
  includeImages: { type: Boolean, default: true },
  
  // News-style articles (fetch trending topics)
  includeNews: { type: Boolean, default: false },
  
  // Status
  isActive: { type: Boolean, default: true },
  isPaused: { type: Boolean, default: false },
  
  // Stats
  totalArticlesGenerated: { type: Number, default: 0 },
  totalViewsGenerated: { type: Number, default: 0 },
  lastRunAt: { type: Date },
  lastRunArticles: { type: Number, default: 0 },
  lastRunErrors: { type: Number, default: 0 },
  
  // Schedule — which hours to post (24h format, spread throughout day)
  postingHours: { type: [Number], default: [6, 8, 10, 12, 14, 16, 18, 20, 22] },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('AutoBlogCampaign', autoBlogCampaignSchema);
