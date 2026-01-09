// ============================================
// FILE: routes/group.routes.js
// Facebook-like Groups API Routes
// VERSION: 6.4.2
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models
const getGroupModel = () => mongoose.models.Group || require('../models/group.model');
const getGroupPostModel = () => mongoose.models.GroupPost || require('../models/groupPost.model');
const getUserModel = () => mongoose.models.User || require('../models/user.model');

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// Optional auth
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    } catch {}
  }
  next();
};

// ==========================================
// GROUP CRUD
// ==========================================

// GET /api/groups - List groups (discover, my groups, search)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      type = 'discover', // discover, my, joined, managed
      category,
      search,
      page = 1,
      limit = 20,
      sort = 'popular' // popular, recent, alphabetical
    } = req.query;

    const Group = getGroupModel();
    let query = { isActive: true, isArchived: false };
    
    // Filter by type
    if (type === 'my' && req.user) {
      query.creator = req.user.id;
    } else if (type === 'joined' && req.user) {
      query['members.user'] = req.user.id;
    } else if (type === 'managed' && req.user) {
      query.$or = [
        { creator: req.user.id },
        { admins: req.user.id },
        { moderators: req.user.id }
      ];
    } else {
      // Discover - only show public groups
      query.privacy = 'public';
    }

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Sort
    let sortOption = {};
    switch (sort) {
      case 'popular': sortOption = { 'stats.memberCount': -1 }; break;
      case 'recent': sortOption = { createdAt: -1 }; break;
      case 'alphabetical': sortOption = { name: 1 }; break;
      case 'active': sortOption = { lastActivityAt: -1 }; break;
      default: sortOption = { 'stats.memberCount': -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [groups, total] = await Promise.all([
      Group.find(query)
        .populate('creator', 'name username avatar')
        .select('-members -joinRequests -invites')
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Group.countDocuments(query)
    ]);

    // Add membership status for logged-in users
    const groupsWithStatus = groups.map(group => ({
      ...group,
      isMember: req.user ? group.members?.some(m => m.user?.toString() === req.user.id) : false,
      isAdmin: req.user ? group.admins?.some(a => a.toString() === req.user.id) : false,
      isCreator: req.user ? group.creator?._id?.toString() === req.user.id : false
    }));

    res.json({
      ok: true,
      groups: groupsWithStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/groups/categories - Get group categories
router.get('/categories', (req, res) => {
  const categories = [
    { id: 'general', name: 'General', icon: '💬' },
    { id: 'technology', name: 'Technology', icon: '💻' },
    { id: 'business', name: 'Business', icon: '💼' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
    { id: 'sports', name: 'Sports', icon: '⚽' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'music', name: 'Music', icon: '🎵' },
    { id: 'art', name: 'Art & Design', icon: '🎨' },
    { id: 'education', name: 'Education', icon: '📚' },
    { id: 'health', name: 'Health & Fitness', icon: '💪' },
    { id: 'lifestyle', name: 'Lifestyle', icon: '🌟' },
    { id: 'news', name: 'News', icon: '📰' },
    { id: 'science', name: 'Science', icon: '🔬' },
    { id: 'travel', name: 'Travel', icon: '✈️' },
    { id: 'food', name: 'Food & Cooking', icon: '🍳' },
    { id: 'fashion', name: 'Fashion', icon: '👗' },
    { id: 'religion', name: 'Faith & Spirituality', icon: '🙏' },
    { id: 'parenting', name: 'Parenting', icon: '👨‍👩‍👧' },
    { id: 'pets', name: 'Pets', icon: '🐾' },
    { id: 'photography', name: 'Photography', icon: '📷' },
    { id: 'other', name: 'Other', icon: '📌' }
  ];
  res.json({ ok: true, categories });
});

// POST /api/groups - Create group
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, privacy, category, rules, tags, coverImage, avatar } = req.body;

    if (!name || name.trim().length < 3) {
      return res.status(400).json({ ok: false, error: 'Group name must be at least 3 characters' });
    }

    const Group = getGroupModel();

    const group = new Group({
      name: name.trim(),
      description: description?.trim(),
      privacy: privacy || 'public',
      category: category || 'general',
      rules: rules || [],
      tags: tags || [],
      coverImage,
      avatar,
      creator: req.user.id,
      admins: [req.user.id],
      members: [{
        user: req.user.id,
        role: 'admin',
        joinedAt: new Date()
      }],
      stats: { memberCount: 1 }
    });

    await group.save();

    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'name username avatar');

    res.status(201).json({ ok: true, group: populatedGroup });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/groups/:idOrSlug - Get group details
router.get('/:idOrSlug', optionalAuth, async (req, res) => {
  try {
    const Group = getGroupModel();
    const { idOrSlug } = req.params;

    let group;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      group = await Group.findById(idOrSlug);
    } else {
      group = await Group.findOne({ slug: idOrSlug });
    }

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    // Check access for secret groups
    const isMember = req.user && group.members.some(m => m.user?.toString() === req.user.id);
    const isAdmin = req.user && group.admins.some(a => a.toString() === req.user.id);

    if (group.privacy === 'secret' && !isMember) {
      return res.status(403).json({ ok: false, error: 'This group is private' });
    }

    // Populate based on access level
    await group.populate('creator', 'name username avatar');
    await group.populate('admins', 'name username avatar');
    await group.populate('moderators', 'name username avatar');
    
    if (isMember || group.privacy === 'public') {
      await group.populate('members.user', 'name username avatar');
    }

    // Check for pending join request
    const hasPendingRequest = req.user && group.joinRequests.some(
      r => r.user?.toString() === req.user.id && r.status === 'pending'
    );

    // Check for pending invite
    const hasInvite = req.user && group.invites.some(
      i => i.user?.toString() === req.user.id && i.status === 'pending'
    );

    res.json({
      ok: true,
      group: {
        ...group.toObject(),
        isMember,
        isAdmin,
        isModerator: req.user && group.moderators.some(m => m.toString() === req.user.id),
        isCreator: req.user && group.creator._id.toString() === req.user.id,
        hasPendingRequest,
        hasInvite,
        // Hide sensitive data for non-members
        members: (isMember || group.settings.showMemberList) ? group.members : [],
        joinRequests: isAdmin ? group.joinRequests : [],
        invites: isAdmin ? group.invites : []
      }
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/groups/:id - Update group
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!group.isAdmin(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Only admins can update group' });
    }

    const allowedUpdates = [
      'name', 'description', 'privacy', 'category', 'rules', 'tags',
      'coverImage', 'avatar', 'settings', 'features', 'location'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        group[field] = req.body[field];
      }
    });

    await group.save();

    res.json({ ok: true, group });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/groups/:id - Delete group
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const GroupPost = getGroupPostModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (group.creator.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Only the creator can delete the group' });
    }

    // Delete all group posts
    await GroupPost.deleteMany({ group: group._id });

    // Delete group
    await Group.findByIdAndDelete(req.params.id);

    res.json({ ok: true, message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// MEMBERSHIP
// ==========================================

// POST /api/groups/:id/join - Join group
router.post('/:id/join', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (group.isMember(req.user.id)) {
      return res.status(400).json({ ok: false, error: 'Already a member' });
    }

    // Check if banned
    const member = group.members.find(m => m.user?.toString() === req.user.id);
    if (member?.status === 'banned') {
      return res.status(403).json({ ok: false, error: 'You are banned from this group' });
    }

    // Public group - join immediately
    if (group.privacy === 'public' && !group.settings.memberApproval) {
      await group.addMember(req.user.id);
      return res.json({ ok: true, status: 'joined', message: 'Joined group successfully' });
    }

    // Private group - create join request
    if (group.privacy === 'private') {
      const existingRequest = group.joinRequests.find(
        r => r.user?.toString() === req.user.id && r.status === 'pending'
      );

      if (existingRequest) {
        return res.status(400).json({ ok: false, error: 'Join request already pending' });
      }

      group.joinRequests.push({
        user: req.user.id,
        message: req.body.message || '',
        requestedAt: new Date(),
        status: 'pending'
      });

      await group.save();

      return res.json({ ok: true, status: 'pending', message: 'Join request sent' });
    }

    // Secret group - can only join via invite
    if (group.privacy === 'secret') {
      const invite = group.invites.find(
        i => i.user?.toString() === req.user.id && i.status === 'pending'
      );

      if (!invite) {
        return res.status(403).json({ ok: false, error: 'This group is invite-only' });
      }

      // Accept invite
      invite.status = 'accepted';
      await group.addMember(req.user.id, invite.invitedBy);

      return res.json({ ok: true, status: 'joined', message: 'Joined group successfully' });
    }

    res.status(400).json({ ok: false, error: 'Unable to join group' });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/leave - Leave group
router.post('/:id/leave', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (group.creator.toString() === req.user.id) {
      return res.status(400).json({ ok: false, error: 'Creator cannot leave. Transfer ownership first or delete the group.' });
    }

    const result = await group.removeMember(req.user.id);

    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    res.json({ ok: true, message: 'Left group successfully' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/groups/:id/members - Get members
router.get('/:id/members', optionalAuth, async (req, res) => {
  try {
    const { role, search, page = 1, limit = 50 } = req.query;
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    const isMember = req.user && group.isMember(req.user.id);

    if (!group.settings.showMemberList && !isMember) {
      return res.status(403).json({ ok: false, error: 'Member list is private' });
    }

    await group.populate('members.user', 'name username avatar bio');

    let members = group.members.filter(m => m.status === 'active');

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

    // Paginate
    const total = members.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    members = members.slice(skip, skip + parseInt(limit));

    res.json({
      ok: true,
      members,
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

// POST /api/groups/:id/requests/:requestId/approve - Approve join request
router.post('/:id/requests/:requestId/approve', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!group.isAdmin(req.user.id) && !group.isModerator(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const request = group.joinRequests.id(req.params.requestId);
    if (!request || request.status !== 'pending') {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }

    request.status = 'approved';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();

    await group.addMember(request.user);

    res.json({ ok: true, message: 'Request approved' });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/requests/:requestId/reject - Reject join request
router.post('/:id/requests/:requestId/reject', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!group.isAdmin(req.user.id) && !group.isModerator(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const request = group.joinRequests.id(req.params.requestId);
    if (!request || request.status !== 'pending') {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }

    request.status = 'rejected';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();

    await group.save();

    res.json({ ok: true, message: 'Request rejected' });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/invite - Invite user
router.post('/:id/invite', verifyToken, async (req, res) => {
  try {
    const { userId, userIds } = req.body;
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!group.isMember(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Only members can invite' });
    }

    if (!group.settings.allowInvites && !group.isAdmin(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Invites are disabled' });
    }

    const usersToInvite = userIds || [userId];
    const invited = [];

    for (const uid of usersToInvite) {
      if (group.isMember(uid)) continue;
      
      const existingInvite = group.invites.find(
        i => i.user?.toString() === uid && i.status === 'pending'
      );
      if (existingInvite) continue;

      group.invites.push({
        user: uid,
        invitedBy: req.user.id,
        invitedAt: new Date()
      });
      invited.push(uid);
    }

    await group.save();

    res.json({ ok: true, invited: invited.length, message: `${invited.length} user(s) invited` });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/members/:memberId/role - Update member role
router.post('/:id/members/:memberId/role', verifyToken, async (req, res) => {
  try {
    const { role } = req.body;
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!group.isAdmin(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Only admins can change roles' });
    }

    if (group.creator.toString() === req.params.memberId && req.user.id !== req.params.memberId) {
      return res.status(403).json({ ok: false, error: 'Cannot change creator role' });
    }

    const result = await group.updateMemberRole(req.params.memberId, role);

    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    res.json({ ok: true, message: 'Role updated' });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/groups/:id/members/:memberId - Remove member
router.delete('/:id/members/:memberId', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!group.isAdmin(req.user.id) && !group.isModerator(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const result = await group.removeMember(req.params.memberId);

    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    res.json({ ok: true, message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// GROUP POSTS
// ==========================================

// GET /api/groups/:id/posts - Get group posts
router.get('/:id/posts', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, pinned } = req.query;
    const Group = getGroupModel();
    const GroupPost = getGroupPostModel();

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    const isMember = req.user && group.isMember(req.user.id);

    if (group.privacy !== 'public' && !isMember) {
      return res.status(403).json({ ok: false, error: 'Join the group to see posts' });
    }

    let query = { group: req.params.id, status: 'approved', isHidden: false };
    
    if (type) query.postType = type;
    if (pinned === 'true') query.isPinned = true;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      GroupPost.find(query)
        .populate('author', 'name username avatar')
        .populate('comments.author', 'name username avatar')
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      GroupPost.countDocuments(query)
    ]);

    // Add user interaction data
    const postsWithData = posts.map(post => ({
      ...post,
      isLiked: req.user ? post.likes?.some(l => l.toString() === req.user.id) : false,
      isAuthor: req.user ? post.author._id.toString() === req.user.id : false
    }));

    res.json({
      ok: true,
      posts: postsWithData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/posts - Create post
router.post('/:id/posts', verifyToken, async (req, res) => {
  try {
    const { content, media, postType, poll, event } = req.body;
    const Group = getGroupModel();
    const GroupPost = getGroupPostModel();

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ ok: false, error: 'Group not found' });
    }

    if (!group.isMember(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Join the group to post' });
    }

    // Check if member is muted
    const member = group.members.find(m => m.user?.toString() === req.user.id);
    if (member?.status === 'muted') {
      return res.status(403).json({ ok: false, error: 'You are muted in this group' });
    }

    const post = new GroupPost({
      group: req.params.id,
      author: req.user.id,
      content,
      media: media || [],
      postType: postType || 'post',
      poll: postType === 'poll' ? poll : undefined,
      event: postType === 'event' ? event : undefined,
      status: group.settings.postApproval && !group.isAdmin(req.user.id) ? 'pending' : 'approved'
    });

    await post.save();

    // Update group stats
    group.stats.postCount = (group.stats.postCount || 0) + 1;
    group.lastActivityAt = new Date();
    await group.save();

    await post.populate('author', 'name username avatar');

    res.status(201).json({ 
      ok: true, 
      post,
      message: post.status === 'pending' ? 'Post submitted for approval' : 'Post created'
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/posts/:postId/like - Like/unlike post
router.post('/:id/posts/:postId/like', verifyToken, async (req, res) => {
  try {
    const GroupPost = getGroupPostModel();
    const post = await GroupPost.findOne({ _id: req.params.postId, group: req.params.id });

    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const result = await post.toggleLike(req.user.id);

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/posts/:postId/comment - Add comment
router.post('/:id/posts/:postId/comment', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;
    const GroupPost = getGroupPostModel();
    const post = await GroupPost.findOne({ _id: req.params.postId, group: req.params.id });

    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const comment = await post.addComment(req.user.id, content);

    // Populate author
    await post.populate('comments.author', 'name username avatar');

    res.json({ ok: true, comment: post.comments[post.comments.length - 1] });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/posts/:postId/pin - Pin/unpin post
router.post('/:id/posts/:postId/pin', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const GroupPost = getGroupPostModel();

    const group = await Group.findById(req.params.id);
    if (!group || !group.isAdmin(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Only admins can pin posts' });
    }

    const post = await GroupPost.findOne({ _id: req.params.postId, group: req.params.id });
    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    post.isPinned = !post.isPinned;
    await post.save();

    res.json({ ok: true, isPinned: post.isPinned });
  } catch (error) {
    console.error('Pin post error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api/groups/:id/posts/:postId - Delete post
router.delete('/:id/posts/:postId', verifyToken, async (req, res) => {
  try {
    const Group = getGroupModel();
    const GroupPost = getGroupPostModel();

    const group = await Group.findById(req.params.id);
    const post = await GroupPost.findOne({ _id: req.params.postId, group: req.params.id });

    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const canDelete = post.author.toString() === req.user.id || 
                      group.isAdmin(req.user.id) || 
                      group.isModerator(req.user.id);

    if (!canDelete) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    await GroupPost.findByIdAndDelete(req.params.postId);

    // Update stats
    group.stats.postCount = Math.max(0, (group.stats.postCount || 0) - 1);
    await group.save();

    res.json({ ok: true, message: 'Post deleted' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/groups/:id/posts/:postId/vote - Vote on poll
router.post('/:id/posts/:postId/vote', verifyToken, async (req, res) => {
  try {
    const { optionIndex } = req.body;
    const GroupPost = getGroupPostModel();
    const post = await GroupPost.findOne({ _id: req.params.postId, group: req.params.id });

    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const result = await post.votePoll(req.user.id, optionIndex);

    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    res.json({ ok: true, poll: result.poll });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
