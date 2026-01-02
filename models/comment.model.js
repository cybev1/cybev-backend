// ============================================
// FILE: models/comment.model.js
// UPDATED: Added authorName field
// ============================================

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Author name for display (required)
  authorName: {
    type: String,
    required: true,
    default: 'Anonymous'
  },
  
  // Author avatar URL (optional)
  authorAvatar: {
    type: String,
    default: ''
  },
  
  // Reference to blog (if commenting on blog)
  blog: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog',
    default: null
  },
  
  // Reference to post (if commenting on post)
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    default: null
  },
  
  // Parent comment (for replies/threads)
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  
  // Likes on comment
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Reply comments
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  
  // Is edited
  isEdited: {
    type: Boolean,
    default: false
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  }
  
}, { timestamps: true });

// Indexes
commentSchema.index({ blog: 1, createdAt: -1 });
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ user: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1 });

// Virtual for likes count
commentSchema.virtual('likesCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Pre-save middleware to set authorName if not provided
commentSchema.pre('save', async function(next) {
  if (!this.authorName || this.authorName === 'Anonymous') {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(this.user).select('name username');
      this.authorName = user?.name || user?.username || 'Anonymous';
    } catch (e) {
      // Keep default
    }
  }
  next();
});

module.exports = mongoose.model('Comment', commentSchema);
