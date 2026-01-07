// ============================================
// FILE: routes/creator-analytics.routes.js
// Creator Analytics Dashboard API
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Models
const User = require('../models/user.model');
const Post = require('../models/post.model');
const Blog = require('../models/blog.model');

// Try to load optional models
let Vlog, Follow, Notification, Reaction;
try { Vlog = require('../models/vlog.model'); } catch (e) {}
try { Follow = require('../models/follow.model'); } catch (e) {}
try { Notification = require('../models/notification.model'); } catch (e) {}
try { Reaction = require('../models/reaction.model'); } catch (e) {}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Get date range for queries
function getDateRange(period) {
  const now = new Date();
  const ranges = {
    '7d': new Date(now - 7 * 24 * 60 * 60 * 1000),
    '30d': new Date(now - 30 * 24 * 60 * 60 * 1000),
    '90d': new Date(now - 90 * 24 * 60 * 60 * 1000),
    '1y': new Date(now - 365 * 24 * 60 * 60 * 1000),
    'all': new Date(0)
  };
  return ranges[period] || ranges['30d'];
}

// Format number with K/M suffix
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Calculate percentage change
function calcChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ==========================================
// GET DASHBOARD OVERVIEW
// ==========================================

router.get('/overview', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '30d' } = req.query;
    const startDate = getDateRange(period);
    const previousStartDate = new Date(startDate - (Date.now() - startDate));

    // Get user data
    const user = await User.findById(userId).select('followerCount followingCount createdAt');

    // Current period stats
    const [
      totalPosts,
      totalBlogs,
      totalVlogs,
      periodPosts,
      periodBlogs,
      newFollowers
    ] = await Promise.all([
      // All-time counts
      Post.countDocuments({ author: userId }),
      Blog.countDocuments({ author: userId, status: 'published' }),
      Vlog ? Vlog.countDocuments({ author: userId }) : 0,
      // Period counts
      Post.countDocuments({ author: userId, createdAt: { $gte: startDate } }),
      Blog.countDocuments({ author: userId, status: 'published', createdAt: { $gte: startDate } }),
      Follow ? Follow.countDocuments({ following: userId, createdAt: { $gte: startDate } }) : 0
    ]);

    // Previous period stats for comparison
    const [prevPosts, prevBlogs, prevFollowers] = await Promise.all([
      Post.countDocuments({ 
        author: userId, 
        createdAt: { $gte: previousStartDate, $lt: startDate } 
      }),
      Blog.countDocuments({ 
        author: userId, 
        status: 'published',
        createdAt: { $gte: previousStartDate, $lt: startDate } 
      }),
      Follow ? Follow.countDocuments({ 
        following: userId, 
        createdAt: { $gte: previousStartDate, $lt: startDate } 
      }) : 0
    ]);

    // Get engagement stats
    const posts = await Post.find({ author: userId }).select('likes comments shares views createdAt');
    
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalViews = 0;
    let periodLikes = 0, periodComments = 0;

    posts.forEach(post => {
      const likes = Array.isArray(post.likes) ? post.likes.length : (post.likes || 0);
      const comments = Array.isArray(post.comments) ? post.comments.length : (post.comments || 0);
      const shares = post.shares || 0;
      const views = post.views || 0;

      totalLikes += likes;
      totalComments += comments;
      totalShares += shares;
      totalViews += views;

      if (post.createdAt >= startDate) {
        periodLikes += likes;
        periodComments += comments;
      }
    });

    // Calculate engagement rate
    const totalContent = totalPosts + totalBlogs + totalVlogs;
    const totalEngagement = totalLikes + totalComments + totalShares;
    const engagementRate = totalViews > 0 ? ((totalEngagement / totalViews) * 100).toFixed(2) : 0;

    res.json({
      ok: true,
      overview: {
        // Main stats
        followers: {
          total: user?.followerCount || 0,
          new: newFollowers,
          change: calcChange(newFollowers, prevFollowers)
        },
        following: user?.followingCount || 0,
        
        // Content stats
        content: {
          total: totalContent,
          posts: totalPosts,
          blogs: totalBlogs,
          vlogs: totalVlogs,
          periodPosts: periodPosts + periodBlogs,
          change: calcChange(periodPosts + periodBlogs, prevPosts + prevBlogs)
        },
        
        // Engagement stats
        engagement: {
          likes: totalLikes,
          comments: totalComments,
          shares: totalShares,
          views: totalViews,
          rate: parseFloat(engagementRate),
          periodLikes,
          periodComments
        },
        
        // Account info
        memberSince: user?.createdAt,
        period
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch analytics' });
  }
});

// ==========================================
// GET ENGAGEMENT OVER TIME (Chart Data)
// ==========================================

router.get('/engagement-chart', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '30d' } = req.query;
    const startDate = getDateRange(period);

    // Determine grouping interval
    const daysDiff = Math.ceil((Date.now() - startDate) / (1000 * 60 * 60 * 24));
    let groupBy, dateFormat;
    
    if (daysDiff <= 7) {
      groupBy = { $dayOfMonth: '$createdAt' };
      dateFormat = '%Y-%m-%d';
    } else if (daysDiff <= 30) {
      groupBy = { $dayOfMonth: '$createdAt' };
      dateFormat = '%Y-%m-%d';
    } else if (daysDiff <= 90) {
      groupBy = { $week: '$createdAt' };
      dateFormat = '%Y-W%V';
    } else {
      groupBy = { $month: '$createdAt' };
      dateFormat = '%Y-%m';
    }

    // Aggregate posts by date
    const postStats = await Post.aggregate([
      {
        $match: {
          author: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          posts: { $sum: 1 },
          likes: { $sum: { $cond: [{ $isArray: '$likes' }, { $size: '$likes' }, '$likes'] } },
          comments: { $sum: { $cond: [{ $isArray: '$comments' }, { $size: '$comments' }, '$comments'] } },
          views: { $sum: { $ifNull: ['$views', 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill in missing dates
    const chartData = [];
    const dateMap = new Map(postStats.map(s => [s._id, s]));
    
    let current = new Date(startDate);
    while (current <= new Date()) {
      const dateKey = current.toISOString().split('T')[0];
      const data = dateMap.get(dateKey) || { posts: 0, likes: 0, comments: 0, views: 0 };
      
      chartData.push({
        date: dateKey,
        label: new Date(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        posts: data.posts,
        likes: data.likes,
        comments: data.comments,
        views: data.views,
        engagement: data.likes + data.comments
      });
      
      current.setDate(current.getDate() + 1);
    }

    // Limit data points for readability
    let finalData = chartData;
    if (chartData.length > 30) {
      // Sample every nth point
      const n = Math.ceil(chartData.length / 30);
      finalData = chartData.filter((_, i) => i % n === 0);
    }

    res.json({
      ok: true,
      chart: {
        data: finalData,
        period,
        totalPoints: finalData.length
      }
    });
  } catch (error) {
    console.error('Engagement chart error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch chart data' });
  }
});

// ==========================================
// GET TOP PERFORMING CONTENT
// ==========================================

router.get('/top-content', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '30d', limit = 10, type = 'all' } = req.query;
    const startDate = getDateRange(period);

    const results = [];

    // Get top posts
    if (type === 'all' || type === 'posts') {
      const topPosts = await Post.find({
        author: userId,
        createdAt: { $gte: startDate }
      })
        .sort({ 'likes.length': -1, views: -1 })
        .limit(parseInt(limit))
        .select('content media likes comments shares views createdAt')
        .lean();

      topPosts.forEach(post => {
        results.push({
          type: 'post',
          id: post._id,
          content: post.content?.substring(0, 100) + (post.content?.length > 100 ? '...' : ''),
          thumbnail: post.media?.[0]?.url,
          likes: Array.isArray(post.likes) ? post.likes.length : (post.likes || 0),
          comments: Array.isArray(post.comments) ? post.comments.length : (post.comments || 0),
          shares: post.shares || 0,
          views: post.views || 0,
          engagement: (Array.isArray(post.likes) ? post.likes.length : 0) + 
                      (Array.isArray(post.comments) ? post.comments.length : 0),
          createdAt: post.createdAt
        });
      });
    }

    // Get top blogs
    if (type === 'all' || type === 'blogs') {
      const topBlogs = await Blog.find({
        author: userId,
        status: 'published',
        createdAt: { $gte: startDate }
      })
        .sort({ views: -1, 'likes.length': -1 })
        .limit(parseInt(limit))
        .select('title slug coverImage likes comments views createdAt')
        .lean();

      topBlogs.forEach(blog => {
        results.push({
          type: 'blog',
          id: blog._id,
          title: blog.title,
          slug: blog.slug,
          thumbnail: blog.coverImage,
          likes: Array.isArray(blog.likes) ? blog.likes.length : (blog.likes || 0),
          comments: Array.isArray(blog.comments) ? blog.comments.length : (blog.comments || 0),
          views: blog.views || 0,
          engagement: (Array.isArray(blog.likes) ? blog.likes.length : 0) + 
                      (Array.isArray(blog.comments) ? blog.comments.length : 0),
          createdAt: blog.createdAt
        });
      });
    }

    // Sort by engagement and limit
    results.sort((a, b) => b.engagement - a.engagement);

    res.json({
      ok: true,
      content: results.slice(0, parseInt(limit)),
      period
    });
  } catch (error) {
    console.error('Top content error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch top content' });
  }
});

// ==========================================
// GET FOLLOWER GROWTH
// ==========================================

router.get('/follower-growth', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '30d' } = req.query;
    const startDate = getDateRange(period);

    if (!Follow) {
      return res.json({ ok: true, growth: [], message: 'Follow model not available' });
    }

    // Get follower growth over time
    const growth = await Follow.aggregate([
      {
        $match: {
          following: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate cumulative growth
    let cumulative = 0;
    const chartData = growth.map(day => {
      cumulative += day.count;
      return {
        date: day._id,
        label: new Date(day._id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        new: day.count,
        cumulative
      };
    });

    res.json({
      ok: true,
      growth: chartData,
      total: cumulative,
      period
    });
  } catch (error) {
    console.error('Follower growth error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch follower growth' });
  }
});

// ==========================================
// GET CONTENT BREAKDOWN (Pie Chart)
// ==========================================

router.get('/content-breakdown', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [posts, blogs, vlogs] = await Promise.all([
      Post.countDocuments({ author: userId }),
      Blog.countDocuments({ author: userId, status: 'published' }),
      Vlog ? Vlog.countDocuments({ author: userId }) : 0
    ]);

    const total = posts + blogs + vlogs;

    res.json({
      ok: true,
      breakdown: [
        { name: 'Posts', value: posts, percentage: total > 0 ? Math.round((posts / total) * 100) : 0, color: '#9333ea' },
        { name: 'Blogs', value: blogs, percentage: total > 0 ? Math.round((blogs / total) * 100) : 0, color: '#ec4899' },
        { name: 'Vlogs', value: vlogs, percentage: total > 0 ? Math.round((vlogs / total) * 100) : 0, color: '#3b82f6' }
      ],
      total
    });
  } catch (error) {
    console.error('Content breakdown error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch breakdown' });
  }
});

// ==========================================
// GET REACTION BREAKDOWN
// ==========================================

router.get('/reaction-breakdown', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '30d' } = req.query;
    const startDate = getDateRange(period);

    // Get all user's posts
    const postIds = await Post.find({ author: userId }).distinct('_id');

    if (!Reaction) {
      // Fallback: estimate from posts
      const posts = await Post.find({ author: userId }).select('likes');
      const totalLikes = posts.reduce((sum, p) => sum + (Array.isArray(p.likes) ? p.likes.length : 0), 0);
      
      return res.json({
        ok: true,
        reactions: [
          { type: 'like', emoji: '👍', count: totalLikes, percentage: 100, color: '#3b82f6' }
        ],
        total: totalLikes
      });
    }

    // Get reaction breakdown
    const reactions = await Reaction.aggregate([
      {
        $match: {
          post: { $in: postIds },
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const reactionTypes = {
      like: { emoji: '👍', color: '#3b82f6' },
      love: { emoji: '❤️', color: '#ef4444' },
      haha: { emoji: '😂', color: '#f59e0b' },
      wow: { emoji: '😮', color: '#8b5cf6' },
      sad: { emoji: '😢', color: '#6b7280' },
      angry: { emoji: '😡', color: '#dc2626' }
    };

    const total = reactions.reduce((sum, r) => sum + r.count, 0);

    const breakdown = reactions.map(r => ({
      type: r._id,
      emoji: reactionTypes[r._id]?.emoji || '👍',
      count: r.count,
      percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
      color: reactionTypes[r._id]?.color || '#9333ea'
    }));

    res.json({
      ok: true,
      reactions: breakdown,
      total,
      period
    });
  } catch (error) {
    console.error('Reaction breakdown error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch reactions' });
  }
});

// ==========================================
// GET POSTING ACTIVITY (Heatmap Data)
// ==========================================

router.get('/activity-heatmap', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '90d' } = req.query;
    const startDate = getDateRange(period);

    // Get posting activity by day and hour
    const activity = await Post.aggregate([
      {
        $match: {
          author: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            dayOfWeek: { $dayOfWeek: '$createdAt' },
            hour: { $hour: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Create heatmap grid (7 days x 24 hours)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const heatmap = [];

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const found = activity.find(a => a._id.dayOfWeek === day + 1 && a._id.hour === hour);
        heatmap.push({
          day: days[day],
          dayIndex: day,
          hour,
          hourLabel: `${hour.toString().padStart(2, '0')}:00`,
          count: found?.count || 0
        });
      }
    }

    // Find best posting times
    const sortedByCount = [...heatmap].sort((a, b) => b.count - a.count);
    const bestTimes = sortedByCount.slice(0, 5).filter(t => t.count > 0);

    res.json({
      ok: true,
      heatmap,
      bestTimes: bestTimes.map(t => ({
        day: t.day,
        time: t.hourLabel,
        posts: t.count
      })),
      period
    });
  } catch (error) {
    console.error('Activity heatmap error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch activity' });
  }
});

// ==========================================
// GET AUDIENCE INSIGHTS
// ==========================================

router.get('/audience', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!Follow) {
      return res.json({ 
        ok: true, 
        audience: { 
          totalFollowers: 0,
          recentFollowers: [],
          topEngagers: []
        }
      });
    }

    // Get recent followers
    const recentFollowers = await Follow.find({ following: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('follower', 'name username avatar')
      .lean();

    // Get user's follower count
    const user = await User.findById(userId).select('followerCount');

    res.json({
      ok: true,
      audience: {
        totalFollowers: user?.followerCount || 0,
        recentFollowers: recentFollowers.map(f => ({
          id: f.follower?._id,
          name: f.follower?.name,
          username: f.follower?.username,
          avatar: f.follower?.avatar,
          followedAt: f.createdAt
        })),
        // Top engagers would require tracking who interacts most
        topEngagers: []
      }
    });
  } catch (error) {
    console.error('Audience insights error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch audience data' });
  }
});

// ==========================================
// GET QUICK STATS (For Dashboard Cards)
// ==========================================

router.get('/quick-stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeek = new Date(today - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today - 30 * 24 * 60 * 60 * 1000);

    const [
      postsToday,
      postsThisWeek,
      postsThisMonth,
      totalPosts,
      user
    ] = await Promise.all([
      Post.countDocuments({ author: userId, createdAt: { $gte: today } }),
      Post.countDocuments({ author: userId, createdAt: { $gte: thisWeek } }),
      Post.countDocuments({ author: userId, createdAt: { $gte: thisMonth } }),
      Post.countDocuments({ author: userId }),
      User.findById(userId).select('followerCount followingCount tokenBalance')
    ]);

    res.json({
      ok: true,
      stats: {
        postsToday,
        postsThisWeek,
        postsThisMonth,
        totalPosts,
        followers: user?.followerCount || 0,
        following: user?.followingCount || 0,
        tokens: user?.tokenBalance || 0
      }
    });
  } catch (error) {
    console.error('Quick stats error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch stats' });
  }
});

module.exports = router;
