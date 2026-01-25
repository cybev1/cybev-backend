// ============================================
// FILE: user-analytics.routes.js
// PATH: cybev-backend-main/routes/user-analytics.routes.js
// VERSION: 1.0.0 - Comprehensive User Analytics
// UPDATED: 2026-01-25
// FIXES:
//   - Profile stats (posts, followers, following)
//   - Creator Studio stats (websites, blogs, views)
//   - Wallet balance
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// Helper to get user ID from token
const getUserId = (req) => {
  return req.user?.userId || req.user?.id || req.user?._id;
};

// Helper to safely get model
const getModel = (name, schema) => {
  try {
    return mongoose.models[name] || mongoose.model(name, schema);
  } catch (e) {
    return null;
  }
};

// ==========================================
// GET /api/user-analytics/profile/:userId
// Get complete profile stats for a user
// ==========================================
router.get('/profile/:userId?', auth, async (req, res) => {
  try {
    const userId = req.params.userId || getUserId(req);
    
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }

    // Get models
    const User = getModel('User');
    const Post = getModel('Post');
    const Follow = getModel('Follow');
    const Website = getModel('Website');
    const Blog = getModel('Blog');
    const Vlog = getModel('Vlog');
    const Reward = getModel('Reward');

    // User info
    const user = User ? await User.findById(userId).select('-password').lean() : null;
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Count posts
    let postCount = 0;
    if (Post) {
      postCount = await Post.countDocuments({ 
        $or: [
          { author: userId },
          { user: userId },
          { userId: userId }
        ]
      });
    }

    // Count followers
    let followerCount = 0;
    if (Follow) {
      followerCount = await Follow.countDocuments({ 
        $or: [
          { following: userId },
          { followee: userId },
          { targetUser: userId }
        ]
      });
    }

    // Count following
    let followingCount = 0;
    if (Follow) {
      followingCount = await Follow.countDocuments({ 
        $or: [
          { follower: userId },
          { user: userId },
          { sourceUser: userId }
        ]
      });
    }

    // Count websites
    let websiteCount = 0;
    if (Website) {
      websiteCount = await Website.countDocuments({ 
        $or: [
          { owner: userId },
          { user: userId },
          { userId: userId },
          { author: userId }
        ]
      });
    }

    // Count blogs/articles
    let blogCount = 0;
    if (Blog) {
      blogCount = await Blog.countDocuments({ 
        $or: [
          { author: userId },
          { user: userId },
          { userId: userId },
          { owner: userId }
        ]
      });
    }

    // Count vlogs
    let vlogCount = 0;
    if (Vlog) {
      vlogCount = await Vlog.countDocuments({ 
        $or: [
          { author: userId },
          { user: userId },
          { userId: userId }
        ]
      });
    }

    // Get total views
    let totalViews = 0;
    if (Post) {
      const postViews = await Post.aggregate([
        { $match: { $or: [{ author: new mongoose.Types.ObjectId(userId) }, { user: new mongoose.Types.ObjectId(userId) }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
      ]);
      totalViews += postViews[0]?.total || 0;
    }
    if (Blog) {
      const blogViews = await Blog.aggregate([
        { $match: { $or: [{ author: new mongoose.Types.ObjectId(userId) }, { user: new mongoose.Types.ObjectId(userId) }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
      ]);
      totalViews += blogViews[0]?.total || 0;
    }
    if (Website) {
      const siteViews = await Website.aggregate([
        { $match: { $or: [{ owner: new mongoose.Types.ObjectId(userId) }, { user: new mongoose.Types.ObjectId(userId) }] } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } }
      ]);
      totalViews += siteViews[0]?.total || 0;
    }

    // Get wallet balance
    let walletBalance = user.walletBalance || user.tokenBalance || user.balance || 0;
    if (Reward) {
      const rewards = await Reward.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      if (rewards[0]?.total) {
        walletBalance = rewards[0].total;
      }
    }

    res.json({
      ok: true,
      stats: {
        posts: postCount,
        followers: followerCount,
        following: followingCount,
        websites: websiteCount,
        blogs: blogCount,
        vlogs: vlogCount,
        totalViews,
        walletBalance
      },
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        bio: user.bio,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });

  } catch (err) {
    console.error('Profile stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/user-analytics/creator-studio
// Get creator studio dashboard stats
// ==========================================
router.get('/creator-studio', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const Website = getModel('Website');
    const Blog = getModel('Blog');
    const Post = getModel('Post');
    const Follow = getModel('Follow');

    // Get websites
    let websites = [];
    let websiteCount = 0;
    let websiteViews = 0;
    if (Website) {
      websites = await Website.find({ 
        $or: [{ owner: userId }, { user: userId }, { userId: userId }] 
      }).sort({ createdAt: -1 }).limit(10).lean();
      websiteCount = websites.length;
      websiteViews = websites.reduce((sum, w) => sum + (w.views || 0), 0);
      
      // If no results, try counting all
      if (websiteCount === 0) {
        websiteCount = await Website.countDocuments({ 
          $or: [{ owner: userId }, { user: userId }, { userId: userId }, { author: userId }] 
        });
      }
    }

    // Get blogs/articles
    let blogs = [];
    let blogCount = 0;
    let blogViews = 0;
    if (Blog) {
      blogs = await Blog.find({ 
        $or: [{ author: userId }, { user: userId }, { userId: userId }] 
      }).sort({ createdAt: -1 }).limit(10).lean();
      blogCount = blogs.length;
      blogViews = blogs.reduce((sum, b) => sum + (b.views || 0), 0);
      
      if (blogCount === 0) {
        blogCount = await Blog.countDocuments({ 
          $or: [{ author: userId }, { user: userId }, { userId: userId }, { owner: userId }] 
        });
      }
    }

    // Get posts for articles too
    let postArticles = [];
    if (Post) {
      postArticles = await Post.find({ 
        $or: [{ author: userId }, { user: userId }],
        $or: [{ type: 'article' }, { isArticle: true }]
      }).sort({ createdAt: -1 }).limit(10).lean();
      blogCount += postArticles.length;
      blogViews += postArticles.reduce((sum, p) => sum + (p.views || 0), 0);
    }

    // Total views
    const totalViews = websiteViews + blogViews;

    // Followers
    let followerCount = 0;
    if (Follow) {
      followerCount = await Follow.countDocuments({ 
        $or: [{ following: userId }, { followee: userId }, { targetUser: userId }]
      });
    }

    // Calculate view change (mock for now - would need historical data)
    const viewChange = totalViews > 0 ? Math.floor(Math.random() * 20) + 5 : 0;

    res.json({
      ok: true,
      stats: {
        totalWebsites: websiteCount,
        blogPosts: blogCount,
        totalViews,
        followers: followerCount,
        viewChange: viewChange // Percentage change
      },
      recentWebsites: websites.slice(0, 5),
      recentBlogs: [...blogs, ...postArticles].slice(0, 5)
    });

  } catch (err) {
    console.error('Creator studio stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/user-analytics/wallet
// Get wallet balance and transaction history
// ==========================================
router.get('/wallet', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const User = getModel('User');
    const Reward = getModel('Reward');
    const Transaction = getModel('Transaction');

    // Get user
    const user = User ? await User.findById(userId).select('walletBalance tokenBalance balance tokens').lean() : null;
    
    // Calculate balance from rewards if model exists
    let balance = user?.walletBalance || user?.tokenBalance || user?.balance || user?.tokens || 0;
    
    if (Reward) {
      const rewardSum = await Reward.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      if (rewardSum[0]?.total) {
        balance = rewardSum[0].total;
      }
    }

    // Get transactions
    let transactions = [];
    if (Transaction) {
      transactions = await Transaction.find({ 
        $or: [{ user: userId }, { from: userId }, { to: userId }] 
      }).sort({ createdAt: -1 }).limit(20).lean();
    }

    // If no Transaction model, try Reward model for history
    if (transactions.length === 0 && Reward) {
      const rewards = await Reward.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      transactions = rewards.map(r => ({
        _id: r._id,
        type: r.type || 'reward',
        amount: r.amount,
        description: r.reason || r.description || r.type,
        createdAt: r.createdAt,
        status: 'completed'
      }));
    }

    res.json({
      ok: true,
      balance,
      currency: 'CYBEV',
      transactions,
      earnMethods: [
        { id: 'create_content', title: 'Create Content', reward: '50-200 CYBEV per post', icon: 'sparkles' },
        { id: 'daily_checkin', title: 'Daily Check-in', reward: '10 CYBEV daily', icon: 'gift' },
        { id: 'refer_friends', title: 'Refer Friends', reward: '100 CYBEV per referral', icon: 'users' }
      ]
    });

  } catch (err) {
    console.error('Wallet stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/user-analytics/stats
// Quick stats endpoint (lightweight)
// ==========================================
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const Post = getModel('Post');
    const Follow = getModel('Follow');

    let postCount = 0;
    let followerCount = 0;
    let followingCount = 0;

    if (Post) {
      postCount = await Post.countDocuments({ 
        $or: [{ author: userId }, { user: userId }] 
      });
    }

    if (Follow) {
      followerCount = await Follow.countDocuments({ 
        $or: [{ following: userId }, { followee: userId }]
      });
      followingCount = await Follow.countDocuments({ 
        $or: [{ follower: userId }, { user: userId }]
      });
    }

    res.json({
      ok: true,
      posts: postCount,
      followers: followerCount,
      following: followingCount
    });

  } catch (err) {
    console.error('Quick stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
