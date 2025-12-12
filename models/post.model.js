const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  // Basic Info
  title: String,
  content: {
    type: String,
    required: true,
    maxlength: 5000,
    trim: true
  },
  
  // Author
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  authorName: {
    type: String,
    required: true
  },

  // Media (optional)
  images: [{
    url: String,
    alt: String,
    credit: String
  }],

  video: {
    url: String,
    thumbnail: String,
    duration: Number
  },

  // Post Type
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'poll'],
    default: 'text'
  },

  // Tags & Discovery
  tags: [String],
  hashtags: [String],

  // Mentions
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Engagement - NEW LIKE SYSTEM
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reaction: {
      type: String,
      enum: ['love', 'wow', 'fire', 'happy', 'celebrate', 'perfect'],
      default: 'love'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Comments - NEW
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userName: String,
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],

  // Shares - NEW
  shares: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Bookmarks - NEW
  bookmarks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Stats
  views: { type: Number, default: 0 },
  reactions: { type: Number, default: 0 }, // Legacy field - kept for backward compatibility

  // Visibility
  visibility: {
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public'
  },

  // Moderation
  isPinned: {
    type: Boolean,
    default: false
  },

  isHidden: {
    type: Boolean,
    default: false
  },

  reportCount: {
    type: Number,
    default: 0
  },

  // Location (optional)
  location: {
    name: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Existing Boost/Mint Features - KEPT!
  boosted: { type: Boolean, default: false },
  boostCount: { type: Number, default: 0 },
  boostLogs: [
    {
      userId: String,
      date: Date
    }
  ],
  minted: { type: Boolean, default: false },
  mintTxHash: String,
  tokenId: String,

  // Tokens earned from this post
  tokensEarned: {
    type: Number,
    default: 0
  }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ 'likes.user': 1 });
postSchema.index({ isPinned: 1, createdAt: -1 });
postSchema.index({ visibility: 1 });

// Virtual for like count
postSchema.virtual('likeCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual for comment count
postSchema.virtual('commentCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Virtual for share count
postSchema.virtual('shareCount').get(function() {
  return this.shares ? this.shares.length : 0;
});

// Pre-save hook - extract hashtags
postSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    // Extract hashtags
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    while ((match = hashtagRegex.exec(this.content)) !== null) {
      hashtags.push(match[1].toLowerCase());
    }
    this.hashtags = [...new Set(hashtags)]; // Remove duplicates
  }
  next();
});

// Method to check if user liked the post
postSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(like => like.user.toString() === userId.toString());
};

// Method to check if user bookmarked the post
postSchema.methods.isBookmarkedBy = function(userId) {
  return this.bookmarks.some(bookmark => bookmark.toString() === userId.toString());
};

// Static method to get trending posts
postSchema.statics.getTrending = function(limit = 10) {
  return this.find({ isHidden: false, visibility: 'public' })
    .sort({ likeCount: -1, views: -1, createdAt: -1 })
    .limit(limit)
    .populate('authorId', 'name username avatar');
};

// Static method to get posts by hashtag
postSchema.statics.getByHashtag = function(hashtag, limit = 20) {
  return this.find({ 
    hashtags: hashtag.toLowerCase(),
    isHidden: false,
    visibility: 'public'
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('authorId', 'name username avatar');
};

module.exports = mongoose.model('Post', postSchema);
