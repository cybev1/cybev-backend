// ============================================
// FILE: models/sharedPost.model.js
// Shared Posts / Reposts / Timeline Shares
// ============================================

const mongoose = require('mongoose');

const sharedPostSchema = new mongoose.Schema({
  // User who shared the post
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Original blog/post being shared
  originalBlog: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog'
  },
  
  originalPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  
  // Type of shared content
  contentType: {
    type: String,
    enum: ['blog', 'post'],
    required: true
  },
  
  // Optional comment when sharing
  comment: {
    type: String,
    maxlength: 500,
    default: ''
  },
  
  // Share visibility
  visibility: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'public'
  },
  
  // Engagement on the shared post
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
    angry: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  
  commentsCount: {
    type: Number,
    default: 0
  },
  
  // Is this share active
  isActive: {
    type: Boolean,
    default: true
  }
  
}, { timestamps: true });

// Indexes
sharedPostSchema.index({ user: 1, createdAt: -1 });
sharedPostSchema.index({ originalBlog: 1 });
sharedPostSchema.index({ originalPost: 1 });
sharedPostSchema.index({ createdAt: -1 });

// Virtual for total reactions
sharedPostSchema.virtual('totalReactions').get(function() {
  if (!this.reactions) return this.likes?.length || 0;
  return Object.values(this.reactions).reduce((sum, arr) => sum + (arr?.length || 0), 0);
});

// Ensure virtuals are included in JSON
sharedPostSchema.set('toJSON', { virtuals: true });
sharedPostSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SharedPost', sharedPostSchema);
