// ============================================
// FILE: models/vlog.model.js
// Vlog (Video Blog/Stories) Model
// ============================================

const mongoose = require('mongoose');

const vlogSchema = new mongoose.Schema({
  // Soft delete
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Author
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Video content
  videoUrl: {
    type: String,
    required: true
  },
  
  thumbnailUrl: {
    type: String,
    default: ''
  },
  
  // Metadata
  caption: {
    type: String,
    maxlength: 500,
    default: ''
  },
  
  duration: {
    type: Number, // in seconds
    default: 0
  },
  
  // Visibility
  visibility: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'public'
  },
  
  // Story-like expiration (24 hours)
  isStory: {
    type: Boolean,
    default: true
  },
  
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  },
  
  // Engagement
  views: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now }
  }],
  
  viewsCount: {
    type: Number,
    default: 0
  },
  
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  reactions: {
    like: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    love: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    haha: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    wow: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sad: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    fire: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  
  // Music/Audio
  audio: {
    name: String,
    artist: String,
    url: String
  },
  
  // Hashtags
  hashtags: [String],
  
  // Mentions
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Background gradient (for vlogs without video)
  backgroundGradient: {
    type: String,
    default: 'from-purple-500 to-pink-500'
  }
  
}, { timestamps: true });

// Indexes
vlogSchema.index({ user: 1, createdAt: -1 });
vlogSchema.index({ expiresAt: 1 });
vlogSchema.index({ isActive: 1, visibility: 1 });

// Auto-delete expired stories
vlogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for total reactions
vlogSchema.virtual('totalReactions').get(function() {
  if (!this.reactions) return this.likes?.length || 0;
  return Object.values(this.reactions).reduce((sum, arr) => sum + (arr?.length || 0), 0);
});

vlogSchema.set('toJSON', { virtuals: true });
vlogSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Vlog', vlogSchema);
