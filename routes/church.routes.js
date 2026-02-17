// ============================================
// FILE: routes/church.routes.js
// Online Church Management System API
// VERSION: 3.0.0 - Ministry Selection + CE Zones Support
// PREVIOUS: 2.8.0 - Direct /members routes for frontend
// 
// NEW IN 3.0.0:
//   - Added ministry field (christ_embassy / others)
//   - Added 185+ Christ Embassy zones as preset data
//   - GET /zones - List all CE zones with filtering
//   - GET /zones/:id - Get single zone
//   - GET /dashboard/stats - Dashboard statistics
//   - POST /organizations now accepts ministry & ceZone
//   - GET /organizations supports ministry filter
//   - POST /souls supports ceZone assignment
//
// ROLLBACK: If issues, revert to VERSION 2.8.0
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
// CHRIST EMBASSY ZONES DATA (185+ Zones)
// ==========================================
const CE_ZONES = [
  // Main Zones (Nigeria)
  { id: '1-0', name: 'Aba Zone', category: 'zone' },
  { id: '2-0', name: 'Abeokuta Zone', category: 'zone' },
  { id: '3-0', name: 'Abuja Zone', category: 'zone' },
  { id: '4-0', name: 'Accra Ghana Zone', category: 'zone' },
  { id: '5-0', name: 'Akure Zone', category: 'zone' },
  { id: '6-0', name: 'Asaba Zone', category: 'zone' },
  { id: '7-0', name: 'Bayelsa Zone', category: 'zone' },
  { id: '8-0', name: 'Benin Zone 1', category: 'zone' },
  { id: '9-0', name: 'Benin Zone 2', category: 'zone' },
  { id: '10-0', name: 'Bonny Zone', category: 'zone' },
  { id: '11-0', name: 'Calabar Zone', category: 'zone' },
  { id: '12-0', name: 'Delta Zone', category: 'zone' },
  { id: '13-0', name: 'Edo North Zone', category: 'zone' },
  { id: '14-0', name: 'Ekiti Zone', category: 'zone' },
  { id: '15-0', name: 'Enugu Zone', category: 'zone' },
  { id: '16-0', name: 'Ibadan Zone 1', category: 'zone' },
  { id: '17-0', name: 'Ibadan Zone 2', category: 'zone' },
  { id: '18-0', name: 'Ikorodu Zone', category: 'zone' },
  { id: '19-0', name: 'Ilorin Zone', category: 'zone' },
  { id: '20-0', name: 'Imo Zone', category: 'zone' },
  { id: '21-0', name: 'Jos Zone', category: 'zone' },
  { id: '22-0', name: 'Kaduna Zone', category: 'zone' },
  { id: '23-0', name: 'Kano Zone', category: 'zone' },
  { id: '24-0', name: 'Kwara Zone', category: 'zone' },
  { id: '25-0', name: 'Lagos Zone 1', category: 'zone' },
  { id: '26-0', name: 'Lagos Zone 2', category: 'zone' },
  { id: '27-0', name: 'Lagos Zone 3', category: 'zone' },
  { id: '28-0', name: 'Lagos Zone 4', category: 'zone' },
  { id: '29-0', name: 'Lagos Zone 5', category: 'zone' },
  { id: '30-0', name: 'Lekki Zone', category: 'zone' },
  { id: '31-0', name: 'Makurdi Zone', category: 'zone' },
  { id: '32-0', name: 'Minna Zone', category: 'zone' },
  { id: '33-0', name: 'Nasarawa Zone', category: 'zone' },
  { id: '34-0', name: 'Ogbomoso Zone', category: 'zone' },
  { id: '35-0', name: 'Ogun Zone', category: 'zone' },
  { id: '36-0', name: 'Ondo Zone', category: 'zone' },
  { id: '37-0', name: 'Owerri Zone', category: 'zone' },
  { id: '38-0', name: 'Oyo Zone', category: 'zone' },
  { id: '39-0', name: 'Port Harcourt Zone 1', category: 'zone' },
  { id: '40-0', name: 'Port Harcourt Zone 2', category: 'zone' },
  { id: '41-0', name: 'Port Harcourt Zone 3', category: 'zone' },
  { id: '42-0', name: 'Rivers Zone', category: 'zone' },
  { id: '43-0', name: 'Sapele Zone', category: 'zone' },
  { id: '44-0', name: 'Sokoto Zone', category: 'zone' },
  { id: '45-0', name: 'Umuahia Zone', category: 'zone' },
  { id: '46-0', name: 'Uyo Zone', category: 'zone' },
  { id: '47-0', name: 'Warri Zone', category: 'zone' },
  { id: '48-0', name: 'Yenagoa Zone', category: 'zone' },
  { id: '49-0', name: 'Yola Zone', category: 'zone' },
  
  // International Zones (Africa)
  { id: '50-0', name: 'Cameroon Zone', category: 'zone' },
  { id: '51-0', name: 'Congo Zone', category: 'zone' },
  { id: '52-0', name: 'Cote d\'Ivoire Zone', category: 'zone' },
  { id: '53-0', name: 'East Africa Zone', category: 'zone' },
  { id: '54-0', name: 'Ethiopia Zone', category: 'zone' },
  { id: '55-0', name: 'Gabon Zone', category: 'zone' },
  { id: '56-0', name: 'Kenya Zone', category: 'zone' },
  { id: '57-0', name: 'Malawi Zone', category: 'zone' },
  { id: '58-0', name: 'Mozambique Zone', category: 'zone' },
  { id: '59-0', name: 'Rwanda Zone', category: 'zone' },
  { id: '60-0', name: 'Senegal Zone', category: 'zone' },
  { id: '61-0', name: 'South Africa Zone 1', category: 'zone' },
  { id: '62-0', name: 'South Africa Zone 2', category: 'zone' },
  { id: '63-0', name: 'Tanzania Zone', category: 'zone' },
  { id: '64-0', name: 'Uganda Zone', category: 'zone' },
  { id: '65-0', name: 'Zambia Zone', category: 'zone' },
  { id: '66-0', name: 'Zimbabwe Zone', category: 'zone' },
  
  // International Zones (Europe)
  { id: '67-0', name: 'UK Zone 1', category: 'zone' },
  { id: '68-0', name: 'UK Zone 2', category: 'zone' },
  { id: '69-0', name: 'UK Zone 3', category: 'zone' },
  { id: '70-0', name: 'UK Zone 4', category: 'zone' },
  { id: '71-0', name: 'Germany Zone', category: 'zone' },
  { id: '72-0', name: 'France Zone', category: 'zone' },
  { id: '73-0', name: 'Netherlands Zone', category: 'zone' },
  { id: '74-0', name: 'Italy Zone', category: 'zone' },
  { id: '75-0', name: 'Spain Zone', category: 'zone' },
  { id: '76-0', name: 'Belgium Zone', category: 'zone' },
  { id: '77-0', name: 'Switzerland Zone', category: 'zone' },
  { id: '78-0', name: 'Austria Zone', category: 'zone' },
  { id: '79-0', name: 'Ireland Zone', category: 'zone' },
  { id: '80-0', name: 'Scandinavia Zone', category: 'zone' },
  
  // International Zones (Americas)
  { id: '81-0', name: 'USA Zone 1 (East)', category: 'zone' },
  { id: '82-0', name: 'USA Zone 2 (West)', category: 'zone' },
  { id: '83-0', name: 'USA Zone 3 (South)', category: 'zone' },
  { id: '84-0', name: 'USA Zone 4 (Midwest)', category: 'zone' },
  { id: '85-0', name: 'Canada Zone 1 (East)', category: 'zone' },
  { id: '86-0', name: 'Canada Zone 2 (West)', category: 'zone' },
  { id: '87-0', name: 'Caribbean Zone', category: 'zone' },
  { id: '88-0', name: 'Brazil Zone', category: 'zone' },
  { id: '89-0', name: 'Mexico Zone', category: 'zone' },
  
  // International Zones (Asia/Pacific)
  { id: '90-0', name: 'India Zone', category: 'zone' },
  { id: '91-0', name: 'Australia Zone', category: 'zone' },
  { id: '92-0', name: 'Malaysia Zone', category: 'zone' },
  { id: '93-0', name: 'Singapore Zone', category: 'zone' },
  { id: '94-0', name: 'Philippines Zone', category: 'zone' },
  { id: '95-0', name: 'South Korea Zone', category: 'zone' },
  { id: '96-0', name: 'Japan Zone', category: 'zone' },
  { id: '97-0', name: 'China Zone', category: 'zone' },
  { id: '98-0', name: 'Dubai/UAE Zone', category: 'zone' },
  { id: '99-0', name: 'Israel Zone', category: 'zone' },
  
  // BLW Zones
  { id: '100-1', name: 'BLW Zone A', category: 'blw' },
  { id: '101-1', name: 'BLW Zone B', category: 'blw' },
  { id: '102-1', name: 'BLW Zone C', category: 'blw' },
  { id: '103-1', name: 'BLW Zone D', category: 'blw' },
  { id: '104-1', name: 'BLW Zone E', category: 'blw' },
  { id: '105-1', name: 'BLW Zone F', category: 'blw' },
  { id: '106-1', name: 'BLW Zone G', category: 'blw' },
  { id: '107-1', name: 'BLW Zone H', category: 'blw' },
  { id: '108-1', name: 'BLW Zone I', category: 'blw' },
  { id: '109-1', name: 'BLW Zone J', category: 'blw' },
  { id: '110-1', name: 'BLW Zone K', category: 'blw' },
  { id: '111-1', name: 'BLW Zone L', category: 'blw' },
  { id: '112-1', name: 'BLW Zone M', category: 'blw' },
  { id: '113-1', name: 'BLW Zone N', category: 'blw' },
  { id: '114-1', name: 'BLW Ghana Zone', category: 'blw' },
  { id: '115-1', name: 'BLW Kenya Zone', category: 'blw' },
  { id: '116-1', name: 'BLW South Africa Zone', category: 'blw' },
  { id: '117-1', name: 'BLW UK Zone', category: 'blw' },
  { id: '118-1', name: 'BLW USA Zone', category: 'blw' },
  { id: '119-1', name: 'BLW Canada Zone', category: 'blw' },
  { id: '120-1', name: 'BLW Europe Zone', category: 'blw' },
  { id: '121-1', name: 'BLW Asia Zone', category: 'blw' },
  
  // Ministry Zones
  { id: '130-2', name: 'GYLF Africa', category: 'ministry' },
  { id: '131-2', name: 'GYLF Europe', category: 'ministry' },
  { id: '132-2', name: 'GYLF Americas', category: 'ministry' },
  { id: '133-2', name: 'GYLF Asia Pacific', category: 'ministry' },
  { id: '134-2', name: 'Healing School Africa', category: 'ministry' },
  { id: '135-2', name: 'Healing School Europe', category: 'ministry' },
  { id: '136-2', name: 'Healing School Americas', category: 'ministry' },
  { id: '137-2', name: 'Healing School Asia Pacific', category: 'ministry' },
  { id: '138-2', name: 'Future Africa Leaders Foundation', category: 'ministry' },
  { id: '139-2', name: 'InnerCity Mission Africa', category: 'ministry' },
  { id: '140-2', name: 'InnerCity Mission International', category: 'ministry' },
  { id: '141-2', name: 'Rhapsody of Realities Distribution', category: 'ministry' },
  { id: '142-2', name: 'Loveworld Medical Missions', category: 'ministry' },
  { id: '143-2', name: 'International School of Ministry', category: 'ministry' },
  
  // ISM Zones
  { id: '150-3', name: 'ISM Nigeria Zone 1', category: 'ism' },
  { id: '151-3', name: 'ISM Nigeria Zone 2', category: 'ism' },
  { id: '152-3', name: 'ISM Ghana Zone', category: 'ism' },
  { id: '153-3', name: 'ISM South Africa Zone', category: 'ism' },
  { id: '154-3', name: 'ISM UK Zone', category: 'ism' },
  { id: '155-3', name: 'ISM USA Zone', category: 'ism' },
  { id: '156-3', name: 'ISM Canada Zone', category: 'ism' },
  { id: '157-3', name: 'ISM Europe Zone', category: 'ism' },
  { id: '158-3', name: 'ISM Asia Zone', category: 'ism' },
  { id: '159-3', name: 'ISM Online Campus', category: 'ism' },
  
  // Departments
  { id: '170-4', name: 'Loveworld Music & Arts Ministry', category: 'department' },
  { id: '171-4', name: 'Loveworld Films', category: 'department' },
  { id: '172-4', name: 'Loveworld Publishing', category: 'department' },
  { id: '173-4', name: 'Loveworld Television Ministry', category: 'department' },
  { id: '174-4', name: 'Loveworld Radio Ministry', category: 'department' },
  { id: '175-4', name: 'Loveworld Digital Network', category: 'department' },
  { id: '176-4', name: 'Pastor Chris Digital Library', category: 'department' },
  { id: '177-4', name: 'KingsChat', category: 'department' },
  { id: '178-4', name: 'Yookos', category: 'department' },
  { id: '179-4', name: 'CeFlix', category: 'department' },
  { id: '180-4', name: 'Loveworld USA Network', category: 'department' },
  { id: '181-4', name: 'Loveworld UK Network', category: 'department' },
  { id: '182-4', name: 'Loveworld SAT', category: 'department' },
  { id: '183-4', name: 'Rhapsody of Realities Translations', category: 'department' },
  { id: '184-4', name: 'Loveworld Innovations', category: 'department' },
  { id: '185-4', name: 'Believers Loveworld Incorporated', category: 'department' },
].sort((a, b) => a.name.localeCompare(b.name));

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
// CE ZONES ROUTES (NEW in v3.0.0)
// ==========================================

// GET /zones - List all CE zones with filtering
router.get('/zones', verifyToken, (req, res) => {
  try {
    const { category, search } = req.query;
    
    let zones = [...CE_ZONES];
    
    // Filter by category
    if (category && category !== 'all') {
      zones = zones.filter(z => z.category === category);
    }
    
    // Filter by search
    if (search) {
      const query = search.toLowerCase();
      zones = zones.filter(z => 
        z.name.toLowerCase().includes(query) ||
        z.id.toLowerCase().includes(query)
      );
    }
    
    res.json({
      ok: true,
      zones,
      total: zones.length,
      categories: ['zone', 'blw', 'ministry', 'ism', 'department']
    });
  } catch (err) {
    console.error('GET /zones error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /zones/:id - Get single zone
router.get('/zones/:id', verifyToken, (req, res) => {
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

// GET /dashboard/stats - Dashboard statistics (NEW in v3.0.0)
router.get('/dashboard/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    
    // Get organizations where user is leader or admin
    const orgs = await ChurchOrg.find({
      $or: [
        { leader: userId },
        { createdBy: userId },
        { admins: userId }
      ],
      isActive: { $ne: false }
    }).lean();
    
    const orgIds = orgs.map(o => o._id);
    
    // Count souls
    const totalSouls = await Soul.countDocuments({
      $or: [
        { organization: { $in: orgIds } },
        { zone: { $in: orgIds } },
        { church: { $in: orgIds } },
        { fellowship: { $in: orgIds } },
        { cell: { $in: orgIds } },
        { addedBy: userId }
      ],
      isActive: { $ne: false }
    });
    
    // Count new souls this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newSoulsThisMonth = await Soul.countDocuments({
      $or: [
        { organization: { $in: orgIds } },
        { zone: { $in: orgIds } },
        { church: { $in: orgIds } },
        { fellowship: { $in: orgIds } },
        { cell: { $in: orgIds } },
        { addedBy: userId }
      ],
      isActive: { $ne: false },
      createdAt: { $gte: startOfMonth }
    });
    
    // Count members
    const totalMembers = orgs.reduce((sum, org) => 
      sum + (org.members?.length || org.memberCount || 0), 0);
    
    // Count FS graduates
    const fsGraduates = orgs.reduce((sum, org) => 
      sum + (org.stats?.foundationSchoolGraduates || 0), 0);
    
    // Souls by status
    const soulsByStatus = await Soul.aggregate([
      {
        $match: {
          $or: [
            { organization: { $in: orgIds } },
            { zone: { $in: orgIds } },
            { church: { $in: orgIds } },
            { addedBy: new ObjectId(userId) }
          ],
          isActive: { $ne: false }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statusCounts = {};
    soulsByStatus.forEach(s => {
      statusCounts[s._id || 'new'] = s.count;
    });
    
    res.json({
      ok: true,
      totalOrgs: orgs.length,
      totalSouls,
      newSoulsThisMonth,
      totalMembers,
      fsGraduates,
      soulsByStatus: statusCounts
    });
  } catch (err) {
    console.error('GET /dashboard/stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
    const allOrgs = await ChurchOrg.find({ isActive: { $ne: false } })
      .select('_id name type slug leader ceZone ministry leaderName leaderTitle')
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
    
    // Ministry options (NEW in v3.0.0)
    const ministryOptions = [
      { value: 'christ_embassy', label: 'Christ Embassy', description: 'Loveworld Inc. / Christ Embassy churches' },
      { value: 'others', label: 'Other Ministry', description: 'Other churches and organizations' }
    ];
    
    // Return a placeholder org object so frontend doesn't show "not found"
    const placeholderOrg = {
      _id: 'create',
      name: '',
      type: 'church',
      description: '',
      isCreateMode: true,
      colorTheme: 'purple',
      ministry: 'christ_embassy'
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
        parentOptions: allOrgs,
        colorThemes,
        ministryOptions,
        ceZones: CE_ZONES,
        defaults: {
          type: 'church',
          colorTheme: 'purple',
          ministry: 'christ_embassy'
        }
      },
      validTypes: validTypes.map(t => t.value),
      parentOrganizations: allOrgs,
      ceZones: CE_ZONES,
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
    const { type, ministry, ceZoneId } = req.query; // Optional filters
    
    const query = { isActive: { $ne: false } }; // Include orgs without isActive field
    if (type) query.type = type;
    if (ministry) query.ministry = ministry;
    if (ceZoneId) query['ceZone.id'] = ceZoneId;
    
    const orgs = await ChurchOrg.find(query)
      .select('_id name type slug leader memberCount parent zone church leaderName leaderTitle ministry ceZone')
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
      total: orgs.length,
      ceZones: CE_ZONES
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
    const allOrgs = await ChurchOrg.find({ isActive: { $ne: false } })
      .select('_id name type slug leader ceZone ministry')
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
      colorTheme: 'purple',
      ministry: 'christ_embassy'
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
        colorThemes: ['purple', 'blue', 'green', 'red', 'orange', 'pink', 'teal', 'indigo'],
        ceZones: CE_ZONES
      },
      validTypes: validTypes.map(t => t.value),
      parentOrganizations: allOrgs,
      ceZones: CE_ZONES,
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

// POST /organizations - Create (UPDATED in v3.0.0 for ministry + ceZone)
router.post('/organizations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { 
      name, type, description, motto, parentId, contact, meetingSchedule, colorTheme, structureMode, 
      leaderName, leaderTitle,
      // NEW v3.0.0 fields
      ministry, customMinistry, ceZone, ceZoneId
    } = req.body;
    
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
    
    // Handle CE Zone (NEW in v3.0.0)
    let ceZoneData = null;
    if (ceZone) {
      // ceZone object passed directly
      ceZoneData = ceZone;
    } else if (ceZoneId) {
      // Lookup zone by ID
      const foundZone = CE_ZONES.find(z => z.id === ceZoneId);
      if (foundZone) {
        ceZoneData = {
          id: foundZone.id,
          name: foundZone.name,
          category: foundZone.category
        };
      }
    }
    
    const org = new ChurchOrg({
      name, slug, type,
      ...(structureMode ? { structureMode } : {}),
      description, motto,
      parent: parentId || null,
      zone, church,
      leader: userId,
      leaderName: leaderName || '',
      leaderTitle: leaderTitle || '',
      // NEW v3.0.0 fields
      ministry: ministry || 'christ_embassy',
      customMinistry: customMinistry || '',
      ceZone: ceZoneData,
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
    console.log(`⛪ Created ${type}: ${name} by user ${userId}${ceZoneData ? ` (Zone: ${ceZoneData.name})` : ''}${leaderName ? ` (Leader: ${leaderTitle || ''} ${leaderName})` : ''}`);
    
    res.status(201).json({ ok: true, org, organization: org });
  } catch (err) {
    console.error('Create org error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /organizations - List ONLY user's organizations (UPDATED in v3.0.0 for ministry filter)
router.get('/organizations', verifyToken, async (req, res) => {
  try {
    const { type, parentId, zoneId, churchId, ministry, ceZoneId, page = 1, limit = 20, search } = req.query;
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
    // NEW v3.0.0 filters
    if (ministry) userQuery.ministry = ministry;
    if (ceZoneId) userQuery['ceZone.id'] = ceZoneId;
    
    if (search) {
      const searchCondition = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'ceZone.name': { $regex: search, $options: 'i' } }
        ]
      };
      if (userQuery.$and) {
        userQuery.$and.push(searchCondition);
      } else {
        userQuery = { $and: [userQuery, searchCondition] };
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
    
    const children = await ChurchOrg.find({ parent: org._id, isActive: { $ne: false } })
      .populate('leader', 'name username profilePicture')
      .select('name type slug memberCount leader logo ceZone ministry')
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

// PUT /organizations/:id - Update (requires owner/admin) - UPDATED for ministry/ceZone
router.put('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Not authorized', yourRole: userRole });
    }
    
    const { 
      name, description, motto, contact, meetingSchedule, socialLinks, settings, logo, coverImage, colorTheme, leaderName, leaderTitle,
      // NEW v3.0.0 fields
      ministry, customMinistry, ceZone
    } = req.body;
    
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
        ...(leaderName !== undefined && { leaderName }),
        ...(leaderTitle !== undefined && { leaderTitle }),
        // NEW v3.0.0 fields
        ...(ministry && { ministry }),
        ...(customMinistry !== undefined && { customMinistry }),
        ...(ceZone && { ceZone }),
        updatedAt: new Date()
      }
    }, { new: true }).populate('leader', 'name username profilePicture');
    
    if (leaderName !== undefined || leaderTitle !== undefined) {
      console.log(`⛪ Updated leader info for ${org.name}: ${leaderTitle || ''} ${leaderName || ''}`);
    }
    
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

// POST /organizations/:id/upload-logo - Upload organization logo
router.post('/organizations/:id/upload-logo', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { image, logo, url } = req.body;
    
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    let logoUrl = url || logo || image;
    
    // If it's a base64 image, upload to Cloudinary
    if (logoUrl && logoUrl.startsWith('data:image')) {
      try {
        const cloudinary = require('cloudinary').v2;
        const result = await cloudinary.uploader.upload(logoUrl, {
          folder: 'church-logos',
          public_id: `org-${id}-logo`,
          overwrite: true,
          transformation: [{ width: 400, height: 400, crop: 'fill' }]
        });
        logoUrl = result.secure_url;
      } catch (uploadErr) {
        console.error('Cloudinary upload error:', uploadErr);
        return res.status(500).json({ ok: false, error: 'Failed to upload image' });
      }
    }
    
    org.logo = logoUrl;
    org.updatedAt = new Date();
    await org.save();
    
    console.log(`✅ Updated logo for ${org.name}`);
    res.json({ ok: true, logo: logoUrl, message: 'Logo updated' });
  } catch (err) {
    console.error('Upload logo error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /organizations/:id/upload-cover - Upload organization cover image
router.post('/organizations/:id/upload-cover', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { image, coverImage, url } = req.body;
    
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    let coverUrl = url || coverImage || image;
    
    // If it's a base64 image, upload to Cloudinary
    if (coverUrl && coverUrl.startsWith('data:image')) {
      try {
        const cloudinary = require('cloudinary').v2;
        const result = await cloudinary.uploader.upload(coverUrl, {
          folder: 'church-covers',
          public_id: `org-${id}-cover`,
          overwrite: true,
          transformation: [{ width: 1200, height: 400, crop: 'fill' }]
        });
        coverUrl = result.secure_url;
      } catch (uploadErr) {
        console.error('Cloudinary upload error:', uploadErr);
        return res.status(500).json({ ok: false, error: 'Failed to upload image' });
      }
    }
    
    org.coverImage = coverUrl;
    org.updatedAt = new Date();
    await org.save();
    
    console.log(`✅ Updated cover for ${org.name}`);
    res.json({ ok: true, coverImage: coverUrl, message: 'Cover image updated' });
  } catch (err) {
    console.error('Upload cover error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /organizations/:id/images - Update both logo and cover at once
router.put('/organizations/:id/images', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { logo, coverImage } = req.body;
    
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    const cloudinary = require('cloudinary').v2;
    
    // Upload logo if base64
    if (logo && logo.startsWith('data:image')) {
      try {
        const result = await cloudinary.uploader.upload(logo, {
          folder: 'church-logos',
          public_id: `org-${id}-logo`,
          overwrite: true,
          transformation: [{ width: 400, height: 400, crop: 'fill' }]
        });
        org.logo = result.secure_url;
      } catch (e) {
        console.error('Logo upload error:', e);
      }
    } else if (logo) {
      org.logo = logo;
    }
    
    // Upload cover if base64
    if (coverImage && coverImage.startsWith('data:image')) {
      try {
        const result = await cloudinary.uploader.upload(coverImage, {
          folder: 'church-covers',
          public_id: `org-${id}-cover`,
          overwrite: true,
          transformation: [{ width: 1200, height: 400, crop: 'fill' }]
        });
        org.coverImage = result.secure_url;
      } catch (e) {
        console.error('Cover upload error:', e);
      }
    } else if (coverImage) {
      org.coverImage = coverImage;
    }
    
    org.updatedAt = new Date();
    await org.save();
    
    res.json({ ok: true, logo: org.logo, coverImage: org.coverImage, message: 'Images updated' });
  } catch (err) {
    console.error('Update images error:', err);
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
      const query = search.toLowerCase();
      members = members.filter(m => 
        m.user?.name?.toLowerCase().includes(query) ||
        m.user?.username?.toLowerCase().includes(query) ||
        m.firstName?.toLowerCase().includes(query) ||
        m.lastName?.toLowerCase().includes(query) ||
        m.email?.toLowerCase().includes(query)
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
    
    // If not manager, hide sensitive info
    if (!canManage) {
      members = members.map(m => ({
        _id: m._id,
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
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const paginatedMembers = members.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    
    res.json({
      ok: true,
      members: paginatedMembers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      canManage,
      userRole
    });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /organizations/:id/members - Add member
router.post('/organizations/:id/members', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    const memberData = {
      ...req.body,
      joinedAt: new Date(),
      status: 'active',
      addedBy: userId
    };
    
    org.members.push(memberData);
    org.memberCount = org.members.length;
    await org.save();
    
    const newMember = org.members[org.members.length - 1];
    console.log(`👤 Added member to ${org.name}`);
    
    res.status(201).json({ ok: true, member: newMember });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /members/:orgId/:memberId - Get single member (frontend path)
router.get('/members/:orgId/:memberId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { orgId, memberId } = req.params;
    
    const userRole = await getUserRole(userId, orgId);
    if (!userRole) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    
    const org = await ChurchOrg.findById(orgId)
      .populate('members.user', 'name username profilePicture email phone')
      .lean();
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    const member = org.members?.find(m => 
      m._id?.toString() === memberId || 
      m.user?._id?.toString() === memberId ||
      (m.user?._id && m.user._id.toString() === memberId)
    );
    
    if (!member) {
      return res.status(404).json({ ok: false, error: 'Member not found' });
    }
    
    const canManage = ['owner', 'admin', 'assistant'].includes(userRole);
    
    // If not manager, hide sensitive info
    let memberData = member;
    if (!canManage) {
      memberData = {
        _id: member._id,
        user: {
          _id: member.user?._id,
          name: member.user?.name,
          username: member.user?.username,
          profilePicture: member.user?.profilePicture
        },
        role: member.role,
        joinedAt: member.joinedAt,
        status: member.status
      };
    }
    
    res.json({ ok: true, member: memberData, canManage });
  } catch (err) {
    console.error('Get member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /members/:orgId/:memberId - Update member (frontend path)
router.put('/members/:orgId/:memberId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { orgId, memberId } = req.params;
    
    console.log(`📝 PUT /members/${orgId}/${memberId} - Update member request`);
    
    const userRole = await getUserRole(userId, orgId);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Not authorized to edit members' });
    }
    
    const org = await ChurchOrg.findById(orgId);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Find member by _id or user._id
    const memberIndex = org.members?.findIndex(m => 
      m._id?.toString() === memberId || 
      m.user?.toString() === memberId ||
      (m.user?._id && m.user._id.toString() === memberId)
    );
    
    if (memberIndex === -1 || memberIndex === undefined) {
      console.log('❌ Member not found. memberId:', memberId);
      console.log('   Available members:', org.members?.map(m => ({ _id: m._id?.toString(), user: m.user?.toString() })));
      return res.status(404).json({ ok: false, error: 'Member not found in organization' });
    }
    
    // Update all fields from request body
    const member = org.members[memberIndex];
    const updates = req.body;
    
    // Apply all updates
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && key !== '_id' && key !== 'user') {
        member[key] = updates[key];
      }
    });
    
    member.updatedAt = new Date();
    member.updatedBy = userId;
    
    await org.save();
    
    console.log(`✅ Updated member ${memberId} in org ${org.name}`);
    
    res.json({ ok: true, message: 'Member updated successfully', member });
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /members/:orgId/:memberId - Remove member
router.delete('/members/:orgId/:memberId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { orgId, memberId } = req.params;
    
    const userRole = await getUserRole(userId, orgId);
    if (!['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Only owner/admin can remove members' });
    }
    
    const org = await ChurchOrg.findById(orgId);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    if (org.leader?.toString() === memberId) {
      return res.status(400).json({ ok: false, error: 'Cannot remove the owner' });
    }
    
    // Remove member
    org.members = org.members.filter(m => 
      m._id?.toString() !== memberId && 
      m.user?.toString() !== memberId
    );
    org.memberCount = org.members.length;
    
    await org.save();
    
    res.json({ ok: true, message: 'Member removed' });
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// SOULS ROUTES (UPDATED in v3.0.0 for ceZone)
// ==========================================

router.get('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { organizationId, zoneId, churchId, fellowshipId, cellId, ceZoneId, status, page = 1, limit = 20, search } = req.query;
    
    const query = { isActive: { $ne: false } };
    
    if (organizationId) {
      try { query.organization = new ObjectId(organizationId); } catch(e) { query.organization = organizationId; }
    }
    if (zoneId) {
      try { query.zone = new ObjectId(zoneId); } catch(e) { query.zone = zoneId; }
    }
    if (churchId) {
      try { query.church = new ObjectId(churchId); } catch(e) { query.church = churchId; }
    }
    if (fellowshipId) {
      try { query.fellowship = new ObjectId(fellowshipId); } catch(e) { query.fellowship = fellowshipId; }
    }
    if (cellId) {
      try { query.cell = new ObjectId(cellId); } catch(e) { query.cell = cellId; }
    }
    // NEW v3.0.0 filter
    if (ceZoneId) {
      query['ceZone.id'] = ceZoneId;
    }
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    // If no specific filter, show souls from user's orgs
    if (!organizationId && !zoneId && !churchId && !fellowshipId && !cellId && !ceZoneId) {
      const userOrgs = await ChurchOrg.find({
        $or: [{ leader: userId }, { admins: userId }, { assistantLeaders: userId }, { createdBy: userId }],
        isActive: { $ne: false }
      }).select('_id');
      const orgIds = userOrgs.map(o => o._id);
      
      if (orgIds.length > 0) {
        query.$or = [
          { organization: { $in: orgIds } },
          { zone: { $in: orgIds } },
          { church: { $in: orgIds } },
          { fellowship: { $in: orgIds } },
          { cell: { $in: orgIds } },
          { addedBy: userId }
        ];
      } else {
        query.addedBy = userId;
      }
    }
    
    const souls = await Soul.find(query)
      .populate('organization', 'name type')
      .populate('zone', 'name type')
      .populate('church', 'name type')
      .populate('fellowship', 'name type')
      .populate('cell', 'name type')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Soul.countDocuments(query);
    
    res.json({ 
      ok: true, 
      souls, 
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total,
        pages: Math.ceil(total / limit)
      } 
    });
  } catch (err) {
    console.error('Get souls error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /souls/:id - Get single soul
router.get('/souls/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid soul ID' });
    }
    
    const soul = await Soul.findById(id)
      .populate('organization', 'name type')
      .populate('zone', 'name type')
      .populate('church', 'name type')
      .populate('fellowship', 'name type')
      .populate('cell', 'name type')
      .populate('addedBy', 'name username')
      .populate('assignedTo', 'name username');
    
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    res.json({ ok: true, soul });
  } catch (err) {
    console.error('Get soul error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /souls - Add soul (UPDATED in v3.0.0 for ceZone)
router.post('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { 
      firstName, lastName, email, phone, whatsapp, address, city, state, country,
      gender, ageGroup, salvationType, howTheyHeard, howTheyHeardDetails, prayerRequest,
      organizationId, zoneId, churchId, fellowshipId, cellId, 
      // NEW v3.0.0 fields
      ceZone, ceZoneId,
      source, notes, tags
    } = req.body;
    
    if (!firstName) {
      return res.status(400).json({ ok: false, error: 'First name is required' });
    }
    
    // Handle CE Zone (NEW in v3.0.0)
    let ceZoneData = null;
    if (ceZone) {
      ceZoneData = ceZone;
    } else if (ceZoneId) {
      const foundZone = CE_ZONES.find(z => z.id === ceZoneId);
      if (foundZone) {
        ceZoneData = {
          id: foundZone.id,
          name: foundZone.name,
          category: foundZone.category
        };
      }
    }
    
    const soul = new Soul({
      firstName, 
      lastName: lastName || '', 
      email, 
      phone,
      whatsapp,
      address,
      city,
      state,
      country,
      gender,
      ageGroup,
      salvationType: salvationType || 'first_time',
      howTheyHeard,
      howTheyHeardDetails,
      prayerRequest,
      organization: organizationId || null,
      zone: zoneId || null, 
      church: churchId || null, 
      fellowship: fellowshipId || null, 
      cell: cellId || null,
      // NEW v3.0.0 field
      ceZone: ceZoneData,
      source: source || 'manual',
      notes,
      tags: tags || [],
      addedBy: userId,
      status: 'new',
      pipelineStage: 'new_convert'
    });
    
    await soul.save();
    console.log(`🙏 Soul added: ${firstName} ${lastName || ''}${ceZoneData ? ` (Zone: ${ceZoneData.name})` : ''}`);
    res.status(201).json({ ok: true, soul });
  } catch (err) {
    console.error('Add soul error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /souls/:id - Update soul
router.put('/souls/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid soul ID' });
    }
    
    const updates = { ...req.body, lastUpdatedBy: userId, updatedAt: new Date() };
    
    // Handle ceZone update
    if (updates.ceZoneId && !updates.ceZone) {
      const foundZone = CE_ZONES.find(z => z.id === updates.ceZoneId);
      if (foundZone) {
        updates.ceZone = {
          id: foundZone.id,
          name: foundZone.name,
          category: foundZone.category
        };
      }
    }
    
    const soul = await Soul.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('organization', 'name type')
      .populate('zone', 'name type')
      .populate('church', 'name type');
    
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    res.json({ ok: true, soul });
  } catch (err) {
    console.error('Update soul error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /souls/:id/followup - Add follow-up record
router.post('/souls/:id/followup', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    const { type, notes, outcome, nextFollowUpDate, duration } = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid soul ID' });
    }
    
    const followUp = {
      date: new Date(),
      type: type || 'call',
      notes,
      outcome: outcome || 'successful',
      followedUpBy: userId,
      nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
      duration
    };
    
    const soul = await Soul.findByIdAndUpdate(id, {
      $push: { followUps: followUp },
      $set: {
        lastContactDate: new Date(),
        nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
        updatedAt: new Date()
      },
      $inc: { totalFollowUps: 1 }
    }, { new: true });
    
    if (!soul) {
      return res.status(404).json({ ok: false, error: 'Soul not found' });
    }
    
    console.log(`📞 Follow-up recorded for ${soul.firstName} ${soul.lastName || ''}`);
    res.json({ ok: true, soul, followUp });
  } catch (err) {
    console.error('Add followup error:', err);
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

console.log('⛪ Church Management routes v3.0.0 loaded - Ministry Selection + CE Zones Support');

module.exports = router;
