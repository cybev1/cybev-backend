// ============================================
// FILE: routes/subscription.routes.js
// Premium Subscriptions & Creator Memberships
// ============================================
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const mongoose = require('mongoose');
const { createNotification } = require('../utils/notifications');

// Subscription Plan Model
const planSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true }, // Monthly price in CYBEV
  features: [String],
  type: { type: String, enum: ['platform', 'creator'], default: 'platform' },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For creator plans
  active: { type: Boolean, default: true }
}, { timestamps: true });

// Subscription Model
const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For creator subscriptions
  status: { type: String, enum: ['active', 'cancelled', 'expired'], default: 'active' },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  autoRenew: { type: Boolean, default: true },
  lastPayment: { type: Date },
  totalPaid: { type: Number, default: 0 }
}, { timestamps: true });

let SubscriptionPlan, Subscription;
try {
  SubscriptionPlan = mongoose.model('SubscriptionPlan');
  Subscription = mongoose.model('Subscription');
} catch {
  SubscriptionPlan = mongoose.model('SubscriptionPlan', planSchema);
  Subscription = mongoose.model('Subscription', subscriptionSchema);
}

// Default platform plans
const DEFAULT_PLANS = [
  {
    name: 'Basic',
    description: 'Essential features for casual creators',
    price: 0,
    features: ['Create up to 5 blogs', 'Basic analytics', 'Community support'],
    type: 'platform'
  },
  {
    name: 'Pro',
    description: 'Advanced features for serious creators',
    price: 50,
    features: [
      'Unlimited blogs',
      'Advanced analytics',
      'AI writing assistant',
      'Custom domain',
      'Priority support',
      'No platform fees on tips'
    ],
    type: 'platform'
  },
  {
    name: 'Business',
    description: 'For teams and enterprises',
    price: 200,
    features: [
      'Everything in Pro',
      'Team collaboration',
      'API access',
      'White-label options',
      'Dedicated support',
      'Revenue share boost'
    ],
    type: 'platform'
  }
];

// Initialize default plans
async function initDefaultPlans() {
  try {
    const existingPlans = await SubscriptionPlan.countDocuments({ type: 'platform' });
    if (existingPlans === 0) {
      await SubscriptionPlan.insertMany(DEFAULT_PLANS);
      console.log('✅ Default subscription plans created');
    }
  } catch (e) {
    console.log('Plans init error:', e.message);
  }
}
initDefaultPlans();

// GET /api/subscriptions/plans - Get all platform plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ type: 'platform', active: true });
    res.json({ ok: true, plans });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch plans' });
  }
});

// GET /api/subscriptions/creator/:creatorId/plans - Get creator's membership plans
router.get('/creator/:creatorId/plans', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ 
      creator: req.params.creatorId, 
      type: 'creator',
      active: true 
    });
    res.json({ ok: true, plans });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch creator plans' });
  }
});

// POST /api/subscriptions/subscribe - Subscribe to a plan
router.post('/subscribe', verifyToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const Wallet = require('../models/wallet.model');
    const User = require('../models/user.model');

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.active) {
      return res.status(404).json({ ok: false, error: 'Plan not found' });
    }

    // Check if already subscribed
    const existingSub = await Subscription.findOne({
      user: req.user.id,
      plan: planId,
      status: 'active'
    });
    if (existingSub) {
      return res.status(400).json({ ok: false, error: 'Already subscribed to this plan' });
    }

    // Check balance if not free plan
    if (plan.price > 0) {
      const wallet = await Wallet.findOne({ user: req.user.id });
      if (!wallet || wallet.balance < plan.price) {
        return res.status(400).json({ ok: false, error: 'Insufficient balance' });
      }

      // Deduct payment
      wallet.balance -= plan.price;
      wallet.transactions.push({
        type: 'SUBSCRIPTION',
        amount: -plan.price,
        description: `${plan.name} subscription`
      });
      await wallet.save();

      // If creator plan, pay creator
      if (plan.type === 'creator' && plan.creator) {
        const platformFee = plan.price * 0.1; // 10% platform fee
        const creatorAmount = plan.price - platformFee;

        let creatorWallet = await Wallet.findOne({ user: plan.creator });
        if (!creatorWallet) {
          creatorWallet = new Wallet({ user: plan.creator, balance: 0 });
        }
        creatorWallet.balance += creatorAmount;
        creatorWallet.totalEarned = (creatorWallet.totalEarned || 0) + creatorAmount;
        creatorWallet.transactions.push({
          type: 'SUBSCRIPTION_EARNING',
          amount: creatorAmount,
          description: 'Membership subscription'
        });
        await creatorWallet.save();

        // Notify creator
        const subscriber = await User.findById(req.user.id);
        await createNotification({
          recipient: plan.creator,
          sender: req.user.id,
          type: 'subscription',
          message: `${subscriber.name || subscriber.username} subscribed to your ${plan.name} membership!`
        });
      }
    }

    // Create subscription
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

    const subscription = new Subscription({
      user: req.user.id,
      plan: planId,
      creator: plan.creator || null,
      endDate,
      lastPayment: plan.price > 0 ? new Date() : null,
      totalPaid: plan.price
    });
    await subscription.save();

    // Update user premium status
    await User.findByIdAndUpdate(req.user.id, {
      isPremium: plan.price > 0,
      subscriptionPlan: plan.name
    });

    res.json({
      ok: true,
      subscription: {
        _id: subscription._id,
        plan: plan.name,
        endDate: subscription.endDate,
        features: plan.features
      }
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ ok: false, error: 'Failed to subscribe' });
  }
});

// POST /api/subscriptions/cancel - Cancel subscription
router.post('/cancel', verifyToken, async (req, res) => {
  try {
    const { subscriptionId } = req.body;

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      user: req.user.id,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({ ok: false, error: 'Subscription not found' });
    }

    subscription.status = 'cancelled';
    subscription.autoRenew = false;
    await subscription.save();

    res.json({ 
      ok: true, 
      message: 'Subscription cancelled. Access continues until ' + subscription.endDate.toLocaleDateString()
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to cancel subscription' });
  }
});

// GET /api/subscriptions/my - Get user's subscriptions
router.get('/my', verifyToken, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ user: req.user.id })
      .populate('plan')
      .populate('creator', 'name username avatar')
      .sort({ createdAt: -1 });

    res.json({ ok: true, subscriptions });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch subscriptions' });
  }
});

// GET /api/subscriptions/subscribers - Get creator's subscribers
router.get('/subscribers', verifyToken, async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ creator: req.user.id });
    const planIds = plans.map(p => p._id);

    const subscribers = await Subscription.find({
      plan: { $in: planIds },
      status: 'active'
    }).populate('user', 'name username avatar email');

    const totalEarnings = await Subscription.aggregate([
      { $match: { plan: { $in: planIds } } },
      { $group: { _id: null, total: { $sum: '$totalPaid' } } }
    ]);

    res.json({
      ok: true,
      subscribers,
      stats: {
        count: subscribers.length,
        totalEarnings: totalEarnings[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch subscribers' });
  }
});

// POST /api/subscriptions/creator/plan - Create creator membership plan
router.post('/creator/plan', verifyToken, async (req, res) => {
  try {
    const { name, description, price, features } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ ok: false, error: 'Name and price required' });
    }

    // Check if creator already has 3 plans
    const existingPlans = await SubscriptionPlan.countDocuments({ creator: req.user.id });
    if (existingPlans >= 3) {
      return res.status(400).json({ ok: false, error: 'Maximum 3 membership tiers allowed' });
    }

    const plan = new SubscriptionPlan({
      name,
      description,
      price,
      features: features || [],
      type: 'creator',
      creator: req.user.id
    });
    await plan.save();

    res.json({ ok: true, plan });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to create plan' });
  }
});

// PUT /api/subscriptions/creator/plan/:id - Update creator plan
router.put('/creator/plan/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, price, features, active } = req.body;

    const plan = await SubscriptionPlan.findOne({
      _id: req.params.id,
      creator: req.user.id
    });

    if (!plan) {
      return res.status(404).json({ ok: false, error: 'Plan not found' });
    }

    if (name) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (price !== undefined) plan.price = price;
    if (features) plan.features = features;
    if (active !== undefined) plan.active = active;

    await plan.save();

    res.json({ ok: true, plan });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update plan' });
  }
});

// DELETE /api/subscriptions/creator/plan/:id - Delete creator plan
router.delete('/creator/plan/:id', verifyToken, async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findOneAndDelete({
      _id: req.params.id,
      creator: req.user.id
    });

    if (!plan) {
      return res.status(404).json({ ok: false, error: 'Plan not found' });
    }

    res.json({ ok: true, message: 'Plan deleted' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to delete plan' });
  }
});

module.exports = router;
