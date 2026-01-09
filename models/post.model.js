// ============================================
// FILE: models/post.model.js
// Post Model - Enhanced with NFT & Website Posts
// VERSION: 2.0 - Added NFT and Website feed posts
// ============================================

const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reaction: { type: String, default: 'like' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CommentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const PostSchema = new mongoose.Schema(
  {
    // Support both authorId and author (for compatibility)
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    
    title: { type: String, default: '' },
    content: { type: String, required: true },

    // ==========================================
    // Media Support (Simple and Enhanced)
    // ==========================================
    
    // Simple media (original)
    imageUrl: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    
    // Enhanced media array
    media: [{
      type: {
        type: String,
        enum: ['image', 'video', 'file', 'link'],
        default: 'image'
      },
      url: String,
      thumbnail: String,
      filename: String,
      size: Number,
      mimeType: String
    }],

    // ==========================================
    // Post Classification (ENHANCED)
    // ==========================================
    postType: { 
      type: String, 
      enum: ['post', 'story', 'update', 'nft', 'website', 'blog', 'reel', 'live'], 
      default: 'post' 
    },
    isAIGenerated: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    hashtags: { type: [String], default: [] },
    visibility: { type: String, enum: ['public', 'private', 'followers'], default: 'public' },
    isPublished: { type: Boolean, default: true },

    // ==========================================
    // NEW: NFT Data (for NFT posts)
    // ==========================================
    nftData: {
      nftId: { type: mongoose.Schema.Types.ObjectId, ref: 'NFT' },
      name: String,
      description: String,
      image: String,
      price: Number,
      currency: { type: String, default: 'ETH' },
      tokenId: String,
      contractAddress: String,
      blockchain: { type: String, default: 'ethereum' },
      marketplaceUrl: String
    },
    
    // ==========================================
    // NEW: Website Data (for website launch posts)
    // ==========================================
    websiteData: {
      siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
      name: String,
      description: String,
      subdomain: String,
      customDomain: String,
      url: String,
      thumbnail: String,
      template: String
    },
    
    // ==========================================
    // NEW: Blog Data (for blog post shares)
    // ==========================================
    blogData: {
      blogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
      title: String,
      excerpt: String,
      coverImage: String,
      url: String,
      readTime: Number
    },
    
    // ==========================================
    // NEW: Live Data (for live stream posts)
    // ==========================================
    liveData: {
      streamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream' },
      title: String,
      thumbnail: String,
      isLive: { type: Boolean, default: false },
      viewerCount: Number,
      recordingUrl: String
    },

    // ==========================================
    // Engagement
    // ==========================================
    likes: { type: [LikeSchema], default: [] },
    likeCount: { type: Number, default: 0 },
    comments: { type: [CommentSchema], default: [] },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    bookmarkCount: { type: Number, default: 0 },
    
    // ==========================================
    // Mentions & References
    // ==========================================
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    
    // ==========================================
    // Group Posts
    // ==========================================
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    isPinned: { type: Boolean, default: false },

    // ==========================================
    // Monetization / Gamification
    // ==========================================
    tokensEarned: { type: Number, default: 0 },
    
    // ==========================================
    // Moderation
    // ==========================================
    status: {
      type: String,
      enum: ['active', 'pending', 'hidden', 'removed'],
      default: 'active'
    },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: Date,
    moderationReason: String
  },
  { timestamps: true }
);

// ==========================================
// Pre-save Hooks
// ==========================================

// Ensure author/authorId sync
PostSchema.pre('save', function(next) {
  if (this.author && !this.authorId) {
    this.authorId = this.author;
  }
  if (this.authorId && !this.author) {
    this.author = this.authorId;
  }
  next();
});

// Extract hashtags from content
PostSchema.pre('save', function(next) {
  if (this.isModified('content') && this.content) {
    const hashtagRegex = /#(\w+)/g;
    const matches = this.content.match(hashtagRegex);
    if (matches) {
      this.hashtags = [...new Set(matches.map(tag => tag.slice(1).toLowerCase()))];
    }
  }
  next();
});

// Update counts
PostSchema.pre('save', function(next) {
  if (this.likes) {
    this.likeCount = this.likes.length;
  }
  if (this.comments) {
    this.commentCount = this.comments.length;
  }
  next();
});

// ==========================================
// Indexes
// ==========================================

PostSchema.index({ createdAt: -1 });
PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ postType: 1, createdAt: -1 });
PostSchema.index({ hashtags: 1 });
PostSchema.index({ group: 1, createdAt: -1 });
PostSchema.index({ visibility: 1, status: 1, createdAt: -1 });

// ==========================================
// Virtual Population
// ==========================================

PostSchema.virtual('authorInfo', {
  ref: 'User',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

module.exports = mongoose.model('Post', PostSchema);
