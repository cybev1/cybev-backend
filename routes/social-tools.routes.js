// ============================================
// FILE: routes/social-tools.routes.js
// Social Media Automation Routes
// VERSION: 1.0.0 - NEW FEATURE
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Simple auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Encryption for credentials
const ENCRYPTION_KEY = process.env.SOCIAL_ENCRYPTION_KEY || 'cYb3v2026S3cur3K3y@Fb4ut0m4t10n!';
const ALGORITHM = 'aes-256-cbc';

const encrypt = (text) => {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

const decrypt = (text) => {
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
};

// Social Account Schema
const socialAccountSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, enum: ['facebook', 'instagram', 'twitter'], required: true },
  email: { type: String, required: true },
  passwordEncrypted: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive', 'error'], default: 'active' },
  lastUsed: Date,
  cookies: String,
}, { timestamps: true });

const SocialAccount = mongoose.models.SocialAccount || mongoose.model('SocialAccount', socialAccountSchema);

// Social Job Schema
const socialJobSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true },
  type: { type: String, required: true },
  config: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  progress: { type: Number, default: 0 },
  result: mongoose.Schema.Types.Mixed,
  error: String,
}, { timestamps: true });

const SocialJob = mongoose.models.SocialJob || mongoose.model('SocialJob', socialJobSchema);

// Audience Data Schema
const audienceDataSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: String,
  profileId: String,
  name: String,
  email: String,
  phone: String,
  location: String,
  source: String,
  tags: [String],
}, { timestamps: true });

const AudienceData = mongoose.models.AudienceData || mongoose.model('AudienceData', audienceDataSchema);

// ==========================================
// ACCOUNT ROUTES
// ==========================================

// Get all accounts
router.get('/accounts', auth, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ 
      user: req.user.userId || req.user.id 
    }).select('-passwordEncrypted -cookies');

    res.json({ accounts });
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Add account
router.post('/accounts', auth, async (req, res) => {
  try {
    const { platform, email, password } = req.body;

    if (!platform || !email || !password) {
      return res.status(400).json({ error: 'Platform, email, and password are required' });
    }

    // Check if account already exists
    const existing = await SocialAccount.findOne({
      user: req.user.userId || req.user.id,
      platform,
      email
    });

    if (existing) {
      return res.status(400).json({ error: 'Account already exists' });
    }

    const account = await SocialAccount.create({
      user: req.user.userId || req.user.id,
      platform,
      email,
      passwordEncrypted: encrypt(password),
      status: 'active'
    });

    res.json({ 
      ok: true, 
      account: {
        _id: account._id,
        platform: account.platform,
        email: account.email,
        status: account.status,
        createdAt: account.createdAt
      }
    });
  } catch (err) {
    console.error('Add account error:', err);
    res.status(500).json({ error: 'Failed to add account' });
  }
});

// Delete account
router.delete('/accounts/:id', auth, async (req, res) => {
  try {
    const account = await SocialAccount.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId || req.user.id
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ==========================================
// JOB ROUTES
// ==========================================

// Get all jobs
router.get('/jobs', auth, async (req, res) => {
  try {
    const jobs = await SocialJob.find({ 
      user: req.user.userId || req.user.id 
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('account', 'platform email');

    res.json({ jobs });
  } catch (err) {
    console.error('Get jobs error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Create job
router.post('/jobs', auth, async (req, res) => {
  try {
    const { accountId, type, config } = req.body;

    if (!accountId || !type) {
      return res.status(400).json({ error: 'Account and type are required' });
    }

    // Verify account belongs to user
    const account = await SocialAccount.findOne({
      _id: accountId,
      user: req.user.userId || req.user.id
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const job = await SocialJob.create({
      user: req.user.userId || req.user.id,
      account: accountId,
      type,
      config: config || {},
      status: 'pending'
    });

    // In production, this would trigger the automation worker
    // For now, we'll just mark it as pending

    res.json({ ok: true, job });
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// ==========================================
// STATS ROUTES
// ==========================================

router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const [completedJobs, audienceCount] = await Promise.all([
      SocialJob.find({ user: userId, status: 'completed' }),
      AudienceData.countDocuments({ user: userId })
    ]);

    // Aggregate stats from completed jobs
    let friendRequests = 0;
    let messagesSent = 0;
    let postsLiked = 0;

    completedJobs.forEach(job => {
      if (job.result) {
        friendRequests += job.result.friendRequestsSent || 0;
        messagesSent += job.result.messagesSent || 0;
        postsLiked += job.result.postsLiked || 0;
      }
    });

    res.json({
      stats: {
        friendRequests,
        messagesSent,
        postsLiked,
        audience: audienceCount
      }
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ==========================================
// AUDIENCE ROUTES
// ==========================================

router.get('/audience', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const audience = await AudienceData.find({ 
      user: req.user.userId || req.user.id 
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

    const total = await AudienceData.countDocuments({ 
      user: req.user.userId || req.user.id 
    });

    res.json({ audience, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Get audience error:', err);
    res.status(500).json({ error: 'Failed to fetch audience' });
  }
});

// Export audience as CSV
router.get('/audience/export', auth, async (req, res) => {
  try {
    const audience = await AudienceData.find({ 
      user: req.user.userId || req.user.id 
    });

    // Create CSV
    const headers = ['Name', 'Email', 'Phone', 'Platform', 'Location', 'Source', 'Created'];
    const rows = audience.map(a => [
      a.name || '',
      a.email || '',
      a.phone || '',
      a.platform || '',
      a.location || '',
      a.source || '',
      a.createdAt?.toISOString() || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audience.csv');
    res.send(csv);
  } catch (err) {
    console.error('Export audience error:', err);
    res.status(500).json({ error: 'Failed to export audience' });
  }
});

module.exports = router;
