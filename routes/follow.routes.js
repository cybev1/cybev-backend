// ============================================
// FILE: routes/follow.routes.js
// Follow System with Suggested Follows
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try { verifyToken = require('../middleware/auth'); } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

// Optional auth
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
    } catch {}
  }
  next();
};

// Load models
let User, Blog;
try { User = require('../models/user.model'); } catch (e) { User = mongoose.model('User'); }
try { Blog = require('../models/blog.model'); } catch (e) { Blog = mongoose.model('Blog'); }

// ==========================================
// POST /api/follow/:userId - Follow a user
// ==========================================
router.post('/:userId', verifyToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;
    
    if (targetUserId === currentUserId) {
      return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
    }
    
    // Get both users
    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId)
    ]);
    
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Initialize arrays if needed
    if (!currentUser.following) currentUser.following = [];
    if (!targetUser.followers) targetUser.followers = [];
    
    // Check if already following
    const alreadyFollowing = currentUser.following.some(
      id => id.toString() === targetUserId
    );
    
    if (alreadyFollowing) {
      return res.status(400).json({ success: false, error: 'Already following' });
    }
    
    // Add to following/followers
    currentUser.following.push(targetUserId);
    targetUser.followers.push(currentUserId);
    
    // Update counts
    currentUser.followingCount = currentUser.following.length;
    targetUser.followersCount = targetUser.followers.length;
    
    await Promise.all([currentUser.save(), targetUser.save()]);
    
    console.log(`👤 ${currentUserId} followed ${targetUserId}`);
    
    // Create notification (optional)
    try {
      const Notification = mongoose.model('Notification');
      await Notification.create({
        recipient: targetUserId,
        sender: currentUserId,
        type: 'follow',
        message: `${currentUser.name || currentUser.username} started following you`,
        read: false
      });
    } catch {}
    
    res.json({
      success: true,
      message: `You are now following ${targetUser.name || targetUser.username}!`,
      following: true,
      followersCount: targetUser.followersCount
    });
    
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ success: false, error: 'Failed to follow' });
  }
});

// ==========================================
// DELETE /api/follow/:userId - Unfollow a user
// ==========================================
router.delete('/:userId', verifyToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;
    
    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId)
    ]);
    
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Remove from following/followers
    if (currentUser.following) {
      currentUser.following = currentUser.following.filter(
        id => id.toString() !== targetUserId
      );
      currentUser.followingCount = currentUser.following.length;
    }
    
    if (targetUser.followers) {
      targetUser.followers = targetUser.followers.filter(
        id => id.toString() !== currentUserId
      );
      targetUser.followersCount = targetUser.followers.length;
    }
    
    await Promise.all([currentUser.save(), targetUser.save()]);
    
    console.log(`👤 ${currentUserId} unfollowed ${targetUserId}`);
    
    res.json({
      success: true,
      message: `You unfollowed ${targetUser.name || targetUser.username}`,
      following: false,
      followersCount: targetUser.followersCount
    });
    
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ success: false, error: 'Failed to unfollow' });
  }
});

// ==========================================
// GET /api/follow/check/:userId - Check if following
// ==========================================
router.get('/check/:userId', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('following');
    
    const isFollowing = user?.following?.some(
      id => id.toString() === req.params.userId
    ) || false;
    
    res.json({ 
      success: true, 
      following: isFollowing,
      isFollowing: isFollowing  // Alias for compatibility
    });
    
  } catch (error) {
    console.error('Check follow error:', error);
    res.status(500).json({ success: false, following: false, isFollowing: false });
  }
});

// ==========================================
// GET /api/follow/followers/:userId - Get user's followers
// ==========================================
router.get('/followers/:userId', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const user = await User.findById(req.params.userId)
      .populate({
        path: 'followers',
        select: 'name username profilePicture avatar bio followersCount',
        options: {
          skip: (parseInt(page) - 1) * parseInt(limit),
          limit: parseInt(limit)
        }
      });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check which ones current user follows
    let currentUserFollowing = [];
    if (req.user) {
      const currentUser = await User.findById(req.user.id).select('following');
      currentUserFollowing = currentUser?.following?.map(id => id.toString()) || [];
    }
    
    const followers = (user.followers || []).map(follower => ({
      ...follower.toObject(),
      isFollowedByMe: currentUserFollowing.includes(follower._id.toString())
    }));
    
    res.json({
      success: true,
      followers,
      total: user.followersCount || 0,
      page: parseInt(page)
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch followers' });
  }
});

// ==========================================
// GET /api/follow/following/:userId - Get who user is following
// ==========================================
router.get('/following/:userId', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const user = await User.findById(req.params.userId)
      .populate({
        path: 'following',
        select: 'name username profilePicture avatar bio followersCount',
        options: {
          skip: (parseInt(page) - 1) * parseInt(limit),
          limit: parseInt(limit)
        }
      });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({
      success: true,
      following: user.following || [],
      total: user.followingCount || 0,
      page: parseInt(page)
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch following' });
  }
});

// ==========================================
// GET /api/follow/suggestions - Get suggested users to follow
// ==========================================
router.get('/suggestions', optionalAuth, async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    let excludeIds = [];
    
    if (req.user) {
      const currentUser = await User.findById(req.user.id).select('following');
      const following = currentUser?.following?.map(id => id.toString()) || [];
      excludeIds = [...following, req.user.id];
    }
    
    // Convert to ObjectIds safely
    const excludeObjectIds = excludeIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
    
    // Find popular users to suggest
    let suggestions = [];
    
    try {
      suggestions = await User.aggregate([
        // Exclude self and already following
        { $match: excludeObjectIds.length > 0 ? { _id: { $nin: excludeObjectIds } } : {} },
        
        // Add score based on followers and activity
        {
          $addFields: {
            score: {
              $add: [
                { $ifNull: ['$followersCount', 0] },
                { $multiply: [{ $ifNull: ['$blogsCount', 0] }, 5] },
                { $multiply: [{ $ifNull: ['$totalViews', 0] }, 0.01] }
              ]
            }
          }
        },
        
        // Sort by score
        { $sort: { score: -1, createdAt: -1 } },
        
        // Limit
        { $limit: parseInt(limit) },
        
        // Project fields
        {
          $project: {
            name: 1,
            username: 1,
            profilePicture: 1,
            avatar: 1,
            bio: 1,
            followersCount: 1,
            blogsCount: 1,
            verified: 1,
            score: 1
          }
        }
      ]);
    } catch (aggError) {
      console.log('Aggregate error, falling back to simple query:', aggError.message);
      // Fallback to simple query
      suggestions = await User.find(
        excludeObjectIds.length > 0 ? { _id: { $nin: excludeObjectIds } } : {}
      )
      .select('name username profilePicture avatar bio followersCount')
      .sort({ followersCount: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .lean();
    }
    
    // If not enough suggestions, get recent users
    if (suggestions.length < parseInt(limit)) {
      const existingIds = [...excludeIds, ...suggestions.map(s => s._id.toString())];
      const validExistingIds = existingIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      
      const additional = await User.find(
        validExistingIds.length > 0 ? { _id: { $nin: validExistingIds } } : {}
      )
      .select('name username profilePicture avatar bio followersCount')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) - suggestions.length)
      .lean();
      
      suggestions.push(...additional);
    }
    
    res.json({
      success: true,
      suggestions: suggestions.map(user => ({
        ...user,
        isFollowing: false,
        suggestedReason: user.score > 100 ? 'Popular creator' : 
                        user.blogsCount > 5 ? 'Active writer' : 
                        'New to CYBEV'
      }))
    });
    
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch suggestions' });
  }
});

// ==========================================
// GET /api/follow/suggested-creators - Get top creators to follow
// ==========================================
router.get('/suggested-creators', optionalAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    let excludeIds = [];
    
    if (req.user) {
      const currentUser = await User.findById(req.user.id).select('following');
      excludeIds = [...(currentUser?.following?.map(id => id.toString()) || []), req.user.id];
    }
    
    // Find users with most content/engagement
    const creators = await Blog.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: '$author',
          blogsCount: { $sum: 1 },
          totalViews: { $sum: { $ifNull: ['$views', 0] } },
          totalLikes: { $sum: { $size: { $ifNull: ['$likes', []] } } }
        }
      },
      {
        $match: {
          _id: { $nin: excludeIds.map(id => mongoose.Types.ObjectId(id)) }
        }
      },
      { $sort: { totalViews: -1, blogsCount: -1 } },
      { $limit: parseInt(limit) },
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
          profilePicture: '$user.profilePicture',
          avatar: '$user.avatar',
          bio: '$user.bio',
          followersCount: '$user.followersCount',
          blogsCount: 1,
          totalViews: 1,
          totalLikes: 1
        }
      }
    ]);
    
    res.json({
      success: true,
      creators: creators.map(c => ({
        ...c,
        isFollowing: false
      }))
    });
    
  } catch (error) {
    console.error('Suggested creators error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch creators' });
  }
});

console.log('✅ Follow routes loaded');

module.exports = router;
