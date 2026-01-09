// ============================================
// FILE: models/follow.model.js
// Follow System Model
// VERSION: 6.4.2
// ============================================

const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
  // The user who is following
  follower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // The user being followed
  following: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'blocked', 'muted'],
    default: 'active'
  },
  
  // Notification preferences
  notifications: {
    posts: { type: Boolean, default: true },
    stories: { type: Boolean, default: true },
    live: { type: Boolean, default: true }
  },
  
  // Close friends (like Instagram)
  isCloseFriend: { type: Boolean, default: false }
  
}, { timestamps: true });

// Compound unique index - prevent duplicate follows
followSchema.index({ follower: 1, following: 1 }, { unique: true });

// Index for efficient queries
followSchema.index({ follower: 1, status: 1 });
followSchema.index({ following: 1, status: 1 });
followSchema.index({ createdAt: -1 });

// Pre-save: Prevent self-follow
followSchema.pre('save', function(next) {
  if (this.follower.toString() === this.following.toString()) {
    return next(new Error('Cannot follow yourself'));
  }
  next();
});

// Static: Check if user A follows user B
followSchema.statics.isFollowing = async function(followerId, followingId) {
  const follow = await this.findOne({
    follower: followerId,
    following: followingId,
    status: 'active'
  });
  return !!follow;
};

// Static: Get follow counts for a user
followSchema.statics.getCounts = async function(userId) {
  const [followers, following] = await Promise.all([
    this.countDocuments({ following: userId, status: 'active' }),
    this.countDocuments({ follower: userId, status: 'active' })
  ]);
  return { followers, following };
};

// Static: Get mutual follows (friends)
followSchema.statics.getMutualFollows = async function(userId) {
  // Users that this user follows who also follow back
  const following = await this.find({ follower: userId, status: 'active' }).select('following');
  const followingIds = following.map(f => f.following);
  
  const mutuals = await this.find({
    follower: { $in: followingIds },
    following: userId,
    status: 'active'
  }).populate('follower', 'name username avatar');
  
  return mutuals.map(m => m.follower);
};

// Static: Get suggested users to follow
followSchema.statics.getSuggestions = async function(userId, limit = 10) {
  // Get users that the current user's followings follow
  const following = await this.find({ follower: userId, status: 'active' }).select('following');
  const followingIds = following.map(f => f.following.toString());
  followingIds.push(userId.toString()); // Exclude self
  
  const suggestions = await this.aggregate([
    // Find who my followings follow
    { $match: { follower: { $in: following.map(f => f.following) }, status: 'active' } },
    // Exclude users I already follow and myself
    { $match: { following: { $nin: followingIds.map(id => new mongoose.Types.ObjectId(id)) } } },
    // Group by suggested user
    { $group: { _id: '$following', mutualCount: { $sum: 1 } } },
    // Sort by mutual count
    { $sort: { mutualCount: -1 } },
    // Limit
    { $limit: limit },
    // Lookup user details
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: '$user._id',
        name: '$user.name',
        username: '$user.username',
        avatar: '$user.avatar',
        bio: '$user.bio',
        mutualCount: 1
      }
    }
  ]);
  
  return suggestions;
};

module.exports = mongoose.model('Follow', followSchema);
