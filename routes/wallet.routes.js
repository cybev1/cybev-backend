// ============================================
// FILE: wallet.routes.js
// PATH: /routes/wallet.routes.js
// CYBEV Wallet v2.0 — USD + Credits + Subscriptions
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
let verifyToken;
try { verifyToken = require('../middleware/verifyToken'); } catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try {
      const m = require('../middleware/auth');
      verifyToken = m.authenticateToken || m;
    } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          req.user.id = req.user.userId || req.user.id;
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

let Wallet, User;
try { Wallet = require('../models/wallet.model'); } catch (e) { Wallet = mongoose.model('Wallet'); }
try { User = require('../models/user.model'); } catch (e) { User = mongoose.model('User'); }

// Payment service (has Flutterwave already)
let paymentService;
try { paymentService = require('../services/payment.service'); } catch (e) {
  console.log('⚠️ Wallet: payment.service not found, funding disabled');
}

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://cybev.io';
console.log('✅ Wallet routes v2.0 loaded — USD + Credits + Subscriptions');


// ═══════════════════════════════════════════
//  GET WALLET
// ═══════════════════════════════════════════

router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        credits: 200, // signup bonus
        totalCreditsEarned: 200,
        balance: 200,
        totalEarned: 200,
        transactions: [{
          type: 'SIGNUP_BONUS', currency: 'CREDITS', amount: 200,
          description: 'Welcome bonus! 200 credits', status: 'completed'
        }]
      });
    }

    const plans = Wallet.PLANS || {};
    const currentPlan = plans[wallet.subscription?.plan || 'free'] || plans.free;

    res.json({
      ok: true,
      wallet: {
        usdBalance: wallet.usdBalance || 0,
        credits: wallet.credits || wallet.balance || 0,
        totalCreditsEarned: wallet.totalCreditsEarned || wallet.totalEarned || 0,
        totalCreditsSpent: wallet.totalCreditsSpent || 0,
        totalFunded: wallet.totalFunded || 0,
        totalWithdrawn: wallet.totalWithdrawn || 0,
        streaks: wallet.streaks || { current: 0, longest: 0 },
        achievements: wallet.achievements || [],
        lastDailyClaim: wallet.lastDailyClaim
      },
      subscription: {
        plan: wallet.subscription?.plan || 'free',
        status: wallet.subscription?.status || 'active',
        expiresAt: wallet.subscription?.expiresAt,
        ...currentPlan
      },
      plans,
      rates: {
        creditRate: Wallet.CREDIT_RATE || 100,
        cashoutRate: Wallet.CASHOUT_RATE || 80,
        minWithdraw: Wallet.MIN_WITHDRAW || 5
      },
      earningRates: Wallet.EARNING_RATES || {},
      transactions: (wallet.transactions || []).slice(-50).reverse(),
      // Legacy compat
      balance: wallet.credits || wallet.balance || 0,
      pending: 0
    });
  } catch (err) {
    console.error('Wallet get error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch wallet' });
  }
});


// ═══════════════════════════════════════════
//  FUND WALLET (Flutterwave / Card / Mobile Money)
// ═══════════════════════════════════════════

router.post('/fund', verifyToken, async (req, res) => {
  try {
    const { amount, currency = 'USD', paymentMethod = 'card' } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Minimum funding is $1' });
    if (amount > 10000) return res.status(400).json({ error: 'Maximum single funding is $10,000' });

    if (!paymentService) return res.status(503).json({ error: 'Payment service unavailable' });

    const userId = req.user.id || req.user.userId;
    const user = await User.findById(userId).select('email name username');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Convert to local currency if needed
    let payAmount = amount;
    let payCurrency = currency;
    // If user pays in NGN/GHS, Flutterwave handles conversion

    const payment = await paymentService.initializePayment({
      amount: payAmount,
      currency: payCurrency,
      email: user.email,
      name: user.name || user.username,
      userId,
      type: 'wallet_fund',
      metadata: { userId, fundAmount: amount, walletCurrency: 'USD' },
      redirectUrl: `${FRONTEND_URL}/wallet?funded=true`
    });

    if (!payment || !payment.link) {
      return res.status(500).json({ error: 'Failed to initialize payment' });
    }

    // Create pending transaction
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = await Wallet.create({ user: userId });
    wallet.transactions.push({
      type: 'FUND_FLUTTERWAVE', currency: 'USD', amount,
      description: `Funding $${amount} via ${paymentMethod}`,
      reference: payment.reference || payment.tx_ref,
      status: 'pending'
    });
    await wallet.save();

    res.json({
      ok: true,
      paymentLink: payment.link,
      reference: payment.reference || payment.tx_ref,
      provider: payment.provider || 'flutterwave'
    });
  } catch (err) {
    console.error('Fund wallet error:', err);
    res.status(500).json({ error: 'Failed to initialize funding', details: err.message });
  }
});


// ═══════════════════════════════════════════
//  VERIFY FUNDING (callback after payment)
// ═══════════════════════════════════════════

router.post('/fund/verify', verifyToken, async (req, res) => {
  try {
    const { reference, transactionId } = req.body;
    if (!reference && !transactionId) return res.status(400).json({ error: 'Reference or transaction ID required' });

    if (!paymentService) return res.status(503).json({ error: 'Payment service unavailable' });

    const verification = await paymentService.verifyPayment(transactionId || reference);
    if (!verification || !verification.success) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const userId = req.user.id || req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = await Wallet.create({ user: userId });

    // Check if already processed
    const existing = wallet.transactions.find(t => t.reference === reference && t.status === 'completed');
    if (existing) return res.json({ ok: true, message: 'Already credited', wallet: { usdBalance: wallet.usdBalance, credits: wallet.credits } });

    // Credit USD to wallet
    const amount = verification.amount || verification.data?.amount;
    const currency = verification.currency || verification.data?.currency || 'USD';

    // Convert to USD if paid in local currency
    let usdAmount = amount;
    if (currency === 'NGN') usdAmount = amount / 1600; // approximate
    else if (currency === 'GHS') usdAmount = amount / 16;
    else if (currency === 'KES') usdAmount = amount / 130;

    usdAmount = Math.round(usdAmount * 100) / 100; // round to cents

    await wallet.addUSD(usdAmount, 'FUND_FLUTTERWAVE', `Funded $${usdAmount.toFixed(2)} via ${currency}`, reference);

    // Update pending tx
    const pendingTx = wallet.transactions.find(t => t.reference === reference && t.status === 'pending');
    if (pendingTx) pendingTx.status = 'completed';
    await wallet.save();

    res.json({
      ok: true,
      message: `$${usdAmount.toFixed(2)} added to your wallet`,
      wallet: { usdBalance: wallet.usdBalance, credits: wallet.credits }
    });
  } catch (err) {
    console.error('Verify fund error:', err);
    res.status(500).json({ error: 'Verification failed', details: err.message });
  }
});


// ═══════════════════════════════════════════
//  BUY CREDITS WITH USD
// ═══════════════════════════════════════════

router.post('/buy-credits', verifyToken, async (req, res) => {
  try {
    const { usdAmount } = req.body;
    if (!usdAmount || usdAmount < 0.5) return res.status(400).json({ error: 'Minimum $0.50' });

    const userId = req.user.id || req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const rate = Wallet.CREDIT_RATE || 100;
    const credits = Math.floor(usdAmount * rate);

    if (wallet.usdBalance < usdAmount) {
      return res.status(400).json({ error: `Insufficient balance. Have $${wallet.usdBalance.toFixed(2)}, need $${usdAmount.toFixed(2)}` });
    }

    await wallet.buyCredits(usdAmount);

    res.json({
      ok: true,
      message: `Bought ${credits} credits for $${usdAmount.toFixed(2)}`,
      wallet: { usdBalance: wallet.usdBalance, credits: wallet.credits }
    });
  } catch (err) {
    console.error('Buy credits error:', err);
    res.status(500).json({ error: err.message || 'Failed to buy credits' });
  }
});


// ═══════════════════════════════════════════
//  CASH OUT CREDITS → USD
// ═══════════════════════════════════════════

router.post('/cashout', verifyToken, async (req, res) => {
  try {
    const { creditsAmount } = req.body;
    if (!creditsAmount || creditsAmount < 500) return res.status(400).json({ error: 'Minimum cashout is 500 credits ($4.00)' });

    const userId = req.user.id || req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (wallet.credits < creditsAmount) return res.status(400).json({ error: 'Insufficient credits' });

    const cashoutRate = Wallet.CASHOUT_RATE || 80;
    const usdAmount = Math.round((creditsAmount / 100) * (cashoutRate / 100) * 100) / 100;

    wallet.credits -= creditsAmount;
    wallet.totalCreditsSpent += creditsAmount;
    wallet.usdBalance += usdAmount;
    wallet.balance = wallet.credits;

    wallet.transactions.push({
      type: 'SELL_CREDITS', currency: 'CREDITS', amount: -creditsAmount,
      description: `Cashed out ${creditsAmount} credits → $${usdAmount.toFixed(2)}`, status: 'completed'
    });
    wallet.transactions.push({
      type: 'SELL_CREDITS', currency: 'USD', amount: usdAmount,
      description: `Received $${usdAmount.toFixed(2)} from credit cashout`, status: 'completed'
    });
    await wallet.save();

    res.json({
      ok: true,
      message: `Converted ${creditsAmount} credits to $${usdAmount.toFixed(2)}`,
      wallet: { usdBalance: wallet.usdBalance, credits: wallet.credits }
    });
  } catch (err) {
    console.error('Cashout error:', err);
    res.status(500).json({ error: 'Cashout failed' });
  }
});


// ═══════════════════════════════════════════
//  WITHDRAW USD (to bank / mobile money)
// ═══════════════════════════════════════════

router.post('/withdraw', verifyToken, async (req, res) => {
  try {
    const { amount, bankDetails } = req.body;
    const minWithdraw = Wallet.MIN_WITHDRAW || 5;
    if (!amount || amount < minWithdraw) return res.status(400).json({ error: `Minimum withdrawal is $${minWithdraw}` });

    const userId = req.user.id || req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (wallet.usdBalance < amount) return res.status(400).json({ error: 'Insufficient USD balance' });

    // Create pending withdrawal
    wallet.usdBalance -= amount;
    wallet.totalWithdrawn += amount;
    wallet.transactions.push({
      type: 'WITHDRAW', currency: 'USD', amount: -amount,
      description: `Withdrawal of $${amount.toFixed(2)} — processing`,
      status: 'pending',
      metadata: { bankDetails }
    });
    await wallet.save();

    // TODO: Process via Flutterwave transfers API
    // For now, admin manually processes withdrawals

    res.json({
      ok: true,
      message: `Withdrawal of $${amount.toFixed(2)} is being processed. Allow 1-3 business days.`,
      wallet: { usdBalance: wallet.usdBalance, credits: wallet.credits }
    });
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Withdrawal failed' });
  }
});


// ═══════════════════════════════════════════
//  SUBSCRIBE TO PLAN
// ═══════════════════════════════════════════

router.post('/subscribe', verifyToken, async (req, res) => {
  try {
    const { plan } = req.body;
    const plans = Wallet.PLANS || {};
    if (!plans[plan]) return res.status(400).json({ error: 'Invalid plan', available: Object.keys(plans) });
    if (plan === 'free') return res.status(400).json({ error: 'Use /cancel to downgrade to free' });

    const userId = req.user.id || req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = await Wallet.create({ user: userId });

    const planData = plans[plan];
    const price = planData.price;

    // Check USD balance
    if (wallet.usdBalance < price) {
      // Not enough USD — try to initiate payment
      if (paymentService) {
        const user = await User.findById(userId).select('email name username');
        const payment = await paymentService.initializePayment({
          amount: price,
          currency: 'USD',
          email: user.email,
          name: user.name || user.username,
          userId,
          type: 'subscription',
          metadata: { plan, userId },
          redirectUrl: `${FRONTEND_URL}/wallet?subscribed=${plan}`
        });
        return res.json({
          ok: false,
          needsPayment: true,
          paymentLink: payment.link,
          reference: payment.reference,
          message: `Insufficient balance. Pay $${price} to subscribe to ${planData.name}.`
        });
      }
      return res.status(400).json({ error: `Insufficient balance. Need $${price}, have $${wallet.usdBalance.toFixed(2)}. Fund your wallet first.` });
    }

    // Deduct and activate
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    wallet.usdBalance -= price;
    wallet.subscription = {
      plan,
      status: 'active',
      startedAt: now,
      expiresAt,
      autoRenew: true
    };

    // Grant monthly credits
    wallet.credits += planData.monthlyCredits;
    wallet.totalCreditsEarned += planData.monthlyCredits;
    wallet.balance = wallet.credits;

    wallet.transactions.push({
      type: 'SUBSCRIPTION', currency: 'USD', amount: -price,
      description: `${planData.name} plan — $${price}/month`, status: 'completed'
    });
    wallet.transactions.push({
      type: 'BONUS', currency: 'CREDITS', amount: planData.monthlyCredits,
      description: `${planData.name} monthly credits: ${planData.monthlyCredits}`, status: 'completed'
    });
    await wallet.save();

    res.json({
      ok: true,
      message: `Subscribed to ${planData.name}! ${planData.monthlyCredits} credits added.`,
      subscription: wallet.subscription,
      wallet: { usdBalance: wallet.usdBalance, credits: wallet.credits }
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Subscription failed' });
  }
});

// Cancel subscription
router.post('/subscribe/cancel', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    wallet.subscription.autoRenew = false;
    wallet.subscription.status = 'canceled';
    await wallet.save();

    res.json({ ok: true, message: 'Subscription canceled. You keep access until the end of your billing period.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// GET plans
router.get('/plans', async (req, res) => {
  res.json({ ok: true, plans: Wallet.PLANS || {} });
});


// ═══════════════════════════════════════════
//  TRANSACTIONS
// ═══════════════════════════════════════════

router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 30, currency, type } = req.query;
    const userId = req.user.id || req.user.userId;
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.json({ ok: true, transactions: [], total: 0 });

    let txs = wallet.transactions || [];
    if (currency) txs = txs.filter(t => t.currency === currency);
    if (type) txs = txs.filter(t => t.type === type);

    txs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = txs.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    txs = txs.slice(skip, skip + parseInt(limit));

    res.json({ ok: true, transactions: txs, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});


// ═══════════════════════════════════════════
//  CREDIT / TIP / TRANSFER / DAILY
// ═══════════════════════════════════════════

// Credit rewards (called internally by other routes)
router.post('/credit', verifyToken, async (req, res) => {
  try {
    const { amount, type = 'CONTENT_REWARD', description = 'Content reward' } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const userId = req.user.id || req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = await Wallet.create({ user: userId });

    await wallet.addCredits(amount, type, description);
    res.json({ ok: true, balance: wallet.credits, message: `+${amount} credits` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to credit' });
  }
});

// Tip creator
router.post('/tip', verifyToken, async (req, res) => {
  try {
    const { recipientId, amount } = req.body;
    if (!recipientId || !amount || amount < 1) return res.status(400).json({ error: 'Invalid tip' });

    const senderId = req.user.id || req.user.userId;
    if (senderId === recipientId) return res.status(400).json({ error: 'Cannot tip yourself' });

    const senderWallet = await Wallet.findOne({ user: senderId });
    if (!senderWallet || senderWallet.credits < amount) return res.status(400).json({ error: 'Insufficient credits' });

    let recipientWallet = await Wallet.findOne({ user: recipientId });
    if (!recipientWallet) recipientWallet = await Wallet.create({ user: recipientId });

    await senderWallet.deductCredits(amount, 'TIP_CREATOR', `Tipped ${amount} credits`);
    await recipientWallet.addCredits(amount, 'TIP_CREATOR', `Received ${amount} credits tip`);

    res.json({ ok: true, message: `Tipped ${amount} credits!`, balance: senderWallet.credits });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Tip failed' });
  }
});

// Transfer credits
router.post('/transfer', verifyToken, async (req, res) => {
  try {
    const { recipientId, amount } = req.body;
    if (!recipientId || !amount || amount < 1) return res.status(400).json({ error: 'Invalid transfer' });

    const senderId = req.user.id || req.user.userId;
    if (senderId === recipientId) return res.status(400).json({ error: 'Cannot transfer to yourself' });

    const senderWallet = await Wallet.findOne({ user: senderId });
    if (!senderWallet || senderWallet.credits < amount) return res.status(400).json({ error: 'Insufficient credits' });

    let recipientWallet = await Wallet.findOne({ user: recipientId });
    if (!recipientWallet) recipientWallet = await Wallet.create({ user: recipientId });

    await senderWallet.deductCredits(amount, 'TRANSFER_OUT', `Sent ${amount} credits`);
    await recipientWallet.addCredits(amount, 'TRANSFER_IN', `Received ${amount} credits`);

    res.json({ ok: true, message: `Transferred ${amount} credits`, balance: senderWallet.credits });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Transfer failed' });
  }
});

// Claim daily login bonus
router.post('/claim-daily', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = await Wallet.create({ user: userId });

    const now = new Date();
    if (wallet.lastDailyClaim) {
      const last = new Date(wallet.lastDailyClaim);
      const hoursDiff = (now - last) / (1000 * 60 * 60);
      if (hoursDiff < 20) {
        return res.status(400).json({ error: 'Already claimed today. Come back tomorrow!' });
      }
    }

    const rates = Wallet.EARNING_RATES || {};
    let bonus = rates.DAILY_LOGIN || 5;
    const streakBonus = (rates.STREAK_BONUS || 2) * (wallet.streaks?.current || 0);
    bonus += Math.min(streakBonus, 20); // cap streak bonus at +20

    wallet.lastDailyClaim = now;
    await wallet.addCredits(bonus, 'DAILY_LOGIN', `Daily login +${bonus} credits (${wallet.streaks?.current || 0} day streak)`);
    await wallet.updateStreak();

    res.json({
      ok: true,
      message: `+${bonus} credits! ${wallet.streaks.current} day streak`,
      credits: bonus,
      streak: wallet.streaks.current,
      balance: wallet.credits
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim daily bonus' });
  }
});

// Leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const top = await Wallet.find({})
      .sort({ totalCreditsEarned: -1 })
      .limit(20)
      .populate('user', 'username displayName avatar isVerified')
      .select('user totalCreditsEarned credits streaks subscription')
      .lean();

    res.json({ ok: true, leaderboard: top.filter(w => w.user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});


// ═══════════════════════════════════════════
//  WEBHOOK (Flutterwave payment callback)
// ═══════════════════════════════════════════

router.post('/webhook/flutterwave', async (req, res) => {
  try {
    // Verify webhook signature
    const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
    if (secretHash && req.headers['verif-hash'] !== secretHash) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { data, event } = req.body;
    if (event !== 'charge.completed' || data?.status !== 'successful') {
      return res.status(200).json({ message: 'Ignored' });
    }

    const meta = data.meta || {};
    const userId = meta.userId;
    if (!userId) return res.status(200).json({ message: 'No user ID' });

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = await Wallet.create({ user: userId });

    // Check duplicate
    const ref = String(data.tx_ref || data.flw_ref);
    const exists = wallet.transactions.find(t => t.reference === ref && t.status === 'completed');
    if (exists) return res.status(200).json({ message: 'Already processed' });

    let usdAmount = data.amount;
    if (data.currency === 'NGN') usdAmount = data.amount / 1600;
    else if (data.currency === 'GHS') usdAmount = data.amount / 16;
    else if (data.currency === 'KES') usdAmount = data.amount / 130;
    usdAmount = Math.round(usdAmount * 100) / 100;

    // Check if this is a subscription payment
    if (meta.plan) {
      const plans = Wallet.PLANS || {};
      const planData = plans[meta.plan];
      if (planData) {
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        wallet.subscription = { plan: meta.plan, status: 'active', startedAt: now, expiresAt, autoRenew: true };
        wallet.credits += planData.monthlyCredits;
        wallet.totalCreditsEarned += planData.monthlyCredits;
        wallet.balance = wallet.credits;
        wallet.transactions.push({
          type: 'SUBSCRIPTION', currency: 'USD', amount: -planData.price,
          description: `${planData.name} plan activated`, reference: ref, status: 'completed'
        });
      }
    } else {
      // Regular funding
      await wallet.addUSD(usdAmount, 'FUND_FLUTTERWAVE', `Funded $${usdAmount.toFixed(2)}`, ref);
    }

    // Update pending tx
    const pendingTx = wallet.transactions.find(t => t.reference === ref && t.status === 'pending');
    if (pendingTx) pendingTx.status = 'completed';
    await wallet.save();

    res.status(200).json({ message: 'Processed' });
  } catch (err) {
    console.error('Flutterwave webhook error:', err);
    res.status(200).json({ message: 'Error but acknowledged' });
  }
});

module.exports = router;
