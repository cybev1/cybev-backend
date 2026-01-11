// ============================================
// FILE: routes/prayer.routes.js
// Prayer Wall API Routes
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Prayer Model
const PrayerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  request: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['healing', 'family', 'finances', 'guidance', 'salvation', 'marriage', 'work', 'protection', 'thanksgiving', 'other'],
    default: 'other'
  },
  isAnonymous: { type: Boolean, default: false },
  isUrgent: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: true },
  isAnswered: { type: Boolean, default: false },
  testimony: { type: String },
  answeredAt: Date,
  scripture: {
    text: String,
    reference: String
  },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'ChurchOrg' },
  prayedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    prayedAt: { type: Date, default: Date.now }
  }],
  prayerCount: { type: Number, default: 0 },
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

PrayerSchema.index({ user: 1, createdAt: -1 });
PrayerSchema.index({ organization: 1, isPublic: 1 });
PrayerSchema.index({ category: 1, isAnswered: 1 });

const Prayer = mongoose.models.Prayer || mongoose.model('Prayer', PrayerSchema);

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

// Optional auth
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret');
    } catch {}
  }
  next();
};

// ==========================================
// POST /api/church/prayers - Create prayer request
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { request, category, isAnonymous, isUrgent, isPublic, scripture, organizationId } = req.body;

    if (!request || request.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Prayer request is required' });
    }

    const prayer = new Prayer({
      user: userId,
      request: request.trim(),
      category: category || 'other',
      isAnonymous: isAnonymous || false,
      isUrgent: isUrgent || false,
      isPublic: isPublic !== false,
      scripture: scripture ? { reference: scripture } : undefined,
      organization: organizationId || undefined
    });

    await prayer.save();

    // Populate user info
    await prayer.populate('user', 'name username profilePicture');

    console.log(`🙏 Prayer request created by ${userId}`);

    res.status(201).json({ ok: true, prayer });
  } catch (err) {
    console.error('Create prayer error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/prayers - List prayers
// ==========================================
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { category, urgent, answered, mine, orgId, page = 1, limit = 20 } = req.query;

    const query = { isPublic: true };
    
    if (category) query.category = category;
    if (urgent === 'true') query.isUrgent = true;
    if (answered === 'true') query.isAnswered = true;
    if (mine === 'true' && userId) {
      query.user = new ObjectId(userId);
      delete query.isPublic; // Show user's own prayers regardless of public status
    }
    if (orgId) query.organization = new ObjectId(orgId);

    const prayers = await Prayer.find(query)
      .populate('user', 'name username profilePicture')
      .populate('prayedBy.user', 'name username profilePicture')
      .populate('comments.user', 'name username profilePicture')
      .sort({ isUrgent: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Prayer.countDocuments(query);
    const totalAnswered = await Prayer.countDocuments({ ...query, isAnswered: true });
    const totalPrayers = await Prayer.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$prayerCount' } } }
    ]);

    res.json({
      ok: true,
      prayers,
      total,
      answered: totalAnswered,
      totalPrayers: totalPrayers[0]?.total || 0,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List prayers error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/prayers/:id/pray - Pray for request
// ==========================================
router.post('/:id/pray', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const prayer = await Prayer.findById(id);
    if (!prayer) {
      return res.status(404).json({ ok: false, error: 'Prayer not found' });
    }

    // Check if already prayed
    const alreadyPrayed = prayer.prayedBy.some(p => p.user.toString() === userId.toString());
    
    if (!alreadyPrayed) {
      prayer.prayedBy.push({ user: userId, prayedAt: new Date() });
      prayer.prayerCount = (prayer.prayerCount || 0) + 1;
      prayer.updatedAt = new Date();
      await prayer.save();
    }

    res.json({ ok: true, prayerCount: prayer.prayerCount });
  } catch (err) {
    console.error('Pray error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/prayers/:id/testimony - Add testimony
// ==========================================
router.post('/:id/testimony', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { testimony } = req.body;

    const prayer = await Prayer.findById(id);
    if (!prayer) {
      return res.status(404).json({ ok: false, error: 'Prayer not found' });
    }

    // Only owner can add testimony
    if (prayer.user.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Only the prayer owner can add testimony' });
    }

    prayer.testimony = testimony;
    prayer.isAnswered = true;
    prayer.answeredAt = new Date();
    prayer.updatedAt = new Date();
    await prayer.save();

    console.log(`✨ Testimony added to prayer ${id}`);

    res.json({ ok: true, prayer });
  } catch (err) {
    console.error('Add testimony error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/prayers/:id/comment - Add comment
// ==========================================
router.post('/:id/comment', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Comment text is required' });
    }

    const prayer = await Prayer.findById(id);
    if (!prayer) {
      return res.status(404).json({ ok: false, error: 'Prayer not found' });
    }

    prayer.comments.push({ user: userId, text: text.trim() });
    prayer.updatedAt = new Date();
    await prayer.save();

    await prayer.populate('comments.user', 'name username profilePicture');

    res.json({ ok: true, comments: prayer.comments });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// DELETE /api/church/prayers/:id - Delete prayer
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const prayer = await Prayer.findById(id);
    if (!prayer) {
      return res.status(404).json({ ok: false, error: 'Prayer not found' });
    }

    if (prayer.user.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    await Prayer.findByIdAndDelete(id);

    res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('Delete prayer error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('🙏 Prayer routes loaded');

module.exports = router;
