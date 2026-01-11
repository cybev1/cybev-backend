// ============================================
// FILE: routes/cell-reports.routes.js
// Cell Group Reports API Routes
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Cell Report Model
const CellReportSchema = new mongoose.Schema({
  cell: { type: mongoose.Schema.Types.ObjectId, ref: 'ChurchOrg', required: true },
  weekNumber: { type: Number, required: true },
  year: { type: Number, required: true },
  meetingDate: { type: Date, required: true },
  topic: String,
  scripture: String,
  attendance: {
    members: { type: Number, default: 0 },
    visitors: { type: Number, default: 0 },
    firstTimers: { type: Number, default: 0 },
    children: { type: Number, default: 0 }
  },
  soulsWon: { type: Number, default: 0 },
  offering: {
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'GHS' }
  },
  testimonies: [{
    memberName: String,
    summary: String
  }],
  prayerRequests: [String],
  challenges: String,
  nextWeekPlan: String,
  notes: String,
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'draft'
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

CellReportSchema.index({ cell: 1, year: 1, weekNumber: 1 }, { unique: true });
CellReportSchema.index({ submittedBy: 1, status: 1 });

const CellReport = mongoose.models.CellReport || mongoose.model('CellReport', CellReportSchema);

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

// ==========================================
// POST /api/church/cell-reports - Create report
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { 
      cell, weekNumber, year, meetingDate, topic, scripture,
      attendance, soulsWon, offering, testimonies, prayerRequests,
      challenges, nextWeekPlan, notes, status 
    } = req.body;

    if (!cell || !meetingDate) {
      return res.status(400).json({ ok: false, error: 'Cell and meeting date are required' });
    }

    // Calculate week number if not provided
    const date = new Date(meetingDate);
    const calculatedWeek = weekNumber || Math.ceil((date.getDate()) / 7);
    const calculatedYear = year || date.getFullYear();

    // Check for existing report
    const existing = await CellReport.findOne({
      cell: new ObjectId(cell),
      weekNumber: calculatedWeek,
      year: calculatedYear
    });

    if (existing) {
      return res.status(400).json({ ok: false, error: 'Report for this week already exists' });
    }

    const report = new CellReport({
      cell,
      weekNumber: calculatedWeek,
      year: calculatedYear,
      meetingDate: date,
      topic,
      scripture,
      attendance: attendance || { members: 0, visitors: 0, firstTimers: 0, children: 0 },
      soulsWon: soulsWon || 0,
      offering: offering || { amount: 0, currency: 'GHS' },
      testimonies: testimonies || [],
      prayerRequests: prayerRequests || [],
      challenges,
      nextWeekPlan,
      notes,
      status: status || 'draft',
      submittedBy: userId,
      submittedAt: status === 'submitted' ? new Date() : undefined
    });

    await report.save();
    await report.populate('cell', 'name slug type');

    console.log(`📋 Cell report created for week ${calculatedWeek}/${calculatedYear}`);

    res.status(201).json({ ok: true, report });
  } catch (err) {
    console.error('Create cell report error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/cell-reports - List reports
// ==========================================
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { cellId, status, year, page = 1, limit = 20 } = req.query;

    const query = {};
    
    if (cellId) {
      query.cell = new ObjectId(cellId);
    } else {
      // Get user's cells
      const { ChurchOrg } = require('../models/church.model');
      const userCells = await ChurchOrg.find({
        type: 'cell',
        $or: [
          { leader: userId },
          { admins: userId },
          { 'members.user': userId }
        ]
      }).select('_id');
      
      query.cell = { $in: userCells.map(c => c._id) };
    }
    
    if (status) query.status = status;
    if (year) query.year = parseInt(year);

    const reports = await CellReport.find(query)
      .populate('cell', 'name slug type')
      .populate('submittedBy', 'name username profilePicture')
      .sort({ year: -1, weekNumber: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await CellReport.countDocuments(query);

    res.json({
      ok: true,
      reports,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List cell reports error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/cell-reports/:id - Get single report
// ==========================================
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const report = await CellReport.findById(req.params.id)
      .populate('cell', 'name slug type leader')
      .populate('submittedBy', 'name username profilePicture')
      .populate('approvedBy', 'name username');

    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    res.json({ ok: true, report });
  } catch (err) {
    console.error('Get cell report error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// PUT /api/church/cell-reports/:id - Update report
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const updates = req.body;

    const report = await CellReport.findById(id);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    // Only allow updates if draft or rejected
    if (!['draft', 'rejected'].includes(report.status)) {
      return res.status(400).json({ ok: false, error: 'Cannot edit submitted/approved report' });
    }

    // Update fields
    const allowedFields = [
      'topic', 'scripture', 'attendance', 'soulsWon', 'offering',
      'testimonies', 'prayerRequests', 'challenges', 'nextWeekPlan', 'notes', 'status'
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        report[field] = updates[field];
      }
    });

    if (updates.status === 'submitted') {
      report.submittedAt = new Date();
    }

    report.updatedAt = new Date();
    await report.save();
    await report.populate('cell', 'name slug type');

    res.json({ ok: true, report });
  } catch (err) {
    console.error('Update cell report error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/cell-reports/:id/approve - Approve report
// ==========================================
router.post('/:id/approve', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const report = await CellReport.findById(id);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    if (report.status !== 'submitted') {
      return res.status(400).json({ ok: false, error: 'Report must be submitted first' });
    }

    report.status = 'approved';
    report.approvedBy = userId;
    report.approvedAt = new Date();
    report.updatedAt = new Date();
    await report.save();

    res.json({ ok: true, report });
  } catch (err) {
    console.error('Approve cell report error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/church/cell-reports/:id/reject - Reject report
// ==========================================
router.post('/:id/reject', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { reason } = req.body;

    const report = await CellReport.findById(id);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    report.status = 'rejected';
    report.rejectionReason = reason;
    report.updatedAt = new Date();
    await report.save();

    res.json({ ok: true, report });
  } catch (err) {
    console.error('Reject cell report error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/church/cell-reports/stats/:cellId - Cell statistics
// ==========================================
router.get('/stats/:cellId', verifyToken, async (req, res) => {
  try {
    const { cellId } = req.params;
    const { year } = req.query;

    const matchQuery = { 
      cell: new ObjectId(cellId), 
      status: 'approved'
    };
    if (year) matchQuery.year = parseInt(year);

    const stats = await CellReport.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalReports: { $sum: 1 },
          totalSoulsWon: { $sum: '$soulsWon' },
          avgAttendance: { 
            $avg: { 
              $add: [
                '$attendance.members', 
                '$attendance.visitors', 
                '$attendance.firstTimers',
                '$attendance.children'
              ] 
            } 
          },
          totalOffering: { $sum: '$offering.amount' },
          totalFirstTimers: { $sum: '$attendance.firstTimers' }
        }
      }
    ]);

    // Weekly trend
    const weeklyTrend = await CellReport.aggregate([
      { $match: matchQuery },
      {
        $project: {
          week: { $concat: [{ $toString: '$year' }, '-W', { $toString: '$weekNumber' }] },
          attendance: { 
            $add: ['$attendance.members', '$attendance.visitors', '$attendance.firstTimers', '$attendance.children'] 
          },
          soulsWon: 1
        }
      },
      { $sort: { week: -1 } },
      { $limit: 12 }
    ]);

    res.json({
      ok: true,
      stats: stats[0] || { totalReports: 0, totalSoulsWon: 0, avgAttendance: 0, totalOffering: 0 },
      weeklyTrend: weeklyTrend.reverse()
    });
  } catch (err) {
    console.error('Cell stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// DELETE /api/church/cell-reports/:id - Delete report
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const report = await CellReport.findById(id);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    // Only allow delete if draft
    if (report.status !== 'draft') {
      return res.status(400).json({ ok: false, error: 'Can only delete draft reports' });
    }

    await CellReport.findByIdAndDelete(id);

    res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('Delete cell report error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('📋 Cell Reports routes loaded');

module.exports = router;
