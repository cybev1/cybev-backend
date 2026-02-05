// ============================================
// FILE: models/livestream.model.js
// LiveStream Model - UPDATED with Recording Fields
// Supports: Mux streaming, WebRTC, Recording capture
// ============================================

const mongoose = require('mongoose');

const liveStreamSchema = new mongoose.Schema({
  // Soft delete
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ==========================================
  // Core Fields
  // ==========================================
  streamer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  
  description: {
    type: String,
    maxlength: 2000
  },
  
  thumbnail: String,
  
  category: {
    type: String,
    default: 'General'
  },
  
  tags: [String],
  
  // ==========================================
  // Stream Type & Status
  // ==========================================
  streamType: {
    type: String,
    enum: ['mux', 'camera', 'webrtc', 'external', 'embed'],
    default: 'mux'
  },
  
  status: {
    type: String,
    enum: ['preparing', 'live', 'ended', 'saved', 'error'],
    default: 'preparing',
    index: true
  },
  
  isActive: {
    type: Boolean,
    default: false,
    index: true
  },
  
  privacy: {
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public'
  },
  
  // ==========================================
  // Mux Streaming Fields
  // ==========================================
  muxStreamId: {
    type: String,
    index: true
  },
  
  muxStreamKey: String,
  
  muxPlaybackId: String,
  
  muxRtmpUrl: {
    type: String,
    default: 'rtmps://global-live.mux.com:443/app'
  },
  
  // Playback URLs (computed from Mux)
  playbackUrls: {
    hls: String,
    dash: String,
    thumbnail: String,
    gif: String
  },
  
  // ==========================================
  // Recording Fields (NEW - Mux Webhooks)
  // ==========================================
  muxAssetId: {
    type: String,
    index: true
  },
  
  recordingPlaybackId: String,
  
  recordingUrl: String,
  
  recordingThumbnail: String,
  
  recordingGif: String,
  
  recordingDuration: Number, // in seconds
  
  recordingResolution: String, // e.g., "1080p", "720p"
  
  recordingFrameRate: Number,
  
  recordingAspectRatio: String, // e.g., "16:9"
  
  recordingStatus: {
    type: String,
    enum: ['none', 'processing', 'ready', 'error'],
    default: 'none'
  },
  
  recordingReadyAt: Date,
  
  recordingError: String,
  
  // ==========================================
  // External/Embed Fields
  // ==========================================
  externalUrl: String,
  
  embedUrl: String,
  
  embedPlatform: {
    type: String,
    enum: ['youtube', 'facebook', 'twitch', 'vimeo', 'other']
  },
  
  // ==========================================
  // Viewer & Engagement
  // ==========================================
  viewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  peakViewers: {
    type: Number,
    default: 0
  },
  
  totalViews: {
    type: Number,
    default: 0
  },
  
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // ==========================================
  // Comments/Chat
  // ==========================================
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: {
      type: String,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isHighlighted: {
      type: Boolean,
      default: false
    }
  }],
  
  // ==========================================
  // Admin & Moderation
  // ==========================================
  isPinned: {
    type: Boolean,
    default: false,
    index: true
  },
  
  isFeatured: {
    type: Boolean,
    default: false
  },
  
  isAdminStream: {
    type: Boolean,
    default: false
  },
  
  moderators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  bannedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // ==========================================
  // Feed Integration
  // ==========================================
  feedPostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog'
  },
  
  postToFeed: {
    type: Boolean,
    default: true
  },
  
  // ==========================================
  // Monetization (Future)
  // ==========================================
  isMonetized: {
    type: Boolean,
    default: false
  },
  
  tipJarEnabled: {
    type: Boolean,
    default: false
  },
  
  subscriptionRequired: {
    type: Boolean,
    default: false
  },
  
  // ==========================================
  // Timestamps
  // ==========================================
  startedAt: Date,
  
  endedAt: Date,
  
  duration: Number, // in seconds
  
  scheduledFor: Date,
  
  // ==========================================
  // Notifications
  // ==========================================
  notificationsSent: {
    type: Boolean,
    default: false
  },
  
  // ==========================================
  // Analytics
  // ==========================================
  analytics: {
    avgWatchTime: Number,
    chatMessages: { type: Number, default: 0 },
    reactions: { type: Number, default: 0 },
    shares: { type: Number, default: 0 }
  }
  
}, {
  timestamps: true
});

// ==========================================
// Indexes
// ==========================================
liveStreamSchema.index({ streamer: 1, status: 1 });
liveStreamSchema.index({ status: 1, isActive: 1 });
liveStreamSchema.index({ isPinned: -1, startedAt: -1 });
liveStreamSchema.index({ createdAt: -1 });
liveStreamSchema.index({ muxStreamId: 1 });
liveStreamSchema.index({ muxAssetId: 1 });

// ==========================================
// Virtual: Viewer Count
// ==========================================
liveStreamSchema.virtual('viewerCount').get(function() {
  return this.viewers?.length || 0;
});

// ==========================================
// Virtual: Like Count
// ==========================================
liveStreamSchema.virtual('likeCount').get(function() {
  return this.likes?.length || 0;
});

// ==========================================
// Virtual: Is Recording Available
// ==========================================
liveStreamSchema.virtual('hasRecording').get(function() {
  return this.recordingStatus === 'ready' && !!this.recordingUrl;
});

// ==========================================
// Virtual: Stream Duration (computed)
// ==========================================
liveStreamSchema.virtual('computedDuration').get(function() {
  if (this.duration) return this.duration;
  if (this.startedAt && this.endedAt) {
    return Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  if (this.startedAt && this.status === 'live') {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
  return 0;
});

// ==========================================
// Methods
// ==========================================

// Add viewer
liveStreamSchema.methods.addViewer = function(userId) {
  if (userId && !this.viewers.includes(userId)) {
    this.viewers.push(userId);
    this.totalViews = (this.totalViews || 0) + 1;
    if (this.viewers.length > this.peakViewers) {
      this.peakViewers = this.viewers.length;
    }
  }
  return this;
};

// Remove viewer
liveStreamSchema.methods.removeViewer = function(userId) {
  const index = this.viewers.indexOf(userId);
  if (index > -1) {
    this.viewers.splice(index, 1);
  }
  return this;
};

// Add comment
liveStreamSchema.methods.addComment = function(userId, content) {
  this.comments.push({
    user: userId,
    content,
    createdAt: new Date()
  });
  if (this.analytics) {
    this.analytics.chatMessages = (this.analytics.chatMessages || 0) + 1;
  }
  return this;
};

// End stream
liveStreamSchema.methods.endStream = function() {
  this.status = 'ended';
  this.isActive = false;
  this.endedAt = new Date();
  if (this.startedAt) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  return this;
};

// ==========================================
// Statics
// ==========================================

// Find active streams
liveStreamSchema.statics.findActive = function(limit = 50) {
  return this.find({ status: 'live', isActive: true })
    .sort({ isPinned: -1, startedAt: -1 })
    .limit(limit)
    .populate('streamer', 'name username profilePicture isAdmin role');
};

// Find user's active stream
liveStreamSchema.statics.findUserActiveStream = function(userId) {
  return this.findOne({
    streamer: userId,
    status: { $in: ['preparing', 'live'] },
    isActive: true
  });
};

// Ensure JSON includes virtuals
liveStreamSchema.set('toJSON', { virtuals: true });
liveStreamSchema.set('toObject', { virtuals: true });

const LiveStream = mongoose.model('LiveStream', liveStreamSchema);

module.exports = LiveStream;
