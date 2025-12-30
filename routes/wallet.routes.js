// ============================================
// FILE: routes/wallet.routes.js
// PATH: cybev-backend/routes/wallet.routes.js
// PURPOSE: Wallet management, transactions, balances
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Transaction Schema
let Transaction;
try {
  Transaction = mongoose.model('Transaction');
} catch {
  const transactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { 
      type: String, 
      enum: ['deposit', 'withdrawal', 'tip_sent', 'tip_received', 'purchase', 'sale', 'stake', 'unstake', 'reward', 'transfer'],
      required: true 
    },
    amount: { type: Number, required: true },
    balance: Number, // Balance after transaction
    description: String,
    reference: String, // Related ID (tip, purchase, etc)
    referenceType: String, // 'Tip', 'NFT', 'Stake', etc
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    transactionHash: String,
    metadata: mongoose.Schema.Types.Mixed
  }, { timestamps: true });

  transactionSchema.index({ user: 1, createdAt: -1 });
  transactionSchema.index({ type: 1 });
  
  Transaction = mongoose.model('Transaction', transactionSchema);
}

// GET /api/wallet/balance - Get user balance
router.get('/balance', verifyToken, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id).select('tokenBalance walletAddress');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({
      ok: true,
      balance: user.tokenBalance || 0,
      walletAddress: user.walletAddress
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get balance' });
  }
});

// GET /api/wallet/transactions - Get transaction history
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const query = { user: req.user.id };
    
    if (type) query.type = type;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
      ok: true,
      transactions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get transactions' });
  }
});

// POST /api/wallet/connect - Connect external wallet
router.post('/connect', verifyToken, async (req, res) => {
  try {
    const { walletAddress, signature } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ ok: false, error: 'Wallet address required' });
    }

    // In production, verify signature here
    // const isValid = verifySignature(walletAddress, signature, message);

    const User = mongoose.model('User');
    
    // Check if wallet already connected to another account
    const existingUser = await User.findOne({ walletAddress });
    if (existingUser && existingUser._id.toString() !== req.user.id) {
      return res.status(400).json({ ok: false, error: 'Wallet already connected to another account' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { walletAddress },
      { new: true }
    ).select('-password');

    res.json({ ok: true, user });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to connect wallet' });
  }
});

// POST /api/wallet/disconnect - Disconnect wallet
router.post('/disconnect', verifyToken, async (req, res) => {
  try {
    const User = mongoose.model('User');
    
    await User.findByIdAndUpdate(req.user.id, { walletAddress: null });

    res.json({ ok: true, message: 'Wallet disconnected' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to disconnect wallet' });
  }
});

// POST /api/wallet/transfer - Transfer tokens to another user
router.post('/transfer', verifyToken, async (req, res) => {
  try {
    const { recipientId, recipientUsername, amount, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid amount required' });
    }

    const User = mongoose.model('User');
    const sender = await User.findById(req.user.id);
    
    if (!sender) {
      return res.status(404).json({ ok: false, error: 'Sender not found' });
    }

    if (sender.tokenBalance < amount) {
      return res.status(400).json({ ok: false, error: 'Insufficient balance' });
    }

    // Find recipient
    let recipient;
    if (recipientId) {
      recipient = await User.findById(recipientId);
    } else if (recipientUsername) {
      recipient = await User.findOne({ username: recipientUsername });
    }

    if (!recipient) {
      return res.status(404).json({ ok: false, error: 'Recipient not found' });
    }

    if (recipient._id.toString() === req.user.id) {
      return res.status(400).json({ ok: false, error: 'Cannot transfer to yourself' });
    }

    // Perform transfer
    sender.tokenBalance -= amount;
    recipient.tokenBalance += amount;

    await sender.save();
    await recipient.save();

    // Record transactions
    await Transaction.create({
      user: sender._id,
      type: 'transfer',
      amount: -amount,
      balance: sender.tokenBalance,
      description: `Transfer to @${recipient.username}`,
      reference: recipient._id,
      referenceType: 'User',
      metadata: { note }
    });

    await Transaction.create({
      user: recipient._id,
      type: 'transfer',
      amount: amount,
      balance: recipient.tokenBalance,
      description: `Transfer from @${sender.username}`,
      reference: sender._id,
      referenceType: 'User',
      metadata: { note }
    });

    res.json({
      ok: true,
      message: 'Transfer successful',
      newBalance: sender.tokenBalance
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ ok: false, error: 'Failed to transfer' });
  }
});

// GET /api/wallet/stats - Get wallet statistics
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Total received
    const received = await Transaction.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId), amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Total sent
    const sent = await Transaction.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId), amount: { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // By type
    const byType = await Transaction.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    res.json({
      ok: true,
      stats: {
        totalReceived: received[0]?.total || 0,
        totalSent: Math.abs(sent[0]?.total || 0),
        byType: byType.reduce((acc, item) => {
          acc[item._id] = { total: item.total, count: item.count };
          return acc;
        }, {})
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get stats' });
  }
});

module.exports = router;
