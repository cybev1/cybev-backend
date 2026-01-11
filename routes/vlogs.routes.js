// ============================================
// FILE: routes/vlogs.routes.js
// Vlog Routes - FIXED VERSION
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// Optional auth - doesn't fail if no token
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    } catch (err) {
      // Token invalid, but continue without user
    }
  }
  next();
};

// Get or create Vlog model
const getVlogModel = () => {
  if (mongoose.models.Vlog) {
    return mongoose.models.Vlog;
  }
  
  // Define Vlog schema if not exists
  const vlogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    videoUrl: { type: String },
    thumbnail: { type: String },
    duration: { type: String },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
    tags: [String],
    status: { type: String, enum: ['draft', 'published', 'unlisted'], default: 'published' },
    muxAssetId: { type: String },
    muxPlaybackId: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });
  
  return mongoose.model('Vlog', vlogSchema);
};

// ==========================================
// GET /api/vlogs/my - Get current user's vlogs
// ==========================================
router.get('/my', verifyToken, async (req, res) => {
  try {
    const Vlog = getVlogModel();
    
    const vlogs = await Vlog.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .populate('author', 'name username avatar')
      .lean();

    res.json({ 
      ok: true, 
      vlogs: vlogs || [],
      count: vlogs.length
    });
  } catch (error) {
    console.error('Get my vlogs error:', error);
    res.status(500).json({ ok: false, error: error.message, vlogs: [] });
  }
});

// ==========================================
// GET /api/vlogs/feed - Get vlog feed
// ==========================================
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const Vlog = getVlogModel();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const vlogs = await Vlog.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name username avatar')
      .lean();

    const total = await Vlog.countDocuments({ status: 'published' });

    res.json({ 
      ok: true, 
      vlogs: vlogs || [],
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get vlog feed error:', error);
    res.status(500).json({ ok: false, error: error.message, vlogs: [] });
  }
});

// ==========================================
// GET /api/vlogs/:id - Get single vlog
// ==========================================
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const Vlog = getVlogModel();
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, error: 'Invalid vlog ID' });
    }

    const vlog = await Vlog.findById(req.params.id)
      .populate('author', 'name username avatar')
      .lean();

    if (!vlog) {
      return res.status(404).json({ ok: false, error: 'Vlog not found' });
    }

    // Increment views
    await Vlog.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    res.json({ ok: true, vlog });
  } catch (error) {
    console.error('Get vlog error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// POST /api/vlogs - Create vlog
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const Vlog = getVlogModel();
    const { title, description, videoUrl, thumbnail, duration, tags, status } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Title is required' });
    }

    const vlog = new Vlog({
      title,
      description,
      videoUrl,
      thumbnail,
      duration,
      tags: tags || [],
      status: status || 'published',
      author: req.user.id
    });

    await vlog.save();
    await vlog.populate('author', 'name username avatar');

    res.status(201).json({ ok: true, vlog });
  } catch (error) {
    console.error('Create vlog error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// PUT /api/vlogs/:id - Update vlog
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const Vlog = getVlogModel();
    
    const vlog = await Vlog.findOne({ _id: req.params.id, author: req.user.id });
    
    if (!vlog) {
      return res.status(404).json({ ok: false, error: 'Vlog not found' });
    }

    const { title, description, videoUrl, thumbnail, duration, tags, status } = req.body;

    if (title) vlog.title = title;
    if (description !== undefined) vlog.description = description;
    if (videoUrl) vlog.videoUrl = videoUrl;
    if (thumbnail) vlog.thumbnail = thumbnail;
    if (duration) vlog.duration = duration;
    if (tags) vlog.tags = tags;
    if (status) vlog.status = status;
    vlog.updatedAt = new Date();

    await vlog.save();
    await vlog.populate('author', 'name username avatar');

    res.json({ ok: true, vlog });
  } catch (error) {
    console.error('Update vlog error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// DELETE /api/vlogs/:id - Delete vlog
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const Vlog = getVlogModel();
    
    const vlog = await Vlog.findOneAndDelete({ _id: req.params.id, author: req.user.id });
    
    if (!vlog) {
      return res.status(404).json({ ok: false, error: 'Vlog not found' });
    }

    res.json({ ok: true, message: 'Vlog deleted' });
  } catch (error) {
    console.error('Delete vlog error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// POST /api/vlogs/:id/like - Like/unlike vlog
// ==========================================
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const Vlog = getVlogModel();
    const vlog = await Vlog.findById(req.params.id);
    
    if (!vlog) {
      return res.status(404).json({ ok: false, error: 'Vlog not found' });
    }

    const userId = req.user.id;
    const isLiked = vlog.likes.includes(userId);

    if (isLiked) {
      vlog.likes = vlog.likes.filter(id => id.toString() !== userId);
    } else {
      vlog.likes.push(userId);
    }

    await vlog.save();

    res.json({ 
      ok: true, 
      liked: !isLiked,
      likesCount: vlog.likes.length
    });
  } catch (error) {
    console.error('Like vlog error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
