// ============================================
// FILE: routes/church.routes.js
// Online Church Management System API
// VERSION: 1.1.0 - Added /organizations alias endpoint
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Import models
const { ChurchOrg, Soul, FoundationModule, FoundationEnrollment, ChurchEvent, AttendanceRecord } = require('../models/church.model');

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

// Helper: Check if user is admin/leader of org
async function canManageOrg(userId, orgId) {
  const org = await ChurchOrg.findById(orgId);
  if (!org) return false;
  
  const userIdStr = userId.toString();
  if (org.leader?.toString() === userIdStr) return true;
  if (org.admins?.some(a => a.toString() === userIdStr)) return true;
  if (org.assistantLeaders?.some(a => a.toString() === userIdStr)) return true;
  
  return false;
}

// ==========================================
// ==========================================
// CHURCH ORGANIZATION ROUTES
// ==========================================
// ==========================================

// ==========================================
// POST /api/church/org - Create organization
// ==========================================
router.post('/org', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, type, description, motto, parentId, contact, meetingSchedule, colorTheme, structureMode } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ ok: false, error: 'Name and type are required' });
    }
    
    // Validate type
    const validTypes = ['zone', 'church', 'fellowship', 'cell', 'biblestudy'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization type' });
    }
    
    // Generate slug
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 50);
    let slug = baseSlug;
    let counter = 1;
    while (await ChurchOrg.findOne({ slug, type })) {
      slug = `${baseSlug}-${counter++}`;
    }
    
    // Get parent info if provided
    let parent = null;
    let zone = null;
    let church = null;
    
    if (parentId) {
      parent = await ChurchOrg.findById(parentId);
      if (!parent) {
        return res.status(400).json({ ok: false, error: 'Parent organization not found' });
      }
      
      // Validate hierarchy
      const hierarchy = { zone: 0, church: 1, fellowship: 2, cell: 3, biblestudy: 4 };
      if (hierarchy[type] <= hierarchy[parent.type]) {
        return res.status(400).json({ ok: false, error: `${type} cannot be under ${parent.type}` });
      }
      
      // Set zone and church references
      zone = parent.zone || (parent.type === 'zone' ? parent._id : null);
      church = parent.church || (parent.type === 'church' ? parent._id : null);
    }
    
    // Create organization
    const org = new ChurchOrg({
      name,
      slug,
      type,
      ...(structureMode ? { structureMode } : {}),
      description,
      motto,
      parent: parentId || null,
      zone,
      church,
      leader: userId,
      admins: [userId],
      members: [{
        user: userId,
        role: type === 'zone' || type === 'church' ? 'pastor' : 'leader',
        joinedAt: new Date(),
        status: 'active'
      }],
      memberCount: 1,
      contact,
      meetingSchedule,
      colorTheme: colorTheme || 'purple',
      createdBy: userId
    });
    
    await org.save();
    
    console.log(`⛪ Created ${type}: ${name} (${slug})`);
    
    res.status(201).json({ ok: true, org });
  } catch (err) {
    console.error('Create org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/org - List organizations
// ==========================================
router.get('/org', optionalAuth, async (req, res) => {
  try {
    const { type, parentId, zoneId, churchId, page = 1, limit = 20, search } = req.query;
    
    const query = { isActive: true };
    if (type) query.type = type;
    if (parentId) query.parent = new ObjectId(parentId);
    if (zoneId) query.zone = new ObjectId(zoneId);
    if (churchId) query.church = new ObjectId(churchId);
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const orgs = await ChurchOrg.find(query)
      .populate('leader', 'name username profilePicture')
      .populate('parent', 'name type slug')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await ChurchOrg.countDocuments(query);
    
    res.json({
      ok: true,
      orgs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List orgs error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/org/my - My organizations
// ==========================================
router.get('/org/my', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const orgs = await ChurchOrg.find({
      $or: [
        { leader: userId },
        { admins: userId },
        { assistantLeaders: userId },
        { 'members.user': userId }
      ],
      isActive: true
    })
    .populate('leader', 'name username profilePicture')
    .populate('parent', 'name type slug')
    .sort({ type: 1, name: 1 });
    
    res.json({ ok: true, orgs });
  } catch (err) {
    console.error('My orgs error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/organizations - Alias for frontend compatibility
// Returns user's organizations (same as /org/my but different response format)
// ==========================================
router.get('/organizations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const organizations = await ChurchOrg.find({
      $or: [
        { leader: userId },
        { admins: userId },
        { assistantLeaders: userId },
        { 'members.user': userId }
      ],
      isActive: true
    })
    .populate('leader', 'name username profilePicture')
    .populate('parent', 'name type slug')
    .sort({ type: 1, name: 1 });
    
    res.json({ ok: true, organizations });
  } catch (err) {
    console.error('Organizations error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/org/:id - Get organization
// ==========================================
router.get('/org/:id', optionalAuth, async (req, res) => {
  try {
    const org = await ChurchOrg.findById(req.params.id)
      .populate('leader', 'name username profilePicture bio')
      .populate('assistantLeaders', 'name username profilePicture')
      .populate('parent', 'name type slug')
      .populate('members.user', 'name username profilePicture');
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Get children
    const children = await ChurchOrg.find({ parent: org._id, isActive: true })
      .populate('leader', 'name username profilePicture')
      .select('name type slug memberCount leader logo')
      .sort({ name: 1 });
    
    // Get recent stats
    const recentSouls = await Soul.countDocuments({
      $or: [{ zone: org._id }, { church: org._id }, { fellowship: org._id }, { cell: org._id }],
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    res.json({ ok: true, org, children, recentSouls });
  } catch (err) {
    console.error('Get org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/org/:id/hierarchy - Get full hierarchy
// ==========================================
router.get('/org/:id/hierarchy', optionalAuth, async (req, res) => {
  try {
    const org = await ChurchOrg.findById(req.params.id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Build hierarchy tree
    const buildTree = async (parentId, depth = 0) => {
      if (depth > 5) return []; // Prevent infinite loops
      
      const children = await ChurchOrg.find({ parent: parentId, isActive: true })
        .select('name type slug memberCount leader stats')
        .populate('leader', 'name username profilePicture')
        .sort({ type: 1, name: 1 });
      
      return Promise.all(children.map(async (child) => ({
        ...child.toObject(),
        children: await buildTree(child._id, depth + 1)
      })));
    };
    
    const hierarchy = await buildTree(org._id);
    
    res.json({ ok: true, org, hierarchy });
  } catch (err) {
    console.error('Get hierarchy error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// PUT /api/church/org/:id - Update organization
// ==========================================
router.put('/org/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    if (!await canManageOrg(userId, req.params.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized to manage this organization' });
    }
    
    const { name, description, motto, contact, meetingSchedule, socialLinks, settings, logo, coverImage, colorTheme } = req.body;
    
    const org = await ChurchOrg.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(motto !== undefined && { motto }),
          ...(contact && { contact }),
          ...(meetingSchedule && { meetingSchedule }),
          ...(socialLinks && { socialLinks }),
          ...(settings && { settings }),
          ...(logo && { logo }),
          ...(coverImage && { coverImage }),
          ...(colorTheme && { colorTheme }),
          updatedAt: new Date()
        }
      },
      { new: true }
    ).populate('leader', 'name username profilePicture');
    
    res.json({ ok: true, org });
  } catch (err) {
    console.error('Update org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/org/:id/split - Split a cell into two cells
// Rules: only for type='cell'. Creates two new child cells under same parent.
// ==========================================
router.post('/org/:id/split', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (!await canManageOrg(userId, req.params.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized to manage this organization' });
    }

    const cell = await ChurchOrg.findById(req.params.id);
    if (!cell) return res.status(404).json({ ok: false, error: 'Cell not found' });
    if (cell.type !== 'cell') {
      return res.status(400).json({ ok: false, error: 'Only cells can be split' });
    }

    const { nameA, nameB, leaderA, leaderB, deactivateOriginal = true } = req.body || {};

    // Create new cells under same parent (fellowship)
    const parentId = cell.parent;
    if (!parentId) {
      return res.status(400).json({ ok: false, error: 'Cell has no parent fellowship. Please set parent first.' });
    }

    const baseA = (nameA || `${cell.name} A`).toString();
    const baseB = (nameB || `${cell.name} B`).toString();

    const makeSlug = async (name) => {
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 50);
      let slug = base;
      let c = 1;
      while (await ChurchOrg.findOne({ slug, type: 'cell' })) slug = `${base}-${c++}`;
      return slug;
    };

    const slugA = await makeSlug(baseA);
    const slugB = await makeSlug(baseB);

    // Split members roughly in half (active members only)
    const activeMembers = (cell.members || []).filter(m => m.status === 'active');
    const half = Math.ceil(activeMembers.length / 2);
    const membersA = activeMembers.slice(0, half);
    const membersB = activeMembers.slice(half);

    const now = new Date();
    const cellA = new ChurchOrg({
      name: baseA,
      slug: slugA,
      type: 'cell',
      description: cell.description,
      motto: cell.motto,
      parent: parentId,
      zone: cell.zone,
      church: cell.church,
      fellowship: cell.fellowship || parentId,
      leader: leaderA || cell.leader,
      admins: [leaderA || cell.leader].filter(Boolean),
      assistantLeaders: [],
      members: membersA,
      memberCount: membersA.length,
      contact: cell.contact,
      meetingSchedule: cell.meetingSchedule,
      socialLinks: cell.socialLinks,
      settings: cell.settings,
      cellSettings: cell.cellSettings,
      linkedGroupId: cell.linkedGroupId,
      linkedMeetRoomId: cell.linkedMeetRoomId,
      logo: cell.logo,
      coverImage: cell.coverImage,
      bannerImage: cell.bannerImage,
      colorTheme: cell.colorTheme,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    });

    const cellB = new ChurchOrg({
      name: baseB,
      slug: slugB,
      type: 'cell',
      description: cell.description,
      motto: cell.motto,
      parent: parentId,
      zone: cell.zone,
      church: cell.church,
      fellowship: cell.fellowship || parentId,
      leader: leaderB || cell.leader,
      admins: [leaderB || cell.leader].filter(Boolean),
      assistantLeaders: [],
      members: membersB,
      memberCount: membersB.length,
      contact: cell.contact,
      meetingSchedule: cell.meetingSchedule,
      socialLinks: cell.socialLinks,
      settings: cell.settings,
      cellSettings: cell.cellSettings,
      linkedGroupId: cell.linkedGroupId,
      linkedMeetRoomId: cell.linkedMeetRoomId,
      logo: cell.logo,
      coverImage: cell.coverImage,
      bannerImage: cell.bannerImage,
      colorTheme: cell.colorTheme,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    });

    await cellA.save();
    await cellB.save();

    if (deactivateOriginal) {
      cell.isActive = false;
      cell.updatedAt = new Date();
      await cell.save();
    }

    res.json({ ok: true, message: 'Cell split successfully', originalCellId: cell._id, newCells: [cellA, cellB] });
  } catch (err) {
    console.error('Split cell error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/org/:id/ensure-tools - Create/link Group & Meet room for a cell
// ==========================================
router.post('/org/:id/ensure-tools', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (!await canManageOrg(userId, req.params.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized to manage this organization' });
    }

    const org = await ChurchOrg.findById(req.params.id);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });

    // Group
    if (!org.linkedGroupId) {
      const Group = require('../models/group.model');
      const group = await Group.create({
        name: org.name,
        description: org.description || `${org.name} group`,
        category: 'church',
        createdBy: userId,
        admins: [userId],
        members: [{ user: userId, role: 'admin', joinedAt: new Date() }],
        isPrivate: true,
        churchOrgId: org._id
      }).catch(async () => {
        // Some schemas may differ; fall back to minimal
        return await Group.create({ name: org.name, createdBy: userId });
      });
      org.linkedGroupId = group._id;
    }

    // Meeting (Jitsi)
    if (!org.linkedMeetRoomId) {
      const mongoose = require('mongoose');
      let Meeting;
      try {
        Meeting = mongoose.model('Meeting');
      } catch {
        const meetingSchema = new mongoose.Schema({
          roomId: { type: String, required: true, unique: true },
          title: { type: String, default: 'Meeting' },
          host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
          scheduledAt: Date,
          duration: { type: Number, default: 60 },
          status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'scheduled' },
          provider: { type: String, default: 'jitsi' }
        }, { timestamps: true });
        Meeting = mongoose.model('Meeting', meetingSchema);
      }

      const crypto = require('crypto');
      const roomId = crypto.randomBytes(4).toString('hex') + '-' + crypto.randomBytes(2).toString('hex') + '-' + crypto.randomBytes(2).toString('hex');
      const meeting = await Meeting.create({
        roomId,
        title: `${org.name} Meeting`,
        host: userId,
        status: 'scheduled',
        provider: 'jitsi'
      });
      org.linkedMeetRoomId = meeting._id;
    }

    org.updatedAt = new Date();
    await org.save();

    res.json({
      ok: true,
      org,
      groupId: org.linkedGroupId,
      meetingId: org.linkedMeetRoomId
    });
  } catch (err) {
    console.error('Ensure tools error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/org/:id/join - Request to join
// ==========================================
router.post('/org/:id/join', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const org = await ChurchOrg.findById(req.params.id);
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Check if already member
    if (org.members.some(m => m.user.toString() === userId.toString())) {
      return res.status(400).json({ ok: false, error: 'Already a member' });
    }
    
    // Add as member
    org.members.push({
      user: userId,
      role: 'member',
      joinedAt: new Date(),
      status: org.settings.requireApproval ? 'pending' : 'active'
    });
    org.memberCount = org.members.filter(m => m.status === 'active').length;
    
    await org.save();
    
    res.json({ ok: true, message: org.settings.requireApproval ? 'Join request sent' : 'Joined successfully' });
  } catch (err) {
    console.error('Join org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/org/:id/members - Add member
// ==========================================
router.post('/org/:id/members', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    if (!await canManageOrg(userId, req.params.id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const { memberId, role = 'member' } = req.body;
    
    const org = await ChurchOrg.findById(req.params.id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Check if already member
    const existingIdx = org.members.findIndex(m => m.user.toString() === memberId);
    if (existingIdx >= 0) {
      // Update role
      org.members[existingIdx].role = role;
      org.members[existingIdx].status = 'active';
    } else {
      // Add new member
      org.members.push({
        user: memberId,
        role,
        joinedAt: new Date(),
        status: 'active'
      });
    }
    
    org.memberCount = org.members.filter(m => m.status === 'active').length;
    await org.save();
    
    res.json({ ok: true, memberCount: org.memberCount });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ==========================================
// SOUL TRACKER ROUTES
// ==========================================
// ==========================================

// ==========================================
// POST /api/church/souls - Add new soul
// ==========================================
router.post('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const {
      firstName, lastName, phone, email, address, city,
      gender, ageGroup, salvationType, howTheyHeard,
      zoneId, churchId, fellowshipId, cellId,
      notes, prayerRequests
    } = req.body;
    
    if (!firstName || !phone) {
      return res.status(400).json({ ok: false, error: 'First name and phone are required' });
    }
    
    // Check for duplicate phone
    const existing = await Soul.findOne({ phone, church: churchId });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Phone number already registered' });
    }
    
    const soul = new Soul({
      firstName,
      lastName,
      phone,
      email,
      address,
      city,
      gender,
      ageGroup,
      salvationType: salvationType || 'first_time',
      howTheyHeard,
      zone: zoneId,
      church: churchId,
      fellowship: fellowshipId,
      cell: cellId,
      assignedTo: userId,
      witnessedBy: userId,
      notes,
      prayerRequests,
      status: 'new',
      createdBy: userId
    });
    
    await soul.save();

    // Auto-enroll new soul into Foundation School (if enabled and an active batch exists)
    try {
      if (churchId) {
        const church = await ChurchOrg.findById(churchId).select('settings enableFoundationSchool');
        const enabled = church?.settings?.enableFoundationSchool !== false;
        if (enabled) {
          const { FSBatch } = require('../models/church.model');
          const activeBatch = await FSBatch.findOne({
            organization: churchId,
            status: { $in: ['registration_open', 'in_progress'] }
          }).sort({ startDate: -1 });

          if (activeBatch) {
            // Create enrollment tied to soul (legacy flow)
            const existingEnroll = await FoundationEnrollment.findOne({ soul: soul._id, status: { $ne: 'withdrawn' } });
            if (!existingEnroll) {
              const enrollment = new FoundationEnrollment({
                soul: soul._id,
                church: churchId,
                organization: churchId,
                batch: activeBatch._id,
                status: 'enrolled'
              });
              await enrollment.save();
              await Soul.findByIdAndUpdate(soul._id, {
                status: 'foundation_school',
                'foundationSchool.enrolled': true,
                'foundationSchool.enrolledAt': new Date()
              });
            }
          }
        }
      }
    } catch (e) {
      // Best-effort; never block soul creation
      console.warn('Auto-enroll soul failed:', e?.message || e);
    }
    
    // Update org stats
    if (churchId) {
      await ChurchOrg.findByIdAndUpdate(churchId, { $inc: { 'stats.totalSouls': 1 } });
    }
    
    console.log(`🙏 New soul added: ${firstName} ${lastName || ''}`);
    
    res.status(201).json({ ok: true, soul });
  } catch (err) {
    console.error('Add soul error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/souls - List souls
// ==========================================
router.get('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { orgId, status, assignedTo, startDate, endDate, page = 1, limit = 20, search } = req.query;
    
    const query = {};
    
    if (orgId) {
      query.$or = [
        { zone: new ObjectId(orgId) },
        { church: new ObjectId(orgId) },
        { fellowship: new ObjectId(orgId) },
        { cell: new ObjectId(orgId) }
      ];
    }
    
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = new ObjectId(assignedTo);
    
    if (startDate || endDate) {
      query.salvationDate = {};
      if (startDate) query.salvationDate.$gte = new Date(startDate);
      if (endDate) query.salvationDate.$lte = new Date(endDate);
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const souls = await Soul.find(query)
      .populate('assignedTo', 'name username profilePicture')
      .populate('church', 'name slug')
      .populate('cell', 'name slug')
      .sort({ salvationDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Soul.countDocuments(query);
    
    // Get status breakdown
    const statusBreakdown = await Soul.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({
      ok: true,
      souls,
      statusBreakdown: Object.fromEntries(statusBreakdown.map(s => [s._id, s.count])),
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List souls error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/souls/:id - Get soul details
// ==========================================
router.get('/souls/:id', verifyToken, async (req, res) => {
  try {
    const soul = await Soul.findById(req.params.id)
      .populate('assignedTo', 'name username profilePicture phone')
      .populate('witnessedBy', 'name username profilePicture')
      .populate('church', 'name slug type')
      .populate('cell', 'name slug type')
      .populate('followUps.followedUpBy', 'name username profilePicture');
    
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    res.json({ ok: true, soul });
  } catch (err) {
    console.error('Get soul error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// PUT /api/church/souls/:id - Update soul
// ==========================================
router.put('/souls/:id', verifyToken, async (req, res) => {
  try {
    const soul = await Soul.findByIdAndUpdate(
      req.params.id,
      { $set: { ...req.body, updatedAt: new Date() } },
      { new: true }
    );
    
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    res.json({ ok: true, soul });
  } catch (err) {
    console.error('Update soul error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/souls/:id/followup - Add follow-up
// ==========================================
router.post('/souls/:id/followup', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { type, notes, outcome, nextFollowUpDate } = req.body;
    
    const soul = await Soul.findById(req.params.id);
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    soul.followUps.push({
      date: new Date(),
      type,
      notes,
      outcome,
      followedUpBy: userId,
      nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null
    });
    
    // Update status based on outcome
    if (outcome === 'successful') {
      if (soul.status === 'new') soul.status = 'contacted';
      else if (soul.status === 'contacted') soul.status = 'followup';
    }
    
    soul.updatedAt = new Date();
    await soul.save();
    
    res.json({ ok: true, soul });
  } catch (err) {
    console.error('Add followup error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/souls/stats/:orgId - Soul statistics
// ==========================================
router.get('/souls/stats/:orgId', verifyToken, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;
    
    const dateQuery = {};
    if (startDate) dateQuery.$gte = new Date(startDate);
    if (endDate) dateQuery.$lte = new Date(endDate);
    
    const matchQuery = {
      $or: [
        { zone: new ObjectId(orgId) },
        { church: new ObjectId(orgId) },
        { fellowship: new ObjectId(orgId) },
        { cell: new ObjectId(orgId) }
      ]
    };
    
    if (Object.keys(dateQuery).length) {
      matchQuery.salvationDate = dateQuery;
    }
    
    const stats = await Soul.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
          contacted: { $sum: { $cond: [{ $eq: ['$status', 'contacted'] }, 1, 0] } },
          followup: { $sum: { $cond: [{ $eq: ['$status', 'followup'] }, 1, 0] } },
          attending: { $sum: { $cond: [{ $eq: ['$status', 'attending'] }, 1, 0] } },
          member: { $sum: { $cond: [{ $eq: ['$status', 'member'] }, 1, 0] } },
          foundationSchool: { $sum: { $cond: [{ $eq: ['$status', 'foundation_school'] }, 1, 0] } },
          graduated: { $sum: { $cond: [{ $eq: ['$status', 'graduated'] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          male: { $sum: { $cond: [{ $eq: ['$gender', 'male'] }, 1, 0] } },
          female: { $sum: { $cond: [{ $eq: ['$gender', 'female'] }, 1, 0] } }
        }
      }
    ]);
    
    // Weekly trend
    const weeklyTrend = await Soul.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%W', date: '$salvationDate' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 12 }
    ]);
    
    res.json({
      ok: true,
      stats: stats[0] || { total: 0 },
      weeklyTrend: weeklyTrend.reverse()
    });
  } catch (err) {
    console.error('Soul stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ==========================================
// FOUNDATION SCHOOL ROUTES
// ==========================================
// ==========================================

// ==========================================
// GET /api/church/foundation/modules - List modules
// ==========================================
router.get('/foundation/modules', async (req, res) => {
  try {
    const modules = await FoundationModule.find({ isActive: true })
      .sort({ moduleNumber: 1 });
    
    res.json({ ok: true, modules });
  } catch (err) {
    console.error('List modules error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/foundation/enroll - Enroll in Foundation School
// ==========================================
router.post('/foundation/enroll', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { soulId, churchId, mentorId } = req.body;
    
    // Check if already enrolled
    const existing = await FoundationEnrollment.findOne({
      $or: [{ soul: soulId }, { user: userId }],
      status: { $in: ['enrolled', 'in_progress'] }
    });
    
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Already enrolled in Foundation School' });
    }
    
    const enrollment = new FoundationEnrollment({
      soul: soulId,
      user: userId,
      church: churchId,
      mentor: mentorId,
      status: 'enrolled'
    });
    
    await enrollment.save();
    
    // Update soul status
    if (soulId) {
      await Soul.findByIdAndUpdate(soulId, {
        status: 'foundation_school',
        'foundationSchool.enrolled': true,
        'foundationSchool.enrolledAt': new Date()
      });
    }
    
    res.status(201).json({ ok: true, enrollment });
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/foundation/progress - Get my progress
// ==========================================
router.get('/foundation/progress', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const enrollment = await FoundationEnrollment.findOne({
      user: userId,
      status: { $in: ['enrolled', 'in_progress'] }
    })
    .populate('church', 'name slug')
    .populate('mentor', 'name username profilePicture');
    
    if (!enrollment) {
      return res.json({ ok: true, enrollment: null });
    }
    
    const modules = await FoundationModule.find({ isActive: true }).sort({ moduleNumber: 1 });
    
    res.json({ ok: true, enrollment, modules });
  } catch (err) {
    console.error('Get progress error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/foundation/complete-module - Complete a module
// ==========================================
router.post('/foundation/complete-module', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { moduleNumber, quizScore } = req.body;
    
    const enrollment = await FoundationEnrollment.findOne({
      user: userId,
      status: { $in: ['enrolled', 'in_progress'] }
    });
    
    if (!enrollment) {
      return res.status(404).json({ ok: false, error: 'Not enrolled in Foundation School' });
    }
    
    const module = await FoundationModule.findOne({ moduleNumber });
    if (!module) {
      return res.status(404).json({ ok: false, error: 'Module not found' });
    }
    
    const passed = quizScore >= module.passingScore;
    
    // Update module progress
    const existingIdx = enrollment.moduleProgress.findIndex(p => p.moduleNumber === moduleNumber);
    if (existingIdx >= 0) {
      enrollment.moduleProgress[existingIdx].quizScore = quizScore;
      enrollment.moduleProgress[existingIdx].quizAttempts += 1;
      enrollment.moduleProgress[existingIdx].passed = passed;
      if (passed) enrollment.moduleProgress[existingIdx].completedAt = new Date();
    } else {
      enrollment.moduleProgress.push({
        moduleNumber,
        startedAt: new Date(),
        completedAt: passed ? new Date() : null,
        quizScore,
        quizAttempts: 1,
        passed
      });
    }
    
    // Update current module
    if (passed) {
      enrollment.currentModule = moduleNumber + 1;
      enrollment.status = 'in_progress';
    }
    
    // Check if completed all modules
    const totalModules = await FoundationModule.countDocuments({ isActive: true, isRequired: true });
    const completedModules = enrollment.moduleProgress.filter(p => p.passed).length;
    
    if (completedModules >= totalModules) {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
    }
    
    enrollment.updatedAt = new Date();
    await enrollment.save();
    
    res.json({
      ok: true,
      passed,
      quizScore,
      completedModules,
      totalModules,
      isCompleted: enrollment.status === 'completed'
    });
  } catch (err) {
    console.error('Complete module error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/foundation/graduate - Graduate from Foundation School
// ==========================================
router.post('/foundation/graduate/:enrollmentId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const enrollment = await FoundationEnrollment.findById(req.params.enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    }
    
    if (enrollment.status !== 'completed') {
      return res.status(400).json({ ok: false, error: 'Must complete all modules first' });
    }
    
    // Generate certificate number
    const certNumber = `CYBEV-FS-${Date.now().toString(36).toUpperCase()}`;
    
    enrollment.status = 'graduated';
    enrollment.graduatedAt = new Date();
    enrollment.certificateNumber = certNumber;
    await enrollment.save();
    
    // Update soul
    if (enrollment.soul) {
      await Soul.findByIdAndUpdate(enrollment.soul, {
        status: 'graduated',
        'foundationSchool.graduated': true,
        'foundationSchool.graduatedAt': new Date()
      });
    }
    
    // Update church stats
    if (enrollment.church) {
      await ChurchOrg.findByIdAndUpdate(enrollment.church, {
        $inc: { 'stats.foundationSchoolGraduates': 1 }
      });
    }
    
    res.json({
      ok: true,
      certificateNumber: certNumber,
      graduatedAt: enrollment.graduatedAt
    });
  } catch (err) {
    console.error('Graduate error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ==========================================
// EVENTS & ATTENDANCE ROUTES
// ==========================================
// ==========================================

// ==========================================
// POST /api/church/events - Create event
// ==========================================
router.post('/events', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { title, description, type, organizationId, startDate, endDate, isOnline, location, streamUrl, isPublic } = req.body;
    
    if (!title || !organizationId || !startDate) {
      return res.status(400).json({ ok: false, error: 'Title, organization, and start date are required' });
    }
    
    const event = new ChurchEvent({
      title,
      description,
      type: type || 'service',
      organization: organizationId,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      isOnline,
      location,
      streamUrl,
      isPublic: isPublic !== false,
      createdBy: userId
    });
    
    await event.save();
    
    res.status(201).json({ ok: true, event });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/events - List events
// ==========================================
router.get('/events', optionalAuth, async (req, res) => {
  try {
    const { orgId, type, upcoming, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (orgId) query.organization = new ObjectId(orgId);
    if (type) query.type = type;
    if (upcoming === 'true') query.startDate = { $gte: new Date() };
    
    const events = await ChurchEvent.find(query)
      .populate('organization', 'name slug type')
      .sort({ startDate: upcoming === 'true' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await ChurchEvent.countDocuments(query);
    
    res.json({
      ok: true,
      events,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List events error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/attendance - Record attendance
// ==========================================
router.post('/attendance', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { organizationId, eventId, date, serviceType, totalAttendance, members, visitors, firstTimers, children, online, soulsWon, notes } = req.body;
    
    if (!organizationId || !date) {
      return res.status(400).json({ ok: false, error: 'Organization and date are required' });
    }
    
    const record = new AttendanceRecord({
      organization: organizationId,
      event: eventId,
      date: new Date(date),
      serviceType,
      totalAttendance: totalAttendance || (members + visitors + firstTimers + children),
      members: members || 0,
      visitors: visitors || 0,
      firstTimers: firstTimers || 0,
      children: children || 0,
      online: online || 0,
      soulsWon: soulsWon || 0,
      notes,
      recordedBy: userId
    });
    
    await record.save();
    
    // Update org stats
    await ChurchOrg.findByIdAndUpdate(organizationId, {
      'stats.avgAttendance': totalAttendance,
      $inc: { 'stats.totalSouls': soulsWon || 0 }
    });
    
    res.status(201).json({ ok: true, record });
  } catch (err) {
    console.error('Record attendance error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/attendance/stats/:orgId - Attendance statistics
// ==========================================
router.get('/attendance/stats/:orgId', verifyToken, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;
    
    const matchQuery = { organization: new ObjectId(orgId) };
    
    if (startDate || endDate) {
      matchQuery.date = {};
      if (startDate) matchQuery.date.$gte = new Date(startDate);
      if (endDate) matchQuery.date.$lte = new Date(endDate);
    }
    
    const stats = await AttendanceRecord.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalServices: { $sum: 1 },
          avgAttendance: { $avg: '$totalAttendance' },
          totalSoulsWon: { $sum: '$soulsWon' },
          totalFirstTimers: { $sum: '$firstTimers' },
          highestAttendance: { $max: '$totalAttendance' },
          totalMembers: { $avg: '$members' },
          totalOnline: { $sum: '$online' }
        }
      }
    ]);
    
    // Weekly trend
    const weeklyTrend = await AttendanceRecord.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%W', date: '$date' } },
          avgAttendance: { $avg: '$totalAttendance' },
          soulsWon: { $sum: '$soulsWon' }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 12 }
    ]);
    
    res.json({
      ok: true,
      stats: stats[0] || { totalServices: 0, avgAttendance: 0, totalSoulsWon: 0 },
      weeklyTrend: weeklyTrend.reverse()
    });
  } catch (err) {
    console.error('Attendance stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('⛪ Church Management routes loaded');

module.exports = router;
