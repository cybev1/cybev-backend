// ============================================
// FILE: routes/giving.routes.js
// Online Giving & Donations API Routes
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Giving Model
const GivingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'ChurchOrg', required: true },
  type: { 
    type: String, 
    enum: ['tithe', 'offering', 'thanksgiving', 'missions', 'building', 'special'],
    default: 'offering'
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'GHS' },
  paymentMethod: { 
    type: String, 
    enum: ['card', 'mobile', 'bank', 'ussd', 'crypto'],
    default: 'mobile'
  },
  isRecurring: { type: Boolean, default: false },
  frequency: { type: String, enum: ['weekly', 'monthly', 'quarterly'], default: 'monthly' },
  nextPaymentDate: Date,
  isAnonymous: { type: Boolean, default: false },
  note: String,
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentReference: String,
  paymentProvider: String,
  paymentMetadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  completedAt: Date
});

GivingSchema.index({ user: 1, createdAt: -1 });
GivingSchema.index({ organization: 1, status: 1 });
GivingSchema.index({ type: 1, createdAt: -1 });

const Giving = mongoose.models.Giving || mongoose.model('Giving', GivingSchema);

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/auth.middleware');
  if (verifyToken.verifyToken) verifyToken = verifyToken.verifyToken;
} catch (e) {
  verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: 'No token' });
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret');
      next();
    } catch (err) {
      res.status(401).json({ ok: false, error: 'Invalid token' });
    }
  };
}

// ==========================================
// POST /api/church/giving - Create donation
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { 
      type, amount, currency, organization, paymentMethod, 
      isRecurring, frequency, isAnonymous, note 
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid amount is required' });
    }

    if (!organization) {
      return res.status(400).json({ ok: false, error: 'Organization is required' });
    }

    // Generate payment reference
    const paymentReference = `CYBEV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const giving = new Giving({
      user: userId,
      organization,
      type: type || 'offering',
      amount,
      currency: currency || 'GHS',
      paymentMethod: paymentMethod || 'mobile',
      isRecurring: isRecurring || false,
      frequency: frequency || 'monthly',
      isAnonymous: isAnonymous || false,
      note,
      paymentReference,
      status: 'pending'
    });

    // Calculate next payment date for recurring
    if (isRecurring) {
      const now = new Date();
      switch (frequency) {
        case 'weekly':
          giving.nextPaymentDate = new Date(now.setDate(now.getDate() + 7));
          break;
        case 'monthly':
          giving.nextPaymentDate = new Date(now.setMonth(now.getMonth() + 1));
          break;
        case 'quarterly':
          giving.nextPaymentDate = new Date(now.setMonth(now.getMonth() + 3));
          break;
      }
    }

    await giving.save();

    console.log(`💰 Giving created: ${type} - ${currency} ${amount} by ${userId}`);

    // TODO: Integrate with payment provider (Paystack, Flutterwave, etc.)
    // For now, auto-complete for demo
    giving.status = 'completed';
    giving.completedAt = new Date();
    await giving.save();

    res.status(201).json({ 
      ok: true, 
      giving,
      paymentReference
      // paymentUrl: 'https://payment.provider.com/...' // For redirect
    });
  } catch (err) {
    console.error('Create giving error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/giving/history - User's giving history
// ==========================================
router.get('/history', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { orgId, type, page = 1, limit = 20 } = req.query;

    const query = { user: new ObjectId(userId), status: 'completed' };
    if (orgId) query.organization = new ObjectId(orgId);
    if (type) query.type = type;

    const transactions = await Giving.find(query)
      .populate('organization', 'name slug type')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Giving.countDocuments(query);

    // Calculate stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const stats = await Giving.aggregate([
      { $match: { user: new ObjectId(userId), status: 'completed' } },
      {
        $group: {
          _id: null,
          totalGiven: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const thisMonthStats = await Giving.aggregate([
      { 
        $match: { 
          user: new ObjectId(userId), 
          status: 'completed',
          createdAt: { $gte: startOfMonth }
        } 
      },
      {
        $group: {
          _id: null,
          thisMonth: { $sum: '$amount' }
        }
      }
    ]);

    // Calculate giving streak (consecutive months)
    const monthlyGiving = await Giving.aggregate([
      { $match: { user: new ObjectId(userId), status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    let streak = 0;
    const currentMonth = new Date().toISOString().slice(0, 7);
    for (let i = 0; i < monthlyGiving.length; i++) {
      const expectedMonth = new Date();
      expectedMonth.setMonth(expectedMonth.getMonth() - i);
      const expected = expectedMonth.toISOString().slice(0, 7);
      if (monthlyGiving.find(m => m._id === expected)) {
        streak++;
      } else {
        break;
      }
    }

    res.json({
      ok: true,
      transactions,
      totalGiven: stats[0]?.totalGiven || 0,
      thisMonth: thisMonthStats[0]?.thisMonth || 0,
      streak,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Giving history error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/giving/org/:orgId - Organization giving summary
// ==========================================
router.get('/org/:orgId', verifyToken, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;

    const matchQuery = { organization: new ObjectId(orgId), status: 'completed' };
    
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    // Summary by type
    const byType = await Giving.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Monthly trend
    const monthlyTrend = await Giving.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 12 }
    ]);

    // Total stats
    const totalStats = await Giving.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalTransactions: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);

    res.json({
      ok: true,
      byType,
      monthlyTrend: monthlyTrend.reverse(),
      stats: totalStats[0] || { totalAmount: 0, totalTransactions: 0, avgAmount: 0 }
    });
  } catch (err) {
    console.error('Org giving stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/giving/:id - Get single transaction
// ==========================================
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const giving = await Giving.findById(id)
      .populate('organization', 'name slug type logo')
      .populate('user', 'name username');

    if (!giving) {
      return res.status(404).json({ ok: false, error: 'Transaction not found' });
    }

    // Only owner can view their transaction
    if (giving.user._id.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    res.json({ ok: true, giving });
  } catch (err) {
    console.error('Get giving error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// DELETE /api/church/giving/recurring/:id - Cancel recurring
// ==========================================
router.delete('/recurring/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const giving = await Giving.findById(id);
    
    if (!giving) {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }

    if (giving.user.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    giving.isRecurring = false;
    giving.nextPaymentDate = null;
    await giving.save();

    res.json({ ok: true, cancelled: true });
  } catch (err) {
    console.error('Cancel recurring error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('💰 Giving routes loaded');

module.exports = router;
