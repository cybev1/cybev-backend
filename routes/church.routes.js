// ============================================
// FILE: routes/church.routes.js
// Online Church Management System API
// VERSION: 3.0.0 - Ministry Selection + CE Zones Support
// PREVIOUS: 2.8.0 - Direct /members routes for frontend
// 
// NEW IN 3.0.0:
//   - Added ministry field (christ_embassy / others)
//   - Added 263 Christ Embassy zones as preset data
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
// CHRIST EMBASSY ZONES DATA (263 Zones)
// Complete comprehensive list
// Categories: zone, ministry, mvp, blw, ism, digital, department
// ==========================================
const CE_ZONES = [
  // ========== MAIN ZONES (106 zones) ==========
  { id: 'zone-001', name: 'Abakaliki Zone', category: 'zone' },
  { id: 'zone-002', name: 'Abeokuta Ministry Centre', category: 'zone' },
  { id: 'zone-003', name: 'Abuja Ministry Centre', category: 'zone' },
  { id: 'zone-004', name: 'Abuja Zone 1', category: 'zone' },
  { id: 'zone-005', name: 'Abuja Zone 2', category: 'zone' },
  { id: 'zone-006', name: 'Accra Ghana Zone', category: 'zone' },
  { id: 'zone-007', name: 'Australia Region', category: 'zone' },
  { id: 'zone-008', name: 'Benin Zone 1', category: 'zone' },
  { id: 'zone-009', name: 'Benin Zone 2', category: 'zone' },
  { id: 'zone-010', name: 'C.E Amsterdam', category: 'zone' },
  { id: 'zone-011', name: 'C.E Kenya Sub Zone A', category: 'zone' },
  { id: 'zone-012', name: 'C.E Kenya Sub Zone B', category: 'zone' },
  { id: 'zone-013', name: 'Calabar Ministry Centre', category: 'zone' },
  { id: 'zone-014', name: 'Cape Town Zone 1', category: 'zone' },
  { id: 'zone-015', name: 'Cape Town Zone 2', category: 'zone' },
  { id: 'zone-016', name: 'CHAD Zone', category: 'zone' },
  { id: 'zone-017', name: 'Christ Embassy Barking DSP', category: 'zone' },
  { id: 'zone-018', name: 'Dallas Zone (USA)', category: 'zone' },
  { id: 'zone-019', name: 'Durban Zone, South Africa', category: 'zone' },
  { id: 'zone-020', name: 'East Asia Region', category: 'zone' },
  { id: 'zone-021', name: 'Eastern Europe Region', category: 'zone' },
  { id: 'zone-022', name: 'Edo North & Central Zone', category: 'zone' },
  { id: 'zone-023', name: 'EWCA Zone 1', category: 'zone' },
  { id: 'zone-024', name: 'EWCA Zone 2', category: 'zone' },
  { id: 'zone-025', name: 'EWCA Zone 3', category: 'zone' },
  { id: 'zone-026', name: 'EWCA Zone 4', category: 'zone' },
  { id: 'zone-027', name: 'EWCA Zone 5', category: 'zone' },
  { id: 'zone-028', name: 'EWCA Zone 6', category: 'zone' },
  { id: 'zone-029', name: 'Ibadan Zone 1', category: 'zone' },
  { id: 'zone-030', name: 'Ibadan Zone 2', category: 'zone' },
  { id: 'zone-031', name: 'India Zone', category: 'zone' },
  { id: 'zone-032', name: 'India Zone 2', category: 'zone' },
  { id: 'zone-033', name: 'International Missions for South East Asia', category: 'zone' },
  { id: 'zone-034', name: 'Ireland Sub Zone 2 Region 2', category: 'zone' },
  { id: 'zone-035', name: 'Katsina Sub Zone', category: 'zone' },
  { id: 'zone-036', name: 'Kenya Zone', category: 'zone' },
  { id: 'zone-037', name: 'Kogi Sub Zone', category: 'zone' },
  { id: 'zone-038', name: 'Lafia Sub Zone', category: 'zone' },
  { id: 'zone-039', name: 'Lagos Sub Zone A', category: 'zone' },
  { id: 'zone-040', name: 'Lagos Sub Zone B', category: 'zone' },
  { id: 'zone-041', name: 'Lagos Sub Zone C', category: 'zone' },
  { id: 'zone-042', name: 'Lagos Sub Zone D', category: 'zone' },
  { id: 'zone-043', name: 'Lagos Virtual Zone', category: 'zone' },
  { id: 'zone-044', name: 'Lagos Zone 1', category: 'zone' },
  { id: 'zone-045', name: 'Lagos Zone 2', category: 'zone' },
  { id: 'zone-046', name: 'Lagos Zone 3', category: 'zone' },
  { id: 'zone-047', name: 'Lagos Zone 4', category: 'zone' },
  { id: 'zone-048', name: 'Lagos Zone 5', category: 'zone' },
  { id: 'zone-049', name: 'Lagos Zone 6', category: 'zone' },
  { id: 'zone-050', name: 'Loveworld Church Zone', category: 'zone' },
  { id: 'zone-051', name: 'Loveworld Global Fellowship', category: 'zone' },
  { id: 'zone-052', name: 'Maiduguri Sub Zone', category: 'zone' },
  { id: 'zone-053', name: 'Middle East Zone', category: 'zone' },
  { id: 'zone-054', name: 'Midwest Zone', category: 'zone' },
  { id: 'zone-055', name: 'Ministry Center Ibadan', category: 'zone' },
  { id: 'zone-056', name: 'Niger Sub Zone, Nigeria', category: 'zone' },
  { id: 'zone-057', name: 'Nigeria North Central Zone 1', category: 'zone' },
  { id: 'zone-058', name: 'Nigeria North Central Zone 2', category: 'zone' },
  { id: 'zone-059', name: 'Nigeria South West Zone 4', category: 'zone' },
  { id: 'zone-060', name: 'Nigeria South West Zone 5', category: 'zone' },
  { id: 'zone-061', name: 'NNE Zone 1', category: 'zone' },
  { id: 'zone-062', name: 'NNW Zone 1', category: 'zone' },
  { id: 'zone-063', name: 'NNW Zone 2', category: 'zone' },
  { id: 'zone-064', name: 'NSE Zone 1', category: 'zone' },
  { id: 'zone-065', name: 'NSE Zone 3', category: 'zone' },
  { id: 'zone-066', name: 'NSS Zone 1', category: 'zone' },
  { id: 'zone-067', name: 'NSS Zone 2', category: 'zone' },
  { id: 'zone-068', name: 'NSS Zone 3', category: 'zone' },
  { id: 'zone-069', name: 'NSW Zone 1', category: 'zone' },
  { id: 'zone-070', name: 'NSW Zone 2', category: 'zone' },
  { id: 'zone-071', name: 'NSW Zone 3', category: 'zone' },
  { id: 'zone-072', name: 'Onitsha Zone', category: 'zone' },
  { id: 'zone-073', name: 'Ottawa Zone, Canada', category: 'zone' },
  { id: 'zone-074', name: 'Port Harcourt Zone 1', category: 'zone' },
  { id: 'zone-075', name: 'Port Harcourt Zone 2', category: 'zone' },
  { id: 'zone-076', name: 'Port Harcourt Zone 3', category: 'zone' },
  { id: 'zone-077', name: 'Quebec Zone', category: 'zone' },
  { id: 'zone-078', name: 'South America Region', category: 'zone' },
  { id: 'zone-079', name: 'South East Asia International', category: 'zone' },
  { id: 'zone-080', name: 'Southern Africa Zone 1', category: 'zone' },
  { id: 'zone-081', name: 'Southern Africa Zone 2', category: 'zone' },
  { id: 'zone-082', name: 'Southern Africa Zone 3', category: 'zone' },
  { id: 'zone-083', name: 'Southern Africa Zone 4', category: 'zone' },
  { id: 'zone-084', name: 'Southern Africa Zone 5', category: 'zone' },
  { id: 'zone-085', name: 'Tanzania Zone', category: 'zone' },
  { id: 'zone-086', name: 'Taraba Sub Zone', category: 'zone' },
  { id: 'zone-087', name: 'Toronto Zone', category: 'zone' },
  { id: 'zone-088', name: 'UK Zone 1 DSP Region', category: 'zone' },
  { id: 'zone-089', name: 'UK Zone 1 Region 2', category: 'zone' },
  { id: 'zone-090', name: 'UK Zone 2 DSP Region', category: 'zone' },
  { id: 'zone-091', name: 'UK Zone 2 Region 2', category: 'zone' },
  { id: 'zone-092', name: 'UK Zone 3 DSP Region', category: 'zone' },
  { id: 'zone-093', name: 'UK Zone 3 Region 2', category: 'zone' },
  { id: 'zone-094', name: 'UK Zone 4 DSP Region', category: 'zone' },
  { id: 'zone-095', name: 'UK Zone 4 Region 2', category: 'zone' },
  { id: 'zone-096', name: 'USA Region 2', category: 'zone' },
  { id: 'zone-097', name: 'USA Region 3', category: 'zone' },
  { id: 'zone-098', name: 'USA Zone 1 Region 1', category: 'zone' },
  { id: 'zone-099', name: 'USA Zone 2 Region 1', category: 'zone' },
  { id: 'zone-100', name: 'Warri DSC Sub Zone', category: 'zone' },
  { id: 'zone-101', name: 'Warri Ministry Centre', category: 'zone' },
  { id: 'zone-102', name: 'West Cameroon Zone', category: 'zone' },
  { id: 'zone-103', name: 'Western Europe Zone 1', category: 'zone' },
  { id: 'zone-104', name: 'Western Europe Zone 2', category: 'zone' },
  { id: 'zone-105', name: 'Western Europe Zone 3', category: 'zone' },
  { id: 'zone-106', name: 'Western Europe Zone 4', category: 'zone' },

  // ========== MINISTRY ZONES (12 zones) ==========
  { id: 'ministry-001', name: 'Future Africa Leaders Foundation', category: 'ministry' },
  { id: 'ministry-002', name: 'GYLF', category: 'ministry' },
  { id: 'ministry-003', name: 'Healing School Ambassadors Network', category: 'ministry' },
  { id: 'ministry-004', name: 'Healing School Cyber Church', category: 'ministry' },
  { id: 'ministry-005', name: 'Healing School Prayer Network', category: 'ministry' },
  { id: 'ministry-006', name: 'Healing School Translators', category: 'ministry' },
  { id: 'ministry-007', name: 'Healing Streams Ambassadors Network', category: 'ministry' },
  { id: 'ministry-008', name: 'HS Global Response Centre Africa Region', category: 'ministry' },
  { id: 'ministry-009', name: 'HS Global Response Centre UK Europe Canada Regions', category: 'ministry' },
  { id: 'ministry-010', name: 'HS Global Response Centre US Regions', category: 'ministry' },
  { id: 'ministry-011', name: 'Loveworld Medical Missions', category: 'ministry' },
  { id: 'ministry-012', name: 'Youths to the Nations', category: 'ministry' },

  // ========== MVP ZONES (16 zones) ==========
  { id: 'mvp-001', name: 'MVP Australia & Oceania', category: 'mvp' },
  { id: 'mvp-002', name: 'MVP Portuguese Nations', category: 'mvp' },
  { id: 'mvp-003', name: 'MVP Russia Ukraine & Stan Countries', category: 'mvp' },
  { id: 'mvp-004', name: 'MVP South America', category: 'mvp' },
  { id: 'mvp-005', name: 'MVP USA Canada Caribbean Region', category: 'mvp' },
  { id: 'mvp-006', name: 'MVP Middle East & North Africa', category: 'mvp' },
  { id: 'mvp-007', name: 'MVP Europe', category: 'mvp' },
  { id: 'mvp-008', name: 'MVP Nigeria', category: 'mvp' },
  { id: 'mvp-009', name: 'MVP Southern Africa', category: 'mvp' },
  { id: 'mvp-010', name: 'MVP East West Central Africa Region', category: 'mvp' },
  { id: 'mvp-011', name: 'MVP Eastern Europe Region', category: 'mvp' },
  { id: 'mvp-012', name: 'MVP South Asia Region', category: 'mvp' },
  { id: 'mvp-013', name: 'MVP South East Asia Region', category: 'mvp' },
  { id: 'mvp-014', name: 'MVP East Asia Region', category: 'mvp' },
  { id: 'mvp-015', name: 'MVP Mexico & Central America Region', category: 'mvp' },
  { id: 'mvp-016', name: 'MVP French Speaking Countries', category: 'mvp' },

  // ========== BLW ZONES (69 zones) ==========
  { id: 'blw-001', name: 'BLW Zone A', category: 'blw' },
  { id: 'blw-002', name: 'BLW Zone B', category: 'blw' },
  { id: 'blw-003', name: 'BLW Zone C', category: 'blw' },
  { id: 'blw-004', name: 'BLW Zone D', category: 'blw' },
  { id: 'blw-005', name: 'BLW Zone E', category: 'blw' },
  { id: 'blw-006', name: 'BLW Zone F', category: 'blw' },
  { id: 'blw-007', name: 'BLW Zone G', category: 'blw' },
  { id: 'blw-008', name: 'BLW Zone H', category: 'blw' },
  { id: 'blw-009', name: 'BLW Zone I', category: 'blw' },
  { id: 'blw-010', name: 'BLW Zone J', category: 'blw' },
  { id: 'blw-011', name: 'BLW Zone K', category: 'blw' },
  { id: 'blw-012', name: 'BLW Zone L', category: 'blw' },
  { id: 'blw-013', name: 'BLW Zone M', category: 'blw' },
  { id: 'blw-014', name: 'BLW Zone N', category: 'blw' },
  { id: 'blw-015', name: 'BLW Asia Zone', category: 'blw' },
  { id: 'blw-016', name: 'BLW Benin Republic Zone A', category: 'blw' },
  { id: 'blw-017', name: 'BLW Benin Republic Zone B', category: 'blw' },
  { id: 'blw-018', name: 'BLW Burkina Faso Zone', category: 'blw' },
  { id: 'blw-019', name: 'BLW Cameroon Group 3', category: 'blw' },
  { id: 'blw-020', name: 'BLW Cameroon Zone', category: 'blw' },
  { id: 'blw-021', name: 'BLW Cameroon Zone B', category: 'blw' },
  { id: 'blw-022', name: 'BLW Canada Zone', category: 'blw' },
  { id: 'blw-023', name: 'BLW Congo Zone', category: 'blw' },
  { id: 'blw-024', name: 'BLW Cyprus Group', category: 'blw' },
  { id: 'blw-025', name: 'BLW Democratic Republic of Congo Zone', category: 'blw' },
  { id: 'blw-026', name: 'BLW Europe Zone 1 DSP', category: 'blw' },
  { id: 'blw-027', name: 'BLW Ghana Zone A', category: 'blw' },
  { id: 'blw-028', name: 'BLW Ghana Zone B', category: 'blw' },
  { id: 'blw-029', name: 'BLW Ghana Zone C', category: 'blw' },
  { id: 'blw-030', name: 'BLW Ghana Zone D', category: 'blw' },
  { id: 'blw-031', name: 'BLW Ghana Subzone C', category: 'blw' },
  { id: 'blw-032', name: 'BLW Ghana Subzone D', category: 'blw' },
  { id: 'blw-033', name: 'BLW Ghana Subzone E', category: 'blw' },
  { id: 'blw-034', name: 'BLW Ghana Subzone F', category: 'blw' },
  { id: 'blw-035', name: 'BLW International Chapters', category: 'blw' },
  { id: 'blw-036', name: 'BLW Ireland Zone', category: 'blw' },
  { id: 'blw-037', name: 'BLW Kenya Zone', category: 'blw' },
  { id: 'blw-038', name: 'BLW Kenya Zone B', category: 'blw' },
  { id: 'blw-039', name: 'BLW Middle East & North Africa', category: 'blw' },
  { id: 'blw-040', name: 'BLW Namibia Group', category: 'blw' },
  { id: 'blw-041', name: 'BLW SA Zone F', category: 'blw' },
  { id: 'blw-042', name: 'BLW SA Zone G DSP', category: 'blw' },
  { id: 'blw-043', name: 'BLW South Africa Zone A', category: 'blw' },
  { id: 'blw-044', name: 'BLW South Africa Zone B', category: 'blw' },
  { id: 'blw-045', name: 'BLW South Africa Zone C', category: 'blw' },
  { id: 'blw-046', name: 'BLW South Africa Zone D', category: 'blw' },
  { id: 'blw-047', name: 'BLW South Africa Zone E', category: 'blw' },
  { id: 'blw-048', name: 'BLW South Africa Zone H', category: 'blw' },
  { id: 'blw-049', name: 'BLW South Africa Zone I', category: 'blw' },
  { id: 'blw-050', name: 'BLW Tanzania Zone', category: 'blw' },
  { id: 'blw-051', name: 'BLW Uganda Zone', category: 'blw' },
  { id: 'blw-052', name: 'BLW Uganda Zone B', category: 'blw' },
  { id: 'blw-053', name: 'BLW UK Sub Zone C', category: 'blw' },
  { id: 'blw-054', name: 'BLW UK Zone A', category: 'blw' },
  { id: 'blw-055', name: 'BLW UK Zone B', category: 'blw' },
  { id: 'blw-056', name: 'BLW UK Zone C', category: 'blw' },
  { id: 'blw-057', name: 'BLW USA Group 1', category: 'blw' },
  { id: 'blw-058', name: 'BLW USA Group 2', category: 'blw' },
  { id: 'blw-059', name: 'BLW USA Region 1', category: 'blw' },
  { id: 'blw-060', name: 'BLW USA Region 1 Updated', category: 'blw' },
  { id: 'blw-061', name: 'BLW USA Region 1 Zone B', category: 'blw' },
  { id: 'blw-062', name: 'BLW USA Region 2', category: 'blw' },
  { id: 'blw-063', name: 'BLW USA Region 2 Zone B', category: 'blw' },
  { id: 'blw-064', name: 'BLW Wales', category: 'blw' },
  { id: 'blw-065', name: 'Cameroon Group 1', category: 'blw' },
  { id: 'blw-066', name: 'Cameroon Group 2', category: 'blw' },
  { id: 'blw-067', name: 'Ethiopia Group 1', category: 'blw' },
  { id: 'blw-068', name: 'Ethiopia Group 2', category: 'blw' },
  { id: 'blw-069', name: 'USA Group 4', category: 'blw' },

  // ========== ISM ZONES (18 zones) ==========
  { id: 'ism-001', name: 'International School of Ministry', category: 'ism' },
  { id: 'ism-002', name: 'ISM Asia Region', category: 'ism' },
  { id: 'ism-003', name: 'ISM Central Africa Region', category: 'ism' },
  { id: 'ism-004', name: 'ISM Central America Region', category: 'ism' },
  { id: 'ism-005', name: 'ISM East Africa Region', category: 'ism' },
  { id: 'ism-006', name: 'ISM Europe EW', category: 'ism' },
  { id: 'ism-007', name: 'ISM Europe Region', category: 'ism' },
  { id: 'ism-008', name: 'ISM Greater Glory Ministry Zimbabwe', category: 'ism' },
  { id: 'ism-009', name: 'ISM Inspire TV', category: 'ism' },
  { id: 'ism-010', name: 'ISM Lagos Region 2', category: 'ism' },
  { id: 'ism-011', name: 'ISM MENA Region', category: 'ism' },
  { id: 'ism-012', name: 'ISM North America Region', category: 'ism' },
  { id: 'ism-013', name: 'ISM Online School', category: 'ism' },
  { id: 'ism-014', name: 'ISM SOW Regions', category: 'ism' },
  { id: 'ism-015', name: 'ISM Southern Africa Region', category: 'ism' },
  { id: 'ism-016', name: 'ISM United Kingdom Region', category: 'ism' },
  { id: 'ism-017', name: 'ISM West Africa Region', category: 'ism' },
  { id: 'ism-018', name: 'ISM Women Ministry', category: 'ism' },

  // ========== DIGITAL ZONES (4 zones) ==========
  { id: 'digital-001', name: 'Healing School Digital Evangelists', category: 'digital' },
  { id: 'digital-002', name: 'Healing School Digital Marketing', category: 'digital' },
  { id: 'digital-003', name: 'Online Publicity & Engagement', category: 'digital' },
  { id: 'digital-004', name: 'Web & Mobile Notification', category: 'digital' },

  // ========== DEPARTMENT ZONES (38 zones) ==========
  { id: 'dept-001', name: 'Canada International Office', category: 'department' },
  { id: 'dept-002', name: 'ChristEmbassy.org', category: 'department' },
  { id: 'dept-003', name: 'Family Prayer Network', category: 'department' },
  { id: 'dept-004', name: 'Healing School', category: 'department' },
  { id: 'dept-005', name: 'InnerCity Missions', category: 'department' },
  { id: 'dept-006', name: 'Institute of Strategic Leadership Training', category: 'department' },
  { id: 'dept-007', name: 'LN247', category: 'department' },
  { id: 'dept-008', name: 'Lovetoon', category: 'department' },
  { id: 'dept-009', name: 'Loveworld Arabic', category: 'department' },
  { id: 'dept-010', name: 'Loveworld Canada', category: 'department' },
  { id: 'dept-011', name: 'Loveworld Cell Ministry', category: 'department' },
  { id: 'dept-012', name: 'Loveworld Children Ministry', category: 'department' },
  { id: 'dept-013', name: 'Loveworld Graduate Network', category: 'department' },
  { id: 'dept-014', name: 'Loveworld Impressions', category: 'department' },
  { id: 'dept-015', name: 'Loveworld India', category: 'department' },
  { id: 'dept-016', name: 'Loveworld Institute of Innovation & Technology', category: 'department' },
  { id: 'dept-017', name: 'Loveworld Ladies Network', category: 'department' },
  { id: 'dept-018', name: 'Loveworld Next', category: 'department' },
  { id: 'dept-019', name: 'Loveworld Persia', category: 'department' },
  { id: 'dept-020', name: 'Loveworld Publishing Ministry', category: 'department' },
  { id: 'dept-021', name: 'Loveworld SAT', category: 'department' },
  { id: 'dept-022', name: 'Loveworld Schools', category: 'department' },
  { id: 'dept-023', name: 'Loveworld Staff Community', category: 'department' },
  { id: 'dept-024', name: 'Loveworld Teens Ministry', category: 'department' },
  { id: 'dept-025', name: 'Loveworld TV UK', category: 'department' },
  { id: 'dept-026', name: 'Loveworld USA', category: 'department' },
  { id: 'dept-027', name: 'Loveworld XP', category: 'department' },
  { id: 'dept-028', name: 'LTM and Radio', category: 'department' },
  { id: 'dept-029', name: 'Office of the President', category: 'department' },
  { id: 'dept-030', name: 'PastorChrisOnline', category: 'department' },
  { id: 'dept-031', name: 'Pastoral & Deaconry Nominees Training Program', category: 'department' },
  { id: 'dept-032', name: 'Rhapsody', category: 'department' },
  { id: 'dept-033', name: 'SA Regional Office', category: 'department' },
  { id: 'dept-034', name: 'Sons of Ministry', category: 'department' },
  { id: 'dept-035', name: 'Special Ministers Team', category: 'department' },
  { id: 'dept-036', name: 'Strategic Services Management', category: 'department' },
  { id: 'dept-037', name: 'UK International Office', category: 'department' },
  { id: 'dept-038', name: 'VGSS Loveworld', category: 'department' },
].sort((a, b) => a.name.localeCompare(b.name));

// ==========================================
// AUTHORIZATION HELPERS
// ==========================================

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

async function getUserRole(userId, orgId) {
  if (!userId || !orgId) return null;
  const org = await ChurchOrg.findById(orgId);
  if (!org) return null;
  const userIdStr = userId.toString();
  const leaderId = org.leader?._id?.toString() || org.leader?.toString();
  if (leaderId === userIdStr) return 'owner';
  const createdById = org.createdBy?._id?.toString() || org.createdBy?.toString();
  if (createdById === userIdStr) return 'owner';
  const ownerId = org.owner?._id?.toString() || org.owner?.toString();
  if (ownerId === userIdStr) return 'owner';
  if (org.admins?.some(a => (a?._id?.toString() || a?.toString()) === userIdStr)) return 'admin';
  if (org.assistantLeaders?.some(a => (a?._id?.toString() || a?.toString()) === userIdStr)) return 'assistant';
  const member = org.members?.find(m => (m.user?._id?.toString() || m.user?.toString()) === userIdStr);
  if (member) return member.role || 'member';
  return null;
}

const canManageOrg = isOwnerOrAdmin;

// ==========================================
// CE ZONES ROUTES
// ==========================================

router.get('/zones', verifyToken, (req, res) => {
  try {
    const { category, search } = req.query;
    let zones = [...CE_ZONES];
    if (category && category !== 'all') zones = zones.filter(z => z.category === category);
    if (search) {
      const query = search.toLowerCase();
      zones = zones.filter(z => z.name.toLowerCase().includes(query) || z.id.toLowerCase().includes(query));
    }
    res.json({ ok: true, zones, total: zones.length, categories: ['zone', 'ministry', 'mvp', 'blw', 'ism', 'digital', 'department'] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/zones/:id', verifyToken, (req, res) => {
  try {
    const zone = CE_ZONES.find(z => z.id === req.params.id);
    if (!zone) return res.status(404).json({ ok: false, error: 'Zone not found' });
    res.json({ ok: true, zone });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const orgs = await ChurchOrg.find({ $or: [{ leader: userId }, { createdBy: userId }, { admins: userId }], isActive: { $ne: false } }).lean();
    const orgIds = orgs.map(o => o._id);
    const totalSouls = await Soul.countDocuments({ $or: [{ organization: { $in: orgIds } }, { zone: { $in: orgIds } }, { church: { $in: orgIds } }, { fellowship: { $in: orgIds } }, { cell: { $in: orgIds } }, { addedBy: userId }], isActive: { $ne: false } });
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const newSoulsThisMonth = await Soul.countDocuments({ $or: [{ organization: { $in: orgIds } }, { zone: { $in: orgIds } }, { church: { $in: orgIds } }, { fellowship: { $in: orgIds } }, { cell: { $in: orgIds } }, { addedBy: userId }], isActive: { $ne: false }, createdAt: { $gte: startOfMonth } });
    const totalMembers = orgs.reduce((sum, org) => sum + (org.members?.length || org.memberCount || 0), 0);
    const fsGraduates = orgs.reduce((sum, org) => sum + (org.stats?.foundationSchoolGraduates || 0), 0);
    res.json({ ok: true, totalOrgs: orgs.length, totalSouls, newSoulsThisMonth, totalMembers, fsGraduates });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ORGANIZATION ROUTES
// ==========================================

router.get('/organizations/create', verifyToken, async (req, res) => {
  try {
    const allOrgs = await ChurchOrg.find({ isActive: { $ne: false } }).select('_id name type slug leader ceZone ministry leaderName leaderTitle').populate('leader', 'name username').sort({ type: 1, name: 1 });
    const validTypes = [
      { value: 'zone', label: 'Zone', level: 0, canBeParentOf: ['church', 'fellowship', 'cell', 'biblestudy'] },
      { value: 'church', label: 'Church', level: 1, canBeParentOf: ['fellowship', 'cell', 'biblestudy'] },
      { value: 'fellowship', label: 'Fellowship', level: 2, canBeParentOf: ['cell', 'biblestudy'] },
      { value: 'cell', label: 'Cell', level: 3, canBeParentOf: ['biblestudy'] },
      { value: 'biblestudy', label: 'Bible Study', level: 4, canBeParentOf: [] }
    ];
    const placeholderOrg = { _id: 'create', name: '', type: 'church', description: '', isCreateMode: true, colorTheme: 'purple', ministry: 'christ_embassy' };
    res.json({ ok: true, org: placeholderOrg, organization: placeholderOrg, isCreateMode: true, isNew: true, formData: { validTypes, parentOptions: allOrgs, colorThemes: ['purple', 'blue', 'green', 'red', 'orange', 'pink', 'teal', 'indigo'], ceZones: CE_ZONES, defaults: { type: 'church', colorTheme: 'purple', ministry: 'christ_embassy' } }, validTypes: validTypes.map(t => t.value), parentOrganizations: allOrgs, ceZones: CE_ZONES, permissions: { canEdit: true, canCreate: true } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/organizations/available-parents', verifyToken, async (req, res) => {
  try {
    const { type, ministry, ceZoneId } = req.query;
    const query = { isActive: { $ne: false } };
    if (type) query.type = type;
    if (ministry) query.ministry = ministry;
    if (ceZoneId) query['ceZone.id'] = ceZoneId;
    const orgs = await ChurchOrg.find(query).select('_id name type slug leader memberCount parent zone church leaderName leaderTitle ministry ceZone').populate('leader', 'name username').sort({ type: 1, name: 1 });
    res.json({ ok: true, organizations: orgs, total: orgs.length, ceZones: CE_ZONES });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/org/create', verifyToken, async (req, res) => {
  try {
    const allOrgs = await ChurchOrg.find({ isActive: { $ne: false } }).select('_id name type slug leader ceZone ministry').populate('leader', 'name username').sort({ type: 1, name: 1 });
    const validTypes = [{ value: 'zone', label: 'Zone', level: 0 }, { value: 'church', label: 'Church', level: 1 }, { value: 'fellowship', label: 'Fellowship', level: 2 }, { value: 'cell', label: 'Cell', level: 3 }, { value: 'biblestudy', label: 'Bible Study', level: 4 }];
    const placeholderOrg = { _id: 'create', name: '', type: 'church', description: '', isCreateMode: true, colorTheme: 'purple', ministry: 'christ_embassy' };
    res.json({ ok: true, org: placeholderOrg, organization: placeholderOrg, isCreateMode: true, isNew: true, formData: { validTypes, parentOptions: allOrgs, colorThemes: ['purple', 'blue', 'green', 'red', 'orange', 'pink', 'teal', 'indigo'], ceZones: CE_ZONES }, validTypes: validTypes.map(t => t.value), parentOrganizations: allOrgs, ceZones: CE_ZONES, permissions: { canEdit: true, canCreate: true } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/organizations/my', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin;
    let userObjectId; try { userObjectId = new ObjectId(userId); } catch (e) { userObjectId = userId; }
    let query;
    if (isAdmin) {
      query = { $or: [{ isActive: true }, { isActive: { $exists: false } }] };
    } else {
      query = { $and: [{ $or: [{ isActive: true }, { isActive: { $exists: false } }] }, { $or: [{ leader: userObjectId }, { leader: userId }, { admins: userObjectId }, { admins: userId }, { assistantLeaders: userObjectId }, { assistantLeaders: userId }, { createdBy: userObjectId }, { createdBy: userId }, { 'members.user': userObjectId }, { 'members.user': userId }, { owner: userObjectId }, { owner: userId }] }] };
    }
    const orgs = await ChurchOrg.find(query).populate('leader', 'name username profilePicture').populate('parent', 'name type slug').sort({ type: 1, name: 1 });
    const orgsWithRole = await Promise.all(orgs.map(async (org) => {
      const role = await getUserRole(userId, org._id);
      return { ...org.toObject(), userRole: role || (isAdmin ? 'admin' : null), canManage: ['owner', 'admin', 'assistant'].includes(role) || isAdmin };
    }));
    res.json({ ok: true, orgs: orgsWithRole, organizations: orgsWithRole });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/organizations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { name, type, description, motto, parentId, contact, meetingSchedule, colorTheme, structureMode, leaderName, leaderTitle, ministry, customMinistry, ceZone, ceZoneId } = req.body;
    if (!name || !type) return res.status(400).json({ ok: false, error: 'Name and type are required' });
    const validTypes = ['zone', 'church', 'fellowship', 'cell', 'biblestudy'];
    if (!validTypes.includes(type)) return res.status(400).json({ ok: false, error: 'Invalid organization type' });
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 50);
    let slug = baseSlug; let counter = 1;
    while (await ChurchOrg.findOne({ slug, type })) { slug = `${baseSlug}-${counter++}`; }
    let zone = null, church = null;
    if (parentId) {
      const parent = await ChurchOrg.findById(parentId);
      if (!parent) return res.status(400).json({ ok: false, error: 'Parent organization not found' });
      const hierarchy = { zone: 0, church: 1, fellowship: 2, cell: 3, biblestudy: 4 };
      if (hierarchy[type] <= hierarchy[parent.type]) return res.status(400).json({ ok: false, error: `${type} cannot be under ${parent.type}` });
      zone = parent.zone || (parent.type === 'zone' ? parent._id : null);
      church = parent.church || (parent.type === 'church' ? parent._id : null);
    }
    let ceZoneData = null;
    if (ceZone) { ceZoneData = ceZone; }
    else if (ceZoneId) { const foundZone = CE_ZONES.find(z => z.id === ceZoneId); if (foundZone) { ceZoneData = { id: foundZone.id, name: foundZone.name, category: foundZone.category }; } }
    const org = new ChurchOrg({ name, slug, type, ...(structureMode ? { structureMode } : {}), description, motto, parent: parentId || null, zone, church, leader: userId, leaderName: leaderName || '', leaderTitle: leaderTitle || '', ministry: ministry || 'christ_embassy', customMinistry: customMinistry || '', ceZone: ceZoneData, admins: [userId], members: [{ user: userId, role: type === 'zone' || type === 'church' ? 'pastor' : 'leader', joinedAt: new Date(), status: 'active' }], memberCount: 1, contact, meetingSchedule, colorTheme: colorTheme || 'purple', createdBy: userId });
    await org.save();
    console.log(`⛪ Created ${type}: ${name}${ceZoneData ? ` (Zone: ${ceZoneData.name})` : ''}`);
    res.status(201).json({ ok: true, org, organization: org });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/organizations', verifyToken, async (req, res) => {
  try {
    const { type, parentId, zoneId, churchId, ministry, ceZoneId, page = 1, limit = 20, search } = req.query;
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const isAdmin = req.user?.role === 'admin' || req.user?.isAdmin;
    if (!userId) return res.status(401).json({ ok: false, error: 'Authentication required' });
    let userObjectId; try { userObjectId = new ObjectId(userId); } catch (e) { userObjectId = userId; }
    let userQuery = { $or: [{ isActive: true }, { isActive: { $exists: false } }] };
    if (!isAdmin) {
      userQuery = { $and: [{ $or: [{ isActive: true }, { isActive: { $exists: false } }] }, { $or: [{ leader: userObjectId }, { leader: userId }, { createdBy: userObjectId }, { createdBy: userId }, { admins: userObjectId }, { admins: userId }, { assistantLeaders: userObjectId }, { assistantLeaders: userId }, { 'members.user': userObjectId }, { 'members.user': userId }, { owner: userObjectId }, { owner: userId }] }] };
    }
    if (type) userQuery.type = type;
    if (parentId) { try { userQuery.parent = new ObjectId(parentId); } catch(e) { userQuery.parent = parentId; } }
    if (zoneId) { try { userQuery.zone = new ObjectId(zoneId); } catch(e) { userQuery.zone = zoneId; } }
    if (churchId) { try { userQuery.church = new ObjectId(churchId); } catch(e) { userQuery.church = churchId; } }
    if (ministry) userQuery.ministry = ministry;
    if (ceZoneId) userQuery['ceZone.id'] = ceZoneId;
    if (search) {
      const searchCondition = { $or: [{ name: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }, { 'ceZone.name': { $regex: search, $options: 'i' } }] };
      if (userQuery.$and) { userQuery.$and.push(searchCondition); } else { userQuery = { $and: [userQuery, searchCondition] }; }
    }
    const orgs = await ChurchOrg.find(userQuery).populate('leader', 'name username profilePicture').populate('parent', 'name type slug').sort({ name: 1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await ChurchOrg.countDocuments(userQuery);
    const orgsWithRole = await Promise.all(orgs.map(async (org) => {
      const role = await getUserRole(userId, org._id);
      const canManage = ['owner', 'admin', 'assistant'].includes(role) || isAdmin;
      return { ...org.toObject(), userRole: role || (isAdmin ? 'admin' : null), canManage, permissions: { canEdit: canManage, canDelete: role === 'owner', canAddMembers: canManage, canRemoveMembers: canManage, canExport: canManage, canViewSettings: canManage, isOwner: role === 'owner', isAdmin: ['owner', 'admin'].includes(role), isMember: role !== null } };
    }));
    res.json({ ok: true, orgs: orgsWithRole, organizations: orgsWithRole, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid organization ID' });
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) return res.status(401).json({ ok: false, error: 'Authentication required' });
    const org = await ChurchOrg.findById(id).populate('leader', 'name username profilePicture bio').populate('assistantLeaders', 'name username profilePicture').populate('parent', 'name type slug').populate('members.user', 'name username profilePicture');
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    const userRole = await getUserRole(userId, org._id);
    if (!userRole) return res.status(403).json({ ok: false, error: 'You do not have access to this organization' });
    const canManage = ['owner', 'admin', 'assistant'].includes(userRole);
    const children = await ChurchOrg.find({ parent: org._id, isActive: { $ne: false } }).populate('leader', 'name username profilePicture').select('name type slug memberCount leader logo ceZone ministry').sort({ name: 1 });
    const recentSouls = await Soul.countDocuments({ $or: [{ zone: org._id }, { church: org._id }, { fellowship: org._id }, { cell: org._id }], createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });
    const orgData = org.toObject();
    if (!canManage) { delete orgData.admins; delete orgData.settings; delete orgData.contact?.email; if (orgData.members) { orgData.members = orgData.members.map(m => ({ user: { _id: m.user?._id, name: m.user?.name, username: m.user?.username, profilePicture: m.user?.profilePicture }, role: m.role, joinedAt: m.joinedAt })); } }
    const permissions = { canEdit: canManage, canDelete: userRole === 'owner', canAddMembers: canManage, canRemoveMembers: canManage, canEditMembers: canManage, canExport: canManage, canViewSettings: canManage, canViewAnalytics: canManage, canCreateSubOrg: canManage, canManageFoundationSchool: canManage, canRecordAttendance: canManage, isOwner: userRole === 'owner', isAdmin: ['owner', 'admin'].includes(userRole), isAssistant: userRole === 'assistant', isMember: true };
    res.json({ ok: true, org: { ...orgData, userRole, canManage, permissions }, organization: { ...orgData, userRole, canManage, permissions }, children, recentSouls, userRole, canManage, permissions });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) return res.status(403).json({ ok: false, error: 'Not authorized' });
    const { name, description, motto, contact, meetingSchedule, socialLinks, settings, logo, coverImage, colorTheme, leaderName, leaderTitle, ministry, customMinistry, ceZone } = req.body;
    const org = await ChurchOrg.findByIdAndUpdate(id, { $set: { ...(name && { name }), ...(description !== undefined && { description }), ...(motto !== undefined && { motto }), ...(contact && { contact }), ...(meetingSchedule && { meetingSchedule }), ...(socialLinks && { socialLinks }), ...(settings && { settings }), ...(logo && { logo }), ...(coverImage && { coverImage }), ...(colorTheme && { colorTheme }), ...(leaderName !== undefined && { leaderName }), ...(leaderTitle !== undefined && { leaderTitle }), ...(ministry && { ministry }), ...(customMinistry !== undefined && { customMinistry }), ...(ceZone && { ceZone }), updatedAt: new Date() } }, { new: true }).populate('leader', 'name username profilePicture');
    res.json({ ok: true, org, organization: org });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/organizations/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const org = await ChurchOrg.findById(id);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    const isOwner = org.leader?.toString() === userId.toString() || org.createdBy?.toString() === userId.toString();
    if (!isOwner) return res.status(403).json({ ok: false, error: 'Only the owner can delete' });
    await ChurchOrg.findByIdAndUpdate(id, { isActive: false, deletedAt: new Date() });
    res.json({ ok: true, message: 'Organization deleted' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/organizations/:id/upload-logo', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { image, logo, url } = req.body;
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) return res.status(403).json({ ok: false, error: 'Not authorized' });
    const org = await ChurchOrg.findById(id);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    let logoUrl = url || logo || image;
    if (logoUrl && logoUrl.startsWith('data:image')) {
      try { const cloudinary = require('cloudinary').v2; const result = await cloudinary.uploader.upload(logoUrl, { folder: 'church-logos', public_id: `org-${id}-logo`, overwrite: true, transformation: [{ width: 400, height: 400, crop: 'fill' }] }); logoUrl = result.secure_url; } catch (uploadErr) { return res.status(500).json({ ok: false, error: 'Failed to upload image' }); }
    }
    org.logo = logoUrl; org.updatedAt = new Date(); await org.save();
    res.json({ ok: true, logo: logoUrl, message: 'Logo updated' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/organizations/:id/upload-cover', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { image, coverImage, url } = req.body;
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) return res.status(403).json({ ok: false, error: 'Not authorized' });
    const org = await ChurchOrg.findById(id);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    let coverUrl = url || coverImage || image;
    if (coverUrl && coverUrl.startsWith('data:image')) {
      try { const cloudinary = require('cloudinary').v2; const result = await cloudinary.uploader.upload(coverUrl, { folder: 'church-covers', public_id: `org-${id}-cover`, overwrite: true, transformation: [{ width: 1200, height: 400, crop: 'fill' }] }); coverUrl = result.secure_url; } catch (uploadErr) { return res.status(500).json({ ok: false, error: 'Failed to upload image' }); }
    }
    org.coverImage = coverUrl; org.updatedAt = new Date(); await org.save();
    res.json({ ok: true, coverImage: coverUrl, message: 'Cover image updated' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/organizations/:id/images', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { logo, coverImage } = req.body;
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) return res.status(403).json({ ok: false, error: 'Not authorized' });
    const org = await ChurchOrg.findById(id);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    const cloudinary = require('cloudinary').v2;
    if (logo && logo.startsWith('data:image')) { try { const result = await cloudinary.uploader.upload(logo, { folder: 'church-logos', public_id: `org-${id}-logo`, overwrite: true, transformation: [{ width: 400, height: 400, crop: 'fill' }] }); org.logo = result.secure_url; } catch (e) {} } else if (logo) { org.logo = logo; }
    if (coverImage && coverImage.startsWith('data:image')) { try { const result = await cloudinary.uploader.upload(coverImage, { folder: 'church-covers', public_id: `org-${id}-cover`, overwrite: true, transformation: [{ width: 1200, height: 400, crop: 'fill' }] }); org.coverImage = result.secure_url; } catch (e) {} } else if (coverImage) { org.coverImage = coverImage; }
    org.updatedAt = new Date(); await org.save();
    res.json({ ok: true, logo: org.logo, coverImage: org.coverImage, message: 'Images updated' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// MEMBER MANAGEMENT ROUTES
// ==========================================

router.get('/organizations/:id/members', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const { page = 1, limit = 20, search, role, status } = req.query;
    const userRole = await getUserRole(userId, id);
    if (!userRole) return res.status(403).json({ ok: false, error: 'Access denied' });
    const canManage = ['owner', 'admin', 'assistant'].includes(userRole);
    const org = await ChurchOrg.findById(id).populate('members.user', 'name username profilePicture email phone').lean();
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    let members = org.members || [];
    if (search) { const query = search.toLowerCase(); members = members.filter(m => m.user?.name?.toLowerCase().includes(query) || m.user?.username?.toLowerCase().includes(query) || m.firstName?.toLowerCase().includes(query) || m.lastName?.toLowerCase().includes(query) || m.email?.toLowerCase().includes(query)); }
    if (role) members = members.filter(m => m.role === role);
    if (status) members = members.filter(m => m.status === status);
    if (!canManage) members = members.map(m => ({ _id: m._id, user: { _id: m.user?._id, name: m.user?.name, username: m.user?.username, profilePicture: m.user?.profilePicture }, role: m.role, joinedAt: m.joinedAt, status: m.status }));
    const total = members.length;
    const pageNum = parseInt(page); const limitNum = parseInt(limit);
    const paginatedMembers = members.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    res.json({ ok: true, members: paginatedMembers, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }, canManage, userRole });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/organizations/:id/members', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { id } = req.params;
    const userRole = await getUserRole(userId, id);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) return res.status(403).json({ ok: false, error: 'Not authorized' });
    const org = await ChurchOrg.findById(id);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    const memberData = { ...req.body, joinedAt: new Date(), status: 'active', addedBy: userId };
    org.members.push(memberData); org.memberCount = org.members.length; await org.save();
    res.status(201).json({ ok: true, member: org.members[org.members.length - 1] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/members/:orgId/:memberId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { orgId, memberId } = req.params;
    const userRole = await getUserRole(userId, orgId);
    if (!userRole) return res.status(403).json({ ok: false, error: 'Access denied' });
    const org = await ChurchOrg.findById(orgId).populate('members.user', 'name username profilePicture email phone').lean();
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    const member = org.members?.find(m => m._id?.toString() === memberId || m.user?._id?.toString() === memberId);
    if (!member) return res.status(404).json({ ok: false, error: 'Member not found' });
    const canManage = ['owner', 'admin', 'assistant'].includes(userRole);
    let memberData = member;
    if (!canManage) memberData = { _id: member._id, user: { _id: member.user?._id, name: member.user?.name, username: member.user?.username, profilePicture: member.user?.profilePicture }, role: member.role, joinedAt: member.joinedAt, status: member.status };
    res.json({ ok: true, member: memberData, canManage });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/members/:orgId/:memberId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { orgId, memberId } = req.params;
    const userRole = await getUserRole(userId, orgId);
    if (!['owner', 'admin', 'assistant'].includes(userRole)) return res.status(403).json({ ok: false, error: 'Not authorized to edit members' });
    const org = await ChurchOrg.findById(orgId);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    const memberIndex = org.members?.findIndex(m => m._id?.toString() === memberId || m.user?.toString() === memberId);
    if (memberIndex === -1 || memberIndex === undefined) return res.status(404).json({ ok: false, error: 'Member not found in organization' });
    const member = org.members[memberIndex];
    const updates = req.body;
    Object.keys(updates).forEach(key => { if (updates[key] !== undefined && key !== '_id' && key !== 'user') member[key] = updates[key]; });
    member.updatedAt = new Date(); member.updatedBy = userId;
    await org.save();
    res.json({ ok: true, message: 'Member updated successfully', member });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/members/:orgId/:memberId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { orgId, memberId } = req.params;
    const userRole = await getUserRole(userId, orgId);
    if (!['owner', 'admin'].includes(userRole)) return res.status(403).json({ ok: false, error: 'Only owner/admin can remove members' });
    const org = await ChurchOrg.findById(orgId);
    if (!org) return res.status(404).json({ ok: false, error: 'Organization not found' });
    if (org.leader?.toString() === memberId) return res.status(400).json({ ok: false, error: 'Cannot remove the owner' });
    org.members = org.members.filter(m => m._id?.toString() !== memberId && m.user?.toString() !== memberId);
    org.memberCount = org.members.length;
    await org.save();
    res.json({ ok: true, message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// SOULS ROUTES
// ==========================================

router.get('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { organizationId, zoneId, churchId, fellowshipId, cellId, ceZoneId, status, page = 1, limit = 20, search } = req.query;
    const query = { isActive: { $ne: false } };
    if (organizationId) { try { query.organization = new ObjectId(organizationId); } catch(e) { query.organization = organizationId; } }
    if (zoneId) { try { query.zone = new ObjectId(zoneId); } catch(e) { query.zone = zoneId; } }
    if (churchId) { try { query.church = new ObjectId(churchId); } catch(e) { query.church = churchId; } }
    if (fellowshipId) { try { query.fellowship = new ObjectId(fellowshipId); } catch(e) { query.fellowship = fellowshipId; } }
    if (cellId) { try { query.cell = new ObjectId(cellId); } catch(e) { query.cell = cellId; } }
    if (ceZoneId) query['ceZone.id'] = ceZoneId;
    if (status) query.status = status;
    if (search) query.$or = [{ firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }];
    if (!organizationId && !zoneId && !churchId && !fellowshipId && !cellId && !ceZoneId) {
      const userOrgs = await ChurchOrg.find({ $or: [{ leader: userId }, { admins: userId }, { assistantLeaders: userId }, { createdBy: userId }], isActive: { $ne: false } }).select('_id');
      const orgIds = userOrgs.map(o => o._id);
      if (orgIds.length > 0) query.$or = [{ organization: { $in: orgIds } }, { zone: { $in: orgIds } }, { church: { $in: orgIds } }, { fellowship: { $in: orgIds } }, { cell: { $in: orgIds } }, { addedBy: userId }];
      else query.addedBy = userId;
    }
    const souls = await Soul.find(query).populate('organization', 'name type').populate('zone', 'name type').populate('church', 'name type').populate('fellowship', 'name type').populate('cell', 'name type').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Soul.countDocuments(query);
    res.json({ ok: true, souls, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/souls/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid soul ID' });
    const soul = await Soul.findById(id).populate('organization', 'name type').populate('zone', 'name type').populate('church', 'name type').populate('fellowship', 'name type').populate('cell', 'name type').populate('addedBy', 'name username').populate('assignedTo', 'name username');
    if (!soul) return res.status(404).json({ ok: false, error: 'Soul not found' });
    res.json({ ok: true, soul });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/souls', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { firstName, lastName, email, phone, whatsapp, address, city, state, country, gender, ageGroup, salvationType, howTheyHeard, howTheyHeardDetails, prayerRequest, organizationId, zoneId, churchId, fellowshipId, cellId, ceZone, ceZoneId, source, notes, tags } = req.body;
    if (!firstName) return res.status(400).json({ ok: false, error: 'First name is required' });
    let ceZoneData = null;
    if (ceZone) ceZoneData = ceZone;
    else if (ceZoneId) { const foundZone = CE_ZONES.find(z => z.id === ceZoneId); if (foundZone) ceZoneData = { id: foundZone.id, name: foundZone.name, category: foundZone.category }; }
    const soul = new Soul({ firstName, lastName: lastName || '', email, phone, whatsapp, address, city, state, country, gender, ageGroup, salvationType: salvationType || 'first_time', howTheyHeard, howTheyHeardDetails, prayerRequest, organization: organizationId || null, zone: zoneId || null, church: churchId || null, fellowship: fellowshipId || null, cell: cellId || null, ceZone: ceZoneData, source: source || 'manual', notes, tags: tags || [], addedBy: userId, status: 'new', pipelineStage: 'new_convert' });
    await soul.save();
    console.log(`🙏 Soul added: ${firstName} ${lastName || ''}${ceZoneData ? ` (Zone: ${ceZoneData.name})` : ''}`);
    res.status(201).json({ ok: true, soul });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/souls/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    if (!ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid soul ID' });
    const updates = { ...req.body, lastUpdatedBy: userId, updatedAt: new Date() };
    if (updates.ceZoneId && !updates.ceZone) { const foundZone = CE_ZONES.find(z => z.id === updates.ceZoneId); if (foundZone) updates.ceZone = { id: foundZone.id, name: foundZone.name, category: foundZone.category }; }
    const soul = await Soul.findByIdAndUpdate(id, { $set: updates }, { new: true }).populate('organization', 'name type').populate('zone', 'name type').populate('church', 'name type');
    if (!soul) return res.status(404).json({ ok: false, error: 'Soul not found' });
    res.json({ ok: true, soul });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/souls/:id/followup', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id || req.user.userId;
    const { type, notes, outcome, nextFollowUpDate, duration } = req.body;
    if (!ObjectId.isValid(id)) return res.status(400).json({ ok: false, error: 'Invalid soul ID' });
    const followUp = { date: new Date(), type: type || 'call', notes, outcome: outcome || 'successful', followedUpBy: userId, nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null, duration };
    const soul = await Soul.findByIdAndUpdate(id, { $push: { followUps: followUp }, $set: { lastContactDate: new Date(), nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null, updatedAt: new Date() }, $inc: { totalFollowUps: 1 } }, { new: true });
    if (!soul) return res.status(404).json({ ok: false, error: 'Soul not found' });
    res.json({ ok: true, soul, followUp });
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
    if (!title || !organizationId || !startDate) return res.status(400).json({ ok: false, error: 'Title, organization, and start date required' });
    if (!await canManageOrg(userId, organizationId)) return res.status(403).json({ ok: false, error: 'Not authorized' });
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
    if (!organizationId || !date) return res.status(400).json({ ok: false, error: 'Organization and date required' });
    if (!await canManageOrg(userId, organizationId)) return res.status(403).json({ ok: false, error: 'Not authorized' });
    const record = new AttendanceRecord({ organization: organizationId, date: new Date(date), totalAttendance: totalAttendance || (members + visitors + firstTimers + children), members: members || 0, visitors: visitors || 0, firstTimers: firstTimers || 0, children: children || 0, online: online || 0, soulsWon: soulsWon || 0, notes, recordedBy: userId });
    await record.save();
    res.status(201).json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log(`⛪ Church Management routes v3.0.0 loaded - Ministry Selection + CE Zones (${CE_ZONES.length} zones)`);

module.exports = router;
