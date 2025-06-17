
const express = require('express');
const router = express.Router();
const Post = require('../models/post.model');
const User = require('../models/user.model');

router.get('/charts', async (req, res) => {
  try {
    const dailyPosts = await Post.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          posts: { $sum: 1 },
          views: { $sum: "$views" },
          earnings: { $sum: "$earnings" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const roleCounts = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } }
    ]);

    res.json({
      trends: dailyPosts,
      roles: roleCounts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Chart data fetch failed' });
  }
});

module.exports = router;
