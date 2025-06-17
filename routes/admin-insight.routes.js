
const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Post = require('../models/post.model');
const generateDashboardInsight = require('../utils/generateDashboardInsight');

router.get('/insight', async (req, res) => {
  try {
    const [users, posts] = await Promise.all([
      User.find(),
      Post.find()
    ]);

    const metrics = {
      users: users.length,
      posts: posts.length,
      views: posts.reduce((acc, p) => acc + (p.views || 0), 0),
      earnings: posts.reduce((acc, p) => acc + (p.earnings || 0), 0),
      topCity: 'Lagos',
      topDevice: 'Android',
      topRole: 'admin'
    };

    const summary = await generateDashboardInsight(metrics);
    res.json({ summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate dashboard summary' });
  }
});

module.exports = router;
