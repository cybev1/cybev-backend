// ============================================
// FILE: routes/tipping.routes.js
// Tipping & Creator Support API
// ============================================
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const mongoose = require('mongoose');
const { createNotification } = require('../utils/notifications');

// Tip Model
const tipSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
  amount: { type: Number, required: true, min: 1 },
  message: { type: String, maxlength: 200 },
  anonymous: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' }
}, { timestamps: true });

let Tip;
try {
  Tip = mongoose.model('Tip');
} catch {
  Tip = mongoose.model('Tip', tipSchema);
}

// POST /api/tips/send - Send a tip to a creator
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { recipientId, blogId, amount, message, anonymous } = req.body;
    const Wallet = require('../models/wallet.model');
    const User = require('../models/user.model');

    if (!recipientId || !amount) {
      return res.status(400).json({ ok: false, error: 'Recipient and amount required' });
    }

    if (amount < 1) {
      return res.status(400).json({ ok: false, error: 'Minimum tip is 1 CYBEV' });
    }

    if (recipientId === req.user.id) {
      return res.status(400).json({ ok: false, error: 'Cannot tip yourself' });
    }

    // Check sender balance
    const senderWallet = await Wallet.findOne({ user: req.user.id });
    if (!senderWallet || senderWallet.balance < amount) {
      return res.status(400).json({ ok: false, error: 'Insufficient balance' });
    }

    // Get recipient
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ ok: false, error: 'Recipient not found' });
    }

    // Deduct from sender
    senderWallet.balance -= amount;
    senderWallet.transactions.push({
      type: 'TIP_SENT',
      amount: -amount,
      description: `Tip to ${recipient.name || recipient.username}`
    });
    await senderWallet.save();

    // Add to recipient (with 5% platform fee)
    const platformFee = amount * 0.05;
    const recipientAmount = amount - platformFee;

    let recipientWallet = await Wallet.findOne({ user: recipientId });
    if (!recipientWallet) {
      recipientWallet = new Wallet({ user: recipientId, balance: 0 });
    }
    recipientWallet.balance += recipientAmount;
    recipientWallet.totalEarned = (recipientWallet.totalEarned || 0) + recipientAmount;
    recipientWallet.transactions.push({
      type: 'TIP_RECEIVED',
      amount: recipientAmount,
      description: anonymous ? 'Anonymous tip' : `Tip from ${req.user.name || 'a supporter'}`
    });
    await recipientWallet.save();

    // Create tip record
    const tip = new Tip({
      sender: req.user.id,
      recipient: recipientId,
      blog: blogId || null,
      amount,
      message,
      anonymous,
      status: 'completed'
    });
    await tip.save();

    // Send notification to recipient
    const sender = await User.findById(req.user.id);
    await createNotification({
      recipient: recipientId,
      sender: anonymous ? null : req.user.id,
      type: 'tip',
      message: anonymous 
        ? `Someone tipped you ${amount} CYBEV! 💰`
        : `${sender.name || sender.username} tipped you ${amount} CYBEV! 💰`
    });

    res.json({
      ok: true,
      tip: {
        _id: tip._id,
        amount,
        recipientAmount,
        platformFee
      },
      newBalance: senderWallet.balance
    });
  } catch (error) {
    console.error('Tip error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send tip' });
  }
});

// GET /api/tips/received - Get tips received
router.get('/received', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tips, total] = await Promise.all([
      Tip.find({ recipient: req.user.id })
        .populate('sender', 'name username avatar')
        .populate('blog', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Tip.countDocuments({ recipient: req.user.id })
    ]);

    // Calculate totals
    const totalReceived = await Tip.aggregate([
      { $match: { recipient: new mongoose.Types.ObjectId(req.user.id) } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      ok: true,
      tips: tips.map(tip => ({
        ...tip.toObject(),
        sender: tip.anonymous ? null : tip.sender
      })),
      totalReceived: totalReceived[0]?.total || 0,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch tips' });
  }
});

// GET /api/tips/sent - Get tips sent
router.get('/sent', verifyToken, async (req, res) => {
  try {
    const tips = await Tip.find({ sender: req.user.id })
      .populate('recipient', 'name username avatar')
      .populate('blog', 'title')
      .sort({ createdAt: -1 })
      .limit(50);

    const totalSent = await Tip.aggregate([
      { $match: { sender: new mongoose.Types.ObjectId(req.user.id) } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      ok: true,
      tips,
      totalSent: totalSent[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch tips' });
  }
});

// GET /api/tips/top-supporters/:userId - Get top supporters for a user
router.get('/top-supporters/:userId', async (req, res) => {
  try {
    const topSupporters = await Tip.aggregate([
      { 
        $match: { 
          recipient: new mongoose.Types.ObjectId(req.params.userId),
          anonymous: false
        } 
      },
      { 
        $group: { 
          _id: '$sender', 
          totalTipped: { $sum: '$amount' },
          tipCount: { $sum: 1 }
        } 
      },
      { $sort: { totalTipped: -1 } },
      { $limit: 10 }
    ]);

    // Populate sender info
    const User = require('../models/user.model');
    const populatedSupporters = await Promise.all(
      topSupporters.map(async (supporter) => {
        const user = await User.findById(supporter._id).select('name username avatar');
        return {
          user,
          totalTipped: supporter.totalTipped,
          tipCount: supporter.tipCount
        };
      })
    );

    res.json({ ok: true, supporters: populatedSupporters });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch supporters' });
  }
});

module.exports = router;
