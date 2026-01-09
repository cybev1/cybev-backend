// ============================================
// FILE: models/groupPost.model.js
// Group Posts Model
// ============================================

const mongoose = require('mongoose');

const groupPostSchema = new mongoose.Schema({
  // Group reference
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  
  // Author
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Content
  content: { type: String, maxLength: 10000 },
  
  // Media
  media: [{
    type: { type: String, enum: ['image', 'video', 'file', 'link'] },
    url: String,
    thumbnail: String,
    filename: String,
    size: Number,
    mimeType: String
  }],
  
  // Post type
  postType: { 
    type: String, 
    enum: ['post', 'announcement', 'poll', 'event', 'file', 'link'],
    default: 'post'
  },
  
  // Poll data (if postType is 'poll')
  poll: {
    question: String,
    options: [{
      text: String,
      votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }],
    endDate: Date,
    allowMultiple: { type: Boolean, default: false },
    isAnonymous: { type: Boolean, default: false }
  },
  
  // Event data (if postType is 'event')
  event: {
    title: String,
    description: String,
    startDate: Date,
    endDate: Date,
    location: String,
    isOnline: { type: Boolean, default: false },
    link: String,
    attendees: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['going', 'interested', 'notgoing'], default: 'interested' }
    }]
  },
  
  // Engagement
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount: { type: Number, default: 0 },
  
  comments: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, maxLength: 2000 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replies: [{
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      content: { type: String, maxLength: 1000 },
      likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
  }],
  commentCount: { type: Number, default: 0 },
  
  // Shares
  shares: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  shareCount: { type: Number, default: 0 },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'removed'],
    default: 'approved'
  },
  
  // Moderation
  isPinned: { type: Boolean, default: false },
  isAnnouncement: { type: Boolean, default: false },
  
  // Visibility
  isHidden: { type: Boolean, default: false },
  
  // Moderation info
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moderatedAt: Date,
  moderationReason: String,
  
  // For announcements - who has seen it
  seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Mentions
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Hashtags
  hashtags: [{ type: String, lowercase: true }]
  
}, { timestamps: true });

// Indexes
groupPostSchema.index({ group: 1, createdAt: -1 });
groupPostSchema.index({ group: 1, isPinned: -1, createdAt: -1 });
groupPostSchema.index({ author: 1 });
groupPostSchema.index({ status: 1 });
groupPostSchema.index({ postType: 1 });

// Pre-save: Extract hashtags and update counts
groupPostSchema.pre('save', function(next) {
  // Extract hashtags
  if (this.content) {
    const hashtagRegex = /#(\w+)/g;
    const matches = this.content.match(hashtagRegex);
    if (matches) {
      this.hashtags = matches.map(tag => tag.slice(1).toLowerCase());
    }
  }
  
  // Update counts
  this.likeCount = this.likes?.length || 0;
  this.commentCount = this.comments?.length || 0;
  this.shareCount = this.shares?.length || 0;
  
  next();
});

// Method: Toggle like
groupPostSchema.methods.toggleLike = async function(userId) {
  const likeIndex = this.likes.findIndex(l => l.toString() === userId.toString());
  
  if (likeIndex > -1) {
    this.likes.splice(likeIndex, 1);
  } else {
    this.likes.push(userId);
  }
  
  this.likeCount = this.likes.length;
  await this.save();
  
  return { liked: likeIndex === -1, likeCount: this.likeCount };
};

// Method: Add comment
groupPostSchema.methods.addComment = async function(userId, content) {
  this.comments.push({
    author: userId,
    content,
    createdAt: new Date()
  });
  
  this.commentCount = this.comments.length;
  await this.save();
  
  return this.comments[this.comments.length - 1];
};

// Method: Vote on poll
groupPostSchema.methods.votePoll = async function(userId, optionIndex) {
  if (this.postType !== 'poll' || !this.poll) {
    return { success: false, error: 'Not a poll' };
  }
  
  if (this.poll.endDate && new Date() > new Date(this.poll.endDate)) {
    return { success: false, error: 'Poll has ended' };
  }
  
  // Remove previous votes if not allowing multiple
  if (!this.poll.allowMultiple) {
    this.poll.options.forEach(opt => {
      opt.votes = opt.votes.filter(v => v.toString() !== userId.toString());
    });
  }
  
  // Add vote
  if (this.poll.options[optionIndex]) {
    const alreadyVoted = this.poll.options[optionIndex].votes.some(v => v.toString() === userId.toString());
    if (!alreadyVoted) {
      this.poll.options[optionIndex].votes.push(userId);
    }
  }
  
  await this.save();
  return { success: true, poll: this.poll };
};

module.exports = mongoose.model('GroupPost', groupPostSchema);
