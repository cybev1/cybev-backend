
const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Post = require('../models/post.model');

router.get('/summary', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ isActive: true });
    const totalPosts = await Post.countDocuments();
    const totalEarnings = await Post.aggregate([{ $group: { _id: null, total: { $sum: '$earnings' } } }]);
    const totalViews = await Post.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);

    res.json({
      users: totalUsers,
      posts: totalPosts,
      earnings: totalEarnings[0]?.total || 0,
      views: totalViews[0]?.total || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load admin summary' });
  }
});

module.exports = router;
