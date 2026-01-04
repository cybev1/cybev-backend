// ============================================
// FILE: routes/group.routes.js
// Groups/Community API Routes with Full Admin Features
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

// Group Schema with full features
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  coverImage: String,
  icon: String,
  privacy: { type: String, enum: ['public', 'private', 'secret'], default: 'public' },
  joinApproval: { type: Boolean, default: false },
  category: { type: String, default: 'General' },
  tags: [String],
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  membersCount: { type: Number, default: 0 },
  pendingRequests: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date, default: Date.now },
    message: String
  }],
  bannedMembers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bannedAt: { type: Date, default: Date.now },
    reason: String,
    expiresAt: Date
  }],
  mutedMembers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mutedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mutedAt: { type: Date, default: Date.now },
    reason: String,
    expiresAt: Date
  }],
  rules: [{ title: String, description: String, order: Number }],
  postsCount: { type: Number, default: 0 },
  settings: {
    allowMemberPosts: { type: Boolean, default: true },
    allowMemberInvites: { type: Boolean, default: true },
    requirePostApproval: { type: Boolean, default: false }
  },
  pinnedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Blog' }],
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false }
}, { timestamps: true });

const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);

// Helper function
const checkGroupRole = async (groupId, userId) => {
  const group = await Group.findById(groupId);
  if (!group) return { group: null, role: null };
  
  const isCreator = group.creator.toString() === userId;
  const isAdmin = group.admins.some(a => a.toString() === userId);
  const isModerator = group.moderators.some(m => m.toString() === userId);
  const isMember = group.members.some(m => m.toString() === userId);
  
  let role = null;
  if (isCreator) role = 'creator';
  else if (isAdmin) role = 'admin';
  else if (isModerator) role = 'moderator';
  else if (isMember) role = 'member';
  
  return { group, role, isCreator, isAdmin, isModerator, isMember };
};

// GET /api/groups
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, search, limit = 20, page = 1 } = req.query;
    const query = { isActive: true, privacy: { $ne: 'secret' } };
    
    if (category && category !== 'All') query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const groups = await Group.find(query)
      .populate('creator', 'name username profilePicture')
      .sort({ isFeatured: -1, membersCount: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    if (req.user) {
      groups.forEach(g => {
        g.isMember = g.members?.some(m => m.toString() === req.user.id);
        g.isAdmin = g.admins?.some(a => a.toString() === req.user.id) || g.creator?._id?.toString() === req.user.id;
      });
    }
    
    res.json({ success: true, groups, page: parseInt(page), hasMore: groups.length === parseInt(limit) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch groups' });
  }
});

// GET /api/groups/my-groups
router.get('/my-groups', verifyToken, async (req, res) => {
  try {
    const groups = await Group.find({
      $or: [{ creator: req.user.id }, { members: req.user.id }],
      isActive: true
    })
    .populate('creator', 'name username profilePicture')
    .sort({ updatedAt: -1 })
    .lean();
    
    groups.forEach(g => {
      if (g.creator?._id?.toString() === req.user.id) g.myRole = 'creator';
      else if (g.admins?.some(a => a.toString() === req.user.id)) g.myRole = 'admin';
      else if (g.moderators?.some(m => m.toString() === req.user.id)) g.myRole = 'moderator';
      else g.myRole = 'member';
    });
    
    res.json({ success: true, groups });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch groups' });
  }
});

// POST /api/groups - Create
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, privacy, category, coverImage, icon, rules, tags } = req.body;
    
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Name must be at least 3 characters' });
    }
    
    const group = new Group({
      name: name.trim(),
      description: description?.trim(),
      privacy: privacy || 'public',
      category: category || 'General',
      coverImage, icon, tags: tags || [],
      rules: rules || [],
      creator: req.user.id,
      admins: [req.user.id],
      members: [req.user.id],
      membersCount: 1
    });
    
    await group.save();
    await group.populate('creator', 'name username profilePicture');
    
    res.status(201).json({ success: true, group, message: 'Group created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create group' });
  }
});

// GET /api/groups/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('creator', 'name username profilePicture')
      .populate('admins', 'name username profilePicture')
      .populate('moderators', 'name username profilePicture')
      .populate('pendingRequests.user', 'name username profilePicture')
      .lean();
    
    if (!group || !group.isActive) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    let isMember = false, isAdmin = false, isModerator = false, isCreator = false, isPending = false;
    
    if (req.user) {
      isMember = group.members.some(m => m.toString() === req.user.id);
      isAdmin = group.admins.some(a => a._id?.toString() === req.user.id);
      isModerator = group.moderators.some(m => m._id?.toString() === req.user.id);
      isCreator = group.creator._id?.toString() === req.user.id;
      isPending = group.pendingRequests?.some(p => p.user?._id?.toString() === req.user.id);
    }
    
    res.json({
      success: true,
      group: {
        ...group,
        pendingRequests: (isAdmin || isCreator) ? group.pendingRequests : undefined,
        bannedMembers: (isAdmin || isCreator) ? group.bannedMembers : undefined
      },
      isMember, isAdmin: isAdmin || isCreator, isModerator, isCreator, isPending
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch group' });
  }
});

// GET /api/groups/:id/members
router.get('/:id/members', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const group = await Group.findById(req.params.id)
      .populate({
        path: 'members',
        select: 'name username profilePicture bio',
        options: { skip: (parseInt(page) - 1) * parseInt(limit), limit: parseInt(limit) }
      })
      .populate('admins', 'name username profilePicture')
      .populate('moderators', 'name username profilePicture');
    
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    
    const membersWithRoles = group.members.map(m => {
      let role = 'member';
      if (group.creator.toString() === m._id.toString()) role = 'creator';
      else if (group.admins.some(a => a._id.toString() === m._id.toString())) role = 'admin';
      else if (group.moderators.some(mod => mod._id.toString() === m._id.toString())) role = 'moderator';
      return { ...m.toObject(), role };
    });
    
    res.json({ success: true, members: membersWithRoles, total: group.membersCount, admins: group.admins, moderators: group.moderators });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch members' });
  }
});

// POST /api/groups/:id/join
router.post('/:id/join', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    
    const isBanned = group.bannedMembers?.some(b => b.user.toString() === req.user.id && (!b.expiresAt || b.expiresAt > new Date()));
    if (isBanned) return res.status(403).json({ success: false, error: 'You are banned from this group' });
    
    if (group.members.includes(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Already a member' });
    }
    
    if (group.privacy === 'private' && group.joinApproval) {
      if (!group.pendingRequests.some(p => p.user.toString() === req.user.id)) {
        group.pendingRequests.push({ user: req.user.id, message: req.body.message });
        await group.save();
      }
      return res.json({ success: true, pending: true, message: 'Request sent for approval' });
    }
    
    group.members.push(req.user.id);
    group.membersCount = group.members.length;
    await group.save();
    
    res.json({ success: true, message: 'Joined group successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to join group' });
  }
});

// POST /api/groups/:id/leave
router.post('/:id/leave', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    
    if (group.creator.toString() === req.user.id) {
      return res.status(400).json({ success: false, error: 'Creator cannot leave. Transfer ownership first.' });
    }
    
    group.members = group.members.filter(m => m.toString() !== req.user.id);
    group.admins = group.admins.filter(a => a.toString() !== req.user.id);
    group.moderators = group.moderators.filter(m => m.toString() !== req.user.id);
    group.membersCount = group.members.length;
    await group.save();
    
    res.json({ success: true, message: 'Left group' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to leave group' });
  }
});

// PUT /api/groups/:id - Update
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { role, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    if (!['creator', 'admin'].includes(role)) return res.status(403).json({ success: false, error: 'Admin required' });
    
    const updates = ['name', 'description', 'privacy', 'category', 'coverImage', 'icon', 'rules', 'tags', 'settings', 'joinApproval'];
    updates.forEach(key => {
      if (req.body[key] !== undefined) group[key] = req.body[key];
    });
    
    await group.save();
    res.json({ success: true, group, message: 'Group updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update group' });
  }
});

// MODERATION: Approve join request
router.post('/:id/approve/:userId', verifyToken, async (req, res) => {
  try {
    const { role, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!['creator', 'admin', 'moderator'].includes(role)) return res.status(403).json({ success: false, error: 'Not authorized' });
    
    group.pendingRequests = group.pendingRequests.filter(p => p.user.toString() !== req.params.userId);
    if (!group.members.includes(req.params.userId)) {
      group.members.push(req.params.userId);
      group.membersCount = group.members.length;
    }
    await group.save();
    
    res.json({ success: true, message: 'Request approved' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to approve' });
  }
});

// MODERATION: Reject join request
router.post('/:id/reject/:userId', verifyToken, async (req, res) => {
  try {
    const { role, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!['creator', 'admin', 'moderator'].includes(role)) return res.status(403).json({ success: false, error: 'Not authorized' });
    
    group.pendingRequests = group.pendingRequests.filter(p => p.user.toString() !== req.params.userId);
    await group.save();
    
    res.json({ success: true, message: 'Request rejected' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to reject' });
  }
});

// MODERATION: Remove/kick member
router.post('/:id/kick/:userId', verifyToken, async (req, res) => {
  try {
    const { role, group, isCreator } = await checkGroupRole(req.params.id, req.user.id);
    if (!['creator', 'admin'].includes(role)) return res.status(403).json({ success: false, error: 'Admin required' });
    
    const targetId = req.params.userId;
    if (group.creator.toString() === targetId) return res.status(403).json({ success: false, error: 'Cannot remove creator' });
    if (!isCreator && group.admins.some(a => a.toString() === targetId)) return res.status(403).json({ success: false, error: 'Only creator can remove admins' });
    
    group.members = group.members.filter(m => m.toString() !== targetId);
    group.admins = group.admins.filter(a => a.toString() !== targetId);
    group.moderators = group.moderators.filter(m => m.toString() !== targetId);
    group.membersCount = group.members.length;
    await group.save();
    
    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

// MODERATION: Ban member
router.post('/:id/ban/:userId', verifyToken, async (req, res) => {
  try {
    const { role, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!['creator', 'admin'].includes(role)) return res.status(403).json({ success: false, error: 'Admin required' });
    
    const targetId = req.params.userId;
    if (group.creator.toString() === targetId) return res.status(403).json({ success: false, error: 'Cannot ban creator' });
    
    group.members = group.members.filter(m => m.toString() !== targetId);
    group.admins = group.admins.filter(a => a.toString() !== targetId);
    group.moderators = group.moderators.filter(m => m.toString() !== targetId);
    group.membersCount = group.members.length;
    
    group.bannedMembers.push({
      user: targetId,
      bannedBy: req.user.id,
      reason: req.body.reason,
      expiresAt: req.body.duration ? new Date(Date.now() + req.body.duration * 24 * 60 * 60 * 1000) : null
    });
    await group.save();
    
    res.json({ success: true, message: 'Member banned' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to ban member' });
  }
});

// MODERATION: Unban member
router.post('/:id/unban/:userId', verifyToken, async (req, res) => {
  try {
    const { role, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!['creator', 'admin'].includes(role)) return res.status(403).json({ success: false, error: 'Admin required' });
    
    group.bannedMembers = group.bannedMembers.filter(b => b.user.toString() !== req.params.userId);
    await group.save();
    
    res.json({ success: true, message: 'Member unbanned' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to unban' });
  }
});

// MODERATION: Mute member
router.post('/:id/mute/:userId', verifyToken, async (req, res) => {
  try {
    const { role, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!['creator', 'admin', 'moderator'].includes(role)) return res.status(403).json({ success: false, error: 'Not authorized' });
    
    group.mutedMembers.push({
      user: req.params.userId,
      mutedBy: req.user.id,
      reason: req.body.reason,
      expiresAt: req.body.duration ? new Date(Date.now() + req.body.duration * 60 * 60 * 1000) : null
    });
    await group.save();
    
    res.json({ success: true, message: 'Member muted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to mute' });
  }
});

// MODERATION: Unmute member
router.post('/:id/unmute/:userId', verifyToken, async (req, res) => {
  try {
    const { role, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!['creator', 'admin', 'moderator'].includes(role)) return res.status(403).json({ success: false, error: 'Not authorized' });
    
    group.mutedMembers = group.mutedMembers.filter(m => m.user.toString() !== req.params.userId);
    await group.save();
    
    res.json({ success: true, message: 'Member unmuted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to unmute' });
  }
});

// MODERATION: Promote to admin/moderator
router.post('/:id/promote/:userId', verifyToken, async (req, res) => {
  try {
    const { role, group, isCreator } = await checkGroupRole(req.params.id, req.user.id);
    const { newRole } = req.body;
    
    if (!['creator', 'admin'].includes(role)) return res.status(403).json({ success: false, error: 'Admin required' });
    if (newRole === 'admin' && !isCreator) return res.status(403).json({ success: false, error: 'Only creator can promote to admin' });
    
    const targetId = req.params.userId;
    if (!group.members.includes(targetId)) return res.status(400).json({ success: false, error: 'User is not a member' });
    
    if (newRole === 'admin') {
      if (!group.admins.includes(targetId)) group.admins.push(targetId);
      group.moderators = group.moderators.filter(m => m.toString() !== targetId);
    } else if (newRole === 'moderator') {
      if (!group.moderators.includes(targetId)) group.moderators.push(targetId);
    }
    await group.save();
    
    res.json({ success: true, message: `Promoted to ${newRole}` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to promote' });
  }
});

// MODERATION: Demote member
router.post('/:id/demote/:userId', verifyToken, async (req, res) => {
  try {
    const { isCreator, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!isCreator) return res.status(403).json({ success: false, error: 'Only creator can demote' });
    
    const targetId = req.params.userId;
    group.admins = group.admins.filter(a => a.toString() !== targetId);
    group.moderators = group.moderators.filter(m => m.toString() !== targetId);
    await group.save();
    
    res.json({ success: true, message: 'Demoted to member' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to demote' });
  }
});

// MODERATION: Transfer ownership
router.post('/:id/transfer', verifyToken, async (req, res) => {
  try {
    const { isCreator, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!isCreator) return res.status(403).json({ success: false, error: 'Only creator can transfer' });
    
    const { newOwnerId } = req.body;
    if (!group.members.includes(newOwnerId)) return res.status(400).json({ success: false, error: 'New owner must be a member' });
    
    if (!group.admins.includes(req.user.id)) group.admins.push(req.user.id);
    group.admins = group.admins.filter(a => a.toString() !== newOwnerId);
    group.moderators = group.moderators.filter(m => m.toString() !== newOwnerId);
    group.creator = newOwnerId;
    await group.save();
    
    res.json({ success: true, message: 'Ownership transferred' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to transfer' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { isCreator, group } = await checkGroupRole(req.params.id, req.user.id);
    if (!isCreator) return res.status(403).json({ success: false, error: 'Only creator can delete' });
    
    group.isActive = false;
    await group.save();
    
    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

console.log('✅ Group routes loaded');
module.exports = router;
