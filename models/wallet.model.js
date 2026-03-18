// ============================================
// FILE: wallet.model.js
// PATH: /models/wallet.model.js
// CYBEV Wallet v2.0 — USD + Credits + Subscriptions
// ============================================
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      // Credit earnings
      'CONTENT_REWARD', 'BLOG_POST', 'BLOG_LIKE', 'BLOG_VIEW', 'BLOG_SHARE',
      'VLOG_POST', 'POST_CREATE', 'COMMENT', 'DAILY_LOGIN', 'REFERRAL',
      'STREAK_BONUS', 'SIGNUP_BONUS', 'ACHIEVEMENT',
      // USD funding
      'FUND_FLUTTERWAVE', 'FUND_CRYPTO', 'FUND_CARD', 'FUND_MOBILE_MONEY',
      // Spending
      'AI_VIDEO', 'AI_MUSIC', 'AI_GRAPHICS', 'BOOST_POST', 'TIP_CREATOR',
      'PREMIUM_FEATURE', 'SUBSCRIPTION',
      // Transfers
      'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAW', 'BUY_CREDITS', 'SELL_CREDITS',
      // Admin
      'ADMIN_CREDIT', 'ADMIN_DEBIT', 'BONUS', 'REFUND'
    ],
    required: true
  },
  currency: { type: String, enum: ['USD', 'CREDITS'], required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  reference: { type: String }, // payment ref / tx id
  relatedId: { type: mongoose.Schema.Types.ObjectId }, // blog, user, subscription id
  relatedModel: { type: String }, // 'Blog', 'User', 'Subscription'
  status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'completed' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // ─── USD Balance (real money) ───
  usdBalance: { type: Number, default: 0, min: 0 },
  totalFunded: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },

  // ─── CYBEV Credits (internal currency: 1 USD = 100 Credits) ───
  credits: { type: Number, default: 0, min: 0 },
  totalCreditsEarned: { type: Number, default: 0 },
  totalCreditsSpent: { type: Number, default: 0 },

  // ─── Legacy field (for backward compatibility) ───
  balance: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },

  // ─── Subscription ───
  subscription: {
    plan: { type: String, enum: ['free', 'starter', 'pro', 'business', 'enterprise'], default: 'free' },
    status: { type: String, enum: ['active', 'canceled', 'expired', 'past_due'], default: 'active' },
    startedAt: { type: Date },
    expiresAt: { type: Date },
    autoRenew: { type: Boolean, default: true },
    paymentRef: { type: String }
  },

  // ─── Streaks ───
  streaks: {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    lastActivityDate: { type: Date }
  },

  // ─── Achievements ───
  achievements: [{ type: String }],

  // ─── Daily Login Tracking ───
  lastDailyClaim: { type: Date },

  // ─── Transactions ───
  transactions: [transactionSchema]
}, { timestamps: true });

// ─── Constants ───
walletSchema.statics.CREDIT_RATE = 100; // 1 USD = 100 credits
walletSchema.statics.CASHOUT_RATE = 80; // 100 credits = $0.80 (20% platform fee)
walletSchema.statics.MIN_WITHDRAW = 5; // Minimum $5 to withdraw

walletSchema.statics.PLANS = {
  free: {
    name: 'Free',
    price: 0,
    monthlyCredits: 50,
    features: [
      'Unlimited blog posts', '3 AI articles/month', 'Auto-Blog: 1 article/week',
      'Host watch parties (unlimited viewers)', 'Boost: pay-as-you-go ($1/1K)',
      'Full analytics & SEO tools', 'Social media scheduling',
      'All church/organization features', 'AI Studio: 2 videos, 5 songs, 10 images/month',
      'Email campaigns: 100 contacts', '50 credits/month'
    ],
    limits: {
      aiArticles: 3, autoBlogPerWeek: 1, autoBlogPerDay: 0,
      aiVideo: 2, aiMusic: 5, aiGraphics: 10,
      emailContacts: 100, boostIncluded: 0,
      websites: 1, watchPartyMaxBoost: 5000
    }
  },
  starter: {
    name: 'Starter',
    price: 4.99,
    monthlyCredits: 500,
    features: [
      'Unlimited blog posts', '15 AI articles/month', 'Auto-Blog: 3 articles/day',
      'Host watch parties (unlimited viewers)', 'Boost: 5K included + pay-as-you-go',
      'Full analytics & SEO tools', 'Social media scheduling',
      'All church/organization features', 'AI Studio: 10 videos, 30 songs, 100 images/month',
      'Email campaigns: 1K contacts', '500 credits/month', '7-day free trial'
    ],
    limits: {
      aiArticles: 15, autoBlogPerWeek: -1, autoBlogPerDay: 3,
      aiVideo: 10, aiMusic: 30, aiGraphics: 100,
      emailContacts: 1000, boostIncluded: 5000,
      websites: 3, watchPartyMaxBoost: 10000
    }
  },
  pro: {
    name: 'Pro',
    price: 14.99,
    monthlyCredits: 2000,
    features: [
      'Unlimited blog posts', '50 AI articles/month', 'Auto-Blog: 10 articles/day',
      'Host watch parties (unlimited viewers)', 'Boost: 20K included + pay-as-you-go',
      'Full analytics & SEO tools', 'Social media scheduling',
      'All church/organization features', 'AI Studio: 50 videos, 100 songs, 500 images/month',
      'Email campaigns: 10K contacts', '2,000 credits/month', '14-day free trial'
    ],
    limits: {
      aiArticles: 50, autoBlogPerWeek: -1, autoBlogPerDay: 10,
      aiVideo: 50, aiMusic: 100, aiGraphics: 500,
      emailContacts: 10000, boostIncluded: 20000,
      websites: 10, watchPartyMaxBoost: 50000
    }
  },
  business: {
    name: 'Business',
    price: 49.99,
    monthlyCredits: 10000,
    features: [
      'Unlimited blog posts', 'Unlimited AI articles', 'Auto-Blog: 30 articles/day',
      'Host watch parties (unlimited viewers)', 'Boost: 100K included + pay-as-you-go',
      'Full analytics & SEO tools', 'Social media scheduling',
      'All church/organization features', 'AI Studio: unlimited',
      'Email campaigns: unlimited contacts', '10,000 credits/month',
      'Priority support', 'White-label options', 'API access'
    ],
    limits: {
      aiArticles: -1, autoBlogPerWeek: -1, autoBlogPerDay: 30,
      aiVideo: -1, aiMusic: -1, aiGraphics: -1,
      emailContacts: -1, boostIncluded: 100000,
      websites: -1, watchPartyMaxBoost: -1
    }
  }
};

// Boost pricing — pay-as-you-go
walletSchema.statics.BOOST_PRICING = {
  pricePerThousand: 1.00,  // $1 per 1,000 viewers
  minimumPurchase: 1000,   // min 1K viewers
  creditRate: 100,         // or 100 credits per 1K viewers
};

walletSchema.statics.EARNING_RATES = {
  BLOG_POST: 50,
  VLOG_POST: 30,
  POST_CREATE: 10,
  BLOG_LIKE: 2,
  BLOG_VIEW: 0.1,
  BLOG_SHARE: 5,
  COMMENT: 1,
  DAILY_LOGIN: 5,
  REFERRAL: 100,
  SIGNUP_BONUS: 200,
  STREAK_BONUS: 2 // per day in streak
};

// ─── Methods ───

// Add credits
walletSchema.methods.addCredits = function(amount, type, description, opts = {}) {
  this.credits += amount;
  this.totalCreditsEarned += amount;
  // Keep legacy balance in sync
  this.balance = this.credits;
  this.totalEarned = this.totalCreditsEarned;

  this.transactions.push({
    type,
    currency: 'CREDITS',
    amount,
    description,
    reference: opts.reference,
    relatedId: opts.relatedId,
    relatedModel: opts.relatedModel,
    status: 'completed'
  });

  // Keep last 500 transactions
  if (this.transactions.length > 500) {
    this.transactions = this.transactions.slice(-500);
  }
  return this.save();
};

// Deduct credits
walletSchema.methods.deductCredits = function(amount, type, description, opts = {}) {
  if (this.credits < amount) throw new Error(`Insufficient credits. Need ${amount}, have ${this.credits}`);
  this.credits -= amount;
  this.totalCreditsSpent += amount;
  this.balance = this.credits;

  this.transactions.push({
    type,
    currency: 'CREDITS',
    amount: -amount,
    description,
    reference: opts.reference,
    relatedId: opts.relatedId,
    status: 'completed'
  });
  return this.save();
};

// Add USD
walletSchema.methods.addUSD = function(amount, type, description, reference) {
  this.usdBalance += amount;
  this.totalFunded += amount;

  this.transactions.push({
    type,
    currency: 'USD',
    amount,
    description,
    reference,
    status: 'completed'
  });
  return this.save();
};

// Buy credits with USD
walletSchema.methods.buyCredits = function(usdAmount) {
  const rate = this.constructor.CREDIT_RATE;
  const credits = Math.floor(usdAmount * rate);
  if (this.usdBalance < usdAmount) throw new Error('Insufficient USD balance');

  this.usdBalance -= usdAmount;
  this.credits += credits;
  this.totalCreditsEarned += credits;
  this.balance = this.credits;

  this.transactions.push({
    type: 'BUY_CREDITS', currency: 'USD', amount: -usdAmount,
    description: `Bought ${credits} credits for $${usdAmount.toFixed(2)}`
  });
  this.transactions.push({
    type: 'BUY_CREDITS', currency: 'CREDITS', amount: credits,
    description: `Received ${credits} credits`
  });
  return this.save();
};

// Legacy compatibility
walletSchema.methods.addTokens = function(amount, type, description, relatedBlog = null) {
  return this.addCredits(amount, type, description, { relatedId: relatedBlog, relatedModel: 'Blog' });
};

walletSchema.methods.updateStreak = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (this.streaks.lastActivityDate) {
    const last = new Date(this.streaks.lastActivityDate);
    last.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - last) / 86400000);
    if (diff === 1) {
      this.streaks.current += 1;
      if (this.streaks.current > this.streaks.longest) this.streaks.longest = this.streaks.current;
    } else if (diff > 1) {
      this.streaks.current = 1;
    }
  } else {
    this.streaks.current = 1;
  }
  this.streaks.lastActivityDate = today;
  return this.save();
};

walletSchema.index({ user: 1 });
walletSchema.index({ 'transactions.createdAt': -1 });
walletSchema.index({ 'subscription.plan': 1, 'subscription.status': 1 });

module.exports = mongoose.model('Wallet', walletSchema);
