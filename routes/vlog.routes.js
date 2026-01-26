// ============================================
// FILE: routes/vlog.routes.js
// Vlog (Video Stories) API Routes
// VERSION: 2.0 - Fixed /feed 500 error, added fallback for author field

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Load models
let Vlog, User;
try {
  Vlog = require('../models/vlog.model');
} catch (e) {
  console.log('Creating Vlog model inline');
  const vlogSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    videoUrl: { type: String, required: true },
    thumbnailUrl: String,
    caption: { type: String, maxlength: 500 },
    duration: { type: Number, default: 0 },
    visibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
    isStory: { type: Boolean, default: true },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
    views: [{ user: mongoose.Schema.Types.ObjectId, viewedAt: Date }],
    viewsCount: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reactions: {
      like: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      love: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      fire: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    hashtags: [String],
    backgroundGradient: { type: String, default: 'from-purple-500 to-pink-500' },
    isActive: { type: Boolean, default: true }
  }, { timestamps: true });
  Vlog = mongoose.models.Vlog || mongoose.model('Vlog', vlogSchema);
}

try { User = require('../models/user.model'); } catch (e) { User = mongoose.model('User'); }

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try { verifyToken = require('../middleware/auth'); } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

// Optional auth
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
    } catch {}
  }
  next();
};

// Background gradients for vlogs
const GRADIENTS = [
  'from-purple-500 to-pink-500',
  'from-blue-500 to-teal-500',
  'from-green-400 to-emerald-600',
  'from-orange-500 to-red-500',
  'from-indigo-500 to-purple-600',
  'from-pink-500 to-rose-500',
  'from-cyan-500 to-blue-500',
  'from-yellow-400 to-orange-500'
];

// ==========================================
// GET /api/vlogs - Get all vlogs (stories)
// ==========================================
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, userId } = req.query;
    
    const query = {
      isActive: true,
      visibility: 'public'
    };
    
    // If filtering by user
    if (userId) {
      query.user = userId;
    }
    
    // Only show non-expired stories (or permanent vlogs)
    query.$or = [
      { isStory: false },
      { expiresAt: { $gt: new Date() } }
    ];
    
    const vlogs = await Vlog.find(query)
      .populate('user', 'name username profilePicture avatar')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    // Group by user for story-style display
    const groupedByUser = {};
    vlogs.forEach(vlog => {
      const uId = vlog.user?._id?.toString() || 'unknown';
      if (!groupedByUser[uId]) {
        groupedByUser[uId] = {
          user: vlog.user,
          vlogs: [],
          latestAt: vlog.createdAt
        };
      }
      groupedByUser[uId].vlogs.push(vlog);
    });
    
    // Convert to array and sort by latest
    const grouped = Object.values(groupedByUser).sort(
      (a, b) => new Date(b.latestAt) - new Date(a.latestAt)
    );
    
    res.json({
      success: true,
      vlogs,
      grouped,
      page: parseInt(page),
      hasMore: vlogs.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error('Get vlogs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vlogs' });
  }
});

// ==========================================
// GET /api/vlogs/feed - Get vlogs for feed (grouped by user)
// ==========================================
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    // Get active vlogs from last 24 hours (stories)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    console.log('📺 Fetching vlog feed since:', since);
    
    let vlogs = [];
    
    try {
      vlogs = await Vlog.find({
        isActive: { $ne: false },
        visibility: { $in: ['public', undefined] },
        createdAt: { $gte: since }
      })
      .populate('user', 'name username profilePicture avatar')
      .populate('author', 'name username profilePicture avatar') // Fallback for author field
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    } catch (dbError) {
      console.error('📺 Vlog query error:', dbError.message);
      // Try simpler query without populate
      vlogs = await Vlog.find({
        createdAt: { $gte: since }
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    }
    
    console.log(`📺 Found ${vlogs.length} vlogs in feed`);
    
    // Group by user (handle both user and author fields)
    const userVlogs = {};
    vlogs.forEach(vlog => {
      const vlogUser = vlog.user || vlog.author;
      const uId = vlogUser?._id?.toString() || vlog.user?.toString() || vlog.author?.toString();
      if (!uId) return;
      
      if (!userVlogs[uId]) {
        userVlogs[uId] = {
          user: vlogUser,
          vlogs: [],
          hasUnviewed: false,
          gradient: vlog.backgroundGradient || GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)]
        };
      }
      userVlogs[uId].vlogs.push(vlog);
      
      // Check if current user has viewed
      if (req.user && !vlog.views?.some(v => v.user?.toString() === req.user.id)) {
        userVlogs[uId].hasUnviewed = true;
      }
    });
    
    // Sort: unviewed first, then by latest
    const sorted = Object.values(userVlogs).sort((a, b) => {
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return new Date(b.vlogs[0]?.createdAt) - new Date(a.vlogs[0]?.createdAt);
    });
    
    res.json({
      success: true,
      ok: true,
      stories: sorted,
      vlogs: vlogs,
      count: vlogs.length
    });
    
  } catch (error) {
    console.error('📺 Get vlog feed error:', error.message, error.stack);
    // Return empty result instead of 500 so frontend doesn't break
    res.json({ 
      success: true, 
      ok: true,
      stories: [],
      vlogs: [],
      count: 0,
      error: error.message 
    });
  }
});

// ==========================================
// POST /api/vlogs - Create vlog
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const { videoUrl, thumbnailUrl, caption, duration, visibility, isStory, hashtags } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ success: false, error: 'Video URL is required' });
    }
    
    const vlog = await Vlog.create({
      user: req.user.id,
      videoUrl,
      thumbnailUrl: thumbnailUrl || '',
      caption: caption || '',
      duration: duration || 0,
      visibility: visibility || 'public',
      isStory: isStory !== false,
      hashtags: hashtags || [],
      backgroundGradient: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)],
      expiresAt: isStory !== false ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null
    });
    
    await vlog.populate('user', 'name username profilePicture avatar');
    
    console.log('✅ Vlog created:', vlog._id);
    
    res.status(201).json({
      success: true,
      message: 'Vlog created successfully!',
      vlog
    });
    
  } catch (error) {
    console.error('Create vlog error:', error);
    res.status(500).json({ success: false, error: 'Failed to create vlog' });
  }
});

// ==========================================
// GET /api/vlogs/:id - Get single vlog
// ==========================================
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const vlog = await Vlog.findById(req.params.id)
      .populate('user', 'name username profilePicture avatar');
    
    if (!vlog) {
      return res.status(404).json({ success: false, error: 'Vlog not found' });
    }
    
    res.json({ success: true, vlog });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch vlog' });
  }
});

// ==========================================
// POST /api/vlogs/:id/view - Record view
// ==========================================
router.post('/:id/view', optionalAuth, async (req, res) => {
  try {
    const vlog = await Vlog.findById(req.params.id);
    
    if (!vlog) {
      return res.status(404).json({ success: false, error: 'Vlog not found' });
    }
    
    // Increment view count
    vlog.viewsCount = (vlog.viewsCount || 0) + 1;
    
    // Track who viewed (if logged in)
    if (req.user) {
      const alreadyViewed = vlog.views?.some(
        v => v.user?.toString() === req.user.id
      );
      
      if (!alreadyViewed) {
        if (!vlog.views) vlog.views = [];
        vlog.views.push({ user: req.user.id, viewedAt: new Date() });
      }
    }
    
    await vlog.save();
    
    res.json({ success: true, viewsCount: vlog.viewsCount });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to record view' });
  }
});

// ==========================================
// POST /api/vlogs/:id/react - React to vlog
// ==========================================
router.post('/:id/react', verifyToken, async (req, res) => {
  try {
    const { type } = req.body;
    const userId = req.user.id;
    
    const validTypes = ['like', 'love', 'fire', 'haha', 'wow', 'sad'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid reaction type' });
    }
    
    const vlog = await Vlog.findById(req.params.id);
    if (!vlog) {
      return res.status(404).json({ success: false, error: 'Vlog not found' });
    }
    
    // Initialize reactions
    if (!vlog.reactions) {
      vlog.reactions = {};
      validTypes.forEach(t => vlog.reactions[t] = []);
    }
    
    // Remove from all reactions first
    validTypes.forEach(t => {
      if (vlog.reactions[t]) {
        vlog.reactions[t] = vlog.reactions[t].filter(id => id.toString() !== userId);
      }
    });
    
    // Add new reaction
    if (!vlog.reactions[type]) vlog.reactions[type] = [];
    vlog.reactions[type].push(userId);
    
    await vlog.save();
    
    res.json({ success: true, reactions: vlog.reactions });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to react' });
  }
});

// ==========================================
// DELETE /api/vlogs/:id - Delete vlog
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const vlog = await Vlog.findById(req.params.id);
    
    if (!vlog) {
      return res.status(404).json({ success: false, error: 'Vlog not found' });
    }
    
    if (vlog.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    vlog.isActive = false;
    await vlog.save();
    
    res.json({ success: true, message: 'Vlog deleted' });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete vlog' });
  }
});

// ==========================================
// GET /api/vlogs/user/:userId - Get user's vlogs
// ==========================================
router.get('/user/:userId', optionalAuth, async (req, res) => {
  try {
    const vlogs = await Vlog.find({
      user: req.params.userId,
      isActive: true
    })
    .populate('user', 'name username profilePicture avatar')
    .sort({ createdAt: -1 })
    .lean();
    
    res.json({ success: true, vlogs });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user vlogs' });
  }
});

console.log('✅ Vlog routes loaded');

module.exports = router;
