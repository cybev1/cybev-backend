// ============================================
// FILE: models/blog.model.js
// UPDATED: Added isPinned and reactions fields
// ============================================

const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  
  content: {
    type: String,
    required: true
  },

  excerpt: {
    type: String,
    default: ''
  },

  featuredImage: {
    type: String,
    default: ''
  },

  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Optional blog site this post belongs to
  site: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogSite', default: null, index: true },

  authorName: {
    type: String,
    required: true
  },

  category: {
    type: String,
    default: 'general',
    lowercase: true,
    trim: true
  },

  tags: [{
    type: String,
    trim: true
  }],

  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },

  views: {
    type: Number,
    default: 0
  },

  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Emoji Reactions
  reactions: {
    like: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    love: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    haha: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    wow: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sad: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    angry: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    fire: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    clap: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },

  // Pin post to profile
  isPinned: {
    type: Boolean,
    default: false
  },

  pinnedAt: {
    type: Date,
    default: null
  },

  // Comments count (denormalized for performance)
  commentsCount: {
    type: Number,
    default: 0
  },

  readTime: {
    type: Number,
    default: 5
  },

  isAIGenerated: {
    type: Boolean,
    default: false
  },

  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String]
  },

  shares: {
    total: { type: Number, default: 0 },
    platforms: {
      twitter: { type: Number, default: 0 },
      facebook: { type: Number, default: 0 },
      linkedin: { type: Number, default: 0 },
      whatsapp: { type: Number, default: 0 },
      telegram: { type: Number, default: 0 },
      copy: { type: Number, default: 0 },
      native: { type: Number, default: 0 }
    }
  }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
blogSchema.index({ author: 1, createdAt: -1 });
blogSchema.index({ status: 1, createdAt: -1 });
blogSchema.index({ category: 1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ isPinned: 1, author: 1 });

// Virtual for like count
blogSchema.virtual('likeCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual for total reactions count
blogSchema.virtual('totalReactions').get(function() {
  if (!this.reactions) return 0;
  return Object.values(this.reactions).reduce((sum, arr) => sum + (arr?.length || 0), 0);
});

module.exports = mongoose.model('Blog', blogSchema);
