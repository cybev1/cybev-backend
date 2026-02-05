// ============================================
// FILE: member-management.routes.js
// PATH: cybev-backend-main/routes/member-management.routes.js
// VERSION: 1.0.0 - Comprehensive Member Management
// UPDATED: 2026-01-24
// FEATURES:
//   - Add/Edit/Delete members
//   - Member titles (GO, Pastor, etc.)
//   - Foundation School enrollment tracking
//   - Export to CSV/Excel
//   - Bulk operations
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Import models
const { ChurchOrg, Soul, FoundationEnrollment, MEMBER_TITLES } = require('../models/church.model');

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

// Helper: Check if user can manage org
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
// GET /members/titles - Get available titles
// ==========================================
router.get('/titles', (req, res) => {
  const titles = [
    { value: 'GO', label: 'General Overseer (GO)' },
    { value: 'Bishop', label: 'Bishop' },
    { value: 'Archbishop', label: 'Archbishop' },
    { value: 'Rev', label: 'Reverend (Rev)' },
    { value: 'Pastor', label: 'Pastor' },
    { value: 'Evangelist', label: 'Evangelist' },
    { value: 'Prophet', label: 'Prophet' },
    { value: 'Apostle', label: 'Apostle' },
    { value: 'Deacon', label: 'Deacon' },
    { value: 'Deaconess', label: 'Deaconess' },
    { value: 'Elder', label: 'Elder' },
    { value: 'Minister', label: 'Minister' },
    { value: 'Dr', label: 'Dr' },
    { value: 'Prof', label: 'Prof' },
    { value: 'Engr', label: 'Engr' },
    { value: 'Barr', label: 'Barr' },
    { value: 'Chief', label: 'Chief' },
    { value: 'Mr', label: 'Mr' },
    { value: 'Mrs', label: 'Mrs' },
    { value: 'Miss', label: 'Miss' },
    { value: 'Ms', label: 'Ms' },
    { value: 'Bro', label: 'Brother (Bro)' },
    { value: 'Sis', label: 'Sister (Sis)' },
    { value: 'custom', label: 'Custom Title' }
  ];
  res.json({ ok: true, titles });
});

// ==========================================
// GET /members/:orgId - Get all members of an org
// ==========================================
router.get('/:orgId', verifyToken, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { status, search, role, title, page = 1, limit = 50, sort = 'firstName', order = 'asc' } = req.query;
    
    if (!ObjectId.isValid(orgId)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    }
    
    const org = await ChurchOrg.findById(orgId)
      .populate('members.user', 'name username email profilePicture')
      .populate('members.localChurch', 'name type')
      .populate('members.cell', 'name')
      .populate('members.fellowship', 'name');
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    let members = org.members || [];
    
    // Filter by status
    if (status) {
      members = members.filter(m => m.status === status);
    }
    
    // Filter by role
    if (role) {
      members = members.filter(m => m.role === role);
    }
    
    // Filter by title
    if (title) {
      members = members.filter(m => m.title === title);
    }
    
    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      members = members.filter(m => {
        const name = `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase();
        const email = (m.email || '').toLowerCase();
        const phone = (m.phone || '').toLowerCase();
        return name.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower);
      });
    }
    
    // Sort
    const sortOrder = order === 'desc' ? -1 : 1;
    members.sort((a, b) => {
      const aVal = a[sort] || '';
      const bVal = b[sort] || '';
      return aVal.localeCompare(bVal) * sortOrder;
    });
    
    // Pagination
    const total = members.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedMembers = members.slice(startIndex, startIndex + parseInt(limit));
    
    // Stats
    const stats = {
      total: org.members?.length || 0,
      active: org.members?.filter(m => m.status === 'active').length || 0,
      inactive: org.members?.filter(m => m.status === 'inactive').length || 0,
      workers: org.members?.filter(m => ['worker', 'leader', 'pastor'].includes(m.role)).length || 0,
      fsEnrolled: org.members?.filter(m => m.foundationSchool?.enrolled).length || 0,
      fsGraduated: org.members?.filter(m => m.foundationSchool?.status === 'graduated').length || 0
    };
    
    res.json({
      ok: true,
      members: paginatedMembers,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /members/:orgId - Add new member
// ==========================================
router.post('/:orgId', verifyToken, async (req, res) => {
  try {
    const { orgId } = req.params;
    const userId = req.user.id || req.user._id;
    
    if (!ObjectId.isValid(orgId)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    }
    
    // Check permission
    const canManage = await canManageOrg(userId, orgId);
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'Not authorized to manage this organization' });
    }
    
    const {
      firstName, lastName, email, phone, whatsapp,
      title, customTitle, role, department,
      isSaved, salvationDate, baptismDate, baptismType,
      foundationSchoolEnrolled, foundationSchoolStatus,
      dateOfBirth, gender, maritalStatus, weddingAnniversary,
      address, profession, employer, skills,
      localChurch, cell, fellowship,
      socialMedia, emergencyContact,
      membershipId, joinedAt, joinedHow, previousChurch,
      notes, tags, profilePhoto
    } = req.body;
    
    // Validate required fields
    if (!firstName) {
      return res.status(400).json({ ok: false, error: 'First name is required' });
    }
    
    const org = await ChurchOrg.findById(orgId);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Check for duplicate (by email or phone)
    if (email || phone) {
      const duplicate = org.members?.find(m => 
        (email && m.email?.toLowerCase() === email.toLowerCase()) ||
        (phone && m.phone === phone)
      );
      if (duplicate) {
        return res.status(400).json({ ok: false, error: 'A member with this email or phone already exists' });
      }
    }
    
    // Create member object
    const newMember = {
      firstName,
      lastName,
      email: email?.toLowerCase(),
      phone,
      whatsapp,
      title: title || 'Bro',
      customTitle,
      role: role || 'member',
      department,
      isSaved: isSaved !== false,
      salvationDate,
      baptismDate,
      baptismType,
      foundationSchool: {
        enrolled: foundationSchoolEnrolled || false,
        status: foundationSchoolStatus || 'not_enrolled'
      },
      dateOfBirth,
      gender,
      maritalStatus,
      weddingAnniversary,
      address: typeof address === 'object' ? address : { street: address },
      profession,
      employer,
      skills: Array.isArray(skills) ? skills : skills?.split(',').map(s => s.trim()),
      localChurch: ObjectId.isValid(localChurch) ? localChurch : undefined,
      cell: ObjectId.isValid(cell) ? cell : undefined,
      fellowship: ObjectId.isValid(fellowship) ? fellowship : undefined,
      socialMedia,
      emergencyContact,
      membershipId,
      joinedAt: joinedAt || new Date(),
      joinedHow,
      previousChurch,
      notes,
      tags: Array.isArray(tags) ? tags : tags?.split(',').map(t => t.trim()),
      profilePhoto,
      status: 'active',
      addedBy: userId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Add member
    org.members.push(newMember);
    org.memberCount = org.members.filter(m => m.status === 'active').length;
    await org.save();
    
    const addedMember = org.members[org.members.length - 1];
    
    res.status(201).json({
      ok: true,
      message: 'Member added successfully',
      member: addedMember
    });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// PUT /members/:orgId/:memberId - Update member
// ==========================================
router.put('/:orgId/:memberId', verifyToken, async (req, res) => {
  try {
    const { orgId, memberId } = req.params;
    const userId = req.user.id || req.user._id;
    
    if (!ObjectId.isValid(orgId) || !ObjectId.isValid(memberId)) {
      return res.status(400).json({ ok: false, error: 'Invalid ID' });
    }
    
    // Check permission
    const canManage = await canManageOrg(userId, orgId);
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(orgId);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    const memberIndex = org.members.findIndex(m => m._id.toString() === memberId);
    if (memberIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Member not found' });
    }
    
    // Update fields
    const updateFields = [
      'firstName', 'lastName', 'email', 'phone', 'whatsapp',
      'title', 'customTitle', 'role', 'department',
      'isSaved', 'salvationDate', 'baptismDate', 'baptismType',
      'dateOfBirth', 'gender', 'maritalStatus', 'weddingAnniversary',
      'address', 'profession', 'employer', 'skills',
      'localChurch', 'cell', 'fellowship',
      'socialMedia', 'emergencyContact',
      'membershipId', 'joinedAt', 'joinedHow', 'previousChurch',
      'notes', 'tags', 'profilePhoto', 'status'
    ];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'email' && req.body[field]) {
          org.members[memberIndex][field] = req.body[field].toLowerCase();
        } else if (field === 'skills' || field === 'tags') {
          org.members[memberIndex][field] = Array.isArray(req.body[field]) 
            ? req.body[field] 
            : req.body[field]?.split(',').map(s => s.trim());
        } else if (['localChurch', 'cell', 'fellowship'].includes(field)) {
          org.members[memberIndex][field] = ObjectId.isValid(req.body[field]) ? req.body[field] : undefined;
        } else {
          org.members[memberIndex][field] = req.body[field];
        }
      }
    });
    
    // Handle foundation school update
    if (req.body.foundationSchool) {
      org.members[memberIndex].foundationSchool = {
        ...org.members[memberIndex].foundationSchool,
        ...req.body.foundationSchool
      };
    }
    if (req.body.foundationSchoolEnrolled !== undefined) {
      org.members[memberIndex].foundationSchool.enrolled = req.body.foundationSchoolEnrolled;
    }
    if (req.body.foundationSchoolStatus) {
      org.members[memberIndex].foundationSchool.status = req.body.foundationSchoolStatus;
    }
    
    org.members[memberIndex].lastUpdatedBy = userId;
    org.members[memberIndex].updatedAt = new Date();
    
    org.memberCount = org.members.filter(m => m.status === 'active').length;
    await org.save();
    
    res.json({
      ok: true,
      message: 'Member updated successfully',
      member: org.members[memberIndex]
    });
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// DELETE /members/:orgId/:memberId - Delete member
// ==========================================
router.delete('/:orgId/:memberId', verifyToken, async (req, res) => {
  try {
    const { orgId, memberId } = req.params;
    const userId = req.user.id || req.user._id;
    const { permanent } = req.query; // If true, permanently delete; otherwise mark inactive
    
    if (!ObjectId.isValid(orgId) || !ObjectId.isValid(memberId)) {
      return res.status(400).json({ ok: false, error: 'Invalid ID' });
    }
    
    // Check permission
    const canManage = await canManageOrg(userId, orgId);
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(orgId);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    const memberIndex = org.members.findIndex(m => m._id.toString() === memberId);
    if (memberIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Member not found' });
    }
    
    if (permanent === 'true') {
      // Permanently delete
      org.members.splice(memberIndex, 1);
    } else {
      // Soft delete - mark as inactive
      org.members[memberIndex].status = 'inactive';
      org.members[memberIndex].updatedAt = new Date();
    }
    
    org.memberCount = org.members.filter(m => m.status === 'active').length;
    await org.save();
    
    res.json({
      ok: true,
      message: permanent === 'true' ? 'Member permanently deleted' : 'Member marked as inactive'
    });
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /members/:orgId/export - Export members
// ==========================================
router.get('/:orgId/export', verifyToken, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { format = 'csv', status } = req.query;
    const userId = req.user.id || req.user._id;
    
    if (!ObjectId.isValid(orgId)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    }
    
    // Check permission
    const canManage = await canManageOrg(userId, orgId);
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(orgId)
      .populate('members.localChurch', 'name')
      .populate('members.cell', 'name')
      .populate('members.fellowship', 'name');
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    let members = org.members || [];
    
    if (status) {
      members = members.filter(m => m.status === status);
    }
    
    // Format data for export
    const exportData = members.map(m => ({
      'Title': m.title || '',
      'First Name': m.firstName || '',
      'Last Name': m.lastName || '',
      'Full Name': `${m.title || ''} ${m.firstName || ''} ${m.lastName || ''}`.trim(),
      'Email': m.email || '',
      'Phone': m.phone || '',
      'WhatsApp': m.whatsapp || '',
      'Gender': m.gender || '',
      'Date of Birth': m.dateOfBirth ? new Date(m.dateOfBirth).toLocaleDateString() : '',
      'Marital Status': m.maritalStatus || '',
      'Role': m.role || 'member',
      'Department': m.department || '',
      'Profession': m.profession || '',
      'Employer': m.employer || '',
      'Address': typeof m.address === 'object' ? `${m.address.street || ''}, ${m.address.city || ''}, ${m.address.state || ''}` : (m.address || ''),
      'Is Saved': m.isSaved ? 'Yes' : 'No',
      'Salvation Date': m.salvationDate ? new Date(m.salvationDate).toLocaleDateString() : '',
      'Baptized': m.baptismType && m.baptismType !== 'none' ? 'Yes' : 'No',
      'Foundation School': m.foundationSchool?.status || 'not_enrolled',
      'FS Graduated': m.foundationSchool?.status === 'graduated' ? 'Yes' : 'No',
      'Local Church': m.localChurch?.name || '',
      'Cell': m.cell?.name || '',
      'Fellowship': m.fellowship?.name || '',
      'Joined Date': m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '',
      'Joined How': m.joinedHow || '',
      'Status': m.status || 'active',
      'Facebook': m.socialMedia?.facebook || '',
      'Instagram': m.socialMedia?.instagram || '',
      'Twitter': m.socialMedia?.twitter || '',
      'LinkedIn': m.socialMedia?.linkedin || '',
      'Notes': m.notes || ''
    }));
    
    if (format === 'json') {
      return res.json({ ok: true, data: exportData, total: exportData.length });
    }
    
    // Generate CSV
    if (exportData.length === 0) {
      return res.status(400).json({ ok: false, error: 'No members to export' });
    }
    
    const headers = Object.keys(exportData[0]);
    const csvRows = [
      headers.join(','),
      ...exportData.map(row => 
        headers.map(h => {
          const val = row[h] || '';
          // Escape quotes and wrap in quotes if contains comma
          const escaped = String(val).replace(/"/g, '""');
          return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') 
            ? `"${escaped}"` 
            : escaped;
        }).join(',')
      )
    ];
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${org.name.replace(/[^a-z0-9]/gi, '_')}_members_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
    
  } catch (err) {
    console.error('Export members error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /members/:orgId/bulk - Bulk operations
// ==========================================
router.post('/:orgId/bulk', verifyToken, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { action, memberIds, data } = req.body;
    const userId = req.user.id || req.user._id;
    
    if (!ObjectId.isValid(orgId)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    }
    
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'No members selected' });
    }
    
    // Check permission
    const canManage = await canManageOrg(userId, orgId);
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(orgId);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    let updated = 0;
    
    switch (action) {
      case 'delete':
        org.members = org.members.filter(m => !memberIds.includes(m._id.toString()));
        updated = memberIds.length;
        break;
        
      case 'deactivate':
        org.members.forEach(m => {
          if (memberIds.includes(m._id.toString())) {
            m.status = 'inactive';
            m.updatedAt = new Date();
            updated++;
          }
        });
        break;
        
      case 'activate':
        org.members.forEach(m => {
          if (memberIds.includes(m._id.toString())) {
            m.status = 'active';
            m.updatedAt = new Date();
            updated++;
          }
        });
        break;
        
      case 'update_role':
        if (!data?.role) {
          return res.status(400).json({ ok: false, error: 'Role is required' });
        }
        org.members.forEach(m => {
          if (memberIds.includes(m._id.toString())) {
            m.role = data.role;
            m.updatedAt = new Date();
            updated++;
          }
        });
        break;
        
      case 'assign_cell':
        if (!data?.cellId || !ObjectId.isValid(data.cellId)) {
          return res.status(400).json({ ok: false, error: 'Valid cell ID is required' });
        }
        org.members.forEach(m => {
          if (memberIds.includes(m._id.toString())) {
            m.cell = data.cellId;
            m.updatedAt = new Date();
            updated++;
          }
        });
        break;
        
      case 'enroll_fs':
        org.members.forEach(m => {
          if (memberIds.includes(m._id.toString())) {
            m.foundationSchool = {
              ...m.foundationSchool,
              enrolled: true,
              status: 'enrolled'
            };
            m.updatedAt = new Date();
            updated++;
          }
        });
        break;
        
      default:
        return res.status(400).json({ ok: false, error: 'Invalid action' });
    }
    
    org.memberCount = org.members.filter(m => m.status === 'active').length;
    await org.save();
    
    res.json({
      ok: true,
      message: `${updated} members updated`,
      updated
    });
  } catch (err) {
    console.error('Bulk operation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /members/:orgId/import - Import members from CSV
// ==========================================
router.post('/:orgId/import', verifyToken, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { members: importData } = req.body;
    const userId = req.user.id || req.user._id;
    
    if (!ObjectId.isValid(orgId)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    }
    
    if (!Array.isArray(importData) || importData.length === 0) {
      return res.status(400).json({ ok: false, error: 'No data to import' });
    }
    
    // Check permission
    const canManage = await canManageOrg(userId, orgId);
    if (!canManage) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const org = await ChurchOrg.findById(orgId);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    let imported = 0;
    let skipped = 0;
    const errors = [];
    
    for (const row of importData) {
      try {
        // Skip if no name
        if (!row.firstName && !row['First Name']) {
          skipped++;
          continue;
        }
        
        const firstName = row.firstName || row['First Name'] || '';
        const lastName = row.lastName || row['Last Name'] || '';
        const email = (row.email || row.Email || '').toLowerCase();
        const phone = row.phone || row.Phone || '';
        
        // Check duplicate
        const isDuplicate = org.members.some(m => 
          (email && m.email === email) || (phone && m.phone === phone)
        );
        
        if (isDuplicate) {
          skipped++;
          continue;
        }
        
        org.members.push({
          firstName,
          lastName,
          email,
          phone,
          whatsapp: row.whatsapp || row.WhatsApp || phone,
          title: row.title || row.Title || 'Bro',
          gender: (row.gender || row.Gender || '').toLowerCase(),
          profession: row.profession || row.Profession || '',
          address: { street: row.address || row.Address || '' },
          isSaved: true,
          status: 'active',
          joinedAt: new Date(),
          joinedHow: 'import',
          addedBy: userId,
          createdAt: new Date()
        });
        
        imported++;
      } catch (e) {
        errors.push({ row, error: e.message });
      }
    }
    
    org.memberCount = org.members.filter(m => m.status === 'active').length;
    await org.save();
    
    res.json({
      ok: true,
      message: `Imported ${imported} members, skipped ${skipped}`,
      imported,
      skipped,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    });
  } catch (err) {
    console.error('Import members error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
