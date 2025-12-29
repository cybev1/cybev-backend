// ============================================
// FILE: routes/monetization.routes.js
// PATH: cybev-backend/routes/monetization.routes.js
// PURPOSE: Content monetization - paid posts, tips, subscriptions
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// SCHEMAS
// ==========================================

let Tip, Subscription, PaidContent, Withdrawal;

try { Tip = mongoose.model('Tip'); } catch {
  const tipSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 1 },
    message: String,
    contentId: { type: mongoose.Schema.Types.ObjectId },
    contentType: { type: String, enum: ['blog', 'post', 'nft', 'stream'] },
    transactionHash: String,
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' }
  }, { timestamps: true });
  tipSchema.index({ recipient: 1, createdAt: -1 });
  tipSchema.index({ sender: 1 });
  Tip = mongoose.model('Tip', tipSchema);
}

try { Subscription = mongoose.model('Subscription'); } catch {
  const subscriptionSchema = new mongoose.Schema({
    subscriber: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tier: { type: String, enum: ['basic', 'premium', 'vip'], default: 'basic' },
    price: { type: Number, required: true },
    status: { type: String, enum: ['active', 'cancelled', 'expired'], default: 'active' },
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    autoRenew: { type: Boolean, default: true },
    transactionHash: String
  }, { timestamps: true });
  subscriptionSchema.index({ subscriber: 1, creator: 1 }, { unique: true });
  subscriptionSchema.index({ creator: 1, status: 1 });
  Subscription = mongoose.model('Subscription', subscriptionSchema);
}

try { PaidContent = mongoose.model('PaidContent'); } catch {
  const paidContentSchema = new mongoose.Schema({
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: mongoose.Schema.Types.ObjectId, required: true },
    contentType: { type: String, enum: ['blog', 'post', 'media'], required: true },
    price: { type: Number, required: true, min: 0 },
    requiredTier: { type: String, enum: ['none', 'basic', 'premium', 'vip'], default: 'none' },
    purchases: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    purchaseCount: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  }, { timestamps: true });
  paidContentSchema.index({ content: 1, contentType: 1 });
  PaidContent = mongoose.model('PaidContent', paidContentSchema);
}

try { Withdrawal = mongoose.model('Withdrawal'); } catch {
  const withdrawalSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['crypto', 'bank', 'paypal'], required: true },
    destination: String,
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    transactionHash: String,
    processedAt: Date,
    fee: { type: Number, default: 0 },
    notes: String
  }, { timestamps: true });
  withdrawalSchema.index({ user: 1, createdAt: -1 });
  Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
}

// ==========================================
// TIPS
// ==========================================

// POST /api/monetization/tip - Send a tip
router.post('/tip', verifyToken, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { recipientId, amount, message, contentId, contentType, transactionHash } = req.body;

    if (!recipientId || !amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Recipient and valid amount required' });
    }

    if (senderId === recipientId) {
      return res.status(400).json({ ok: false, error: 'Cannot tip yourself' });
    }

    // Create tip
    const tip = await Tip.create({
      sender: senderId,
      recipient: recipientId,
      amount,
      message,
      contentId,
      contentType,
      transactionHash
    });

    // Update recipient balance
    const User = mongoose.model('User');
    await User.updateOne({ _id: recipientId }, { $inc: { tokenBalance: amount } });
    await User.updateOne({ _id: senderId }, { $inc: { tokenBalance: -amount } });

    // Send notification
    try {
      const Notification = mongoose.model('Notification');
      const sender = await User.findById(senderId).select('name');
      await Notification.create({
        recipient: recipientId,
        sender: senderId,
        type: 'tip',
        message: `${sender.name} sent you a ${amount} CYBEV tip!`,
        data: { tipId: tip._id, amount }
      });
    } catch (e) {}

    res.json({ ok: true, tip });
  } catch (error) {
    console.error('Tip error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send tip' });
  }
});

// GET /api/monetization/tips/received - Get received tips
router.get('/tips/received', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const tips = await Tip.find({ recipient: userId })
      .populate('sender', 'name username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Tip.countDocuments({ recipient: userId });
    const totalAmount = await Tip.aggregate([
      { $match: { recipient: mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({ 
      ok: true, 
      tips, 
      total, 
      totalAmount: totalAmount[0]?.total || 0 
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get tips' });
  }
});

// GET /api/monetization/tips/sent - Get sent tips
router.get('/tips/sent', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const tips = await Tip.find({ sender: userId })
      .populate('recipient', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ ok: true, tips });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get tips' });
  }
});

// ==========================================
// SUBSCRIPTIONS
// ==========================================

// POST /api/monetization/subscribe - Subscribe to creator
router.post('/subscribe', verifyToken, async (req, res) => {
  try {
    const subscriberId = req.user.id;
    const { creatorId, tier = 'basic', transactionHash } = req.body;

    if (!creatorId) {
      return res.status(400).json({ ok: false, error: 'Creator ID required' });
    }

    if (subscriberId === creatorId) {
      return res.status(400).json({ ok: false, error: 'Cannot subscribe to yourself' });
    }

    // Get creator's subscription prices
    const User = mongoose.model('User');
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ ok: false, error: 'Creator not found' });
    }

    const prices = creator.subscriptionPrices || { basic: 5, premium: 15, vip: 50 };
    const price = prices[tier] || 5;

    // Check/update existing subscription
    const existing = await Subscription.findOne({ subscriber: subscriberId, creator: creatorId });
    if (existing && existing.status === 'active') {
      return res.status(400).json({ ok: false, error: 'Already subscribed' });
    }

    // Calculate end date (30 days)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    // Create/update subscription
    const subscription = await Subscription.findOneAndUpdate(
      { subscriber: subscriberId, creator: creatorId },
      {
        tier,
        price,
        status: 'active',
        startDate: new Date(),
        endDate,
        transactionHash
      },
      { upsert: true, new: true }
    );

    // Update balances
    await User.updateOne({ _id: subscriberId }, { $inc: { tokenBalance: -price } });
    await User.updateOne({ _id: creatorId }, { $inc: { tokenBalance: price * 0.9 } }); // 10% platform fee

    res.json({ ok: true, subscription });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ ok: false, error: 'Failed to subscribe' });
  }
});

// POST /api/monetization/unsubscribe - Cancel subscription
router.post('/unsubscribe', verifyToken, async (req, res) => {
  try {
    const subscriberId = req.user.id;
    const { creatorId } = req.body;

    const subscription = await Subscription.findOneAndUpdate(
      { subscriber: subscriberId, creator: creatorId, status: 'active' },
      { status: 'cancelled', autoRenew: false },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ ok: false, error: 'Subscription not found' });
    }

    res.json({ ok: true, subscription, message: 'Subscription cancelled' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to unsubscribe' });
  }
});

// GET /api/monetization/subscriptions - Get my subscriptions
router.get('/subscriptions', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscriptions = await Subscription.find({ subscriber: userId, status: 'active' })
      .populate('creator', 'name username avatar');

    res.json({ ok: true, subscriptions });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get subscriptions' });
  }
});

// GET /api/monetization/subscribers - Get my subscribers
router.get('/subscribers', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscribers = await Subscription.find({ creator: userId, status: 'active' })
      .populate('subscriber', 'name username avatar');

    const totalRevenue = await Subscription.aggregate([
      { $match: { creator: mongoose.Types.ObjectId(userId), status: 'active' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);

    res.json({ 
      ok: true, 
      subscribers, 
      count: subscribers.length,
      monthlyRevenue: totalRevenue[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get subscribers' });
  }
});

// ==========================================
// PAID CONTENT
// ==========================================

// POST /api/monetization/content/set-price - Set content price
router.post('/content/set-price', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { contentId, contentType, price, requiredTier } = req.body;

    if (!contentId || !contentType || price === undefined) {
      return res.status(400).json({ ok: false, error: 'Content ID, type, and price required' });
    }

    const paidContent = await PaidContent.findOneAndUpdate(
      { content: contentId, contentType },
      {
        creator: userId,
        price,
        requiredTier: requiredTier || 'none'
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true, paidContent });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to set price' });
  }
});

// POST /api/monetization/content/purchase - Purchase content
router.post('/content/purchase', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { contentId, contentType, transactionHash } = req.body;

    const paidContent = await PaidContent.findOne({ content: contentId, contentType });
    if (!paidContent) {
      return res.status(404).json({ ok: false, error: 'Content not found' });
    }

    if (paidContent.creator.toString() === userId) {
      return res.status(400).json({ ok: false, error: 'Cannot purchase your own content' });
    }

    if (paidContent.purchases.includes(userId)) {
      return res.status(400).json({ ok: false, error: 'Already purchased' });
    }

    // Update balances
    const User = mongoose.model('User');
    await User.updateOne({ _id: userId }, { $inc: { tokenBalance: -paidContent.price } });
    await User.updateOne({ _id: paidContent.creator }, { $inc: { tokenBalance: paidContent.price * 0.9 } });

    // Record purchase
    paidContent.purchases.push(userId);
    paidContent.purchaseCount += 1;
    paidContent.revenue += paidContent.price;
    await paidContent.save();

    res.json({ ok: true, message: 'Purchase successful' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to purchase content' });
  }
});

// GET /api/monetization/content/check-access - Check if user has access
router.get('/content/check-access', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { contentId, contentType, creatorId } = req.query;

    // Check if content is paid
    const paidContent = await PaidContent.findOne({ content: contentId, contentType });
    
    if (!paidContent || paidContent.price === 0) {
      return res.json({ ok: true, hasAccess: true, reason: 'free' });
    }

    // Check if creator
    if (paidContent.creator.toString() === userId) {
      return res.json({ ok: true, hasAccess: true, reason: 'creator' });
    }

    // Check if purchased
    if (paidContent.purchases.includes(userId)) {
      return res.json({ ok: true, hasAccess: true, reason: 'purchased' });
    }

    // Check subscription tier
    if (paidContent.requiredTier !== 'none' && creatorId) {
      const subscription = await Subscription.findOne({
        subscriber: userId,
        creator: creatorId,
        status: 'active'
      });

      const tierRanks = { basic: 1, premium: 2, vip: 3 };
      if (subscription && tierRanks[subscription.tier] >= tierRanks[paidContent.requiredTier]) {
        return res.json({ ok: true, hasAccess: true, reason: 'subscription' });
      }
    }

    res.json({ 
      ok: true, 
      hasAccess: false, 
      price: paidContent.price,
      requiredTier: paidContent.requiredTier
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to check access' });
  }
});

// ==========================================
// WITHDRAWALS
// ==========================================

// POST /api/monetization/withdraw - Request withdrawal
router.post('/withdraw', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, method, destination } = req.body;

    if (!amount || amount < 10) {
      return res.status(400).json({ ok: false, error: 'Minimum withdrawal is 10 CYBEV' });
    }

    // Check balance
    const User = mongoose.model('User');
    const user = await User.findById(userId);
    if (user.tokenBalance < amount) {
      return res.status(400).json({ ok: false, error: 'Insufficient balance' });
    }

    // Calculate fee (2.5%)
    const fee = amount * 0.025;
    const netAmount = amount - fee;

    // Create withdrawal request
    const withdrawal = await Withdrawal.create({
      user: userId,
      amount: netAmount,
      method,
      destination,
      fee
    });

    // Deduct from balance
    await User.updateOne({ _id: userId }, { $inc: { tokenBalance: -amount } });

    res.json({ ok: true, withdrawal });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to request withdrawal' });
  }
});

// GET /api/monetization/withdrawals - Get withdrawal history
router.get('/withdrawals', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const withdrawals = await Withdrawal.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ ok: true, withdrawals });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get withdrawals' });
  }
});

// ==========================================
// EARNINGS DASHBOARD
// ==========================================

// GET /api/monetization/earnings - Get earnings summary
router.get('/earnings', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Tips received
    const tipsReceived = await Tip.aggregate([
      { $match: { recipient: mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    // Subscription revenue
    const subscriptionRevenue = await Subscription.aggregate([
      { $match: { creator: mongoose.Types.ObjectId(userId), status: 'active' } },
      { $group: { _id: null, total: { $sum: '$price' }, count: { $sum: 1 } } }
    ]);

    // Content sales
    const contentSales = await PaidContent.aggregate([
      { $match: { creator: mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$revenue' }, count: { $sum: '$purchaseCount' } } }
    ]);

    // Withdrawals
    const totalWithdrawn = await Withdrawal.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get user balance
    const User = mongoose.model('User');
    const user = await User.findById(userId).select('tokenBalance');

    res.json({
      ok: true,
      earnings: {
        tips: {
          total: tipsReceived[0]?.total || 0,
          count: tipsReceived[0]?.count || 0
        },
        subscriptions: {
          monthlyRevenue: subscriptionRevenue[0]?.total || 0,
          subscriberCount: subscriptionRevenue[0]?.count || 0
        },
        contentSales: {
          total: contentSales[0]?.total || 0,
          count: contentSales[0]?.count || 0
        },
        withdrawn: totalWithdrawn[0]?.total || 0,
        availableBalance: user?.tokenBalance || 0
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get earnings' });
  }
});

module.exports = router;
