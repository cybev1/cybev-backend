```javascript
const express = require('express');
const router = express.Router();
const Follow = require('../models/follow.model');
const User = require('../models/user.model');
const { authenticateToken } = require('../middleware/auth');

// Follow a user
router.post('/:userId', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.userId;
    const followingId = req.params.userId;

    // Check if trying to follow self
    if (followerId === followingId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    // Check if target user exists
    const targetUser = await User.findById(followingId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      follower: followerId,
      following: followingId
    });

    if (existingFollow) {
      return res.status(400).json({ error: 'Already following this user' });
    }

    // Create follow relationship
    const follow = new Follow({
      follower: followerId,
      following: followingId
    });

    await follow.save();

    // Update follower/following counts
    await User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(followingId, { $inc: { followerCount: 1 } });

    res.status(201).json({ 
      message: 'Successfully followed user',
      follow 
    });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow user' });
  }
});

// Unfollow a user
router.delete('/:userId', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.userId;
    const followingId = req.params.userId;

    const follow = await Follow.findOneAndDelete({
      follower: followerId,
      following: followingId
    });

    if (!follow) {
      return res.status(404).json({ error: 'Follow relationship not found' });
    }

    // Update follower/following counts
    await User.findByIdAndUpdate(followerId, { $inc: { followingCount: -1 } });
    await User.findByIdAndUpdate(followingId, { $inc: { followerCount: -1 } });

    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
});

// Check if following a user
router.get('/check/:userId', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.userId;
    const followingId = req.params.userId;

    const isFollowing = await Follow.exists({
      follower: followerId,
      following: followingId
    });

    res.json({ isFollowing: !!isFollowing });
  } catch (error) {
    console.error('Check follow error:', error);
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

// Get user's followers
router.get('/followers/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const followers = await Follow.find({ following: userId })
      .populate('follower', 'username email avatar bio followerCount followingCount')
      .sort('-createdAt')
      .limit(limit)
      .skip(skip);

    const total = await Follow.countDocuments({ following: userId });

    res.json({
      followers: followers.map(f => f.follower),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

// Get user's following
router.get('/following/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const following = await Follow.find({ follower: userId })
      .populate('following', 'username email avatar bio followerCount followingCount')
      .sort('-createdAt')
      .limit(limit)
      .skip(skip);

    const total = await Follow.countDocuments({ follower: userId });

    res.json({
      following: following.map(f => f.following),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Failed to fetch following' });
  }
});

// Get suggested users to follow (users you don't follow yet)
router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 5;

    // Get users the current user is already following
    const following = await Follow.find({ follower: userId }).select('following');
    const followingIds = following.map(f => f.following);

    // Find users not in the following list and not the current user
    const suggestions = await User.find({
      _id: { $nin: [...followingIds, userId] }
    })
      .select('username email avatar bio followerCount followingCount')
      .sort('-followerCount') // Sort by most followed
      .limit(limit);

    res.json({ suggestions });
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

module.exports = router;
```

---

### Update User Model
