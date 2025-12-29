// ============================================
// FILE: routes/tipping.routes.js
// Creator Tipping API
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Tip Schema
const tipSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  message: { type: String, maxlength: 200 },
  anonymous: { type: Boolean, default: false },
  blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
  transactionHash: { type: String },
  platformFee: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }
}, { timestamps: true });

let Tip;
try {
  Tip = mongoose.model('Tip');
} catch {
  Tip = mongoose.model('Tip', tipSchema);
}

const PLATFORM_FEE_PERCENT = 5; // 5% platform fee

// POST /api/tips/send - Send a tip
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { recipientId, amount, message, anonymous, blogId, transactionHash } = req.body;

    if (!recipientId || !amount) {
      return res.status(400).json({ ok: false, error: 'Recipient and amount required' });
    }

    if (amount < 1) {
      return res.status(400).json({ ok: false, error: 'Minimum tip is 1 CYBEV' });
    }

    if (recipientId === req.user.id) {
      return res.status(400).json({ ok: false, error: 'Cannot tip yourself' });
    }

    const User = mongoose.model('User');
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ ok: false, error: 'Recipient not found' });
    }

    const platformFee = (amount * PLATFORM_FEE_PERCENT) / 100;
    const creatorAmount = amount - platformFee;

    const tip = new Tip({
      sender: req.user.id,
      recipient: recipientId,
      amount,
      message: message?.substring(0, 200),
      anonymous: !!anonymous,
      blog: blogId || null,
      transactionHash,
      platformFee,
      status: transactionHash ? 'completed' : 'pending'
    });

    await tip.save();

    // Create notification for recipient
    try {
      const Notification = mongoose.model('Notification');
      const sender = await User.findById(req.user.id);
      await Notification.create({
        recipient: recipientId,
        type: 'tip',
        message: anonymous 
          ? `Someone sent you a ${amount} CYBEV tip!`
          : `${sender.name || sender.username} sent you a ${amount} CYBEV tip!`,
        data: { tipId: tip._id, amount }
      });
    } catch (e) {
      console.log('Notification creation skipped');
    }

    res.json({
      ok: true,
      tip: {
        _id: tip._id,
        amount,
        creatorReceives: creatorAmount,
        platformFee,
        status: tip.status
      }
    });
  } catch (error) {
    console.error('Tip error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send tip' });
  }
});

// PUT /api/tips/confirm/:id - Confirm tip with transaction
router.put('/confirm/:id', verifyToken, async (req, res) => {
  try {
    const { transactionHash } = req.body;
    
    const tip = await Tip.findById(req.params.id);
    if (!tip) {
      return res.status(404).json({ ok: false, error: 'Tip not found' });
    }

    if (tip.sender.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    tip.transactionHash = transactionHash;
    tip.status = 'completed';
    await tip.save();

    res.json({ ok: true, tip });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to confirm tip' });
  }
});

// GET /api/tips/received - Get tips received
router.get('/received', verifyToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [tips, total, totalAmount] = await Promise.all([
      Tip.find({ recipient: req.user.id, status: 'completed' })
        .populate('sender', 'name username avatar')
        .populate('blog', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Tip.countDocuments({ recipient: req.user.id, status: 'completed' }),
      Tip.aggregate([
        { $match: { recipient: new mongoose.Types.ObjectId(req.user.id), status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    // Hide sender info for anonymous tips
    const formattedTips = tips.map(tip => ({
      ...tip.toObject(),
      sender: tip.anonymous ? null : tip.sender
    }));

    res.json({
      ok: true,
      tips: formattedTips,
      totalReceived: totalAmount[0]?.total || 0,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
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

    const totalSent = tips.reduce((sum, tip) => sum + tip.amount, 0);

    res.json({ ok: true, tips, totalSent });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch tips' });
  }
});

// GET /api/tips/top-supporters/:userId - Get top supporters for a user
router.get('/top-supporters/:userId', async (req, res) => {
  try {
    const supporters = await Tip.aggregate([
      { 
        $match: { 
          recipient: new mongoose.Types.ObjectId(req.params.userId),
          status: 'completed',
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
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          totalTipped: 1,
          tipCount: 1,
          'user.name': 1,
          'user.username': 1,
          'user.avatar': 1
        }
      }
    ]);

    res.json({ ok: true, supporters });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch supporters' });
  }
});

module.exports = router;
