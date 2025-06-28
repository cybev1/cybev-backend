
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Post = require('../models/post.model');

exports.getAdminAnalytics = async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setDate(endDate.getDate() + 1); // include end date fully

    // Fetch New Users per day
    const usersPerDay = await User.aggregate([
      { $match: { createdAt: { $gte: startDate, $lt: endDate } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Fetch Posts and Earnings per day
    const postsPerDay = await Post.aggregate([
      { $match: { createdAt: { $gte: startDate, $lt: endDate } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          posts: { $sum: 1 },
          views: { $sum: "$views" },
          earnings: { $sum: "$earnings" }
      }},
      { $sort: { _id: 1 } }
    ]);

    const merged = {};

    usersPerDay.forEach(day => {
      merged[day._id] = { date: day._id, users: day.count, posts: 0, views: 0, earnings: 0 };
    });

    postsPerDay.forEach(day => {
      if (!merged[day._id]) {
        merged[day._id] = { date: day._id, users: 0, posts: 0, views: 0, earnings: 0 };
      }
      merged[day._id].posts = day.posts;
      merged[day._id].views = day.views;
      merged[day._id].earnings = day.earnings;
    });

    const data = Object.values(merged);

    // Totals
    const totals = {
      users: data.reduce((a, b) => a + b.users, 0),
      posts: data.reduce((a, b) => a + b.posts, 0),
      views: data.reduce((a, b) => a + b.views, 0),
      earnings: data.reduce((a, b) => a + b.earnings, 0),
    };

    res.status(200).json({ data, totals });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to load analytics" });
  }
};
