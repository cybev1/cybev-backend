// ============================================
// FILE: routes/church.routes.js
// Online Church Management System API
// VERSION: 2.4.0 - ALL orgs available as parents
// FIXES:
//   - /organizations/available-parents shows ALL active orgs
//   - Create page can select ANY existing org as parent
//   - Dashboard shows only user's orgs (or all for admins)
//   - ObjectId vs string comparison fixed
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
  
  // Check leader - handle both ObjectId and populated object
  const leaderId = org.leader?._id?.toString() || org.leader?.toString();
  if (leaderId === userIdStr) return 'owner';
  
  // Check createdBy
  const createdById = org.createdBy?._id?.toString() || org.createdBy?.toString();
  if (createdById === userIdStr) return 'owner';
  
  // Check owner field (some orgs might use this)
  const ownerId = org.owner?._id?.toString() || org.owner?.toString();
  if (ownerId === userIdStr) return 'owner';
  
  // Check admins array
  if (org.admins?.some(a => {
    const adminId = a?._id?.toString() || a?.toString();
    return adminId === userIdStr;
  })) return 'admin';
  
  // Check assistant leaders
  if (org.assistantLeaders?.some(a => {
    const assistId = a?._id?.toString() || a?.toString();
    return assistId === userIdStr;
  })) return 'assistant';
  
  // Check members array
  const member = org.members?.find(m => {
    const memberId = m.user?._id?.toString() || m.user?.toString();
    return memberId === userIdStr;
  });
  if (member) return member.role || 'member';
  
  return null;
}

const canManageOrg = isOwnerOrAdmin;

// ==========================================
// ORGANIZATION ROUTES - SPECIFIC FIRST!
// Order: /create, /my, then /:id
// ==========================================

// GET /organizations/create - Return form data for create page
// MUST be before /:id to not be caught by it
router.get('/organizations/create', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    
    // Get ALL active organizations that can be parents (not just user's own)
    // This allows users to create organizations under existing ones
    const allOrgs = await ChurchOrg.find({ isActive: true })
      .select('_id name type slug leader')
      .populate('leader', 'name username')
      .sort({ type: 1, name: 1 });
    
    // Valid organization types with hierarchy info
    const validTypes = [
      { value: 'zone', label: 'Zone', level: 0, canBeParentOf: ['church', 'fellowship', 'cell', 'biblestudy'] },
      { value: 'church', label: 'Church', level: 1, canBeParentOf: ['fellowship', 'cell', 'biblestudy'] },
      { value: 'fellowship', label: 'Fellowship', level: 2, canBeParentOf: ['cell', 'biblestudy'] },
      { value: 'cell', label: 'Cell', level: 3, canBeParentOf: ['biblestudy'] },
      { value: 'biblestudy', label: 'Bible Study', level: 4, canBeParentOf: [] }
    ];
    
    // Color themes available
    const colorThemes = ['purple', 'blue', 'green', 'red', 'orange', 'pink', 'teal', 'indigo'];
    
    // Return a placeholder org object so frontend doesn't show "not found"
    const placeholderOrg = {
      _id: 'create',
      name: '',
      type: 'church',
      description: '',
      isCreateMode: true,
      colorTheme: 'purple'
    };
    
    res.json({ 
      ok: true,
      // Include placeholder org so frontend doesn't show "not found"
      org: placeholderOrg,
      organization: placeholderOrg,
      isCreateMode: true,
      isNew: true,
      formData: {
        validTypes,
        parentOptions: allOrgs, // ALL organizations, not just user's
        colorThemes,
        defaults: {
          type: 'church',
          colorTheme: 'purple'
        }
      },
      validTypes: validTypes.map(t => t.value),
      parentOrganizations: allOrgs, // ALL organizations available as parents
      // Permissions for create page
      permissions: {
        canEdit: true,
        canCreate: true
      }
    });
  } catch (err) {
    console.error('Get create form error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /organizations/available-parents - List ALL organizations available as parents
// This is used by the create form to show all orgs users can build under
router.get('/organizations/available-parents', verifyToken, async (req, res) => {
  try {
    const { type } = req.query; // Optional: filter by type
    
    const query = { isActive: { $ne: false } }; // Include orgs without isActive field
    if (type) query.type = type;
    
    const orgs = await ChurchOrg.find(query)
      .select('_id name type slug leader memberCount parent zone church')
      .populate('leader', 'name username')
      .sort({ type: 1, name: 1 });
    
    // Group by type for easier frontend consumption
    const grouped = {
      zones: orgs.filter(o => o.type === 'zone'),
      churches: orgs.filter(o => o.type === 'church'),
      fellowships: orgs.filter(o => o.type === 'fellowship'),
      cells: orgs.filter(o => o.type === 'cell'),
      biblestudies: orgs.filter(o => o.type === 'biblestudy')
    };
    
    console.log(`📋 Available parents: ${orgs.length} organizations`);
    
    res.json({ 
      ok: true, 
      organizations: orgs,
      grouped,
      total: orgs.length
    });
  } catch (err) {
    console.error('Get available parents error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /org/create - Legacy route (same as above)
router.get('/org/create', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    
    // Get ALL active organizations (not just user's own)
    const allOrgs = await ChurchOrg.find({ isActive: true })
      .select('_id name type slug leader')
      .populate('leader', 'name username')
      .sort({ type: 1, name: 1 });
    
    const validTypes = [
      { value: 'zone', label: 'Zone', level: 0 },
      { value: 'church', label: 'Church', level: 1 },
      { value: 'fellowship', label: 'Fellowship', level: 2 },
      { value: 'cell', label: 'Cell', level: 3 },
      { value: 'biblestudy', label: 'Bible Study', level: 4 }
    ];
    
    const placeholderOrg = {
      _id: 'create',
      name: '',
      type: 'church',
      description: '',
      isCreateMode: true,
      colorTheme: 'purple'
    };
    
    res.json({ 
      ok: true,
      org: placeholderOrg,
      organization: placeholderOrg,
      isCreateMode: true,
      isNew: true,
      formData: {
        validTypes,
        parentOptions: allOrgs,
        colorThemes: ['purple', 'blue', 'green', 'red', 'orange', 'pink', 'teal', 'indigo']
      },
      validTypes: validTypes.map(t => t.value),
      parentOrganizations: allOrgs,
      permissions: { canEdit: true, canCreate: true }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /organizations/my - Must be BEFORE /:id  
router.get('/organizations/my', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin;
    
    // Convert userId to ObjectId for proper comparison
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (e) {
      userObjectId = userId;
    }
    
    // Base: isActive true OR not set (backward compatibility with old data)
    let query;
    
    // Admin users can see all organizations
    if (isAdmin) {
      console.log('👑 Admin user - showing all organizations in /my');
      query = { $or: [{ isActive: true }, { isActive: { $exists: false } }] };
    } else {
      // Regular users see only their orgs
      // Check both string and ObjectId formats, and multiple fields
      query = {
        $and: [
          { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
          { $or: [
            { leader: userObjectId },
            { leader: userId },
            { 'leader._id': userObjectId },
            { 'leader._id': userId },
            { admins: userObjectId },
            { admins: userId },
            { assistantLeaders: userObjectId },
            { assistantLeaders: userId },
            { createdBy: userObjectId },
            { createdBy: userId },
            { 'members.user': userObjectId },
            { 'members.user': userId },
            { owner: userObjectId },
            { owner: userId }
          ]}
        ]
      };
    }
    
    console.log('📋 /organizations/my query for user:', userId, 'isAdmin:', isAdmin);
    
    const orgs = await ChurchOrg.find(query)
    .populate('leader', 'name username profilePicture')
    .populate('parent', 'name type slug')
    .sort({ type: 1, name: 1 });
    
    console.log('📋 /organizations/my found', orgs.length, 'organizations');
    
    const orgsWithRole = await Promise.all(orgs.map(async (org) => {
      const role = await getUserRole(userId, org._id);
      return {
        ...org.toObject(),
        userRole: role || (isAdmin ? 'admin' : null),
        canManage: ['owner', 'admin', 'assistant'].includes(role) || isAdmin
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

// GET /organizations - List ONLY user's organizations (not all!)
router.get('/organizations', verifyToken, async (req, res) => {
  try {
    const { type, parentId, zoneId, churchId, page = 1, limit = 20, search } = req.query;
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin;
    
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }
    
    // Convert userId to ObjectId for proper comparison
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (e) {
      userObjectId = userId; // fallback to string if invalid
    }
    
    // Base query: isActive true OR isActive not set (for backward compatibility)
    let userQuery = { 
      $or: [
        { isActive: true }, 
        { isActive: { $exists: false } }
      ]
    };
    
    // Admin users can see all organizations
    if (isAdmin) {
      console.log('👑 Admin user - showing all organizations');
    } else {
      // SECURITY: Regular users only see organizations they're associated with
      // Check both string and ObjectId formats for compatibility
      const userAssociationQuery = [
        { leader: userObjectId },
        { leader: userId },
        { 'leader._id': userObjectId },
        { 'leader._id': userId },
        { createdBy: userObjectId },
        { createdBy: userId },
        { admins: userObjectId },
        { admins: userId },
        { assistantLeaders: userObjectId },
        { assistantLeaders: userId },
        { 'members.user': userObjectId },
        { 'members.user': userId },
        { owner: userObjectId },
        { owner: userId }
      ];
      
      // Combine isActive check with user association
      userQuery = {
        $and: [
          { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
          { $or: userAssociationQuery }
        ]
      };
    }
    
    // Additional filters
    if (type) userQuery.type = type;
    if (parentId) {
      try { userQuery.parent = new ObjectId(parentId); } catch(e) { userQuery.parent = parentId; }
    }
    if (zoneId) {
      try { userQuery.zone = new ObjectId(zoneId); } catch(e) { userQuery.zone = zoneId; }
    }
    if (churchId) {
      try { userQuery.church = new ObjectId(churchId); } catch(e) { userQuery.church = churchId; }
    }
    if (search) {
      const searchCondition = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
      if (userQuery.$and) {
        userQuery.$and.push(searchCondition);
      } else {
        userQuery.$and = [userQuery, searchCondition];
      }
    }
    
    console.log('📋 Organizations query for user:', userId, 'isAdmin:', isAdmin);
    
    const orgs = await ChurchOrg.find(userQuery)
      .populate('leader', 'name username profilePicture')
      .populate('parent', 'name type slug')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await ChurchOrg.countDocuments(userQuery);
    
    console.log('📋 Found', orgs.length, 'organizations for user', userId);
    
    // Add user's role to each org
    const orgsWithRole = await Promise.all(orgs.map(async (org) => {
      const role = await getUserRole(userId, org._id);
      const canManage = ['owner', 'admin', 'assistant'].includes(role) || isAdmin;
      return { 
        ...org.toObject(), 
        userRole: role || (isAdmin ? 'admin' : null), 
        canManage,
        permissions: {
          canEdit: canManage,
          canDelete: role === 'owner',
          canAddMembers: canManage,
          canRemoveMembers: canManage,
          canExport: canManage,
          canViewSettings: canManage,
          isOwner: role === 'owner',
          isAdmin: ['owner', 'admin'].includes(role),
          isMember: role !== null
        }
      };
    }));
    
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
router.get('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    }
    
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }
    
    const org = await ChurchOrg.findById(id)
      .populate('leader', 'name username profilePicture bio')
      .populate('assistantLeaders', 'name username profilePicture')
      .populate('parent', 'name type slug')
      .populate('members.user', 'name username profilePicture');
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Check user's role
    const userRole = await getUserRole(userId, org._id);
    
    // SECURITY: User must be associated with this org
    if (!userRole) {
      return res.status(403).json({ 
        ok: false, 
        error: 'You do not have access to this organization',
        hint: 'You must be a member, admin, or leader to view this organization'
      });
    }
    
    const canManage = ['owner', 'admin', 'assistant'].includes(userRole);
    
    const children = await ChurchOrg.find({ parent: org._id, isActive: true })
      .populate('leader', 'name username profilePicture')
      .select('name type slug memberCount leader logo')
      .sort({ name: 1 });
    
    const recentSouls = await Soul.countDocuments({
      $or: [{ zone: org._id }, { church: org._id }, { fellowship: org._id }, { cell: org._id }],
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    const orgData = org.toObject();
    
    // SECURITY: Hide sensitive data for regular members
    if (!canManage) {
      // Remove admin-only fields
      delete orgData.admins;
      delete orgData.settings;
      delete orgData.contact?.email; // Hide contact email
      
      // Only show basic member info (not contact details)
      if (orgData.members) {
        orgData.members = orgData.members.map(m => ({
          user: { 
            _id: m.user?._id,
            name: m.user?.name,
            username: m.user?.username,
            profilePicture: m.user?.profilePicture
          },
          role: m.role,
          joinedAt: m.joinedAt
          // Hide: email, phone, notes
        }));
      }
    }
    
    const permissions = {
      canEdit: canManage,
      canDelete: userRole === 'owner',
      canAddMembers: canManage,
      canRemoveMembers: canManage,
      canEditMembers: canManage,
      canExport: canManage,
      canViewSettings: canManage,
      canViewAnalytics: canManage,
      canCreateSubOrg: canManage,
      canManageFoundationSchool: canManage,
      canRecordAttendance: canManage,
      isOwner: userRole === 'owner',
      isAdmin: ['owner', 'admin'].includes(userRole),
      isAssistant: userRole === 'assistant',
      isMember: true // They passed the access check
    };
    
    res.json({
      ok: true,
      org: { ...orgData, userRole, canManage, permissions },
      organization: { ...orgData, userRole, canManage, permissions },
      children,
      recentSouls,
      userRole,
      canManage,
      permissions
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
// MEMBER MANAGEMENT ROUTES (with authorization)
// ==========================================

// GET /organizations/:id/members - Get members (with role-based filtering)
router.get('/organizations/:id/members', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { page = 1, limit = 20, search, role, status } = req.query;
    
    const userRole = await getUserRole(userId, id);
    if (!userRole) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    
    const canManage = ['owner', 'admin', 'assistant'].includes(userRole);
    
    const org = await ChurchOrg.findById(id)
      .populate('members.user', 'name username profilePicture email phone')
      .lean();
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    let members = org.members || [];
    
    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      members = members.filter(m => 
        m.user?.name?.toLowerCase().includes(searchLower) ||
        m.user?.username?.toLowerCase().includes(searchLower) ||
        m.user?.email?.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by role
    if (role) {
      members = members.filter(m => m.role === role);
    }
    
    // Filter by status
    if (status) {
      members = members.filter(m => m.status === status);
    }
    
    // SECURITY: Hide sensitive contact info for regular members
    if (!canManage) {
      members = members.map(m => ({
        user: {
          _id: m.user?._id,
          name: m.user?.name,
          username: m.user?.username,
          profilePicture: m.user?.profilePicture
        },
        role: m.role,
        joinedAt: m.joinedAt,
        status: m.status
      }));
    }
    
    // Pagination
    const total = members.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedMembers = members.slice(startIndex, startIndex + parseInt(limit));
    
    res.json({
      ok: true,
      members: paginatedMembers,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
      canManage,
      userRole
    });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /organizations/:id/members - Add member (admin only)
router.post('/organizations/:id/members', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { memberId, role = 'member', email, phone, notes } = req.body;
    
    // Check authorization
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Only admins can add members' });
    }
    
    if (!memberId) {
      return res.status(400).json({ ok: false, error: 'Member ID is required' });
    }
    
    const org = await ChurchOrg.findById(id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Check if already a member
    const existingMember = org.members?.find(m => m.user?.toString() === memberId);
    if (existingMember) {
      return res.status(400).json({ ok: false, error: 'User is already a member' });
    }
    
    // Add member
    org.members.push({
      user: memberId,
      role: role,
      joinedAt: new Date(),
      status: 'active',
      email,
      phone,
      notes,
      addedBy: userId
    });
    org.memberCount = org.members.length;
    await org.save();
    
    console.log(`👥 Member added to ${org.name} by ${userId}`);
    
    res.json({ ok: true, message: 'Member added', memberCount: org.memberCount });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /organizations/:id/members/:memberId - Update member (admin only)
router.put('/organizations/:id/members/:memberId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id, memberId } = req.params;
    const { role, status, notes } = req.body;
    
    // Check authorization
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Only admins can edit members' });
    }
    
    const org = await ChurchOrg.findById(id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    const memberIndex = org.members?.findIndex(m => m.user?.toString() === memberId);
    if (memberIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Member not found' });
    }
    
    // Update member
    if (role) org.members[memberIndex].role = role;
    if (status) org.members[memberIndex].status = status;
    if (notes !== undefined) org.members[memberIndex].notes = notes;
    org.members[memberIndex].updatedAt = new Date();
    org.members[memberIndex].updatedBy = userId;
    
    await org.save();
    
    res.json({ ok: true, message: 'Member updated' });
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /organizations/:id/members/:memberId - Remove member (admin only)
router.delete('/organizations/:id/members/:memberId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id, memberId } = req.params;
    
    // Check authorization
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Only owner/admin can remove members' });
    }
    
    // Cannot remove yourself if you're the owner
    const org = await ChurchOrg.findById(id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    if (org.leader?.toString() === memberId) {
      return res.status(400).json({ ok: false, error: 'Cannot remove the owner' });
    }
    
    // Remove member
    org.members = org.members.filter(m => m.user?.toString() !== memberId);
    org.memberCount = org.members.length;
    
    // Also remove from admins/assistants if present
    org.admins = org.admins?.filter(a => a.toString() !== memberId);
    org.assistantLeaders = org.assistantLeaders?.filter(a => a.toString() !== memberId);
    
    await org.save();
    
    console.log(`👥 Member ${memberId} removed from ${org.name} by ${userId}`);
    
    res.json({ ok: true, message: 'Member removed', memberCount: org.memberCount });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /organizations/:id/export - Export members (admin only)
router.get('/organizations/:id/export', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    
    // Check authorization - ONLY admins can export
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Only owner/admin can export data' });
    }
    
    const org = await ChurchOrg.findById(id)
      .populate('members.user', 'name username email phone')
      .lean();
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Format for export
    const exportData = (org.members || []).map(m => ({
      name: m.user?.name || '',
      username: m.user?.username || '',
      email: m.user?.email || m.email || '',
      phone: m.user?.phone || m.phone || '',
      role: m.role || 'member',
      status: m.status || 'active',
      joinedAt: m.joinedAt
    }));
    
    res.json({ ok: true, data: exportData, total: exportData.length });
  } catch (err) {
    console.error('Export error:', err);
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

router.post('/org', verifyToken, async (req, res) => {
  req.url = '/organizations';
  return router.handle(req, res);
});

router.get('/org', verifyToken, async (req, res) => {
  const userId = req.user?.id || req.user?._id || req.user?.userId;
  const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin;
  const { type, parentId, page = 1, limit = 20, search } = req.query;
  
  // Convert userId to ObjectId
  let userObjectId;
  try {
    userObjectId = new ObjectId(userId);
  } catch (e) {
    userObjectId = userId;
  }
  
  let query;
  
  // Admin users can see all, regular users only see their orgs
  if (isAdmin) {
    query = { $or: [{ isActive: true }, { isActive: { $exists: false } }] };
  } else {
    query = {
      $and: [
        { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
        { $or: [
          { leader: userObjectId },
          { leader: userId },
          { 'leader._id': userObjectId },
          { 'leader._id': userId },
          { createdBy: userObjectId },
          { createdBy: userId },
          { admins: userObjectId },
          { admins: userId },
          { assistantLeaders: userObjectId },
          { assistantLeaders: userId },
          { 'members.user': userObjectId },
          { 'members.user': userId },
          { owner: userObjectId },
          { owner: userId }
        ]}
      ]
    };
  }
  
  if (type) query.type = type;
  if (parentId) {
    try { query.parent = new ObjectId(parentId); } catch(e) { query.parent = parentId; }
  }
  if (search) query.name = { $regex: search, $options: 'i' };
  
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

console.log('⛪ Church Management routes v2.5.0 loaded - Cascading parent selection');

module.exports = router;
