// ============================================
// FILE: routes/group.routes.js
// Groups/Community API Routes
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

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

// Group Schema
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  coverImage: String,
  privacy: { type: String, enum: ['public', 'private'], default: 'public' },
  category: String,
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  membersCount: { type: Number, default: 0 },
  postsCount: { type: Number, default: 0 },
  rules: [String],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);

// ==========================================
// GET /api/groups - Get all groups
// ==========================================
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, search, limit = 20, page = 1 } = req.query;
    
    const query = { isActive: true };
    
    if (category && category !== 'All') {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const groups = await Group.find(query)
      .populate('creator', 'name username profilePicture')
      .sort({ membersCount: -1, createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    res.json({
      success: true,
      groups,
      page: parseInt(page),
      hasMore: groups.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch groups' });
  }
});

// ==========================================
// GET /api/groups/my-groups - Get user's groups
// ==========================================
router.get('/my-groups', verifyToken, async (req, res) => {
  try {
    const groups = await Group.find({
      $or: [
        { creator: req.user.id },
        { members: req.user.id },
        { admins: req.user.id }
      ],
      isActive: true
    })
    .populate('creator', 'name username profilePicture')
    .sort({ updatedAt: -1 })
    .lean();
    
    res.json({ success: true, groups });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch groups' });
  }
});

// ==========================================
// POST /api/groups - Create group
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, privacy, category, coverImage } = req.body;
    
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Group name must be at least 3 characters' });
    }
    
    const group = new Group({
      name: name.trim(),
      description: description?.trim(),
      privacy: privacy || 'public',
      category,
      coverImage,
      creator: req.user.id,
      admins: [req.user.id],
      members: [req.user.id],
      membersCount: 1
    });
    
    await group.save();
    
    res.status(201).json({
      success: true,
      group,
      message: 'Group created successfully'
    });
    
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ success: false, error: 'Failed to create group' });
  }
});

// ==========================================
// GET /api/groups/:id - Get group by ID
// ==========================================
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('creator', 'name username profilePicture')
      .populate('admins', 'name username profilePicture')
      .lean();
    
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    // Check if user is member
    const isMember = req.user && group.members.some(m => m.toString() === req.user.id);
    const isAdmin = req.user && group.admins.some(a => a._id?.toString() === req.user.id);
    
    res.json({
      success: true,
      group,
      isMember,
      isAdmin
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch group' });
  }
});

// ==========================================
// POST /api/groups/:id/join - Join group
// ==========================================
router.post('/:id/join', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    // Check if already member
    if (group.members.includes(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Already a member' });
    }
    
    group.members.push(req.user.id);
    group.membersCount = group.members.length;
    await group.save();
    
    res.json({
      success: true,
      message: 'Joined group successfully'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to join group' });
  }
});

// ==========================================
// POST /api/groups/:id/leave - Leave group
// ==========================================
router.post('/:id/leave', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    // Can't leave if you're the creator
    if (group.creator.toString() === req.user.id) {
      return res.status(400).json({ success: false, error: 'Creator cannot leave group' });
    }
    
    group.members = group.members.filter(m => m.toString() !== req.user.id);
    group.admins = group.admins.filter(a => a.toString() !== req.user.id);
    group.membersCount = group.members.length;
    await group.save();
    
    res.json({
      success: true,
      message: 'Left group successfully'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to leave group' });
  }
});

// ==========================================
// PUT /api/groups/:id - Update group
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    // Check if user is admin
    const isAdmin = group.admins.some(a => a.toString() === req.user.id);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    const { name, description, privacy, category, coverImage, rules } = req.body;
    
    if (name) group.name = name.trim();
    if (description !== undefined) group.description = description?.trim();
    if (privacy) group.privacy = privacy;
    if (category) group.category = category;
    if (coverImage) group.coverImage = coverImage;
    if (rules) group.rules = rules;
    
    await group.save();
    
    res.json({
      success: true,
      group,
      message: 'Group updated successfully'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update group' });
  }
});

console.log('✅ Group routes loaded');

module.exports = router;
