// ============================================
// FILE: models/group.model.js
// Facebook-like Groups Model
// ============================================

const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  // Basic Info
  name: { type: String, required: true, trim: true, maxLength: 100 },
  slug: { type: String, unique: true, lowercase: true },
  description: { type: String, maxLength: 5000 },
  
  // Images
  coverImage: { type: String, default: '' },
  avatar: { type: String, default: '' },
  
  // Privacy: public (anyone can see & join), private (request to join), secret (invite only)
  privacy: { 
    type: String, 
    enum: ['public', 'private', 'secret'], 
    default: 'public' 
  },
  
  // Category
  category: { 
    type: String, 
    enum: [
      'general', 'technology', 'business', 'entertainment', 'sports', 
      'gaming', 'music', 'art', 'education', 'health', 'lifestyle',
      'news', 'science', 'travel', 'food', 'fashion', 'religion',
      'politics', 'parenting', 'pets', 'photography', 'fitness', 'other'
    ],
    default: 'general'
  },
  
  // Location (optional)
  location: {
    city: String,
    country: String,
    isLocal: { type: Boolean, default: false }
  },
  
  // Rules
  rules: [{
    title: { type: String, maxLength: 100 },
    description: { type: String, maxLength: 500 }
  }],
  
  // Tags for discovery
  tags: [{ type: String, lowercase: true, trim: true }],
  
  // Creator/Owner
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Admins (includes creator)
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Moderators
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Members
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'muted', 'banned'], default: 'active' }
  }],
  
  // Join Requests (for private groups)
  joinRequests: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    requestedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date
  }],
  
  // Invites
  invites: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
  }],
  
  // Stats
  stats: {
    memberCount: { type: Number, default: 1 },
    postCount: { type: Number, default: 0 },
    activeToday: { type: Number, default: 0 },
    activeThisWeek: { type: Number, default: 0 }
  },
  
  // Settings
  settings: {
    postApproval: { type: Boolean, default: false }, // Require admin approval for posts
    memberApproval: { type: Boolean, default: false }, // For public groups
    allowInvites: { type: Boolean, default: true }, // Members can invite
    showMemberList: { type: Boolean, default: true },
    allowPolls: { type: Boolean, default: true },
    allowEvents: { type: Boolean, default: true },
    allowFiles: { type: Boolean, default: true },
    defaultPostNotify: { type: Boolean, default: true }
  },
  
  // Features enabled
  features: {
    chat: { type: Boolean, default: true },
    events: { type: Boolean, default: true },
    polls: { type: Boolean, default: true },
    files: { type: Boolean, default: true },
    announcements: { type: Boolean, default: true },
    badges: { type: Boolean, default: false }
  },
  
  // Pinned posts
  pinnedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GroupPost' }],
  
  // Featured (for discovery)
  isFeatured: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  
  // Status
  isActive: { type: Boolean, default: true },
  isArchived: { type: Boolean, default: false },
  
  // Timestamps
  lastActivityAt: { type: Date, default: Date.now }
  
}, { timestamps: true });

// Indexes
groupSchema.index({ slug: 1 });
groupSchema.index({ name: 'text', description: 'text', tags: 'text' });
groupSchema.index({ privacy: 1, isActive: 1 });
groupSchema.index({ category: 1 });
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ creator: 1 });
groupSchema.index({ 'stats.memberCount': -1 });

// Pre-save: Generate slug
groupSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('name')) {
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    let slug = baseSlug;
    let counter = 1;
    
    while (await mongoose.models.Group.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  
  // Ensure creator is admin
  if (this.isNew && this.creator) {
    if (!this.admins.includes(this.creator)) {
      this.admins.push(this.creator);
    }
    if (!this.members.find(m => m.user?.toString() === this.creator.toString())) {
      this.members.push({
        user: this.creator,
        role: 'admin',
        joinedAt: new Date()
      });
    }
  }
  
  next();
});

// Virtual: is user member
groupSchema.methods.isMember = function(userId) {
  return this.members.some(m => m.user?.toString() === userId.toString() && m.status === 'active');
};

// Virtual: is user admin
groupSchema.methods.isAdmin = function(userId) {
  return this.admins.some(a => a.toString() === userId.toString());
};

// Virtual: is user moderator
groupSchema.methods.isModerator = function(userId) {
  return this.moderators.some(m => m.toString() === userId.toString()) || this.isAdmin(userId);
};

// Method: Add member
groupSchema.methods.addMember = async function(userId, invitedBy = null) {
  if (this.isMember(userId)) return { success: false, error: 'Already a member' };
  
  this.members.push({
    user: userId,
    role: 'member',
    invitedBy,
    joinedAt: new Date()
  });
  
  this.stats.memberCount = this.members.filter(m => m.status === 'active').length;
  this.lastActivityAt = new Date();
  
  await this.save();
  return { success: true };
};

// Method: Remove member
groupSchema.methods.removeMember = async function(userId) {
  const memberIndex = this.members.findIndex(m => m.user?.toString() === userId.toString());
  if (memberIndex === -1) return { success: false, error: 'Not a member' };
  
  // Can't remove creator
  if (this.creator.toString() === userId.toString()) {
    return { success: false, error: 'Cannot remove group creator' };
  }
  
  this.members.splice(memberIndex, 1);
  this.admins = this.admins.filter(a => a.toString() !== userId.toString());
  this.moderators = this.moderators.filter(m => m.toString() !== userId.toString());
  
  this.stats.memberCount = this.members.filter(m => m.status === 'active').length;
  
  await this.save();
  return { success: true };
};

// Method: Update member role
groupSchema.methods.updateMemberRole = async function(userId, newRole) {
  const member = this.members.find(m => m.user?.toString() === userId.toString());
  if (!member) return { success: false, error: 'Not a member' };
  
  member.role = newRole;
  
  if (newRole === 'admin') {
    if (!this.admins.includes(userId)) this.admins.push(userId);
    this.moderators = this.moderators.filter(m => m.toString() !== userId.toString());
  } else if (newRole === 'moderator') {
    if (!this.moderators.includes(userId)) this.moderators.push(userId);
    this.admins = this.admins.filter(a => a.toString() !== userId.toString());
  } else {
    this.admins = this.admins.filter(a => a.toString() !== userId.toString());
    this.moderators = this.moderators.filter(m => m.toString() !== userId.toString());
  }
  
  await this.save();
  return { success: true };
};

module.exports = mongoose.model('Group', groupSchema);
