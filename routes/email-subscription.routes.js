// ============================================
// FILE: routes/email-subscription.routes.js
// CYBEV Email Subscription & Billing API
// VERSION: 1.0.0 - Monetization Tiers
// ============================================

const express = require('express');
const router = express.Router();
const { EmailPlan, UserEmailSubscription, UsageLog } = require('../models/email-subscription.model');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// PLANS
// ==========================================

// Get all available plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await EmailPlan.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .select('-stripeProductId -stripePriceIdMonthly -stripePriceIdYearly');
    
    res.json({ plans });
  } catch (err) {
    console.error('Get plans error:', err);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// Get plan details
router.get('/plans/:planId', async (req, res) => {
  try {
    const plan = await EmailPlan.findOne({ planId: req.params.planId, isActive: true });
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    res.json({ plan });
  } catch (err) {
    console.error('Get plan error:', err);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
});

// ==========================================
// USER SUBSCRIPTION
// ==========================================

// Get current subscription
router.get('/my', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    let subscription = await UserEmailSubscription.findOne({ user: userId })
      .populate('planDetails');
    
    // Create free subscription if none exists
    if (!subscription) {
      const freePlan = await EmailPlan.findOne({ planId: 'free' });
      subscription = await UserEmailSubscription.create({
        user: userId,
        plan: 'free',
        planDetails: freePlan?._id
      });
      subscription = await subscription.populate('planDetails');
    }
    
    res.json({ subscription });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Check feature access
router.get('/check-feature/:feature', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { feature } = req.params;
    
    const subscription = await UserEmailSubscription.findOne({ user: userId })
      .populate('planDetails');
    
    if (!subscription || !subscription.planDetails) {
      // Free plan defaults
      const freePlan = await EmailPlan.findOne({ planId: 'free' });
      const hasFeature = freePlan?.features?.[feature] === true;
      return res.json({ hasFeature, plan: 'free' });
    }
    
    const hasFeature = subscription.hasFeature(feature);
    res.json({ hasFeature, plan: subscription.plan });
  } catch (err) {
    console.error('Check feature error:', err);
    res.status(500).json({ error: 'Failed to check feature' });
  }
});

// Check limit
router.get('/check-limit/:limit', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { limit } = req.params;
    
    const subscription = await UserEmailSubscription.findOne({ user: userId })
      .populate('planDetails');
    
    if (!subscription || !subscription.planDetails) {
      return res.json({ allowed: true, reason: 'No subscription data' });
    }
    
    const currentValue = subscription.usage[limit] || 0;
    const result = subscription.checkLimit(limit, currentValue);
    
    res.json(result);
  } catch (err) {
    console.error('Check limit error:', err);
    res.status(500).json({ error: 'Failed to check limit' });
  }
});

// Get usage stats
router.get('/usage', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const subscription = await UserEmailSubscription.findOne({ user: userId })
      .populate('planDetails');
    
    if (!subscription) {
      return res.json({ usage: {}, limits: {} });
    }
    
    res.json({
      usage: subscription.usage,
      limits: subscription.planDetails?.limits || {},
      overage: subscription.overage
    });
  } catch (err) {
    console.error('Get usage error:', err);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// Get usage history
router.get('/usage/history', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { months = 6 } = req.query;
    
    // Generate period strings for last N months
    const periods = [];
    for (let i = 0; i < parseInt(months); i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      periods.push(date.toISOString().substring(0, 7)); // YYYY-MM
    }
    
    const history = await UsageLog.find({
      user: userId,
      period: { $in: periods }
    }).sort({ period: -1 });
    
    res.json({ history });
  } catch (err) {
    console.error('Get usage history error:', err);
    res.status(500).json({ error: 'Failed to fetch usage history' });
  }
});

// ==========================================
// SUBSCRIPTION MANAGEMENT
// ==========================================

// Upgrade/downgrade plan (for Stripe integration)
router.post('/change-plan', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { planId, billingCycle } = req.body;
    
    const newPlan = await EmailPlan.findOne({ planId, isActive: true });
    if (!newPlan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    let subscription = await UserEmailSubscription.findOne({ user: userId });
    
    if (!subscription) {
      subscription = new UserEmailSubscription({ user: userId });
    }
    
    // Record plan change in history
    if (subscription.plan && subscription.plan !== planId) {
      subscription.planHistory.push({
        plan: subscription.plan,
        startedAt: subscription.currentPeriodStart || subscription.createdAt,
        endedAt: new Date(),
        reason: 'plan_change'
      });
    }
    
    // Update subscription
    subscription.plan = planId;
    subscription.planDetails = newPlan._id;
    subscription.billingCycle = billingCycle || 'monthly';
    subscription.currentPeriodStart = new Date();
    subscription.currentPeriodEnd = billingCycle === 'yearly'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // For free plan, no payment needed
    if (planId === 'free') {
      subscription.paymentStatus = 'none';
      subscription.billingCycle = 'none';
    } else {
      // In production, this would integrate with Stripe
      subscription.paymentStatus = 'active';
    }
    
    await subscription.save();
    
    res.json({ ok: true, subscription: await subscription.populate('planDetails') });
  } catch (err) {
    console.error('Change plan error:', err);
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

// Start trial
router.post('/start-trial', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { planId } = req.body;
    
    let subscription = await UserEmailSubscription.findOne({ user: userId });
    
    if (subscription?.hasUsedTrial) {
      return res.status(400).json({ error: 'Trial already used' });
    }
    
    const plan = await EmailPlan.findOne({ planId, isActive: true });
    if (!plan || planId === 'free') {
      return res.status(400).json({ error: 'Invalid plan for trial' });
    }
    
    if (!subscription) {
      subscription = new UserEmailSubscription({ user: userId });
    }
    
    subscription.plan = planId;
    subscription.planDetails = plan._id;
    subscription.billingCycle = 'monthly';
    subscription.paymentStatus = 'trialing';
    subscription.trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    subscription.hasUsedTrial = true;
    subscription.currentPeriodStart = new Date();
    subscription.currentPeriodEnd = subscription.trialEndsAt;
    
    await subscription.save();
    
    res.json({ ok: true, subscription: await subscription.populate('planDetails') });
  } catch (err) {
    console.error('Start trial error:', err);
    res.status(500).json({ error: 'Failed to start trial' });
  }
});

// Cancel subscription
router.post('/cancel', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { reason, immediate } = req.body;
    
    const subscription = await UserEmailSubscription.findOne({ user: userId });
    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }
    
    if (immediate) {
      // Immediate cancellation - downgrade to free
      const freePlan = await EmailPlan.findOne({ planId: 'free' });
      
      subscription.planHistory.push({
        plan: subscription.plan,
        startedAt: subscription.currentPeriodStart,
        endedAt: new Date(),
        reason: 'cancelled'
      });
      
      subscription.plan = 'free';
      subscription.planDetails = freePlan?._id;
      subscription.billingCycle = 'none';
      subscription.paymentStatus = 'cancelled';
      subscription.cancelledAt = new Date();
      subscription.cancellationReason = reason;
    } else {
      // Cancel at period end
      subscription.cancelAtPeriodEnd = true;
      subscription.cancellationReason = reason;
    }
    
    await subscription.save();
    
    res.json({ ok: true, subscription: await subscription.populate('planDetails') });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ==========================================
// STRIPE WEBHOOK (for production)
// ==========================================

router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  // This would handle Stripe webhook events
  // For now, just acknowledge
  res.json({ received: true });
});

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

// Admin: Update user subscription
router.put('/admin/:userId', auth, async (req, res) => {
  try {
    // Check if user is admin (you'd implement this based on your user model)
    const adminId = req.user.userId || req.user.id;
    const User = require('mongoose').models.User;
    const admin = await User.findById(adminId);
    
    if (!admin?.isAdmin && admin?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { userId } = req.params;
    const updates = req.body;
    
    const subscription = await UserEmailSubscription.findOneAndUpdate(
      { user: userId },
      updates,
      { new: true, upsert: true }
    ).populate('planDetails');
    
    res.json({ ok: true, subscription });
  } catch (err) {
    console.error('Admin update subscription error:', err);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

module.exports = router;
