// ============================================
// FILE: church-registration.routes.js
// PATH: cybev-backend-main/routes/church-registration.routes.js
// VERSION: 1.0.0 - Public Registration System
// UPDATED: 2026-01-24
// FEATURES:
//   - Public registration endpoint (no auth required)
//   - Auto-create CYBEV user account
//   - Auto-add as organization member
//   - Generate unique registration links
//   - Track registration source
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = mongoose.Types;

// Import models
const { ChurchOrg } = require('../models/church.model');
let User;
try {
  User = require('../models/user.model');
  if (User.default) User = User.default;
} catch (e) {
  User = mongoose.model('User');
}

// Title options for reference
const VALID_TITLES = [
  'GO', 'Bishop', 'Archbishop', 'Rev', 'Pastor', 'Evangelist', 'Prophet',
  'Apostle', 'Deacon', 'Deaconess', 'Elder', 'Minister', 'Dr', 'Prof',
  'Engr', 'Barr', 'Chief', 'Mr', 'Mrs', 'Miss', 'Ms', 'Bro', 'Sis', 'custom'
];

// ==========================================
// GET /register/:slug - Get organization info for registration
// PUBLIC - No authentication required
// ==========================================
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Find org by slug or ID
    let org;
    if (ObjectId.isValid(slug)) {
      org = await ChurchOrg.findById(slug)
        .populate('leader', 'name')
        .populate('parent', 'name type')
        .populate('zone', 'name')
        .populate('church', 'name');
    } else {
      org = await ChurchOrg.findOne({ slug, isActive: true })
        .populate('leader', 'name')
        .populate('parent', 'name type')
        .populate('zone', 'name')
        .populate('church', 'name');
    }
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Check if registration is enabled
    if (org.settings?.allowJoinRequests === false) {
      return res.status(403).json({ ok: false, error: 'Registration is currently closed for this organization' });
    }
    
    // Return public info only
    res.json({
      ok: true,
      organization: {
        _id: org._id,
        name: org.name,
        slug: org.slug,
        type: org.type,
        description: org.description,
        motto: org.motto,
        logo: org.logo,
        coverImage: org.coverImage,
        colorTheme: org.colorTheme,
        contact: {
          address: org.contact?.address,
          city: org.contact?.city,
          state: org.contact?.state,
          country: org.contact?.country
        },
        meetingSchedule: org.meetingSchedule,
        leader: org.leader ? { name: org.leader.name } : null,
        parent: org.parent ? { name: org.parent.name, type: org.parent.type } : null,
        zone: org.zone ? { name: org.zone.name } : null,
        church: org.church ? { name: org.church.name } : null,
        memberCount: org.memberCount || 0,
        socialLinks: org.socialLinks
      },
      registrationFields: getRegistrationFields(org.type)
    });
  } catch (err) {
    console.error('Get registration info error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /register/:slug - Register new member
// PUBLIC - No authentication required
// Creates user account + adds to organization
// ==========================================
router.post('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      // Personal
      title, customTitle, firstName, lastName, email, phone, whatsapp,
      gender, dateOfBirth, maritalStatus, weddingAnniversary,
      // Address
      address, city, state, country, postalCode,
      // Spiritual
      isSaved, salvationDate, baptismType, baptismDate,
      // Foundation School
      enrollInFoundationSchool,
      // Professional
      profession, employer, skills,
      // Social Media
      socialMedia,
      // Emergency Contact
      emergencyContact,
      // Other
      howDidYouHear, notes, password
    } = req.body;

    // Validation
    if (!firstName?.trim()) {
      return res.status(400).json({ ok: false, error: 'First name is required' });
    }
    if (!phone?.trim() && !email?.trim()) {
      return res.status(400).json({ ok: false, error: 'Phone or email is required' });
    }

    // Find organization
    let org;
    if (ObjectId.isValid(slug)) {
      org = await ChurchOrg.findById(slug);
    } else {
      org = await ChurchOrg.findOne({ slug, isActive: true });
    }
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }

    // Check if registration is enabled
    if (org.settings?.allowJoinRequests === false) {
      return res.status(403).json({ ok: false, error: 'Registration is currently closed' });
    }

    // Check for existing member by email or phone
    const existingMember = org.members?.find(m => 
      (email && m.email?.toLowerCase() === email.toLowerCase()) ||
      (phone && m.phone === phone)
    );
    
    if (existingMember) {
      return res.status(400).json({ ok: false, error: 'You are already registered with this organization' });
    }

    // Create or find CYBEV user account
    let user = null;
    let isNewUser = false;
    let authToken = null;

    if (email) {
      // Check if user exists
      user = await User.findOne({ email: email.toLowerCase() });
      
      if (!user) {
        // Create new user account
        isNewUser = true;
        
        // Generate username from name
        let baseUsername = `${firstName}${lastName || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (baseUsername.length < 3) baseUsername = `user${Date.now().toString().slice(-6)}`;
        
        let username = baseUsername;
        let counter = 1;
        while (await User.findOne({ username })) {
          username = `${baseUsername}${counter++}`;
        }
        
        // Generate password if not provided
        const userPassword = password || `${firstName.toLowerCase()}${phone?.slice(-4) || '1234'}`;
        const hashedPassword = await bcrypt.hash(userPassword, 10);
        
        user = new User({
          name: `${firstName} ${lastName || ''}`.trim(),
          username,
          email: email.toLowerCase(),
          password: hashedPassword,
          phone,
          isEmailVerified: false,
          role: 'user',
          profilePicture: `https://ui-avatars.com/api/?name=${encodeURIComponent(firstName)}&background=7c3aed&color=fff`,
          bio: profession ? `${profession}${employer ? ` at ${employer}` : ''}` : '',
          createdAt: new Date()
        });
        
        await user.save();
        
        // Generate auth token for new user
        authToken = jwt.sign(
          { id: user._id, email: user.email },
          process.env.JWT_SECRET || 'cybev_secret',
          { expiresIn: '30d' }
        );
      }
    }

    // Add member to organization
    const newMember = {
      user: user?._id,
      firstName,
      lastName,
      email: email?.toLowerCase(),
      phone,
      whatsapp: whatsapp || phone,
      title: VALID_TITLES.includes(title) ? title : 'Bro',
      customTitle: title === 'custom' ? customTitle : undefined,
      role: 'member',
      isSaved: isSaved !== false,
      salvationDate,
      baptismType,
      baptismDate,
      foundationSchool: {
        enrolled: enrollInFoundationSchool || false,
        status: enrollInFoundationSchool ? 'enrolled' : 'not_enrolled'
      },
      dateOfBirth,
      gender,
      maritalStatus,
      weddingAnniversary,
      address: {
        street: address,
        city,
        state,
        country,
        postalCode
      },
      profession,
      employer,
      skills: Array.isArray(skills) ? skills : skills?.split(',').map(s => s.trim()),
      socialMedia,
      emergencyContact,
      joinedAt: new Date(),
      joinedHow: 'online',
      notes,
      tags: ['online_registration'],
      status: org.settings?.requireApproval ? 'pending' : 'active',
      addedBy: null, // Self-registered
      createdAt: new Date(),
      updatedAt: new Date()
    };

    org.members.push(newMember);
    org.memberCount = org.members.filter(m => m.status === 'active').length;
    await org.save();

    const addedMember = org.members[org.members.length - 1];

    // Response
    res.status(201).json({
      ok: true,
      message: org.settings?.requireApproval 
        ? 'Registration submitted! Awaiting approval from the organization.'
        : 'Welcome! You have been successfully registered.',
      member: {
        _id: addedMember._id,
        firstName: addedMember.firstName,
        lastName: addedMember.lastName,
        status: addedMember.status
      },
      organization: {
        _id: org._id,
        name: org.name,
        type: org.type
      },
      user: user ? {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        isNewUser
      } : null,
      token: authToken, // Only for new users
      loginCredentials: isNewUser ? {
        email: user.email,
        tempPassword: password ? undefined : `${firstName.toLowerCase()}${phone?.slice(-4) || '1234'}`,
        note: password ? undefined : 'Please change your password after logging in'
      } : null
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /register/:slug/link - Get shareable registration link
// ==========================================
router.get('/:slug/link', async (req, res) => {
  try {
    const { slug } = req.params;
    
    let org;
    if (ObjectId.isValid(slug)) {
      org = await ChurchOrg.findById(slug).select('name slug type');
    } else {
      org = await ChurchOrg.findOne({ slug }).select('name slug type');
    }
    
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Generate link using slug or ID
    const baseUrl = process.env.FRONTEND_URL || 'https://cybev.io';
    const registrationLink = `${baseUrl}/join/${org.slug || org._id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(registrationLink)}`;
    
    res.json({
      ok: true,
      organization: {
        _id: org._id,
        name: org.name,
        slug: org.slug,
        type: org.type
      },
      registrationLink,
      qrCodeUrl,
      shareText: `Join ${org.name}! Register here: ${registrationLink}`
    });
  } catch (err) {
    console.error('Get link error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /register/:slug/generate-slug - Generate unique slug
// ==========================================
router.post('/:id/generate-slug', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    }
    
    const org = await ChurchOrg.findById(id);
    if (!org) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }
    
    // Generate slug from name if not exists
    if (!org.slug) {
      let baseSlug = org.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
      
      let slug = baseSlug;
      let counter = 1;
      while (await ChurchOrg.findOne({ slug, _id: { $ne: id } })) {
        slug = `${baseSlug}-${counter++}`;
      }
      
      org.slug = slug;
      await org.save();
    }
    
    const baseUrl = process.env.FRONTEND_URL || 'https://cybev.io';
    
    res.json({
      ok: true,
      slug: org.slug,
      registrationLink: `${baseUrl}/join/${org.slug}`
    });
  } catch (err) {
    console.error('Generate slug error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Helper: Get registration fields based on org type
function getRegistrationFields(orgType) {
  const baseFields = [
    { name: 'title', label: 'Title', type: 'select', required: false },
    { name: 'firstName', label: 'First Name', type: 'text', required: true },
    { name: 'lastName', label: 'Last Name', type: 'text', required: false },
    { name: 'email', label: 'Email', type: 'email', required: false },
    { name: 'phone', label: 'Phone Number', type: 'tel', required: true },
    { name: 'whatsapp', label: 'WhatsApp', type: 'tel', required: false },
    { name: 'gender', label: 'Gender', type: 'select', required: false },
    { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: false },
    { name: 'address', label: 'Address', type: 'text', required: false },
    { name: 'city', label: 'City', type: 'text', required: false },
    { name: 'profession', label: 'Profession', type: 'text', required: false }
  ];
  
  // Add spiritual fields for church types
  if (['zone', 'church', 'fellowship', 'cell'].includes(orgType)) {
    baseFields.push(
      { name: 'isSaved', label: 'Born Again?', type: 'checkbox', required: false },
      { name: 'enrollInFoundationSchool', label: 'Enroll in Foundation School', type: 'checkbox', required: false }
    );
  }
  
  return baseFields;
}

module.exports = router;
