// ============================================
// FILE: reward.routes.js
// PATH: cybev-backend-main/routes/reward.routes.js
// VERSION: 2.0.0 - Fixed Wallet & Rewards
// UPDATED: 2026-01-25
// FIXES:
//   - Wallet balance calculation
//   - Transaction history
//   - Earn methods
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Reward Schema
const RewardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  type: { 
    type: String, 
    enum: ['post', 'comment', 'like', 'share', 'daily_checkin', 'referral', 'signup', 'article', 'website', 'video', 'achievement', 'bonus', 'withdrawal', 'transfer', 'purchase', 'other'],
    default: 'other'
  },
  reason: String,
  description: String,
  reference: { type: mongoose.Schema.Types.ObjectId },
  referenceModel: String,
  status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'completed' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Get or create Reward model
let Reward;
try {
  Reward = mongoose.models.Reward || mongoose.model('Reward', RewardSchema);
} catch (e) {
  Reward = mongoose.model('Reward', RewardSchema);
}

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

const getUserId = (req) => req.user?.userId || req.user?.id || req.user?._id;

// Reward amounts configuration
const REWARD_CONFIG = {
  post: { min: 50, max: 200, description: 'Create Content' },
  article: { min: 100, max: 300, description: 'Write Article' },
  website: { min: 200, max: 500, description: 'Create Website' },
  video: { min: 150, max: 400, description: 'Upload Video' },
  comment: { min: 5, max: 20, description: 'Comment' },
  like: { min: 1, max: 5, description: 'Like' },
  share: { min: 10, max: 30, description: 'Share' },
  daily_checkin: { min: 10, max: 10, description: 'Daily Check-in' },
  referral: { min: 100, max: 100, description: 'Refer Friend' },
  signup: { min: 50, max: 50, description: 'Welcome Bonus' }
};

// ==========================================
// GET /api/rewards/wallet - Get wallet balance and history
// ==========================================
router.get('/wallet', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Calculate total balance from rewards
    const balanceResult = await Reward.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const balance = balanceResult[0]?.total || 0;

    // Get recent transactions
    const transactions = await Reward.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Format transactions
    const formattedTransactions = transactions.map(t => ({
      _id: t._id,
      type: t.type,
      amount: t.amount,
      description: t.reason || t.description || REWARD_CONFIG[t.type]?.description || t.type,
      status: t.status,
      createdAt: t.createdAt
    }));

    res.json({
      ok: true,
      balance,
      currency: 'CYBEV',
      transactions: formattedTransactions,
      earnMethods: [
        { 
          id: 'create_content', 
          title: 'Create Content', 
          subtitle: 'Earn 50-200 CYBEV per post',
          reward: '50-200',
          icon: 'sparkles',
          action: '/create'
        },
        { 
          id: 'daily_checkin', 
          title: 'Daily Check-in', 
          subtitle: 'Earn 10 CYBEV daily',
          reward: '10',
          icon: 'gift',
          action: '/checkin'
        },
        { 
          id: 'refer_friends', 
          title: 'Refer Friends', 
          subtitle: 'Earn 100 CYBEV per referral',
          reward: '100',
          icon: 'users',
          action: '/referral'
        }
      ]
    });

  } catch (err) {
    console.error('Get wallet error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/rewards/balance - Quick balance check
// ==========================================
router.get('/balance', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const balanceResult = await Reward.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const balance = balanceResult[0]?.total || 0;

    res.json({ ok: true, balance, currency: 'CYBEV' });

  } catch (err) {
    console.error('Get balance error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/rewards/history - Transaction history
// ==========================================
router.get('/history', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { limit = 50, page = 1, type } = req.query;

    const query = { user: userId };
    if (type) query.type = type;

    const transactions = await Reward.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await Reward.countDocuments(query);

    res.json({
      ok: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/rewards/earn - Earn rewards
// ==========================================
router.post('/earn', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { type, referenceId, referenceModel } = req.body;

    if (!type || !REWARD_CONFIG[type]) {
      return res.status(400).json({ ok: false, error: 'Invalid reward type' });
    }

    const config = REWARD_CONFIG[type];
    const amount = Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;

    // Check for duplicate rewards (same type and reference)
    if (referenceId) {
      const existing = await Reward.findOne({
        user: userId,
        type,
        reference: referenceId
      });
      if (existing) {
        return res.status(400).json({ ok: false, error: 'Reward already claimed' });
      }
    }

    // Daily check-in limit
    if (type === 'daily_checkin') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const checkedIn = await Reward.findOne({
        user: userId,
        type: 'daily_checkin',
        createdAt: { $gte: today }
      });
      if (checkedIn) {
        return res.status(400).json({ ok: false, error: 'Already checked in today' });
      }
    }

    // Create reward
    const reward = new Reward({
      user: userId,
      amount,
      type,
      reason: config.description,
      reference: referenceId,
      referenceModel,
      status: 'completed'
    });

    await reward.save();

    // Get new balance
    const balanceResult = await Reward.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const newBalance = balanceResult[0]?.total || 0;

    res.json({
      ok: true,
      reward: {
        _id: reward._id,
        amount,
        type,
        description: config.description
      },
      newBalance
    });

  } catch (err) {
    console.error('Earn reward error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/rewards/checkin - Daily check-in
// ==========================================
router.post('/checkin', auth, async (req, res) => {
  try {
    const userId = getUserId(req);

    // Check if already checked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const checkedIn = await Reward.findOne({
      user: userId,
      type: 'daily_checkin',
      createdAt: { $gte: today }
    });

    if (checkedIn) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Already checked in today',
        nextCheckin: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      });
    }

    // Create check-in reward
    const reward = new Reward({
      user: userId,
      amount: 10,
      type: 'daily_checkin',
      reason: 'Daily Check-in',
      status: 'completed'
    });

    await reward.save();

    // Get streak (consecutive days)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yesterdayCheckin = await Reward.findOne({
      user: userId,
      type: 'daily_checkin',
      createdAt: { $gte: yesterday, $lt: today }
    });

    // Simple streak counter (would need more logic for full implementation)
    let streak = 1;
    if (yesterdayCheckin) {
      // Count consecutive check-ins
      const recentCheckins = await Reward.find({
        user: userId,
        type: 'daily_checkin'
      }).sort({ createdAt: -1 }).limit(30);
      
      let lastDate = new Date();
      for (const checkin of recentCheckins) {
        const checkinDate = new Date(checkin.createdAt);
        const diffDays = Math.floor((lastDate - checkinDate) / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) {
          streak++;
          lastDate = checkinDate;
        } else {
          break;
        }
      }
    }

    // Get new balance
    const balanceResult = await Reward.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const newBalance = balanceResult[0]?.total || 0;

    res.json({
      ok: true,
      message: 'Check-in successful!',
      reward: {
        amount: 10,
        type: 'daily_checkin'
      },
      streak,
      newBalance,
      nextCheckin: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    });

  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/rewards/checkin/status - Check-in status
// ==========================================
router.get('/checkin/status', auth, async (req, res) => {
  try {
    const userId = getUserId(req);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const checkedIn = await Reward.findOne({
      user: userId,
      type: 'daily_checkin',
      createdAt: { $gte: today }
    });

    res.json({
      ok: true,
      checkedIn: !!checkedIn,
      checkinTime: checkedIn?.createdAt,
      nextCheckin: checkedIn ? new Date(today.getTime() + 24 * 60 * 60 * 1000) : null
    });

  } catch (err) {
    console.error('Check-in status error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/rewards/transfer - Transfer tokens
// ==========================================
router.post('/transfer', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { toUserId, amount, note } = req.body;

    if (!toUserId || !amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid transfer details' });
    }

    // Check balance
    const balanceResult = await Reward.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const balance = balanceResult[0]?.total || 0;

    if (balance < amount) {
      return res.status(400).json({ ok: false, error: 'Insufficient balance' });
    }

    // Create debit reward (negative)
    const debit = new Reward({
      user: userId,
      amount: -amount,
      type: 'transfer',
      reason: `Transfer to user`,
      reference: toUserId,
      referenceModel: 'User',
      status: 'completed'
    });

    // Create credit reward (positive)
    const credit = new Reward({
      user: toUserId,
      amount: amount,
      type: 'transfer',
      reason: note || `Transfer from user`,
      reference: userId,
      referenceModel: 'User',
      status: 'completed'
    });

    await debit.save();
    await credit.save();

    // Get new balance
    const newBalanceResult = await Reward.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const newBalance = newBalanceResult[0]?.total || 0;

    res.json({
      ok: true,
      message: 'Transfer successful',
      amount,
      newBalance
    });

  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
