// ============================================
// FILE: routes/subscription.routes.js
// Premium Subscriptions API
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Subscription Schema
const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, enum: ['free', 'pro', 'business'], default: 'free' },
  price: { type: Number, default: 0 },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  autoRenew: { type: Boolean, default: true },
  transactionHash: { type: String },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' }
}, { timestamps: true });

let Subscription;
try {
  Subscription = mongoose.model('Subscription');
} catch {
  Subscription = mongoose.model('Subscription', subscriptionSchema);
}

// Plan configurations
const PLANS = {
  free: {
    id: 'free',
    name: 'Basic',
    price: 0,
    features: [
      'Create up to 5 blogs',
      'Basic analytics',
      'Community support',
      'Standard AI assistance'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 50, // 50 CYBEV/month
    features: [
      'Unlimited blogs',
      'Advanced analytics',
      'Priority support',
      'Full AI assistant',
      'Custom domain',
      'No tip fees',
      'NFT minting discount'
    ]
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 200, // 200 CYBEV/month
    features: [
      'Everything in Pro',
      'Team collaboration',
      'API access',
      'White-label option',
      'Revenue boost (+10%)',
      'Dedicated support',
      'Custom integrations'
    ]
  }
};

// GET /api/subscriptions/plans - Get available plans
router.get('/plans', (req, res) => {
  res.json({
    ok: true,
    plans: Object.values(PLANS),
    tokenAddress: process.env.CYBEV_TOKEN_ADDRESS
  });
});

// GET /api/subscriptions/my - Get user's subscription
router.get('/my', verifyToken, async (req, res) => {
  try {
    let subscription = await Subscription.findOne({ 
      user: req.user.id,
      status: 'active'
    }).sort({ createdAt: -1 });

    // If no subscription, they're on free plan
    if (!subscription) {
      subscription = {
        plan: 'free',
        price: 0,
        status: 'active',
        features: PLANS.free.features
      };
    } else {
      subscription = {
        ...subscription.toObject(),
        features: PLANS[subscription.plan]?.features || []
      };
    }

    res.json({ ok: true, subscription });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch subscription' });
  }
});

// POST /api/subscriptions/subscribe - Subscribe to a plan
router.post('/subscribe', verifyToken, async (req, res) => {
  try {
    const { plan, transactionHash } = req.body;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ ok: false, error: 'Invalid plan' });
    }

    if (plan === 'free') {
      return res.status(400).json({ ok: false, error: 'Cannot subscribe to free plan' });
    }

    // Check for existing active subscription
    const existing = await Subscription.findOne({
      user: req.user.id,
      status: 'active',
      plan: { $ne: 'free' }
    });

    if (existing) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Already have an active subscription. Cancel first to switch plans.' 
      });
    }

    const planConfig = PLANS[plan];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

    const subscription = new Subscription({
      user: req.user.id,
      plan,
      price: planConfig.price,
      startDate: new Date(),
      endDate,
      transactionHash,
      status: transactionHash ? 'active' : 'pending'
    });

    await subscription.save();

    // Update user's subscription status
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(req.user.id, { 
      subscriptionPlan: plan,
      subscriptionExpires: endDate
    });

    res.json({
      ok: true,
      subscription: {
        _id: subscription._id,
        plan: subscription.plan,
        planName: planConfig.name,
        price: planConfig.price,
        features: planConfig.features,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: subscription.status
      }
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ ok: false, error: 'Failed to subscribe' });
  }
});

// PUT /api/subscriptions/confirm/:id - Confirm subscription payment
router.put('/confirm/:id', verifyToken, async (req, res) => {
  try {
    const { transactionHash } = req.body;
    
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ ok: false, error: 'Subscription not found' });
    }

    if (subscription.user.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    subscription.transactionHash = transactionHash;
    subscription.status = 'active';
    await subscription.save();

    // Update user
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(req.user.id, { 
      subscriptionPlan: subscription.plan,
      subscriptionExpires: subscription.endDate
    });

    res.json({ ok: true, subscription });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to confirm subscription' });
  }
});

// POST /api/subscriptions/cancel - Cancel subscription
router.post('/cancel', verifyToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      user: req.user.id,
      status: 'active',
      plan: { $ne: 'free' }
    });

    if (!subscription) {
      return res.status(404).json({ ok: false, error: 'No active subscription found' });
    }

    subscription.status = 'cancelled';
    subscription.autoRenew = false;
    await subscription.save();

    // Update user
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(req.user.id, { 
      subscriptionPlan: 'free',
      subscriptionExpires: null
    });

    res.json({ 
      ok: true, 
      message: 'Subscription cancelled. You can still use features until ' + subscription.endDate.toDateString()
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to cancel subscription' });
  }
});

// GET /api/subscriptions/check-feature/:feature - Check if user has feature access
router.get('/check-feature/:feature', verifyToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      user: req.user.id,
      status: 'active'
    }).sort({ createdAt: -1 });

    const plan = subscription?.plan || 'free';
    const planFeatures = PLANS[plan]?.features || [];
    
    // Simple feature check - you can make this more sophisticated
    const hasAccess = plan !== 'free' || req.params.feature === 'basic';

    res.json({ 
      ok: true, 
      hasAccess,
      plan,
      features: planFeatures
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to check feature' });
  }
});

module.exports = router;
