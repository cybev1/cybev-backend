// ============================================
// FILE: routes/church-v2.routes.js
// Church Management with Ministry & CE Zones
// VERSION: 3.0.0 - Ministry Selection + CE Zones
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Import models
let ChurchOrg, Soul;
try {
  const models = require('../models/church.model');
  ChurchOrg = models.ChurchOrg;
  Soul = models.Soul;
} catch (e) {
  console.warn('Church models not loaded:', e.message);
}

// CE Zones data
const { CE_ZONES } = require('../data/ce-zones.data');

// Auth middleware
const verifyToken = (req, res, next) => {
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

// ==========================================
// CE ZONES ROUTES
// ==========================================

// GET /zones - Get all Christ Embassy zones
router.get('/zones', (req, res) => {
  try {
    const { category, search } = req.query;
    
    let zones = [...CE_ZONES];
    
    // Filter by category if provided
    if (category && category !== 'all') {
      zones = zones.filter(z => z.category === category);
    }
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      zones = zones.filter(z => z.name.toLowerCase().includes(searchLower));
    }
    
    // Group by category
    const grouped = {
      zones: zones.filter(z => z.category === 'zone'),
      blw: zones.filter(z => z.category === 'blw'),
      ministry: zones.filter(z => z.category === 'ministry'),
      ism: zones.filter(z => z.category === 'ism'),
      department: zones.filter(z => z.category === 'department')
    };
    
    res.json({
      ok: true,
      zones,
      grouped,
      categories: [
        { id: 'zone', name: 'Main Zones', count: grouped.zones.length },
        { id: 'blw', name: 'BLW Zones', count: grouped.blw.length },
        { id: 'ministry', name: 'Ministries', count: grouped.ministry.length },
        { id: 'ism', name: 'ISM Zones', count: grouped.ism.length },
        { id: 'department', name: 'Departments', count: grouped.department.length }
      ],
      total: zones.length
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /zones/:id - Get single zone by ID
router.get('/zones/:id', (req, res) => {
  try {
    const zone = CE_ZONES.find(z => z.id === req.params.id);
    if (!zone) {
      return res.status(404).json({ ok: false, error: 'Zone not found' });
    }
    res.json({ ok: true, zone });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ORGANIZATION ROUTES (Enhanced)
// ==========================================

// GET /organizations - List user's organizations
router.get('/organizations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { ministry, zoneId, type } = req.query;
    
    const query = {
      $or: [
        { leader: userId },
        { createdBy: userId },
        { admins: userId },
        { 'members.user': userId }
      ],
      isActive: { $ne: false }
    };
    
    if (ministry) query.ministry = ministry;
    if (zoneId) query['ceZone.id'] = zoneId;
    if (type) query.type = type;
    
    const organizations = await ChurchOrg.find(query)
      .populate('leader', 'name username avatar')
      .sort({ createdAt: -1 });
    
    res.json({ ok: true, organizations });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /organizations - Create new organization
router.post('/organizations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { 
      name, type, description,
      ministry, // 'christ_embassy' or 'others'
      ceZoneId, // CE Zone ID if christ_embassy
      customMinistry, // Ministry name if 'others'
      parentId,
      leaderName, leaderTitle,
      contact
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Name is required' });
    }
    
    if (!type || !['church', 'fellowship', 'cell', 'biblestudy', 'zone'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'Valid type is required' });
    }
    
    // Generate slug
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    
    // Build organization object
    const orgData = {
      name,
      slug,
      type,
      description: description || '',
      ministry: ministry || 'christ_embassy',
      leader: userId,
      createdBy: userId,
      leaderName,
      leaderTitle,
      contact: contact || {},
      members: [{
        user: userId,
        role: 'leader',
        joinedAt: new Date()
      }],
      memberCount: 1
    };
    
    // Add CE Zone if christ_embassy
    if (ministry === 'christ_embassy' && ceZoneId) {
      const zone = CE_ZONES.find(z => z.id === ceZoneId);
      if (zone) {
        orgData.ceZone = {
          id: zone.id,
          name: zone.name,
          category: zone.category
        };
      }
    }
    
    // Add custom ministry if 'others'
    if (ministry === 'others' && customMinistry) {
      orgData.customMinistry = customMinistry;
    }
    
    // Set parent if provided
    if (parentId) {
      orgData.parent = parentId;
      const parent = await ChurchOrg.findById(parentId);
      if (parent) {
        // Inherit zone from parent if applicable
        if (parent.ceZone) {
          orgData.ceZone = parent.ceZone;
        }
        // Set hierarchy references
        if (parent.type === 'zone') {
          orgData.zone = parentId;
        } else if (parent.type === 'church') {
          orgData.church = parentId;
          orgData.zone = parent.zone;
        } else if (parent.type === 'fellowship') {
          orgData.fellowship = parentId;
          orgData.church = parent.church;
          orgData.zone = parent.zone;
        }
      }
    }
    
    const org = new ChurchOrg(orgData);
    await org.save();
    
    console.log(`⛪ Created ${type}: ${name} (${ministry})`);
    
    res.status(201).json({ ok: true, organization: org });
  } catch (err) {
    console.error('Create org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /organizations/:id - Get single organization
router.get('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const org = await ChurchOrg.findById(req.params.id)
      .populate('leader', 'name username avatar')
      .populate('parent', 'name type')
      .populate('members.user', 'name username avatar');
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Get child organizations
    const children = await ChurchOrg.find({ parent: org._id, isActive: true })
      .select('name type slug memberCount')
      .sort({ type: 1, name: 1 });
    
    // Get souls count
    const soulsCount = await Soul.countDocuments({
      $or: [
        { organization: org._id },
        { church: org._id },
        { fellowship: org._id },
        { cell: org._id }
      ]
    });
    
    res.json({ 
      ok: true, 
      organization: org,
      children,
      soulsCount
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /organizations/:id - Update organization
router.put('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const org = await ChurchOrg.findById(req.params.id);
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Check permission
    const isOwner = org.leader?.toString() === userId.toString() || 
                    org.createdBy?.toString() === userId.toString();
    const isAdmin = org.admins?.some(a => a.toString() === userId.toString());
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    // Update fields
    const allowedUpdates = ['name', 'description', 'leaderName', 'leaderTitle', 'contact', 'settings'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        org[field] = req.body[field];
      }
    });
    
    // Update CE Zone if changed
    if (req.body.ceZoneId) {
      const zone = CE_ZONES.find(z => z.id === req.body.ceZoneId);
      if (zone) {
        org.ceZone = { id: zone.id, name: zone.name, category: zone.category };
      }
    }
    
    org.updatedAt = new Date();
    await org.save();
    
    res.json({ ok: true, organization: org });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// SOULS ROUTES (Enhanced)
// ==========================================

// GET /souls - List souls
router.get('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { 
      organizationId, zoneId, churchId, cellId, 
      status, search, 
      page = 1, limit = 20 
    } = req.query;
    
    const query = { isActive: true };
    
    // Filter by organization hierarchy
    if (organizationId) query.organization = organizationId;
    if (zoneId) query.zone = zoneId;
    if (churchId) query.church = churchId;
    if (cellId) query.cell = cellId;
    if (status) query.status = status;
    
    // Search
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // If no specific filter, get souls from user's organizations
    if (!organizationId && !zoneId && !churchId && !cellId) {
      const userOrgs = await ChurchOrg.find({
        $or: [{ leader: userId }, { admins: userId }, { createdBy: userId }],
        isActive: true
      }).select('_id');
      
      const orgIds = userOrgs.map(o => o._id);
      query.$or = [
        { organization: { $in: orgIds } },
        { church: { $in: orgIds } },
        { cell: { $in: orgIds } },
        { addedBy: userId }
      ];
    }
    
    const souls = await Soul.find(query)
      .populate('organization', 'name type')
      .populate('church', 'name type')
      .populate('cell', 'name type')
      .populate('assignedTo', 'name username')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Soul.countDocuments(query);
    
    // Get stats
    const stats = await Soul.aggregate([
      { $match: query },
      { $group: {
        _id: '$status',
        count: { $sum: 1 }
      }}
    ]);
    
    res.json({
      ok: true,
      souls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      stats: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {})
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /souls - Add new soul
router.post('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const {
      firstName, lastName, phone, email, whatsapp,
      address, city, state, country,
      gender, ageGroup, dateOfBirth,
      salvationType, howTheyHeard, howTheyHeardDetails,
      organizationId, churchId, fellowshipId, cellId,
      ceZoneId, // Can assign to CE Zone directly
      notes, prayerRequest
    } = req.body;
    
    if (!firstName) {
      return res.status(400).json({ ok: false, error: 'First name is required' });
    }
    
    if (!phone && !email) {
      return res.status(400).json({ ok: false, error: 'Phone or email is required' });
    }
    
    // Build soul object
    const soulData = {
      firstName,
      lastName: lastName || '',
      phone: phone || '',
      email: email || '',
      whatsapp: whatsapp || phone || '',
      address: address || '',
      city: city || '',
      state: state || '',
      country: country || '',
      gender,
      ageGroup,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      salvationType: salvationType || 'first_time',
      howTheyHeard,
      howTheyHeardDetails,
      notes,
      prayerRequests: prayerRequest ? [{ request: prayerRequest, date: new Date() }] : [],
      addedBy: userId,
      status: 'new',
      pipelineStage: 'new_convert'
    };
    
    // Set organization hierarchy
    if (organizationId) soulData.organization = organizationId;
    if (churchId) soulData.church = churchId;
    if (fellowshipId) soulData.fellowship = fellowshipId;
    if (cellId) soulData.cell = cellId;
    
    // Set CE Zone if provided
    if (ceZoneId) {
      const zone = CE_ZONES.find(z => z.id === ceZoneId);
      if (zone) {
        soulData.ceZone = { id: zone.id, name: zone.name, category: zone.category };
      }
    }
    
    const soul = new Soul(soulData);
    await soul.save();
    
    // Update organization soul count if applicable
    if (organizationId) {
      await ChurchOrg.findByIdAndUpdate(organizationId, {
        $inc: { 'stats.totalSouls': 1 }
      });
    }
    
    console.log(`🙏 Soul added: ${firstName} ${lastName || ''}`);
    
    res.status(201).json({ ok: true, soul });
  } catch (err) {
    console.error('Add soul error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /souls/:id - Get single soul
router.get('/souls/:id', verifyToken, async (req, res) => {
  try {
    const soul = await Soul.findById(req.params.id)
      .populate('organization', 'name type')
      .populate('church', 'name type')
      .populate('cell', 'name type')
      .populate('assignedTo', 'name username')
      .populate('addedBy', 'name username')
      .populate('followUps.followedUpBy', 'name username');
    
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    res.json({ ok: true, soul });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /souls/:id - Update soul
router.put('/souls/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const soul = await Soul.findById(req.params.id);
    
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    // Update allowed fields
    const updates = req.body;
    const allowedFields = [
      'firstName', 'lastName', 'phone', 'email', 'whatsapp',
      'address', 'city', 'state', 'country',
      'gender', 'ageGroup', 'status', 'pipelineStage',
      'notes', 'assignedTo', 'organizationId', 'churchId', 'cellId'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        soul[field] = updates[field];
      }
    });
    
    soul.lastUpdatedBy = userId;
    soul.updatedAt = new Date();
    await soul.save();
    
    res.json({ ok: true, soul });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /souls/:id/followup - Add follow-up record
router.post('/souls/:id/followup', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { type, notes, outcome, nextFollowUpDate } = req.body;
    
    const soul = await Soul.findById(req.params.id);
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    soul.followUps.push({
      date: new Date(),
      type: type || 'call',
      notes,
      outcome: outcome || 'successful',
      followedUpBy: userId,
      nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : undefined
    });
    
    soul.totalFollowUps = (soul.totalFollowUps || 0) + 1;
    soul.lastContactDate = new Date();
    if (nextFollowUpDate) {
      soul.nextFollowUpDate = new Date(nextFollowUpDate);
    }
    
    // Auto-update status based on follow-ups
    if (soul.totalFollowUps >= 1 && soul.status === 'new') {
      soul.status = 'contacted';
      soul.pipelineStage = 'first_contact';
    }
    
    await soul.save();
    
    res.json({ ok: true, soul });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /souls/:id - Delete soul
router.delete('/souls/:id', verifyToken, async (req, res) => {
  try {
    const soul = await Soul.findById(req.params.id);
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    soul.isActive = false;
    await soul.save();
    
    res.json({ ok: true, message: 'Soul deleted' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// DASHBOARD STATS
// ==========================================

router.get('/dashboard/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    
    // Get user's organizations
    const orgs = await ChurchOrg.find({
      $or: [{ leader: userId }, { createdBy: userId }, { admins: userId }],
      isActive: true
    }).select('_id');
    
    const orgIds = orgs.map(o => o._id);
    
    // Count souls
    const totalSouls = await Soul.countDocuments({
      $or: [
        { organization: { $in: orgIds } },
        { church: { $in: orgIds } },
        { cell: { $in: orgIds } },
        { addedBy: userId }
      ],
      isActive: true
    });
    
    // New souls this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newSoulsThisMonth = await Soul.countDocuments({
      $or: [
        { organization: { $in: orgIds } },
        { addedBy: userId }
      ],
      createdAt: { $gte: startOfMonth },
      isActive: true
    });
    
    // Souls by status
    const soulsByStatus = await Soul.aggregate([
      { $match: { 
        $or: [
          { organization: { $in: orgIds } },
          { addedBy: userId }
        ],
        isActive: true 
      }},
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Total members across orgs
    const totalMembers = await ChurchOrg.aggregate([
      { $match: { _id: { $in: orgIds } } },
      { $group: { _id: null, total: { $sum: '$memberCount' } } }
    ]);
    
    res.json({
      ok: true,
      stats: {
        totalOrganizations: orgs.length,
        totalSouls,
        newSoulsThisMonth,
        totalMembers: totalMembers[0]?.total || 0,
        soulsByStatus: soulsByStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {})
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('⛪ Church v3.0 routes loaded - Ministry & CE Zones support');

module.exports = router;
