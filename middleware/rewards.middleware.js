// ============================================
// FILE: rewards.middleware.js
// PATH: /middleware/rewards.middleware.js
// Auto-credit user wallets on content actions
// ============================================
const mongoose = require('mongoose');

let Wallet;
try { Wallet = require('../models/wallet.model'); } catch (e) {
  try { Wallet = mongoose.model('Wallet'); } catch (e2) {}
}

const RATES = {
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
  STREAK_BONUS: 2
};

/**
 * Credit a user's wallet. Safe — never throws, never blocks.
 * Call-and-forget pattern: rewardUser(userId, 'BLOG_POST', 'Published a blog post', { relatedId: blogId })
 */
async function rewardUser(userId, type, description, opts = {}) {
  try {
    if (!Wallet || !userId) return;
    const amount = opts.amount || RATES[type] || 0;
    if (amount <= 0) return;

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        credits: RATES.SIGNUP_BONUS,
        totalCreditsEarned: RATES.SIGNUP_BONUS,
        balance: RATES.SIGNUP_BONUS,
        totalEarned: RATES.SIGNUP_BONUS,
        transactions: [{
          type: 'SIGNUP_BONUS', currency: 'CREDITS', amount: RATES.SIGNUP_BONUS,
          description: 'Welcome bonus! 200 credits', status: 'completed'
        }]
      });
    }

    wallet.credits = (wallet.credits || 0) + amount;
    wallet.totalCreditsEarned = (wallet.totalCreditsEarned || 0) + amount;
    wallet.balance = wallet.credits;
    wallet.totalEarned = wallet.totalCreditsEarned;

    wallet.transactions.push({
      type,
      currency: 'CREDITS',
      amount,
      description,
      relatedId: opts.relatedId,
      relatedModel: opts.relatedModel,
      status: 'completed',
      createdAt: new Date()
    });

    // Keep last 500 transactions
    if (wallet.transactions.length > 500) {
      wallet.transactions = wallet.transactions.slice(-500);
    }

    await wallet.save();
    console.log(`💰 +${amount} credits → ${userId} (${type})`);
  } catch (err) {
    // Never crash the parent request
    console.error('Reward error (non-blocking):', err.message);
  }
}

/**
 * Express middleware that rewards after successful response.
 * Usage: router.post('/create', auth, rewardAfter('BLOG_POST', 'Published a blog post'), handler)
 */
function rewardAfter(type, description, opts = {}) {
  return (req, res, next) => {
    // Intercept res.json to reward after success
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Only reward on success
      if (res.statusCode >= 200 && res.statusCode < 300 && body && (body.ok !== false)) {
        const userId = req.user?.id || req.user?.userId;
        if (userId) {
          const relatedId = body?._id || body?.blog?._id || body?.vlog?._id || body?.post?._id || opts.relatedId;
          // Fire-and-forget — don't await
          rewardUser(userId, type, description, { ...opts, relatedId });
        }
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { rewardUser, rewardAfter, RATES };
