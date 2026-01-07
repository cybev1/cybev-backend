// ============================================
// FILE: routes/payments.routes.js
// Payment Routes - Tips, Donations, Subscriptions
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const paymentService = require('../services/payment.service');

// Models
const User = require('../models/user.model');

// ==========================================
// Transaction Schema (inline for simplicity)
// ==========================================

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { 
    type: String, 
    enum: ['tip', 'donation', 'subscription', 'token_purchase', 'withdrawal'],
    required: true 
  },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'NGN' },
  provider: { type: String, enum: ['flutterwave', 'paystack', 'hubtel', 'stripe', 'internal'] },
  reference: { type: String, unique: true },
  transactionId: String,
  status: { 
    type: String, 
    enum: ['pending', 'success', 'failed', 'refunded'],
    default: 'pending'
  },
  metadata: mongoose.Schema.Types.Mixed,
  paidAt: Date
}, { timestamps: true });

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

// ==========================================
// GET AVAILABLE PAYMENT PROVIDERS
// ==========================================

router.get('/providers', (req, res) => {
  const providers = paymentService.getAvailableProviders();
  const defaultProvider = paymentService.getDefaultProvider();

  res.json({
    ok: true,
    providers,
    default: defaultProvider,
    currencies: {
      flutterwave: ['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'GBP', 'EUR'],
      paystack: ['NGN', 'GHS', 'ZAR', 'USD'],
      hubtel: ['GHS'],
      stripe: ['USD', 'EUR', 'GBP', 'CAD', 'AUD']
    }
  });
});

// ==========================================
// SEND TIP TO CREATOR
// ==========================================

router.post('/tip', verifyToken, async (req, res) => {
  try {
    const { recipientId, amount, message, provider, currency = 'NGN' } = req.body;
    const userId = req.user.id;

    // Validation
    if (!recipientId || !amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid tip details' });
    }

    if (recipientId === userId) {
      return res.status(400).json({ ok: false, error: 'Cannot tip yourself' });
    }

    // Get users
    const [sender, recipient] = await Promise.all([
      User.findById(userId).select('name email'),
      User.findById(recipientId).select('name email username')
    ]);

    if (!recipient) {
      return res.status(404).json({ ok: false, error: 'Recipient not found' });
    }

    // Use default provider if none specified
    const paymentProvider = provider || paymentService.getDefaultProvider();
    
    if (!paymentProvider) {
      return res.status(503).json({ ok: false, error: 'No payment provider configured' });
    }

    // Initialize payment
    const payment = await paymentService.initializePayment(paymentProvider, {
      amount,
      currency,
      email: sender.email,
      name: sender.name,
      userId,
      type: 'tip',
      metadata: {
        recipientId,
        recipientUsername: recipient.username,
        message,
        description: `Tip to @${recipient.username}`
      }
    });

    // Create pending transaction
    await Transaction.create({
      user: userId,
      recipient: recipientId,
      type: 'tip',
      amount,
      currency,
      provider: paymentProvider,
      reference: payment.reference,
      status: 'pending',
      metadata: { message }
    });

    res.json({
      ok: true,
      payment: {
        url: payment.paymentUrl,
        reference: payment.reference,
        provider: payment.provider
      }
    });
  } catch (error) {
    console.error('Tip error:', error);
    res.status(500).json({ ok: false, error: 'Failed to process tip' });
  }
});

// ==========================================
// DONATE TO CREATOR
// ==========================================

router.post('/donate', verifyToken, async (req, res) => {
  try {
    const { recipientId, amount, message, provider, currency = 'NGN', anonymous = false } = req.body;
    const userId = req.user.id;

    if (!recipientId || !amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid donation details' });
    }

    const [sender, recipient] = await Promise.all([
      User.findById(userId).select('name email'),
      User.findById(recipientId).select('name email username')
    ]);

    if (!recipient) {
      return res.status(404).json({ ok: false, error: 'Creator not found' });
    }

    const paymentProvider = provider || paymentService.getDefaultProvider();
    
    if (!paymentProvider) {
      return res.status(503).json({ ok: false, error: 'No payment provider configured' });
    }

    const payment = await paymentService.initializePayment(paymentProvider, {
      amount,
      currency,
      email: sender.email,
      name: anonymous ? 'Anonymous' : sender.name,
      userId,
      type: 'donation',
      metadata: {
        recipientId,
        recipientUsername: recipient.username,
        message,
        anonymous,
        description: `Donation to @${recipient.username}`
      }
    });

    await Transaction.create({
      user: userId,
      recipient: recipientId,
      type: 'donation',
      amount,
      currency,
      provider: paymentProvider,
      reference: payment.reference,
      status: 'pending',
      metadata: { message, anonymous }
    });

    res.json({
      ok: true,
      payment: {
        url: payment.paymentUrl,
        reference: payment.reference,
        provider: payment.provider
      }
    });
  } catch (error) {
    console.error('Donation error:', error);
    res.status(500).json({ ok: false, error: 'Failed to process donation' });
  }
});

// ==========================================
// PURCHASE TOKENS
// ==========================================

router.post('/tokens/purchase', verifyToken, async (req, res) => {
  try {
    const { amount, tokenAmount, provider, currency = 'NGN' } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid amount' });
    }

    const user = await User.findById(userId).select('name email');

    const paymentProvider = provider || paymentService.getDefaultProvider();
    
    if (!paymentProvider) {
      return res.status(503).json({ ok: false, error: 'No payment provider configured' });
    }

    // Calculate token amount (e.g., 1 NGN = 10 tokens)
    const tokens = tokenAmount || Math.floor(amount * 10);

    const payment = await paymentService.initializePayment(paymentProvider, {
      amount,
      currency,
      email: user.email,
      name: user.name,
      userId,
      type: 'token_purchase',
      metadata: {
        tokenAmount: tokens,
        description: `Purchase ${tokens} CYBEV Tokens`
      }
    });

    await Transaction.create({
      user: userId,
      type: 'token_purchase',
      amount,
      currency,
      provider: paymentProvider,
      reference: payment.reference,
      status: 'pending',
      metadata: { tokenAmount: tokens }
    });

    res.json({
      ok: true,
      payment: {
        url: payment.paymentUrl,
        reference: payment.reference,
        provider: payment.provider
      },
      tokens
    });
  } catch (error) {
    console.error('Token purchase error:', error);
    res.status(500).json({ ok: false, error: 'Failed to process purchase' });
  }
});

// ==========================================
// VERIFY PAYMENT
// ==========================================

router.get('/verify/:provider/:reference', verifyToken, async (req, res) => {
  try {
    const { provider, reference } = req.params;
    const userId = req.user.id;

    // Find transaction
    const transaction = await Transaction.findOne({ 
      reference,
      $or: [{ user: userId }, { recipient: userId }]
    });

    if (!transaction) {
      return res.status(404).json({ ok: false, error: 'Transaction not found' });
    }

    // Already processed
    if (transaction.status === 'success') {
      return res.json({ ok: true, transaction, alreadyProcessed: true });
    }

    // Verify with provider
    const verification = await paymentService.verifyPayment(provider, reference);

    if (verification.success) {
      // Update transaction
      transaction.status = 'success';
      transaction.transactionId = verification.transactionId;
      transaction.paidAt = verification.paidAt;
      await transaction.save();

      // Process based on type
      await processSuccessfulPayment(transaction);

      res.json({
        ok: true,
        transaction,
        verification
      });
    } else {
      transaction.status = 'failed';
      await transaction.save();

      res.json({
        ok: false,
        error: 'Payment verification failed',
        transaction
      });
    }
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ ok: false, error: 'Failed to verify payment' });
  }
});

// ==========================================
// PAYMENT WEBHOOKS
// ==========================================

// Flutterwave Webhook
router.post('/webhook/flutterwave', express.json(), async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log('📩 Flutterwave webhook:', event);

    if (event === 'charge.completed' && data.status === 'successful') {
      await handleSuccessfulPayment('flutterwave', data.tx_ref, data);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Flutterwave webhook error:', error);
    res.status(500).json({ ok: false });
  }
});

// Paystack Webhook
router.post('/webhook/paystack', express.json(), async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log('📩 Paystack webhook:', event);

    if (event === 'charge.success') {
      await handleSuccessfulPayment('paystack', data.reference, data);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.status(500).json({ ok: false });
  }
});

// Hubtel Webhook
router.post('/webhook/hubtel', express.json(), async (req, res) => {
  try {
    const { Data } = req.body;
    console.log('📩 Hubtel webhook:', Data?.ClientReference);

    if (Data?.TransactionStatus === 'Success') {
      await handleSuccessfulPayment('hubtel', Data.ClientReference, Data);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Hubtel webhook error:', error);
    res.status(500).json({ ok: false });
  }
});

// ==========================================
// GET TRANSACTION HISTORY
// ==========================================

router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, status, page = 1, limit = 20 } = req.query;

    const query = {
      $or: [{ user: userId }, { recipient: userId }]
    };

    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('user', 'name username avatar')
      .populate('recipient', 'name username avatar')
      .lean();

    const total = await Transaction.countDocuments(query);

    res.json({
      ok: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Transaction history error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch transactions' });
  }
});

// ==========================================
// GET EARNINGS (For Creators)
// ==========================================

router.get('/earnings', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '30d' } = req.query;

    const periodStart = {
      '7d': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      '90d': new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      'all': new Date(0)
    }[period] || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get earnings by type
    const earnings = await Transaction.aggregate([
      {
        $match: {
          recipient: new mongoose.Types.ObjectId(userId),
          status: 'success',
          createdAt: { $gte: periodStart }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get total all-time earnings
    const allTimeEarnings = await Transaction.aggregate([
      {
        $match: {
          recipient: new mongoose.Types.ObjectId(userId),
          status: 'success'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Get recent transactions
    const recentTransactions = await Transaction.find({
      recipient: userId,
      status: 'success'
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name username avatar')
      .lean();

    res.json({
      ok: true,
      earnings: {
        period: {
          tips: earnings.find(e => e._id === 'tip')?.total || 0,
          donations: earnings.find(e => e._id === 'donation')?.total || 0,
          subscriptions: earnings.find(e => e._id === 'subscription')?.total || 0,
          total: earnings.reduce((sum, e) => sum + e.total, 0)
        },
        allTime: allTimeEarnings[0]?.total || 0,
        transactionCount: earnings.reduce((sum, e) => sum + e.count, 0)
      },
      recentTransactions,
      period
    });
  } catch (error) {
    console.error('Earnings error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch earnings' });
  }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function handleSuccessfulPayment(provider, reference, data) {
  const transaction = await Transaction.findOne({ reference });
  
  if (!transaction || transaction.status === 'success') {
    return;
  }

  transaction.status = 'success';
  transaction.transactionId = data.id || data.transactionId;
  transaction.paidAt = new Date();
  await transaction.save();

  await processSuccessfulPayment(transaction);
}

async function processSuccessfulPayment(transaction) {
  const { type, user, recipient, amount, metadata } = transaction;

  switch (type) {
    case 'tip':
    case 'donation':
      // Credit recipient's balance (platform takes 10% fee)
      const platformFee = amount * 0.10;
      const creatorAmount = amount - platformFee;

      await User.findByIdAndUpdate(recipient, {
        $inc: { 
          walletBalance: creatorAmount,
          totalEarnings: creatorAmount
        }
      });

      // Create notification
      try {
        const Notification = require('../models/notification.model');
        const sender = await User.findById(user).select('name username avatar');
        
        await Notification.create({
          recipient: recipient,
          type: type === 'tip' ? 'tip' : 'donation',
          sender: user,
          message: metadata?.anonymous 
            ? `Anonymous sent you a ${type} of ${amount}`
            : `${sender.name} sent you a ${type} of ${amount}`,
          data: { amount, message: metadata?.message }
        });
      } catch (e) {
        console.log('Notification not created:', e.message);
      }
      break;

    case 'token_purchase':
      // Credit user's token balance
      const tokens = metadata?.tokenAmount || Math.floor(amount * 10);
      await User.findByIdAndUpdate(user, {
        $inc: { tokenBalance: tokens }
      });
      break;

    case 'subscription':
      // Handle subscription activation
      // TODO: Implement subscription logic
      break;
  }

  console.log(`✅ Processed ${type} payment: ${transaction.reference}`);
}

module.exports = router;
