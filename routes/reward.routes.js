const express = require('express');
const router = express.Router();
const Wallet = require('../models/wallet.model');
const Blog = require('../models/blog.model');
const { authenticateToken } = require('../middleware/auth');

// Get user's wallet info (protected)
router.get('/wallet', authenticateToken, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user.id });
    
    if (!wallet) {
      wallet = new Wallet({ user: req.user.id });
      await wallet.save();
    }
    
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transaction history (protected)
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const wallet = await Wallet.findOne({ user: req.user.id })
      .populate('transactions.relatedBlog', 'title');
    
    if (!wallet) {
      return res.json({ transactions: [], pagination: { total: 0 } });
    }
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    
    const transactions = wallet.transactions
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(startIndex, endIndex);
    
    res.json({
      transactions,
      pagination: {
        total: wallet.transactions.length,
        page: parseInt(page),
        pages: Math.ceil(wallet.transactions.length / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user stats (protected)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id });
    const blogCount = await Blog.countDocuments({ author: req.user.id });
    const blogs = await Blog.find({ author: req.user.id });
    
    const totalLikes = blogs.reduce((sum, blog) => sum + blog.likes.length, 0);
    const totalViews = blogs.reduce((sum, blog) => sum + blog.views, 0);
    
    const stats = {
      tokens: wallet ? wallet.balance : 0,
      totalEarned: wallet ? wallet.totalEarned : 0,
      blogCount,
      totalLikes,
      totalViews,
      currentStreak: wallet ? wallet.streaks.current : 0,
      longestStreak: wallet ? wallet.streaks.longest : 0,
      achievements: wallet ? wallet.achievements : []
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { type = 'tokens', limit = 10 } = req.query;
    
    let leaderboard;
    
    if (type === 'tokens') {
      leaderboard = await Wallet.find()
        .populate('user', 'name email')
        .sort({ totalEarned: -1 })
        .limit(parseInt(limit));
    } else if (type === 'blogs') {
      const topAuthors = await Blog.aggregate([
        { $group: { _id: '$author', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: parseInt(limit) }
      ]);
      
      leaderboard = await Promise.all(
        topAuthors.map(async (item) => {
          const wallet = await Wallet.findOne({ user: item._id })
            .populate('user', 'name email');
          return {
            user: wallet?.user,
            blogCount: item.count,
            tokens: wallet?.totalEarned || 0
          };
        })
      );
    } else if (type === 'likes') {
      const blogs = await Blog.find()
        .populate('author', 'name email');
      
      const authorLikes = {};
      blogs.forEach(blog => {
        const authorId = blog.author._id.toString();
        if (!authorLikes[authorId]) {
          authorLikes[authorId] = {
            author: blog.author,
            likes: 0
          };
        }
        authorLikes[authorId].likes += blog.likes.length;
      });
      
      leaderboard = Object.values(authorLikes)
        .sort((a, b) => b.likes - a.likes)
        .slice(0, parseInt(limit));
    }
    
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Claim daily bonus (protected)
router.post('/daily-bonus', authenticateToken, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user.id });
    
    if (!wallet) {
      wallet = new Wallet({ user: req.user.id });
    }
    
    // Check if already claimed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastBonus = wallet.transactions.find(
      t => t.type === 'BONUS' && 
      t.description === 'Daily login bonus' &&
      new Date(t.timestamp) >= today
    );
    
    if (lastBonus) {
      return res.status(400).json({ 
        error: 'Daily bonus already claimed',
        nextClaimTime: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      });
    }
    
    await wallet.addTokens(10, 'BONUS', 'Daily login bonus');
    
    res.json({ 
      message: 'Daily bonus claimed!',
      tokensEarned: 10,
      newBalance: wallet.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get achievements list
router.get('/achievements', authenticateToken, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id });
    
    const allAchievements = [
      { id: 'FIRST_POST', name: 'First Steps', description: 'Published your first blog', reward: 25, unlocked: false },
      { id: 'FIRST_LIKE', name: 'First Fan', description: 'Received your first like', reward: 10, unlocked: false },
      { id: 'DOMAIN_MASTER', name: 'Domain Master', description: 'Connected a custom domain', reward: 200, unlocked: false },
      { id: 'POPULAR_AUTHOR', name: 'Popular Author', description: 'Got 100 total likes', reward: 150, unlocked: false },
      { id: 'TRENDING_WRITER', name: 'Trending Writer', description: 'Published 10 blogs', reward: 100, unlocked: false },
      { id: 'VIRAL_POST', name: 'Viral Post', description: 'Got 1000 views on a single blog', reward: 300, unlocked: false },
      { id: 'WEEK_STREAK', name: 'Consistent Creator', description: 'Posted for 7 days straight', reward: 100, unlocked: false },
      { id: 'MONTH_STREAK', name: 'Dedicated Writer', description: 'Posted for 30 days straight', reward: 500, unlocked: false }
    ];
    
    if (wallet) {
      allAchievements.forEach(achievement => {
        achievement.unlocked = wallet.achievements.includes(achievement.id);
      });
    }
    
    res.json(allAchievements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
