// ============================================
// FILE: server/routes/follow.routes.js
// ============================================
const express = require('express');
const router = express.Router();
const Follow = require('../models/follow.model');
const User = require('../models/user.model');
const { authenticateToken } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');

router.post('/:userId', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    if (followerId === followingId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const targetUser = await User.findById(followingId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingFollow = await Follow.findOne({
      follower: followerId,
      following: followingId
    });

    if (existingFollow) {
      return res.status(400).json({ error: 'Already following this user' });
    }

    const follow = new Follow({
      follower: followerId,
      following: followingId
    });

    await follow.save();
    await User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(followingId, { $inc: { followerCount: 1 } });

    await createNotification({
      recipient: followingId,
      sender: followerId,
      type: 'follow',
      message: 'started following you'
    });

    res.status(201).json({ 
      ok: true,
      message: 'Successfully followed user',
      follow 
    });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ ok: false, error: 'Failed to follow user' });
  }
});

router.delete('/:userId', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    const follow = await Follow.findOneAndDelete({
      follower: followerId,
      following: followingId
    });

    if (!follow) {
      return res.status(404).json({ error: 'Follow relationship not found' });
    }

    await User.findByIdAndUpdate(followerId, { $inc: { followingCount: -1 } });
    await User.findByIdAndUpdate(followingId, { $inc: { followerCount: -1 } });

    res.json({ ok: true, message: 'Successfully unfollowed user' });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ ok: false, error: 'Failed to unfollow user' });
  }
});

router.get('/check/:userId', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    const isFollowing = await Follow.exists({
      follower: followerId,
      following: followingId
    });

    res.json({ ok: true, isFollowing: !!isFollowing });
  } catch (error) {
    console.error('Check follow error:', error);
    res.status(500).json({ ok: false, error: 'Failed to check follow status' });
  }
});

router.get('/followers/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const followers = await Follow.find({ following: userId })
      .populate('follower', 'username name email avatar bio followerCount followingCount')
      .sort('-createdAt')
      .limit(limit)
      .skip(skip);

    const total = await Follow.countDocuments({ following: userId });

    res.json({
      ok: true,
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
    res.status(500).json({ ok: false, error: 'Failed to fetch followers' });
  }
});

router.get('/following/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const following = await Follow.find({ follower: userId })
      .populate('following', 'username name email avatar bio followerCount followingCount')
      .sort('-createdAt')
      .limit(limit)
      .skip(skip);

    const total = await Follow.countDocuments({ follower: userId });

    res.json({
      ok: true,
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
    res.status(500).json({ ok: false, error: 'Failed to fetch following' });
  }
});

router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 5;

    const following = await Follow.find({ follower: userId }).select('following');
    const followingIds = following.map(f => f.following);

    const suggestions = await User.find({
      _id: { $nin: [...followingIds, userId] }
    })
      .select('username name email avatar bio followerCount followingCount')
      .sort('-followerCount')
      .limit(limit);

    res.json({ ok: true, suggestions });
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch suggestions' });
  }
});

module.exports = router;
