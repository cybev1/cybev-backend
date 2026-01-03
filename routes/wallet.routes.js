// ============================================
// FILE: routes/wallet.routes.js
// CYBEV Token Wallet & Transaction System
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try { verifyToken = require('../middleware/auth'); } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

// Load/Create Transaction model
let Transaction;
try {
  Transaction = require('../models/transaction.model');
} catch (e) {
  const transactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { 
      type: String, 
      enum: ['earn', 'spend', 'transfer_in', 'transfer_out', 'reward', 'purchase', 'withdrawal', 'tip'],
      required: true 
    },
    amount: { type: Number, required: true },
    balance: { type: Number }, // Balance after transaction
    description: { type: String, required: true },
    reference: { type: mongoose.Schema.Types.ObjectId },
    referenceType: { type: String }, // 'Blog', 'Post', 'User', 'NFT', etc.
    referenceModel: { type: String },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'completed' },
    metadata: { type: mongoose.Schema.Types.Mixed }
  }, { timestamps: true });
  
  transactionSchema.index({ user: 1, createdAt: -1 });
  transactionSchema.index({ type: 1 });
  transactionSchema.index({ status: 1 });
  
  Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
}

// User model
let User;
try { User = require('../models/user.model'); } catch (e) { User = mongoose.model('User'); }

// ==========================================
// Token earning rates
// ==========================================
const TOKEN_RATES = {
  blog_published: 50,
  blog_view: 0.1,
  blog_like: 1,
  blog_share: 2,
  blog_comment: 0.5,
  post_published: 10,
  post_like: 0.5,
  vlog_published: 20,
  vlog_view: 0.2,
  daily_login: 5,
  profile_complete: 25,
  first_blog: 100,
  referral: 50,
  tip_received: 1, // multiplier
};

// ==========================================
// GET /api/wallet - Get user's wallet info
// ==========================================
router.get('/', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('tokenBalance totalEarned totalSpent walletAddress');
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Get recent transactions
    const recentTransactions = await Transaction.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    // Calculate stats
    const stats = await Transaction.aggregate([
      { $match: { user: mongoose.Types.ObjectId(req.user.id), status: 'completed' } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const earnedStats = stats.filter(s => ['earn', 'reward', 'transfer_in', 'tip'].includes(s._id));
    const spentStats = stats.filter(s => ['spend', 'transfer_out', 'purchase', 'withdrawal'].includes(s._id));
    
    const totalEarned = earnedStats.reduce((sum, s) => sum + s.total, 0);
    const totalSpent = Math.abs(spentStats.reduce((sum, s) => sum + s.total, 0));
    
    res.json({
      success: true,
      wallet: {
        balance: user.tokenBalance || 0,
        totalEarned: user.totalEarned || totalEarned,
        totalSpent: user.totalSpent || totalSpent,
        walletAddress: user.walletAddress || null,
        currency: 'CYBEV'
      },
      recentTransactions,
      stats: {
        earned: earnedStats,
        spent: spentStats
      },
      rates: TOKEN_RATES
    });
    
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch wallet' });
  }
});

// ==========================================
// GET /api/wallet/transactions - Get transaction history
// ==========================================
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, startDate, endDate } = req.query;
    
    const query = { user: req.user.id };
    
    if (type) query.type = type;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const transactions = await Transaction.find(query)
      .populate('fromUser', 'name username profilePicture')
      .populate('toUser', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    const total = await Transaction.countDocuments(query);
    
    res.json({
      success: true,
      transactions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      hasMore: transactions.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

// ==========================================
// POST /api/wallet/credit - Credit tokens (internal use)
// ==========================================
router.post('/credit', verifyToken, async (req, res) => {
  try {
    const { amount, description, type = 'earn', reference, referenceType } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }
    
    // Update user balance
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        $inc: { 
          tokenBalance: amount,
          totalEarned: amount 
        } 
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Create transaction record
    const transaction = await Transaction.create({
      user: req.user.id,
      type,
      amount,
      balance: user.tokenBalance,
      description: description || 'Token credit',
      reference,
      referenceType,
      status: 'completed'
    });
    
    console.log(`💰 Credited ${amount} CYBEV to user ${req.user.id}`);
    
    res.json({
      success: true,
      message: `+${amount} CYBEV credited!`,
      newBalance: user.tokenBalance,
      transaction
    });
    
  } catch (error) {
    console.error('Credit tokens error:', error);
    res.status(500).json({ success: false, error: 'Failed to credit tokens' });
  }
});

// ==========================================
// POST /api/wallet/transfer - Transfer tokens to another user
// ==========================================
router.post('/transfer', verifyToken, async (req, res) => {
  try {
    const { toUserId, amount, message } = req.body;
    
    if (!toUserId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid transfer details' });
    }
    
    if (toUserId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot transfer to yourself' });
    }
    
    // Check sender balance
    const sender = await User.findById(req.user.id);
    if (!sender || (sender.tokenBalance || 0) < amount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }
    
    // Check recipient exists
    const recipient = await User.findById(toUserId);
    if (!recipient) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }
    
    // Perform transfer
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { tokenBalance: -amount, totalSpent: amount }
    });
    
    await User.findByIdAndUpdate(toUserId, {
      $inc: { tokenBalance: amount, totalEarned: amount }
    });
    
    // Record transactions
    await Transaction.create({
      user: req.user.id,
      type: 'transfer_out',
      amount: -amount,
      balance: sender.tokenBalance - amount,
      description: `Transfer to ${recipient.name || recipient.username}${message ? ': ' + message : ''}`,
      toUser: toUserId,
      status: 'completed'
    });
    
    await Transaction.create({
      user: toUserId,
      type: 'transfer_in',
      amount,
      balance: (recipient.tokenBalance || 0) + amount,
      description: `Transfer from ${sender.name || sender.username}${message ? ': ' + message : ''}`,
      fromUser: req.user.id,
      status: 'completed'
    });
    
    console.log(`💸 Transfer: ${amount} CYBEV from ${req.user.id} to ${toUserId}`);
    
    res.json({
      success: true,
      message: `${amount} CYBEV sent to ${recipient.name || recipient.username}!`,
      newBalance: sender.tokenBalance - amount
    });
    
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ success: false, error: 'Transfer failed' });
  }
});

// ==========================================
// POST /api/wallet/tip - Tip a creator
// ==========================================
router.post('/tip', verifyToken, async (req, res) => {
  try {
    const { creatorId, amount, blogId, message } = req.body;
    
    if (!creatorId || !amount || amount < 1) {
      return res.status(400).json({ success: false, error: 'Invalid tip details' });
    }
    
    if (creatorId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot tip yourself' });
    }
    
    // Check balance
    const tipper = await User.findById(req.user.id);
    if (!tipper || (tipper.tokenBalance || 0) < amount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }
    
    // Get creator
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ success: false, error: 'Creator not found' });
    }
    
    // Perform tip
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { tokenBalance: -amount, totalSpent: amount }
    });
    
    await User.findByIdAndUpdate(creatorId, {
      $inc: { tokenBalance: amount, totalEarned: amount }
    });
    
    // Record transactions
    await Transaction.create({
      user: req.user.id,
      type: 'tip',
      amount: -amount,
      balance: tipper.tokenBalance - amount,
      description: `Tip to ${creator.name || creator.username}`,
      toUser: creatorId,
      reference: blogId,
      referenceType: 'Blog',
      metadata: { message }
    });
    
    await Transaction.create({
      user: creatorId,
      type: 'tip',
      amount,
      balance: (creator.tokenBalance || 0) + amount,
      description: `Tip from ${tipper.name || tipper.username}${message ? ': ' + message : ''}`,
      fromUser: req.user.id,
      reference: blogId,
      referenceType: 'Blog'
    });
    
    console.log(`💝 Tip: ${amount} CYBEV from ${req.user.id} to ${creatorId}`);
    
    res.json({
      success: true,
      message: `You tipped ${creator.name || creator.username} ${amount} CYBEV!`,
      newBalance: tipper.tokenBalance - amount
    });
    
  } catch (error) {
    console.error('Tip error:', error);
    res.status(500).json({ success: false, error: 'Tip failed' });
  }
});

// ==========================================
// POST /api/wallet/claim-daily - Claim daily login reward
// ==========================================
router.post('/claim-daily', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check last claim
    const lastClaim = user.lastDailyClaimAt;
    const now = new Date();
    
    if (lastClaim) {
      const hoursSince = (now - new Date(lastClaim)) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        return res.status(400).json({
          success: false,
          error: `Come back in ${hoursLeft} hours!`,
          nextClaimAt: new Date(new Date(lastClaim).getTime() + 24 * 60 * 60 * 1000)
        });
      }
    }
    
    // Calculate streak bonus
    let streak = user.dailyStreak || 0;
    if (lastClaim && (now - new Date(lastClaim)) / (1000 * 60 * 60) < 48) {
      streak++;
    } else {
      streak = 1;
    }
    
    const baseReward = TOKEN_RATES.daily_login;
    const streakBonus = Math.min(streak - 1, 6); // Max 6 extra tokens
    const totalReward = baseReward + streakBonus;
    
    // Update user
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { tokenBalance: totalReward, totalEarned: totalReward },
      lastDailyClaimAt: now,
      dailyStreak: streak
    });
    
    // Record transaction
    await Transaction.create({
      user: req.user.id,
      type: 'reward',
      amount: totalReward,
      description: `Daily login reward (Day ${streak} streak)`,
      metadata: { streak, baseReward, streakBonus }
    });
    
    res.json({
      success: true,
      message: `+${totalReward} CYBEV! Day ${streak} streak 🔥`,
      reward: totalReward,
      streak,
      newBalance: (user.tokenBalance || 0) + totalReward
    });
    
  } catch (error) {
    console.error('Claim daily error:', error);
    res.status(500).json({ success: false, error: 'Failed to claim reward' });
  }
});

// ==========================================
// GET /api/wallet/leaderboard - Top earners
// ==========================================
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const topEarners = await User.find({ tokenBalance: { $gt: 0 } })
      .select('name username profilePicture avatar tokenBalance totalEarned')
      .sort({ tokenBalance: -1 })
      .limit(parseInt(limit))
      .lean();
    
    res.json({
      success: true,
      leaderboard: topEarners.map((user, index) => ({
        rank: index + 1,
        ...user
      }))
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
});

console.log('✅ Wallet routes loaded');

module.exports = router;
