// ============================================
// FILE: routes/group-enhanced.routes.js
// Enhanced Group Features (Chat, Polls, Announcements)
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// Get Group model
const getGroupModel = () => {
  if (mongoose.models.Group) return mongoose.models.Group;
  return require('../models/group.model');
};

// Helper: Check if user is member
const isMember = (group, userId) => {
  return group.members?.some(m => m.user?.toString() === userId || m.toString() === userId);
};

// Helper: Check if user is admin/moderator
const isGroupAdmin = (group, userId) => {
  const member = group.members?.find(m => 
    m.user?.toString() === userId || m.toString() === userId
  );
  return member?.role === 'admin' || member?.role === 'moderator' || 
         group.creator?.toString() === userId;
};

// ==========================================
// GROUP ANNOUNCEMENTS
// ==========================================

// Create announcement
router.post('/:groupId/announcements', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId } = req.params;
    const { title, content, pinned = false } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Only admins can create announcements' });
    }

    if (!group.announcements) group.announcements = [];

    const announcement = {
      _id: new mongoose.Types.ObjectId(),
      author: req.user.id,
      title,
      content,
      pinned,
      createdAt: new Date(),
      reactions: []
    };

    group.announcements.unshift(announcement);
    await group.save();

    // Populate author
    const User = mongoose.models.User || require('../models/user.model');
    const author = await User.findById(req.user.id).select('name username avatar');

    res.status(201).json({
      ok: true,
      announcement: { ...announcement, author }
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get announcements
router.get('/:groupId/announcements', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId } = req.params;

    const group = await Group.findById(groupId)
      .populate('announcements.author', 'name username avatar')
      .lean();

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Must be a member' });
    }

    // Sort: pinned first, then by date
    const announcements = (group.announcements || []).sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({ ok: true, announcements });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Delete announcement
router.delete('/:groupId/announcements/:announcementId', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId, announcementId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    group.announcements = group.announcements.filter(
      a => a._id.toString() !== announcementId
    );
    await group.save();

    res.json({ ok: true, message: 'Announcement deleted' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GROUP POLLS
// ==========================================

// Create poll
router.post('/:groupId/polls', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId } = req.params;
    const { question, options, multipleChoice = false, endsAt, anonymous = false } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Must be a member' });
    }

    if (!question || !options || options.length < 2) {
      return res.status(400).json({ ok: false, error: 'Question and at least 2 options required' });
    }

    if (!group.polls) group.polls = [];

    const poll = {
      _id: new mongoose.Types.ObjectId(),
      author: req.user.id,
      question,
      options: options.map(opt => ({
        text: opt,
        votes: []
      })),
      multipleChoice,
      anonymous,
      endsAt: endsAt ? new Date(endsAt) : null,
      createdAt: new Date(),
      status: 'active'
    };

    group.polls.unshift(poll);
    await group.save();

    // Populate author
    const User = mongoose.models.User || require('../models/user.model');
    const author = await User.findById(req.user.id).select('name username avatar');

    res.status(201).json({
      ok: true,
      poll: {
        ...poll,
        author,
        totalVotes: 0,
        userVoted: false
      }
    });
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Vote on poll
router.post('/:groupId/polls/:pollId/vote', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId, pollId } = req.params;
    const { optionIndexes } = req.body; // Array of indexes

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Must be a member' });
    }

    const poll = group.polls?.find(p => p._id.toString() === pollId);
    if (!poll) {
      return res.status(404).json({ ok: false, error: 'Poll not found' });
    }

    // Check if poll is still active
    if (poll.status !== 'active') {
      return res.status(400).json({ ok: false, error: 'Poll is closed' });
    }

    if (poll.endsAt && new Date(poll.endsAt) < new Date()) {
      poll.status = 'closed';
      await group.save();
      return res.status(400).json({ ok: false, error: 'Poll has ended' });
    }

    // Remove previous votes
    poll.options.forEach(opt => {
      opt.votes = opt.votes.filter(v => v.toString() !== req.user.id);
    });

    // Add new votes
    const indexes = Array.isArray(optionIndexes) ? optionIndexes : [optionIndexes];
    
    if (!poll.multipleChoice && indexes.length > 1) {
      return res.status(400).json({ ok: false, error: 'Only one choice allowed' });
    }

    indexes.forEach(idx => {
      if (poll.options[idx]) {
        poll.options[idx].votes.push(req.user.id);
      }
    });

    await group.save();

    // Calculate results
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    const results = poll.options.map(opt => ({
      text: opt.text,
      votes: opt.votes.length,
      percentage: totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0
    }));

    res.json({
      ok: true,
      results,
      totalVotes,
      userVotes: indexes
    });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get polls
router.get('/:groupId/polls', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId } = req.params;
    const { status = 'all' } = req.query;

    const group = await Group.findById(groupId)
      .populate('polls.author', 'name username avatar')
      .lean();

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Must be a member' });
    }

    let polls = group.polls || [];

    // Filter by status
    if (status !== 'all') {
      polls = polls.filter(p => p.status === status);
    }

    // Add computed fields
    polls = polls.map(poll => {
      const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
      const userVoted = poll.options.some(opt => 
        opt.votes.some(v => v.toString() === req.user.id)
      );
      const userVotes = poll.options
        .map((opt, idx) => opt.votes.some(v => v.toString() === req.user.id) ? idx : -1)
        .filter(idx => idx !== -1);

      return {
        ...poll,
        options: poll.options.map(opt => ({
          text: opt.text,
          votes: poll.anonymous ? opt.votes.length : opt.votes,
          percentage: totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0
        })),
        totalVotes,
        userVoted,
        userVotes
      };
    });

    res.json({ ok: true, polls });
  } catch (error) {
    console.error('Get polls error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Close poll
router.post('/:groupId/polls/:pollId/close', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId, pollId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    const poll = group.polls?.find(p => p._id.toString() === pollId);
    if (!poll) {
      return res.status(404).json({ ok: false, error: 'Poll not found' });
    }

    // Only author or admin can close
    if (poll.author.toString() !== req.user.id && !isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    poll.status = 'closed';
    await group.save();

    res.json({ ok: true, message: 'Poll closed' });
  } catch (error) {
    console.error('Close poll error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GROUP CHAT / DISCUSSION
// ==========================================

// Send message to group
router.post('/:groupId/chat', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId } = req.params;
    const { content, replyTo } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Must be a member' });
    }

    if (!content?.trim()) {
      return res.status(400).json({ ok: false, error: 'Content required' });
    }

    if (!group.chat) group.chat = [];

    const message = {
      _id: new mongoose.Types.ObjectId(),
      sender: req.user.id,
      content: content.trim(),
      replyTo: replyTo || null,
      createdAt: new Date(),
      reactions: []
    };

    group.chat.push(message);

    // Keep only last 500 messages
    if (group.chat.length > 500) {
      group.chat = group.chat.slice(-500);
    }

    await group.save();

    // Populate sender
    const User = mongoose.models.User || require('../models/user.model');
    const sender = await User.findById(req.user.id).select('name username avatar');

    // Emit via Socket.IO
    const io = global.io;
    if (io) {
      io.to(`group:${groupId}`).emit('group-message', {
        ...message,
        sender,
        groupId
      });
    }

    res.status(201).json({
      ok: true,
      message: { ...message, sender }
    });
  } catch (error) {
    console.error('Group chat error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get chat messages
router.get('/:groupId/chat', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId } = req.params;
    const { limit = 50, before } = req.query;

    const group = await Group.findById(groupId)
      .populate('chat.sender', 'name username avatar')
      .lean();

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isMember(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Must be a member' });
    }

    let messages = group.chat || [];

    // Filter by before timestamp
    if (before) {
      messages = messages.filter(m => new Date(m.createdAt) < new Date(before));
    }

    // Get last N messages
    messages = messages.slice(-parseInt(limit));

    res.json({ ok: true, messages });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// React to message
router.post('/:groupId/chat/:messageId/react', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId, messageId } = req.params;
    const { emoji } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    const message = group.chat?.find(m => m._id.toString() === messageId);
    if (!message) {
      return res.status(404).json({ ok: false, error: 'Message not found' });
    }

    if (!message.reactions) message.reactions = [];

    // Toggle reaction
    const existingIndex = message.reactions.findIndex(
      r => r.user.toString() === req.user.id && r.emoji === emoji
    );

    if (existingIndex > -1) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions.push({ user: req.user.id, emoji });
    }

    await group.save();

    res.json({ ok: true, reactions: message.reactions });
  } catch (error) {
    console.error('React error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GROUP MEMBER MANAGEMENT
// ==========================================

// Get members with roles
router.get('/:groupId/members', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId } = req.params;
    const { role, search, page = 1, limit = 50 } = req.query;

    const group = await Group.findById(groupId)
      .populate('members.user', 'name username avatar bio')
      .populate('creator', 'name username avatar')
      .lean();

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    let members = group.members || [];

    // Filter by role
    if (role) {
      members = members.filter(m => m.role === role);
    }

    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      members = members.filter(m => 
        m.user?.name?.toLowerCase().includes(searchLower) ||
        m.user?.username?.toLowerCase().includes(searchLower)
      );
    }

    const total = members.length;

    // Paginate
    const skip = (parseInt(page) - 1) * parseInt(limit);
    members = members.slice(skip, skip + parseInt(limit));

    res.json({
      ok: true,
      members,
      creator: group.creator,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Change member role
router.put('/:groupId/members/:userId/role', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId, userId } = req.params;
    const { role } = req.body; // 'admin', 'moderator', 'member'

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    // Only creator or admin can change roles
    if (group.creator.toString() !== req.user.id && !isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    // Can't change creator's role
    if (userId === group.creator.toString()) {
      return res.status(400).json({ ok: false, error: 'Cannot change creator role' });
    }

    const member = group.members?.find(m => 
      m.user?.toString() === userId || m.toString() === userId
    );

    if (!member) {
      return res.status(404).json({ ok: false, error: 'Member not found' });
    }

    member.role = role;
    await group.save();

    res.json({ ok: true, message: `Role updated to ${role}` });
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Ban member
router.post('/:groupId/members/:userId/ban', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId, userId } = req.params;
    const { reason } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    if (userId === group.creator.toString()) {
      return res.status(400).json({ ok: false, error: 'Cannot ban creator' });
    }

    // Remove from members
    group.members = group.members.filter(m => 
      m.user?.toString() !== userId && m.toString() !== userId
    );

    // Add to banned list
    if (!group.bannedUsers) group.bannedUsers = [];
    if (!group.bannedUsers.some(b => b.user?.toString() === userId)) {
      group.bannedUsers.push({
        user: userId,
        reason,
        bannedBy: req.user.id,
        bannedAt: new Date()
      });
    }

    await group.save();

    res.json({ ok: true, message: 'Member banned' });
  } catch (error) {
    console.error('Ban member error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Unban member
router.post('/:groupId/members/:userId/unban', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId, userId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!isGroupAdmin(group, req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    group.bannedUsers = (group.bannedUsers || []).filter(
      b => b.user?.toString() !== userId
    );

    await group.save();

    res.json({ ok: true, message: 'Member unbanned' });
  } catch (error) {
    console.error('Unban member error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GROUP SETTINGS
// ==========================================

// Update group settings
router.put('/:groupId/settings', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (group.creator.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Only creator can update settings' });
    }

    const allowedSettings = [
      'name', 'description', 'coverImage', 'privacy', 'category',
      'rules', 'allowMemberPosts', 'allowMemberEvents', 'requirePostApproval',
      'allowChat', 'allowPolls'
    ];

    if (!group.settings) group.settings = {};

    allowedSettings.forEach(setting => {
      if (req.body[setting] !== undefined) {
        if (['name', 'description', 'coverImage', 'privacy', 'category', 'rules'].includes(setting)) {
          group[setting] = req.body[setting];
        } else {
          group.settings[setting] = req.body[setting];
        }
      }
    });

    await group.save();

    res.json({ ok: true, group });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
