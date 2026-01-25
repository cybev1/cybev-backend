// ============================================
// FILE: routes/church.routes.js
// Online Church Management System API
// VERSION: 2.0.0 - Fixed Routes + Authorization
// FIXES:
//   - Added /organizations/* aliases (frontend compatibility)
//   - Route ordering: /create, /my before /:id
//   - Authorization: Members vs Owners/Admins
//   - Role-based access control
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

// ==========================================
// AUTHORIZATION HELPERS
// ==========================================

// Check if user is owner/admin of org
async function isOwnerOrAdmin(userId, orgId) {
  if (!userId || !orgId) return false;
  
  const org = await ChurchOrg.findById(orgId);
  if (!org) return false;
  
  const userIdStr = userId.toString();
  
  if (org.leader?.toString() === userIdStr) return true;
  if (org.createdBy?.toString() === userIdStr) return true;
  if (org.admins?.some(a => a.toString() === userIdStr)) return true;
  if (org.assistantLeaders?.some(a => a.toString() === userIdStr)) return true;
  
  return false;
}

// Get user's role in organization
async function getUserRole(userId, orgId) {
  if (!userId || !orgId) return null;
  
  const org = await ChurchOrg.findById(orgId);
  if (!org) return null;
  
  const userIdStr = userId.toString();
  
  if (org.leader?.toString() === userIdStr) return 'owner';
  if (org.createdBy?.toString() === userIdStr) return 'owner';
  if (org.admins?.some(a => a.toString() === userIdStr)) return 'admin';
  if (org.assistantLeaders?.some(a => a.toString() === userIdStr)) return 'assistant';
  
  const member = org.members?.find(m => m.user?.toString() === userIdStr);
  if (member) return member.role || 'member';
  
  return null;
}

const canManageOrg = isOwnerOrAdmin;

// ==========================================
// ORGANIZATION ROUTES - SPECIFIC FIRST!
// Order: /create, /my, then /:id
// ==========================================

// GET /organizations/create - Must be BEFORE /:id
router.get('/organizations/create', verifyToken, (req, res) => {
  res.json({ 
    ok: true, 
    message: 'Use POST to create organization',
    validTypes: ['zone', 'church', 'fellowship', 'cell', 'biblestudy']
  });
});

// GET /organizations/my - Must be BEFORE /:id  
router.get('/organizations/my', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    
    const orgs = await ChurchOrg.find({
      $or: [
        { leader: userId },
        { admins: userId },
        { assistantLeaders: userId },
        { createdBy: userId },
        { 'members.user': userId }
      ],
      isActive: true
    })
    .populate('leader', 'name username profilePicture')
    .populate('parent', 'name type slug')
    .sort({ type: 1, name: 1 });
    
    const orgsWithRole = await Promise.all(orgs.map(async (org) => {
      const role = await getUserRole(userId, org._id);
      return {
        ...org.toObject(),
        userRole: role,
        canManage: ['owner', 'admin', 'assistant'].includes(role)
      };
    }));
    
    res.json({ ok: true, orgs: orgsWithRole, organizations: orgsWithRole });
  } catch (err) {
    console.error('My orgs error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /organizations - Create
router.post('/organizations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { name, type, description, motto, parentId, contact, meetingSchedule, colorTheme, structureMode } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ ok: false, error: 'Name and type are required' });
    }
    
    const validTypes = ['zone', 'church', 'fellowship', 'cell', 'biblestudy'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization type' });
    }
    
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 50);
    let slug = baseSlug;
    let counter = 1;
    while (await ChurchOrg.findOne({ slug, type })) {
      slug = `${baseSlug}-${counter++}`;
    }
    
    let zone = null, church = null;
    
    if (parentId) {
      const parent = await ChurchOrg.findById(parentId);
      if (!parent) {
        return res.status(400).json({ ok: false, error: 'Parent organization not found' });
      }
      
      const hierarchy = { zone: 0, church: 1, fellowship: 2, cell: 3, biblestudy: 4 };
      if (hierarchy[type] <= hierarchy[parent.type]) {
        return res.status(400).json({ ok: false, error: `${type} cannot be under ${parent.type}` });
      }
      
      zone = parent.zone || (parent.type === 'zone' ? parent._id : null);
      church = parent.church || (parent.type === 'church' ? parent._id : null);
    }
    
    const org = new ChurchOrg({
      name, slug, type,
      ...(structureMode ? { structureMode } : {}),
      description, motto,
      parent: parentId || null,
      zone, church,
      leader: userId,
      admins: [userId],
      members: [{
        user: userId,
        role: type === 'zone' || type === 'church' ? 'pastor' : 'leader',
        joinedAt: new Date(),
        status: 'active'
      }],
      memberCount: 1,
      contact, meetingSchedule,
      colorTheme: colorTheme || 'purple',
      createdBy: userId
    });
    
    await org.save();
    console.log(`⛪ Created ${type}: ${name} by user ${userId}`);
    
    res.status(201).json({ ok: true, org, organization: org });
  } catch (err) {
    console.error('Create org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /organizations - List all
router.get('/organizations', optionalAuth, async (req, res) => {
  try {
    const { type, parentId, zoneId, churchId, page = 1, limit = 20, search } = req.query;
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    
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
    
    let orgsWithRole = orgs.map(o => o.toObject());
    if (userId) {
      orgsWithRole = await Promise.all(orgs.map(async (org) => {
        const role = await getUserRole(userId, org._id);
        return { ...org.toObject(), userRole: role, canManage: ['owner', 'admin', 'assistant'].includes(role) };
      }));
    }
    
    res.json({
      ok: true,
      orgs: orgsWithRole,
      organizations: orgsWithRole,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List orgs error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /organizations/:id - Single org (MUST BE LAST of GET routes)
router.get('/organizations/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    }
    
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    
    const org = await ChurchOrg.findById(id)
      .populate('leader', 'name username profilePicture bio')
      .populate('assistantLeaders', 'name username profilePicture')
      .populate('parent', 'name type slug')
      .populate('members.user', 'name username profilePicture');
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    let userRole = null, canManage = false;
    if (userId) {
      userRole = await getUserRole(userId, org._id);
      canManage = ['owner', 'admin', 'assistant'].includes(userRole);
    }
    
    const children = await ChurchOrg.find({ parent: org._id, isActive: true })
      .populate('leader', 'name username profilePicture')
      .select('name type slug memberCount leader logo')
      .sort({ name: 1 });
    
    const recentSouls = await Soul.countDocuments({
      $or: [{ zone: org._id }, { church: org._id }, { fellowship: org._id }, { cell: org._id }],
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    const orgData = org.toObject();
    
    // Hide sensitive data for non-managers
    if (userRole && !canManage) {
      delete orgData.admins;
      if (orgData.members) {
        orgData.members = orgData.members.map(m => ({
          user: m.user,
          role: m.role,
          joinedAt: m.joinedAt
        }));
      }
    }
    
    res.json({
      ok: true,
      org: { ...orgData, userRole, canManage },
      organization: { ...orgData, userRole, canManage },
      children,
      recentSouls,
      userRole,
      canManage,
      permissions: {
        canEdit: canManage,
        canDelete: userRole === 'owner',
        canAddMembers: canManage,
        canRemoveMembers: canManage,
        canViewAnalytics: canManage,
        canCreateSubOrg: canManage,
        isOwner: userRole === 'owner',
        isAdmin: ['owner', 'admin'].includes(userRole),
        isMember: userRole !== null
      }
    });
  } catch (err) {
    console.error('Get org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /organizations/:id - Update (requires owner/admin)
router.put('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Not authorized', yourRole: userRole });
    }
    
    const { name, description, motto, contact, meetingSchedule, socialLinks, settings, logo, coverImage, colorTheme } = req.body;
    
    const org = await ChurchOrg.findByIdAndUpdate(id, {
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
    }, { new: true }).populate('leader', 'name username profilePicture');
    
    res.json({ ok: true, org, organization: org });
  } catch (err) {
    console.error('Update org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /organizations/:id - Delete (owner only)
router.delete('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    
    const org = await ChurchOrg.findById(id);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    
    const isOwner = org.leader?.toString() === userId.toString() || org.createdBy?.toString() === userId.toString();
    if (!isOwner) {
      return res.status(403).json({ ok: false, error: 'Only the owner can delete' });
    }
    
    await ChurchOrg.findByIdAndUpdate(id, { isActive: false, deletedAt: new Date() });
    res.json({ ok: true, message: 'Organization deleted' });
  } catch (err) {
    console.error('Delete org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// LEGACY /org/* ROUTES
// ==========================================

router.get('/org/my', verifyToken, async (req, res) => {
  req.url = '/organizations/my';
  return router.handle(req, res);
});

router.get('/org/create', verifyToken, (req, res) => {
  res.json({ ok: true, message: 'Use POST', validTypes: ['zone', 'church', 'fellowship', 'cell', 'biblestudy'] });
});

router.post('/org', verifyToken, async (req, res) => {
  req.url = '/organizations';
  return router.handle(req, res);
});

router.get('/org', optionalAuth, async (req, res) => {
  const { type, parentId, page = 1, limit = 20, search } = req.query;
  const query = { isActive: true };
  if (type) query.type = type;
  if (parentId) query.parent = new ObjectId(parentId);
  if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }];
  
  const orgs = await ChurchOrg.find(query).populate('leader', 'name username profilePicture').sort({ name: 1 }).skip((page - 1) * limit).limit(parseInt(limit));
  const total = await ChurchOrg.countDocuments(query);
  res.json({ ok: true, orgs, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
});

router.get('/org/:id', optionalAuth, async (req, res) => {
  try {
    const org = await ChurchOrg.findById(req.params.id)
      .populate('leader', 'name username profilePicture')
      .populate('parent', 'name type slug');
    if (!org) return res.status(404).json({ ok: false, error: 'Not found' });
    
    const children = await ChurchOrg.find({ parent: org._id, isActive: true }).select('name type slug memberCount');
    res.json({ ok: true, org, children });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/org/:id', verifyToken, async (req, res) => {
  const userId = req.user.id || req.user._id;
  if (!await canManageOrg(userId, req.params.id)) {
    return res.status(403).json({ ok: false, error: 'Not authorized' });
  }
  const { name, description } = req.body;
  const org = await ChurchOrg.findByIdAndUpdate(req.params.id, { $set: { name, description, updatedAt: new Date() } }, { new: true });
  res.json({ ok: true, org });
});

// ==========================================
// SOULS ROUTES
// ==========================================

router.get('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { zoneId, churchId, fellowshipId, cellId, status, page = 1, limit = 20, search } = req.query;
    
    const query = {};
    if (zoneId) query.zone = new ObjectId(zoneId);
    if (churchId) query.church = new ObjectId(churchId);
    if (fellowshipId) query.fellowship = new ObjectId(fellowshipId);
    if (cellId) query.cell = new ObjectId(cellId);
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (!zoneId && !churchId && !fellowshipId && !cellId) {
      const userOrgs = await ChurchOrg.find({
        $or: [{ leader: userId }, { admins: userId }, { assistantLeaders: userId }, { createdBy: userId }],
        isActive: true
      }).select('_id');
      const orgIds = userOrgs.map(o => o._id);
      query.$or = [
        { zone: { $in: orgIds } },
        { church: { $in: orgIds } },
        { fellowship: { $in: orgIds } },
        { cell: { $in: orgIds } },
        { addedBy: userId }
      ];
    }
    
    const souls = await Soul.find(query)
      .populate('zone', 'name type')
      .populate('church', 'name type')
      .populate('fellowship', 'name type')
      .populate('cell', 'name type')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Soul.countDocuments(query);
    res.json({ ok: true, souls, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { firstName, lastName, email, phone, address, city, country, zoneId, churchId, fellowshipId, cellId, source, notes } = req.body;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ ok: false, error: 'First name and last name required' });
    }
    
    const soul = new Soul({
      firstName, lastName, email, phone,
      address: { street: address, city, country },
      zone: zoneId, church: churchId, fellowship: fellowshipId, cell: cellId,
      source: source || 'manual',
      notes,
      addedBy: userId,
      status: 'new'
    });
    
    await soul.save();
    console.log(`🙏 Soul added: ${firstName} ${lastName}`);
    res.status(201).json({ ok: true, soul });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// EVENTS & ATTENDANCE
// ==========================================

router.post('/events', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { title, organizationId, startDate } = req.body;
    
    if (!title || !organizationId || !startDate) {
      return res.status(400).json({ ok: false, error: 'Title, organization, and start date required' });
    }
    
    if (!await canManageOrg(userId, organizationId)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const event = new ChurchEvent({ ...req.body, organization: organizationId, createdBy: userId });
    await event.save();
    res.status(201).json({ ok: true, event });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/events', optionalAuth, async (req, res) => {
  try {
    const { orgId, type, upcoming, page = 1, limit = 20 } = req.query;
    const query = {};
    if (orgId) query.organization = new ObjectId(orgId);
    if (type) query.type = type;
    if (upcoming === 'true') query.startDate = { $gte: new Date() };
    
    const events = await ChurchEvent.find(query).populate('organization', 'name slug type').sort({ startDate: upcoming === 'true' ? 1 : -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await ChurchEvent.countDocuments(query);
    res.json({ ok: true, events, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/attendance', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { organizationId, date, totalAttendance, members, visitors, firstTimers, children, online, soulsWon, notes } = req.body;
    
    if (!organizationId || !date) {
      return res.status(400).json({ ok: false, error: 'Organization and date required' });
    }
    
    if (!await canManageOrg(userId, organizationId)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const record = new AttendanceRecord({
      organization: organizationId,
      date: new Date(date),
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
    res.status(201).json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('⛪ Church Management routes v2.0.0 loaded - with /organizations/* routes');

module.exports = router;
