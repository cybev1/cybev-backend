// ============================================
// FILE: routes/follow.routes.js
// Follow System API Routes
// VERSION: 6.4.2 - Complete Facebook-like Follow System
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models
const getFollowModel = () => mongoose.models.Follow || require('../models/follow.model');
const getUserModel = () => mongoose.models.User || require('../models/user.model');

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { 
    return res.status(401).json({ ok: false, error: 'Invalid token' }); 
  }
};

// Optional auth
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    } catch {}
  }
  next();
};

// Helper: Update user follow counts
const updateUserCounts = async (userId) => {
  try {
    const Follow = getFollowModel();
    const User = getUserModel();
    
    const [followersCount, followingCount] = await Promise.all([
      Follow.countDocuments({ following: userId, status: 'active' }),
      Follow.countDocuments({ follower: userId, status: 'active' })
    ]);
    
    await User.findByIdAndUpdate(userId, {
      followersCount,
      followingCount
    });
    
    return { followersCount, followingCount };
  } catch (err) {
    console.error('Update counts error:', err);
  }
};

// Helper: Create notification
const createNotification = async (userId, type, data) => {
  try {
    const Notification = mongoose.models.Notification;
    if (!Notification) return;
    
    await Notification.create({
      user: userId,
      type,
      ...data
    });
  } catch (err) {
    console.error('Notification error:', err);
  }
};

// ==========================================
// FOLLOW / UNFOLLOW
// ==========================================

// POST /api/follow/:userId - Follow a user
router.post('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    // Can't follow yourself
    if (userId === followerId) {
      return res.status(400).json({ ok: false, error: 'Cannot follow yourself' });
    }
    
    const Follow = getFollowModel();
    const User = getUserModel();
    
    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    // Check if already following
    const existingFollow = await Follow.findOne({
      follower: followerId,
      following: userId
    });
    
    if (existingFollow) {
      if (existingFollow.status === 'active') {
        return res.status(400).json({ ok: false, error: 'Already following this user' });
      }
      // Reactivate if was inactive
      existingFollow.status = 'active';
      await existingFollow.save();
    } else {
      // Create new follow
      await Follow.create({
        follower: followerId,
        following: userId,
        status: 'active'
      });
    }
    
    // Update counts for both users
    const [followerCounts, followingCounts] = await Promise.all([
      updateUserCounts(followerId),
      updateUserCounts(userId)
    ]);
    
    // Create notification
    await createNotification(userId, 'follow', {
      fromUser: followerId,
      message: 'started following you'
    });
    
    // Get updated follower info
    const follower = await User.findById(followerId).select('name username avatar');
    
    res.json({
      ok: true,
      message: 'Successfully followed user',
      isFollowing: true,
      follower,
      counts: {
        targetFollowers: followingCounts?.followersCount || 0,
        yourFollowing: followerCounts?.followingCount || 0
      }
    });
    
  } catch (error) {
    console.error('Follow error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ ok: false, error: 'Already following this user' });
    }
    
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/follow/:userId - Unfollow a user
router.delete('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const Follow = getFollowModel();
    
    const result = await Follow.findOneAndDelete({
      follower: followerId,
      following: userId
    });
    
    if (!result) {
      return res.status(400).json({ ok: false, error: 'Not following this user' });
    }
    
    // Update counts
    const [followerCounts, followingCounts] = await Promise.all([
      updateUserCounts(followerId),
      updateUserCounts(userId)
    ]);
    
    res.json({
      ok: true,
      message: 'Successfully unfollowed user',
      isFollowing: false,
      counts: {
        targetFollowers: followingCounts?.followersCount || 0,
        yourFollowing: followerCounts?.followingCount || 0
      }
    });
    
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/follow/:userId/toggle - Toggle follow (convenience endpoint)
router.post('/:userId/toggle', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    if (userId === followerId) {
      return res.status(400).json({ ok: false, error: 'Cannot follow yourself' });
    }
    
    const Follow = getFollowModel();
    const User = getUserModel();
    
    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    // Check current follow status
    const existingFollow = await Follow.findOne({
      follower: followerId,
      following: userId,
      status: 'active'
    });
    
    let isFollowing;
    
    if (existingFollow) {
      // Unfollow
      await Follow.findByIdAndDelete(existingFollow._id);
      isFollowing = false;
    } else {
      // Follow
      await Follow.findOneAndUpdate(
        { follower: followerId, following: userId },
        { follower: followerId, following: userId, status: 'active' },
        { upsert: true, new: true }
      );
      isFollowing = true;
      
      // Create notification
      await createNotification(userId, 'follow', {
        fromUser: followerId,
        message: 'started following you'
      });
    }
    
    // Update counts
    const [followerCounts, followingCounts] = await Promise.all([
      updateUserCounts(followerId),
      updateUserCounts(userId)
    ]);
    
    res.json({
      ok: true,
      isFollowing,
      message: isFollowing ? 'Now following' : 'Unfollowed',
      counts: {
        targetFollowers: followingCounts?.followersCount || 0,
        yourFollowing: followerCounts?.followingCount || 0
      }
    });
    
  } catch (error) {
    console.error('Toggle follow error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GET FOLLOWERS / FOLLOWING
// ==========================================

// GET /api/follow/:userId/followers - Get user's followers
router.get('/:userId/followers', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, search } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const Follow = getFollowModel();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = { following: userId, status: 'active' };
    
    // Get followers with pagination
    const [follows, total] = await Promise.all([
      Follow.find(query)
        .populate('follower', 'name username avatar bio followersCount followingCount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Follow.countDocuments(query)
    ]);
    
    // Extract follower data
    let followers = follows.map(f => ({
      ...f.follower,
      followedAt: f.createdAt
    }));
    
    // Search filter (applied after populate)
    if (search) {
      const searchLower = search.toLowerCase();
      followers = followers.filter(f => 
        f.name?.toLowerCase().includes(searchLower) ||
        f.username?.toLowerCase().includes(searchLower)
      );
    }
    
    // Check if current user follows each follower
    if (req.user) {
      const followingIds = await Follow.find({
        follower: req.user.id,
        following: { $in: followers.map(f => f._id) },
        status: 'active'
      }).select('following');
      
      const followingSet = new Set(followingIds.map(f => f.following.toString()));
      
      followers = followers.map(f => ({
        ...f,
        isFollowing: followingSet.has(f._id.toString()),
        isMe: f._id.toString() === req.user.id
      }));
    }
    
    res.json({
      ok: true,
      followers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/follow/:userId/following - Get users that this user follows
router.get('/:userId/following', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, search } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const Follow = getFollowModel();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = { follower: userId, status: 'active' };
    
    const [follows, total] = await Promise.all([
      Follow.find(query)
        .populate('following', 'name username avatar bio followersCount followingCount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Follow.countDocuments(query)
    ]);
    
    let following = follows.map(f => ({
      ...f.following,
      followedAt: f.createdAt
    }));
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      following = following.filter(f => 
        f.name?.toLowerCase().includes(searchLower) ||
        f.username?.toLowerCase().includes(searchLower)
      );
    }
    
    // Check if current user follows each user
    if (req.user) {
      const followingIds = await Follow.find({
        follower: req.user.id,
        following: { $in: following.map(f => f._id) },
        status: 'active'
      }).select('following');
      
      const followingSet = new Set(followingIds.map(f => f.following.toString()));
      
      following = following.map(f => ({
        ...f,
        isFollowing: followingSet.has(f._id.toString()),
        isMe: f._id.toString() === req.user.id
      }));
    }
    
    res.json({
      ok: true,
      following,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// STATUS CHECKS
// ==========================================

// GET /api/follow/:userId/status - Check follow status
router.get('/:userId/status', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const Follow = getFollowModel();
    
    // Check both directions
    const [following, followedBy] = await Promise.all([
      Follow.findOne({ follower: currentUserId, following: userId, status: 'active' }),
      Follow.findOne({ follower: userId, following: currentUserId, status: 'active' })
    ]);
    
    res.json({
      ok: true,
      isFollowing: !!following,
      isFollowedBy: !!followedBy,
      isMutual: !!(following && followedBy)
    });
    
  } catch (error) {
    console.error('Check status error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/follow/:userId/counts - Get follow counts
router.get('/:userId/counts', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const Follow = getFollowModel();
    
    const [followersCount, followingCount] = await Promise.all([
      Follow.countDocuments({ following: userId, status: 'active' }),
      Follow.countDocuments({ follower: userId, status: 'active' })
    ]);
    
    res.json({
      ok: true,
      followersCount,
      followingCount
    });
    
  } catch (error) {
    console.error('Get counts error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// MUTUAL / SUGGESTIONS
// ==========================================

// GET /api/follow/:userId/mutuals - Get mutual follows
router.get('/:userId/mutuals', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const Follow = getFollowModel();
    
    // Get users that userId follows
    const following = await Follow.find({ follower: userId, status: 'active' }).select('following');
    const followingIds = following.map(f => f.following);
    
    // Find which of those follow back
    const mutualFollows = await Follow.find({
      follower: { $in: followingIds },
      following: userId,
      status: 'active'
    })
      .populate('follower', 'name username avatar bio')
      .limit(parseInt(limit));
    
    const mutuals = mutualFollows.map(f => f.follower);
    
    res.json({
      ok: true,
      mutuals,
      count: mutuals.length
    });
    
  } catch (error) {
    console.error('Get mutuals error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/follow/suggestions - Get follow suggestions
router.get('/suggestions', verifyToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user.id;
    
    const Follow = getFollowModel();
    const User = getUserModel();
    
    // Get users current user follows
    const following = await Follow.find({ follower: userId, status: 'active' }).select('following');
    const followingIds = following.map(f => f.following.toString());
    followingIds.push(userId); // Exclude self
    
    // Strategy 1: Friends of friends
    let suggestions = [];
    
    if (followingIds.length > 1) {
      suggestions = await Follow.aggregate([
        // Find who my followings follow
        { $match: { 
          follower: { $in: following.map(f => f.following) }, 
          status: 'active' 
        }},
        // Exclude users I already follow and myself
        { $match: { 
          following: { $nin: followingIds.map(id => new mongoose.Types.ObjectId(id)) } 
        }},
        // Group by suggested user
        { $group: { _id: '$following', mutualCount: { $sum: 1 } } },
        // Sort by mutual count
        { $sort: { mutualCount: -1 } },
        // Limit
        { $limit: parseInt(limit) },
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
            followersCount: '$user.followersCount',
            mutualCount: 1
          }
        }
      ]);
    }
    
    // Strategy 2: Popular users (if not enough suggestions)
    if (suggestions.length < parseInt(limit)) {
      const remainingCount = parseInt(limit) - suggestions.length;
      const suggestionIds = suggestions.map(s => s._id.toString());
      
      const popularUsers = await User.find({
        _id: { $nin: [...followingIds, ...suggestionIds].map(id => new mongoose.Types.ObjectId(id)) },
        isActive: { $ne: false }
      })
        .select('name username avatar bio followersCount')
        .sort({ followersCount: -1 })
        .limit(remainingCount);
      
      suggestions = [
        ...suggestions,
        ...popularUsers.map(u => ({ ...u.toObject(), mutualCount: 0 }))
      ];
    }
    
    res.json({
      ok: true,
      suggestions
    });
    
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// REMOVE FOLLOWER
// ==========================================

// DELETE /api/follow/:userId/remove-follower - Remove someone from your followers
router.delete('/:userId/remove-follower', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }
    
    const Follow = getFollowModel();
    
    // Remove the follow where userId follows currentUser
    const result = await Follow.findOneAndDelete({
      follower: userId,
      following: currentUserId
    });
    
    if (!result) {
      return res.status(400).json({ ok: false, error: 'This user is not following you' });
    }
    
    // Update counts
    await Promise.all([
      updateUserCounts(userId),
      updateUserCounts(currentUserId)
    ]);
    
    res.json({
      ok: true,
      message: 'Follower removed'
    });
    
  } catch (error) {
    console.error('Remove follower error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// BATCH OPERATIONS
// ==========================================

// POST /api/follow/batch/status - Check follow status for multiple users
router.post('/batch/status', verifyToken, async (req, res) => {
  try {
    const { userIds } = req.body;
    const currentUserId = req.user.id;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'userIds array required' });
    }
    
    // Limit batch size
    const limitedIds = userIds.slice(0, 100);
    
    const Follow = getFollowModel();
    
    // Get all follows from current user to these users
    const follows = await Follow.find({
      follower: currentUserId,
      following: { $in: limitedIds },
      status: 'active'
    }).select('following');
    
    const followingSet = new Set(follows.map(f => f.following.toString()));
    
    const statuses = {};
    limitedIds.forEach(id => {
      statuses[id] = followingSet.has(id);
    });
    
    res.json({
      ok: true,
      statuses
    });
    
  } catch (error) {
    console.error('Batch status error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
