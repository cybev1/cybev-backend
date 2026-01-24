/**
 * ============================================
 * FILE: foundation-school.routes.js
 * PATH: cybev-backend-main/routes/foundation-school.routes.js
 * VERSION: 2.2.0 - March 2025 Manual + Admin Seed Endpoint
 * UPDATED: 2026-01-24
 * CHANGES: 
 *   - Fixed enroll to return existing enrollment (not 400)
 *   - Improved stats endpoint
 *   - Added /admin/run-seed endpoint
 *   - Added /admin/students endpoint
 *   - Added /leaderboard endpoint
 * PREVIOUS: 2.0.0 - Initial implementation
 * ============================================
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import models from church.model.js
const { 
  FoundationModule, 
  FoundationEnrollment, 
  FSBatch, 
  FSAssignmentSubmission 
} = require('../models/church.model');

// Middleware
// NOTE: backend uses middleware/auth.js which exports authenticateToken
const { authenticateToken } = require('../middleware/auth');
const verifyToken = authenticateToken;

// ==========================================
// PUBLIC ROUTES (No Auth Required)
// ==========================================

/**
 * GET /api/church/foundation/modules
 * Get all Foundation School modules (public curriculum view)
 */
router.get('/modules', async (req, res) => {
  try {
    const modules = await FoundationModule.find({ isActive: true })
      .sort({ moduleNumber: 1 })
      .select('-quiz.correctAnswer -quiz.explanation');

    res.json({ 
      ok: true, 
      modules,
      totalModules: modules.length 
    });
  } catch (err) {
    console.error('Get modules error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/modules/:moduleNumber
 * Get a specific module by number
 */
router.get('/modules/:moduleNumber', async (req, res) => {
  try {
    const { moduleNumber } = req.params;
    const module = await FoundationModule.findOne({ 
      moduleNumber: parseInt(moduleNumber),
      isActive: true 
    }).select('-quiz.correctAnswer -quiz.explanation');

    if (!module) {
      return res.status(404).json({ ok: false, error: 'Module not found' });
    }

    res.json({ ok: true, module });
  } catch (err) {
    console.error('Get module error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/batches
 * Get available Foundation School batches
 */
router.get('/batches', async (req, res) => {
  try {
    const { churchId, status } = req.query;
    
    const query = {};
    if (churchId) query.organization = churchId;
    if (status) query.status = status;
    else query.status = { $in: ['registration_open', 'in_progress'] };

    const batches = await FSBatch.find(query)
      .populate('organization', 'name slug')
      .populate('principal', 'name username')
      .sort({ startDate: -1 });

    res.json({ ok: true, batches });
  } catch (err) {
    console.error('Get batches error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// AUTHENTICATED ROUTES
// ==========================================

/**
 * POST /api/church/foundation/enroll
 * Enroll in Foundation School
 * NOTE: organizationId and batchId are OPTIONAL
 */
router.post('/enroll', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let { organizationId, batchId } = req.body || {};

    // Check if already enrolled (any active enrollment)
    const existingEnrollment = await FoundationEnrollment.findOne({
      student: userId,
      status: { $in: ['active', 'enrolled', 'in_progress'] }
    }).populate('batch', 'name batchNumber startDate');

    // If already enrolled, return the existing enrollment (not an error)
    if (existingEnrollment) {
      return res.json({ 
        ok: true, 
        enrollment: existingEnrollment,
        message: 'Already enrolled in Foundation School',
        alreadyEnrolled: true
      });
    }

    // Try to find an active batch if not provided
    if (!batchId) {
      const query = { status: { $in: ['registration_open', 'in_progress'] } };
      if (organizationId) query.organization = organizationId;
      const activeBatch = await FSBatch.findOne(query).sort({ startDate: -1 });
      if (activeBatch) {
        batchId = activeBatch._id;
        organizationId = organizationId || activeBatch.organization;
      }
      // NOTE: It's OK if no batch exists - enrollment can work without batch
    }

    // Get total modules for progress tracking
    const totalModules = await FoundationModule.countDocuments({ isActive: true });

    // Create enrollment (batch and organization are optional)
    const enrollment = new FoundationEnrollment({
      student: userId,
      ...(organizationId && { organization: organizationId }),
      ...(batchId && { batch: batchId }),
      enrolledAt: new Date(),
      status: 'active',
      progress: {
        currentModule: 1,
        completedModules: [],
        completedLessons: [],
        totalModules: totalModules || 7, // Default to 7 if no modules seeded yet
        quizScores: [],
        assignments: []
      }
    });

    await enrollment.save();
    
    // Populate batch if it exists
    if (batchId) {
      await enrollment.populate('batch', 'name batchNumber startDate');
    }

    res.status(201).json({ 
      ok: true, 
      enrollment,
      message: 'Successfully enrolled in Foundation School'
    });
  } catch (err) {
    console.error('Enrollment error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/enrollment
 * Get current user's enrollment status
 */
router.get('/enrollment', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { organizationId } = req.query;

    const query = { 
      student: userId,
      status: { $in: ['active', 'completed'] }
    };
    if (organizationId) query.organization = organizationId;

    const enrollment = await FoundationEnrollment.findOne(query)
      .populate('batch', 'name batchNumber startDate endDate status')
      .populate('organization', 'name slug')
      .sort({ enrolledAt: -1 });

    if (!enrollment) {
      return res.json({ ok: true, enrollment: null, enrolled: false });
    }

    res.json({ ok: true, enrollment, enrolled: true });
  } catch (err) {
    console.error('Get enrollment error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/progress
 * Get user's Foundation School progress
 */
router.get('/progress', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const enrollment = await FoundationEnrollment.findOne({
      student: userId,
      status: { $in: ['active', 'enrolled', 'in_progress', 'completed'] }
    }).sort({ enrolledAt: -1 });

    if (!enrollment) {
      return res.json({ 
        ok: true, 
        progress: null,
        enrolled: false 
      });
    }

    // Ensure progress object exists
    const progress = enrollment.progress || {
      currentModule: 1,
      completedModules: [],
      completedLessons: [],
      totalModules: 7,
      quizScores: [],
      assignments: []
    };

    // Calculate overall progress percentage
    const progressPercent = progress.totalModules > 0
      ? Math.round(((progress.completedModules?.length || 0) / progress.totalModules) * 100)
      : 0;

    // Calculate average quiz score
    const avgScore = progress.quizScores?.length > 0
      ? Math.round(progress.quizScores.reduce((a, b) => a + (b.score || 0), 0) / progress.quizScores.length)
      : 0;

    res.json({
      ok: true,
      enrolled: true,
      progress: {
        currentModule: progress.currentModule || 1,
        completedModules: progress.completedModules || [],
        completedLessons: progress.completedLessons || [],
        totalModules: progress.totalModules || 7,
        quizScores: progress.quizScores || [],
        assignments: progress.assignments || [],
        progressPercent,
        avgScore,
        enrolledAt: enrollment.enrolledAt,
        status: enrollment.status
      }
    });
  } catch (err) {
    console.error('Get progress error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/church/foundation/complete-lesson
 * Mark a lesson as complete
 */
router.post('/complete-lesson', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { moduleNumber, lessonId } = req.body;

    const enrollment = await FoundationEnrollment.findOne({
      student: userId,
      status: 'active'
    });

    if (!enrollment) {
      return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    }

    // Add to completed lessons if not already there
    const lessonKey = `${moduleNumber}-${lessonId}`;
    if (!enrollment.progress.completedLessons) {
      enrollment.progress.completedLessons = [];
    }
    
    if (!enrollment.progress.completedLessons.includes(lessonKey)) {
      enrollment.progress.completedLessons.push(lessonKey);
      await enrollment.save();
    }

    res.json({ 
      ok: true, 
      message: 'Lesson marked as complete',
      completedLessons: enrollment.progress.completedLessons
    });
  } catch (err) {
    console.error('Complete lesson error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/church/foundation/submit-quiz
 * Submit a quiz and get results
 */
router.post('/submit-quiz', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { moduleNumber, answers } = req.body;

    // Get module with correct answers
    const module = await FoundationModule.findOne({ 
      moduleNumber: parseInt(moduleNumber),
      isActive: true 
    });

    if (!module) {
      return res.status(404).json({ ok: false, error: 'Module not found' });
    }

    if (!module.quiz || module.quiz.length === 0) {
      return res.status(400).json({ ok: false, error: 'No quiz for this module' });
    }

    // Grade the quiz
    let correct = 0;
    const results = module.quiz.map((q, i) => {
      const userAnswer = answers[i];
      const isCorrect = userAnswer === q.correctAnswer;
      if (isCorrect) correct++;
      return {
        question: q.question,
        userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation
      };
    });

    const score = Math.round((correct / module.quiz.length) * 100);
    const passed = score >= (module.passingScore || 70);

    // Update enrollment progress
    const enrollment = await FoundationEnrollment.findOne({
      student: userId,
      status: 'active'
    });

    if (enrollment) {
      // Add quiz score
      enrollment.progress.quizScores.push({
        moduleNumber: parseInt(moduleNumber),
        score,
        passed,
        attemptDate: new Date()
      });

      // Mark module as complete if passed
      if (passed && !enrollment.progress.completedModules.includes(parseInt(moduleNumber))) {
        enrollment.progress.completedModules.push(parseInt(moduleNumber));
        enrollment.progress.currentModule = parseInt(moduleNumber) + 1;
      }

      // Check if all modules completed
      if (enrollment.progress.completedModules.length >= enrollment.progress.totalModules) {
        enrollment.status = 'completed';
        enrollment.completedAt = new Date();
      }

      await enrollment.save();
    }

    res.json({
      ok: true,
      score,
      passed,
      correct,
      total: module.quiz.length,
      results,
      passingScore: module.passingScore || 70
    });
  } catch (err) {
    console.error('Submit quiz error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/church/foundation/submit-assignment
 * Submit an assignment
 */
router.post('/submit-assignment', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { moduleNumber, assignmentId, content, attachments } = req.body;

    const enrollment = await FoundationEnrollment.findOne({
      student: userId,
      status: 'active'
    });

    if (!enrollment) {
      return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    }

    const submission = new FSAssignmentSubmission({
      enrollment: enrollment._id,
      moduleNumber: parseInt(moduleNumber),
      assignmentId,
      student: userId,
      content,
      attachments: attachments || [],
      submittedAt: new Date(),
      status: 'submitted'
    });

    await submission.save();

    // Update enrollment assignments
    enrollment.progress.assignments.push({
      moduleNumber: parseInt(moduleNumber),
      assignmentId,
      submissionId: submission._id,
      status: 'submitted',
      submittedAt: new Date()
    });

    await enrollment.save();

    res.status(201).json({
      ok: true,
      submission,
      message: 'Assignment submitted successfully'
    });
  } catch (err) {
    console.error('Submit assignment error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/certificate
 * Get graduation certificate
 */
router.get('/certificate', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const enrollment = await FoundationEnrollment.findOne({
      student: userId,
      status: 'completed'
    })
    .populate('student', 'name email username')
    .populate('organization', 'name slug')
    .populate('batch', 'name batchNumber graduationDate');

    if (!enrollment) {
      return res.status(404).json({ 
        ok: false, 
        error: 'No completed enrollment found' 
      });
    }

    // Calculate final grade
    const avgScore = enrollment.progress.quizScores.length > 0
      ? Math.round(enrollment.progress.quizScores.reduce((a, b) => a + b.score, 0) / enrollment.progress.quizScores.length)
      : 0;

    const certificate = {
      studentName: enrollment.student.name,
      organizationName: enrollment.organization.name,
      batchName: enrollment.batch?.name || 'Foundation School',
      completedAt: enrollment.completedAt,
      graduationDate: enrollment.batch?.graduationDate,
      finalGrade: avgScore >= 90 ? 'Distinction' : avgScore >= 75 ? 'Merit' : 'Pass',
      avgScore,
      modulesCompleted: enrollment.progress.completedModules.length,
      certificateId: `FS-${enrollment._id.toString().slice(-8).toUpperCase()}`
    };

    res.json({ ok: true, certificate });
  } catch (err) {
    console.error('Get certificate error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// STATISTICS ROUTES
// ==========================================

/**
 * GET /api/church/foundation/stats
 * Get Foundation School statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { organizationId } = req.query;

    const query = organizationId ? { organization: organizationId } : {};

    const [activeCount, completedCount, modules] = await Promise.all([
      FoundationEnrollment.countDocuments({ 
        ...query, 
        status: { $in: ['active', 'enrolled', 'in_progress'] } 
      }),
      FoundationEnrollment.countDocuments({ 
        ...query, 
        status: { $in: ['completed', 'graduated'] } 
      }),
      FoundationModule.countDocuments({ isActive: true })
    ]);

    // Calculate average quiz score from all enrollments
    let avgQuizScore = 0;
    try {
      const enrollmentsWithScores = await FoundationEnrollment.find({
        ...query,
        'progress.quizScores.0': { $exists: true }
      }).select('progress.quizScores');
      
      if (enrollmentsWithScores.length > 0) {
        let totalScore = 0;
        let scoreCount = 0;
        enrollmentsWithScores.forEach(e => {
          (e.progress?.quizScores || []).forEach(qs => {
            if (qs.score) {
              totalScore += qs.score;
              scoreCount++;
            }
          });
        });
        avgQuizScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;
      }
    } catch (e) {
      // Ignore score calculation errors
    }

    res.json({
      ok: true,
      stats: {
        activeStudents: activeCount,
        graduatedStudents: completedCount,
        avgQuizScore,
        totalStudents: activeCount + completedCount
      },
      totalModules: modules || 7
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// CERTIFICATE (Teacher/Principal Issuance)
// ==========================================

async function loadCertificateTemplate() {
  const path = require('path');
  const fs = require('fs');

  const explicit = process.env.FS_CERT_TEMPLATE_PATH;
  const local = explicit
    ? path.resolve(explicit)
    : path.resolve(__dirname, '..', 'assets', 'foundation-school-certificate.jpeg');

  if (fs.existsSync(local)) return local;
  return null;
}

async function generateCertificateJpegBuffer({ studentName, issueDate, churchName, locationName }) {
  const Jimp = require('jimp');
  const templatePath = await loadCertificateTemplate();
  if (!templatePath) {
    throw new Error('Certificate template missing. Place file at assets/foundation-school-certificate.jpeg or set FS_CERT_TEMPLATE_PATH');
  }

  const img = await Jimp.read(templatePath);
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  // Fonts
  const fontName = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

  // Helper: centered print
  const printCentered = (font, text, y, maxWidth) => {
    const width = maxWidth || Math.floor(w * 0.86);
    const x = Math.floor((w - width) / 2);
    img.print(font, x, y, {
      text,
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
    }, width, 80);
  };

  // Coordinates tuned for the provided template
  printCentered(fontName, studentName || 'Student Name', Math.floor(h * 0.38));

  // Date line
  const dateStr = issueDate
    ? new Date(issueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  printCentered(fontSmall, `Issued: ${dateStr}`, Math.floor(h * 0.58), Math.floor(w * 0.6));

  // Location / church
  const footer = [churchName, locationName].filter(Boolean).join(' • ');
  if (footer) {
    printCentered(fontSmall, footer, Math.floor(h * 0.63), Math.floor(w * 0.75));
  }

  return await img.quality(90).getBufferAsync(Jimp.MIME_JPEG);
}

/**
 * POST /api/church/foundation/admin/issue-certificate/:enrollmentId
 * Teacher/Principal issues certificate (and stores certificate meta)
 */
router.post('/admin/issue-certificate/:enrollmentId', verifyToken, async (req, res) => {
  try {
    const issuerId = req.user.id || req.user._id;
    const { enrollmentId } = req.params;
    const { issueDate, churchName, locationName } = req.body || {};

    const enrollment = await FoundationEnrollment.findById(enrollmentId)
      .populate('student', 'name username email')
      .populate('organization', 'name slug')
      .populate('batch', 'name batchNumber graduationDate principal teachers');

    if (!enrollment) return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    if (!['completed', 'graduated'].includes(enrollment.status)) {
      return res.status(400).json({ ok: false, error: 'Student must complete all modules first' });
    }

    // Basic authorization: principal/teacher of batch OR org leader/admin
    const { ChurchOrg } = require('../models/church.model');
    const org = enrollment.organization ? await ChurchOrg.findById(enrollment.organization._id) : null;
    const issuerStr = issuerId.toString();
    const isBatchTeacher = enrollment.batch && (
      enrollment.batch.principal?.toString() === issuerStr ||
      (enrollment.batch.teachers || []).some(t => t.toString() === issuerStr)
    );
    const isOrgAdmin = org && (
      org.leader?.toString() === issuerStr ||
      (org.admins || []).some(a => a.toString() === issuerStr) ||
      (org.assistantLeaders || []).some(a => a.toString() === issuerStr)
    );
    if (!isBatchTeacher && !isOrgAdmin) {
      return res.status(403).json({ ok: false, error: 'Not authorized to issue certificates for this organization/batch' });
    }

    if (!enrollment.certificateNumber) {
      enrollment.certificateNumber = `CYBEV-FS-${Date.now().toString(36).toUpperCase()}`;
    }

    enrollment.status = 'graduated';
    enrollment.graduatedAt = enrollment.graduatedAt || new Date(issueDate || Date.now());
    enrollment.certificateIssuedBy = issuerId;
    enrollment.certificateIssuedAt = new Date(issueDate || Date.now());

    // We generate on-demand via image endpoint; store meta only
    await enrollment.save();

    res.json({
      ok: true,
      message: 'Certificate issued. Use the certificate image endpoint to download/preview.',
      enrollmentId: enrollment._id,
      certificateNumber: enrollment.certificateNumber,
      certificateImageUrl: `/api/church/foundation/certificates/${enrollment._id}/image`
    });
  } catch (err) {
    console.error('Issue certificate error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/certificates/:enrollmentId/image
 * Streams the generated certificate image with student's name.
 */
router.get('/certificates/:enrollmentId/image', async (req, res) => {
  try {
    // Allow auth via Bearer header OR ?token= (useful for opening in a new tab)
    const jwt = require('jsonwebtoken');
    const bearer = req.headers.authorization?.replace('Bearer ', '');
    const qtok = (req.query.token || '').toString();
    const token = bearer || qtok;
    if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid token' });
    }

    const userId = decoded.userId || decoded.id || decoded._id;
    const { enrollmentId } = req.params;
    const enrollment = await FoundationEnrollment.findById(enrollmentId)
      .populate('student', 'name username')
      .populate('organization', 'name')
      .populate('batch', 'name');

    if (!enrollment) return res.status(404).json({ ok: false, error: 'Enrollment not found' });

    // Student can view own certificate. Teachers/admins can view too.
    const viewerStr = userId.toString();
    const isStudent = enrollment.student && enrollment.student._id.toString() === viewerStr;
    if (!isStudent) {
      const { ChurchOrg } = require('../models/church.model');
      const org = enrollment.organization ? await ChurchOrg.findById(enrollment.organization._id) : null;
      const isOrgAdmin = org && (
        org.leader?.toString() === viewerStr ||
        (org.admins || []).some(a => a.toString() === viewerStr) ||
        (org.assistantLeaders || []).some(a => a.toString() === viewerStr)
      );
      if (!isOrgAdmin) {
        return res.status(403).json({ ok: false, error: 'Not authorized' });
      }
    }

    const buffer = await generateCertificateJpegBuffer({
      studentName: enrollment.student?.name || enrollment.student?.username || 'Student',
      issueDate: enrollment.certificateIssuedAt || enrollment.graduatedAt || enrollment.completedAt || new Date(),
      churchName: enrollment.organization?.name,
      locationName: process.env.FS_CERT_LOCATION_NAME
    });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="foundation-school-certificate-${enrollment.certificateNumber || enrollment._id}.jpg"`);
    res.end(buffer);
  } catch (err) {
    console.error('Certificate image error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

/**
 * POST /api/church/foundation/admin/seed-modules
 * Seed Foundation School modules (Admin only)
 */
router.post('/admin/seed-modules', verifyToken, async (req, res) => {
  try {
    const { modules } = req.body;

    if (!modules || !Array.isArray(modules)) {
      return res.status(400).json({ ok: false, error: 'Modules array required' });
    }

    await FoundationModule.deleteMany({});
    const inserted = await FoundationModule.insertMany(modules);

    res.json({
      ok: true,
      message: `Successfully seeded ${inserted.length} Foundation School modules`,
      count: inserted.length
    });
  } catch (err) {
    console.error('Seed modules error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/admin/students
 * Get all enrolled students (Admin dashboard)
 */
router.get('/admin/students', verifyToken, async (req, res) => {
  try {
    const { organizationId, batchId, status, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (organizationId) query.organization = organizationId;
    if (batchId) query.batch = batchId;
    if (status && status !== 'all') query.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [enrollments, total] = await Promise.all([
      FoundationEnrollment.find(query)
        .populate('student', 'name email username avatar')
        .populate('batch', 'name batchNumber')
        .populate('organization', 'name slug')
        .sort({ enrolledAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      FoundationEnrollment.countDocuments(query)
    ]);
    
    res.json({
      ok: true,
      enrollments,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    console.error('Get admin students error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/leaderboard
 * Public leaderboard - top students by quiz scores
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { organizationId, limit = 50 } = req.query;
    
    const query = {
      'progress.quizScores.0': { $exists: true }
    };
    if (organizationId) query.organization = organizationId;
    
    const enrollments = await FoundationEnrollment.find(query)
      .populate('student', 'name username avatar')
      .select('student progress.quizScores progress.completedModules');
    
    // Calculate average score and sort
    const leaderboard = enrollments
      .map(e => {
        const scores = e.progress?.quizScores || [];
        const avgScore = scores.length > 0 
          ? Math.round(scores.reduce((a, b) => a + (b.score || 0), 0) / scores.length)
          : 0;
        return {
          _id: e._id,
          student: e.student,
          avgScore,
          quizCount: scores.length,
          completedModules: e.progress?.completedModules?.length || 0
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, parseInt(limit));
    
    res.json({ ok: true, leaderboard });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/church/foundation/admin/create-batch
 * Create a new Foundation School batch
 */
router.post('/admin/create-batch', verifyToken, async (req, res) => {
  try {
    const { organizationId, batchNumber, name, startDate, endDate, graduationDate } = req.body;

    const batch = new FSBatch({
      organization: organizationId,
      batchNumber,
      name,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      graduationDate: graduationDate ? new Date(graduationDate) : null,
      status: 'registration_open',
      principal: req.user.id || req.user._id
    });

    await batch.save();

    res.status(201).json({ ok: true, batch });
  } catch (err) {
    console.error('Create batch error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/church/foundation/admin/grade-assignment/:submissionId
 * Grade an assignment submission
 */
router.put('/admin/grade-assignment/:submissionId', verifyToken, async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { grade, feedback, resubmissionAllowed } = req.body;
    const graderId = req.user.id || req.user._id;

    const submission = await FSAssignmentSubmission.findByIdAndUpdate(
      submissionId,
      {
        grade,
        feedback,
        gradedBy: graderId,
        gradedAt: new Date(),
        status: 'graded',
        resubmissionAllowed
      },
      { new: true }
    );

    if (!submission) {
      return res.status(404).json({ ok: false, error: 'Submission not found' });
    }

    await FoundationEnrollment.updateOne(
      { 
        _id: submission.enrollment,
        'progress.assignments.submissionId': submission._id
      },
      {
        $set: {
          'progress.assignments.$.status': 'graded',
          'progress.assignments.$.grade': grade
        }
      }
    );

    res.json({ ok: true, submission });
  } catch (err) {
    console.error('Grade assignment error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/church/foundation/admin/enrollments
 * Get all enrollments (Admin)
 */
router.get('/admin/enrollments', verifyToken, async (req, res) => {
  try {
    const { organizationId, batchId, status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (organizationId) query.organization = organizationId;
    if (batchId) query.batch = batchId;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [enrollments, total] = await Promise.all([
      FoundationEnrollment.find(query)
        .populate('student', 'name email username avatar')
        .populate('batch', 'name batchNumber')
        .sort({ enrolledAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      FoundationEnrollment.countDocuments(query)
    ]);

    res.json({
      ok: true,
      enrollments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get enrollments error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/church/foundation/admin/run-seed
 * Run the Foundation School seed (Admin only - requires admin secret or admin role)
 * Can be called from Railway dashboard or via curl
 * 
 * Usage: 
 * curl -X POST https://api.cybev.io/api/church/foundation/admin/run-seed \
 *   -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
 *   -H "Content-Type: application/json"
 * 
 * Or with secret:
 * curl -X POST https://api.cybev.io/api/church/foundation/admin/run-seed \
 *   -H "Content-Type: application/json" \
 *   -d '{"adminSecret": "YOUR_ADMIN_SECRET"}'
 */
router.post('/admin/run-seed', async (req, res) => {
  try {
    // Check authorization - either admin token or admin secret
    const { adminSecret } = req.body || {};
    const authHeader = req.headers.authorization;
    
    let authorized = false;
    
    // Check admin secret (from env)
    if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
      authorized = true;
    }
    
    // Check JWT token for admin role
    if (!authorized && authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
        if (decoded.role === 'admin' || decoded.isAdmin) {
          authorized = true;
        }
      } catch (e) {
        // Invalid token
      }
    }
    
    if (!authorized) {
      return res.status(403).json({ 
        ok: false, 
        error: 'Admin authorization required. Provide adminSecret or admin JWT token.' 
      });
    }

    // March 2025 Foundation School Curriculum - Inline seed data
    const modules = [
      {
        moduleNumber: 1,
        title: "The New Creature",
        subtitle: "Understanding Your New Identity in Christ",
        description: "Discover what it means to be born again and your new identity as a child of God.",
        icon: "Sparkles",
        color: "#10B981",
        duration: "2-3 hours",
        totalLessons: 5,
        lessons: [
          {
            lessonNumber: 1,
            title: "What Happened When You Were Born Again",
            content: "When you received Jesus Christ as your Lord and Savior, something extraordinary happened. You experienced the new birth - you became a new creature entirely! 2 Corinthians 5:17 says: 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.'",
            scriptureReferences: ["2 Corinthians 5:17", "John 3:3-6", "Colossians 1:13"],
            keyPoints: ["You are a completely new creation", "Your spirit has been born of God", "You have received the divine nature"],
            memoryVerse: "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new. - 2 Corinthians 5:17",
            duration: "30 minutes"
          },
          {
            lessonNumber: 2,
            title: "Your New Nature",
            content: "As a new creature in Christ, you have received a brand new nature - the divine nature! 2 Peter 1:4 tells us that God has given us 'exceeding great and precious promises: that by these ye might be partakers of the divine nature.'",
            scriptureReferences: ["2 Peter 1:4", "Romans 5:19", "2 Corinthians 5:21"],
            keyPoints: ["You have God's nature living inside you", "You are righteous by nature", "You are made righteous, not trying to become righteous"],
            memoryVerse: "For as by one man's disobedience many were made sinners, so by the obedience of one shall many be made righteous. - Romans 5:19",
            duration: "30 minutes"
          },
          {
            lessonNumber: 3,
            title: "Your New Family",
            content: "When you were born again, you were born into God's family. You now have a new Father - God Himself! Galatians 4:6 says: 'And because ye are sons, God hath sent forth the Spirit of his Son into your hearts, crying, Abba, Father.'",
            scriptureReferences: ["Galatians 4:6-7", "Romans 8:15-17", "1 John 3:1-2"],
            keyPoints: ["God is your Father", "You are a son/daughter of God", "You have an inheritance in Christ"],
            memoryVerse: "Behold, what manner of love the Father hath bestowed upon us, that we should be called the sons of God. - 1 John 3:1",
            duration: "30 minutes"
          },
          {
            lessonNumber: 4,
            title: "Your New Name",
            content: "In Christ, you have been given new names that describe your new identity. You are no longer a sinner but a saint. You are called a believer, a Christian, and a disciple.",
            scriptureReferences: ["1 Corinthians 1:2", "Acts 11:26", "Ephesians 1:1"],
            keyPoints: ["You are a saint", "You are a believer", "You are a Christian - a Christ-one"],
            memoryVerse: "Unto the church of God which is at Corinth, to them that are sanctified in Christ Jesus, called to be saints. - 1 Corinthians 1:2",
            duration: "30 minutes"
          },
          {
            lessonNumber: 5,
            title: "Your New Life",
            content: "As a new creature, you have been given a brand new life - eternal life! 1 John 5:11-12 says: 'And this is the record, that God hath given to us eternal life, and this life is in his Son. He that hath the Son hath life.'",
            scriptureReferences: ["1 John 5:11-12", "John 10:10", "Romans 6:4"],
            keyPoints: ["You have eternal life NOW", "This life is in Jesus", "You can walk in newness of life"],
            memoryVerse: "He that hath the Son hath life; and he that hath not the Son of God hath not life. - 1 John 5:12",
            duration: "30 minutes"
          }
        ],
        quiz: [
          { question: "According to 2 Corinthians 5:17, what happens when you are in Christ?", options: ["You become a better person", "You are reformed", "You are a new creature", "You try harder"], correctAnswer: 2, explanation: "The Bible says you become a 'new creature' - not reformed, but completely new!" },
          { question: "What nature did you receive when you were born again?", options: ["Angelic nature", "Human nature improved", "The divine nature of God", "A sinful nature"], correctAnswer: 2, explanation: "2 Peter 1:4 tells us we have become 'partakers of the divine nature' - God's own nature!" },
          { question: "According to Galatians 4:6-7, what is your relationship with God now?", options: ["Servant", "Slave", "Stranger", "Son/Daughter"], correctAnswer: 3, explanation: "Galatians 4:6-7 says we are sons, not servants - we can call God 'Abba, Father.'" },
          { question: "When do you have eternal life according to 1 John 5:12?", options: ["When you die", "When you get to heaven", "Right now if you have the Son", "After you do enough good works"], correctAnswer: 2, explanation: "1 John 5:12 says 'He that hath the Son hath life' - present tense, right now!" }
        ],
        assignment: { title: "My New Identity Declaration", description: "Write a personal declaration of who you are in Christ based on the scriptures studied.", type: "written", dueInDays: 7 },
        passingScore: 70,
        isActive: true,
        order: 1
      },
      {
        moduleNumber: 2,
        title: "The Holy Spirit",
        subtitle: "Your Helper, Guide, and Empowerer",
        description: "Learn about the Person and work of the Holy Spirit in your life.",
        icon: "Flame",
        color: "#F59E0B",
        duration: "2-3 hours",
        totalLessons: 5,
        lessons: [
          { lessonNumber: 1, title: "Who Is The Holy Spirit?", content: "The Holy Spirit is the third Person of the Godhead - Father, Son, and Holy Spirit. He is not a force or influence, but a real Person with intellect, emotions, and will.", scriptureReferences: ["John 14:16-17", "Acts 5:3-4", "2 Corinthians 13:14"], keyPoints: ["The Holy Spirit is God", "He is a Person, not a force", "He is the third Person of the Trinity"], memoryVerse: "And I will pray the Father, and he shall give you another Comforter, that he may abide with you for ever. - John 14:16", duration: "30 minutes" },
          { lessonNumber: 2, title: "The Holy Spirit In You", content: "When you were born again, the Holy Spirit came to live inside you. Your body is now the temple of the Holy Spirit!", scriptureReferences: ["1 Corinthians 6:19", "Romans 8:9-11", "John 14:17"], keyPoints: ["The Holy Spirit lives in you", "Your body is His temple", "He will never leave you"], memoryVerse: "What? know ye not that your body is the temple of the Holy Ghost which is in you? - 1 Corinthians 6:19", duration: "30 minutes" },
          { lessonNumber: 3, title: "The Baptism of the Holy Spirit", content: "Beyond salvation, there is a distinct experience called the baptism of the Holy Spirit. This empowers you for service and witness.", scriptureReferences: ["Acts 1:8", "Acts 2:4", "Acts 19:6"], keyPoints: ["The baptism is distinct from salvation", "It empowers you for witness", "Speaking in tongues is the initial evidence"], memoryVerse: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me. - Acts 1:8", duration: "30 minutes" },
          { lessonNumber: 4, title: "Walking In The Spirit", content: "God wants you to walk in the Spirit daily - to be led by Him, to live by His power, and to bear His fruit.", scriptureReferences: ["Galatians 5:16", "Galatians 5:22-23", "Romans 8:14"], keyPoints: ["Be led by the Spirit daily", "Bear the fruit of the Spirit", "Don't fulfill the lusts of the flesh"], memoryVerse: "This I say then, Walk in the Spirit, and ye shall not fulfil the lust of the flesh. - Galatians 5:16", duration: "30 minutes" },
          { lessonNumber: 5, title: "Gifts of the Spirit", content: "The Holy Spirit distributes spiritual gifts to every believer for the building up of the church and the work of ministry.", scriptureReferences: ["1 Corinthians 12:4-11", "Romans 12:6-8", "Ephesians 4:11-12"], keyPoints: ["Every believer has spiritual gifts", "Gifts are for edifying the church", "Desire spiritual gifts"], memoryVerse: "But the manifestation of the Spirit is given to every man to profit withal. - 1 Corinthians 12:7", duration: "30 minutes" }
        ],
        quiz: [
          { question: "The Holy Spirit is:", options: ["A force or power", "An influence", "A Person - the third Person of the Godhead", "Just God's breath"], correctAnswer: 2, explanation: "The Holy Spirit is a Person with intellect, emotions, and will - the third Person of the Trinity." },
          { question: "Where does the Holy Spirit live?", options: ["In heaven only", "In the church building", "Inside every believer", "Nowhere specific"], correctAnswer: 2, explanation: "1 Corinthians 6:19 says your body is the temple of the Holy Spirit - He lives in you!" },
          { question: "What is the purpose of the baptism of the Holy Spirit?", options: ["To save you", "To make you holy", "To give you power to witness", "To take you to heaven"], correctAnswer: 2, explanation: "Acts 1:8 says you receive power to be witnesses after the Holy Spirit comes upon you." }
        ],
        assignment: { title: "My Holy Spirit Journal", description: "Keep a journal for one week documenting how you sense the Holy Spirit leading you.", type: "reflection", dueInDays: 7 },
        passingScore: 70,
        isActive: true,
        order: 2
      },
      {
        moduleNumber: 3,
        title: "Water Baptism",
        subtitle: "Identifying with Christ's Death and Resurrection",
        description: "Understand the significance and importance of water baptism.",
        icon: "Droplets",
        color: "#3B82F6",
        duration: "1-2 hours",
        totalLessons: 4,
        lessons: [
          { lessonNumber: 1, title: "What Is Water Baptism?", content: "Water baptism is an outward expression of an inward reality. It is a public declaration of your faith in Christ.", scriptureReferences: ["Matthew 28:19", "Mark 16:16", "Acts 2:38"], keyPoints: ["Baptism is commanded by Jesus", "It is a public declaration", "It follows salvation"], memoryVerse: "Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost. - Matthew 28:19", duration: "30 minutes" },
          { lessonNumber: 2, title: "The Meaning of Baptism", content: "Baptism symbolizes your identification with Christ in His death, burial, and resurrection. Going under the water represents dying with Christ; coming up represents rising with Him.", scriptureReferences: ["Romans 6:3-4", "Colossians 2:12", "Galatians 3:27"], keyPoints: ["Baptism symbolizes death to the old life", "It symbolizes resurrection to new life", "You are identified with Christ"], memoryVerse: "Therefore we are buried with him by baptism into death: that like as Christ was raised up from the dead, even so we also should walk in newness of life. - Romans 6:4", duration: "30 minutes" },
          { lessonNumber: 3, title: "Examples of Baptism", content: "Throughout the New Testament, we see examples of believers being baptized immediately after believing.", scriptureReferences: ["Acts 8:36-38", "Acts 16:30-33", "Acts 10:47-48"], keyPoints: ["The Ethiopian was baptized immediately", "The Philippian jailer was baptized the same hour", "Cornelius and his household were baptized"], memoryVerse: "And as they went on their way, they came unto a certain water: and the eunuch said, See, here is water; what doth hinder me to be baptized? - Acts 8:36", duration: "30 minutes" },
          { lessonNumber: 4, title: "Preparing for Your Baptism", content: "If you haven't been baptized since you believed, you should prepare for this important step of obedience.", scriptureReferences: ["Acts 22:16", "1 Peter 3:21"], keyPoints: ["Baptism is an act of obedience", "Prepare your heart", "Share your testimony"], memoryVerse: "And now why tarriest thou? arise, and be baptized, and wash away thy sins, calling on the name of the Lord. - Acts 22:16", duration: "30 minutes" }
        ],
        quiz: [
          { question: "Water baptism is:", options: ["What saves you", "An outward expression of inward faith", "Optional for Christians", "Only for pastors"], correctAnswer: 1, explanation: "Baptism is an outward expression of the inward reality of salvation - it doesn't save you, but demonstrates your faith." },
          { question: "Going under the water in baptism represents:", options: ["Getting clean", "Dying with Christ", "Swimming", "Nothing specific"], correctAnswer: 1, explanation: "Romans 6:3-4 teaches that baptism represents our identification with Christ's death - we die with Him." }
        ],
        assignment: { title: "My Baptism Testimony", description: "If baptized, write your testimony. If not, write why you want to be baptized.", type: "written", dueInDays: 7 },
        passingScore: 70,
        isActive: true,
        order: 3
      },
      {
        moduleNumber: 4,
        title: "The Word of God",
        subtitle: "Your Foundation for Life and Victory",
        description: "Learn the importance of God's Word and how to study it effectively.",
        icon: "Book",
        color: "#8B5CF6",
        duration: "2-3 hours",
        totalLessons: 5,
        lessons: [
          { lessonNumber: 1, title: "What Is The Bible?", content: "The Bible is God's Word - His inspired, infallible, and authoritative revelation to mankind.", scriptureReferences: ["2 Timothy 3:16-17", "2 Peter 1:20-21", "Hebrews 4:12"], keyPoints: ["The Bible is God-breathed", "It is infallible and authoritative", "It is living and powerful"], memoryVerse: "All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness. - 2 Timothy 3:16", duration: "30 minutes" },
          { lessonNumber: 2, title: "The Power of God's Word", content: "God's Word has creative and transforming power. It can change your life, heal your body, and transform your circumstances.", scriptureReferences: ["Isaiah 55:11", "Jeremiah 23:29", "Romans 10:17"], keyPoints: ["God's Word accomplishes what it is sent to do", "It is like fire and a hammer", "Faith comes by hearing the Word"], memoryVerse: "So shall my word be that goeth forth out of my mouth: it shall not return unto me void. - Isaiah 55:11", duration: "30 minutes" },
          { lessonNumber: 3, title: "Studying The Word", content: "To grow as a Christian, you must study God's Word regularly and systematically.", scriptureReferences: ["2 Timothy 2:15", "Joshua 1:8", "Psalm 1:2-3"], keyPoints: ["Study to show yourself approved", "Meditate on the Word day and night", "Be a doer, not just a hearer"], memoryVerse: "Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth. - 2 Timothy 2:15", duration: "30 minutes" },
          { lessonNumber: 4, title: "Meditating On The Word", content: "Biblical meditation is different from Eastern meditation. It means to mutter, ponder, and think deeply on God's Word.", scriptureReferences: ["Joshua 1:8", "Psalm 1:2-3", "Psalm 119:97"], keyPoints: ["Meditate day and night", "Mutter the Word to yourself", "This brings success and prosperity"], memoryVerse: "This book of the law shall not depart out of thy mouth; but thou shalt meditate therein day and night. - Joshua 1:8", duration: "30 minutes" },
          { lessonNumber: 5, title: "Confessing The Word", content: "Confession is saying what God says. Speaking His Word activates your faith and releases His power.", scriptureReferences: ["Romans 10:8-10", "Mark 11:23", "Proverbs 18:21"], keyPoints: ["Confession brings possession", "Your words have power", "Speak what God says"], memoryVerse: "For with the heart man believeth unto righteousness; and with the mouth confession is made unto salvation. - Romans 10:10", duration: "30 minutes" }
        ],
        quiz: [
          { question: "According to 2 Timothy 3:16, the Bible is:", options: ["Man's ideas about God", "Legends and myths", "God-breathed/inspired by God", "Optional reading"], correctAnswer: 2, explanation: "The Bible is 'given by inspiration of God' - literally God-breathed. It is His Word!" },
          { question: "What does Joshua 1:8 promise to those who meditate on God's Word?", options: ["Nothing specific", "Success and prosperity", "Instant wealth", "Easy life"], correctAnswer: 1, explanation: "Joshua 1:8 promises that meditation on God's Word brings success and prosperity in all you do." }
        ],
        assignment: { title: "My Bible Study Plan", description: "Create a personal Bible study plan for the next month.", type: "practical", dueInDays: 7 },
        passingScore: 70,
        isActive: true,
        order: 4
      },
      {
        moduleNumber: 5,
        title: "Prayer",
        subtitle: "Communicating with Your Heavenly Father",
        description: "Learn how to pray effectively and maintain fellowship with God.",
        icon: "MessageCircle",
        color: "#EC4899",
        duration: "2-3 hours",
        totalLessons: 5,
        lessons: [
          { lessonNumber: 1, title: "What Is Prayer?", content: "Prayer is communication with God. It is talking to your Heavenly Father and listening to Him.", scriptureReferences: ["Matthew 6:9-13", "Philippians 4:6-7", "1 Thessalonians 5:17"], keyPoints: ["Prayer is talking to God", "God hears your prayers", "You can pray about everything"], memoryVerse: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God. - Philippians 4:6", duration: "30 minutes" },
          { lessonNumber: 2, title: "Praying In Jesus' Name", content: "Jesus gave us the authority to use His Name in prayer. When we pray in His Name, it's as if He is making the request.", scriptureReferences: ["John 14:13-14", "John 16:23-24", "Colossians 3:17"], keyPoints: ["Pray in Jesus' Name", "Jesus gave you authority to use His Name", "The Father answers prayers in Jesus' Name"], memoryVerse: "And whatsoever ye shall ask in my name, that will I do, that the Father may be glorified in the Son. - John 14:13", duration: "30 minutes" },
          { lessonNumber: 3, title: "Praying In The Spirit", content: "Praying in the Spirit (in tongues) is a powerful way to pray. It bypasses your natural understanding and prays perfect prayers.", scriptureReferences: ["1 Corinthians 14:14-15", "Romans 8:26-27", "Jude 1:20"], keyPoints: ["Praying in tongues edifies you", "The Spirit helps your weaknesses", "Build yourself up in faith"], memoryVerse: "But ye, beloved, building up yourselves on your most holy faith, praying in the Holy Ghost. - Jude 1:20", duration: "30 minutes" },
          { lessonNumber: 4, title: "Types of Prayer", content: "The Bible describes different types of prayer: thanksgiving, petition, intercession, supplication, and more.", scriptureReferences: ["1 Timothy 2:1-2", "Ephesians 6:18", "James 5:16"], keyPoints: ["Pray with thanksgiving", "Make petitions and supplications", "Intercede for others"], memoryVerse: "I exhort therefore, that, first of all, supplications, prayers, intercessions, and giving of thanks, be made for all men. - 1 Timothy 2:1", duration: "30 minutes" },
          { lessonNumber: 5, title: "Developing A Prayer Life", content: "A consistent prayer life requires discipline and desire. Set aside time daily to commune with God.", scriptureReferences: ["Mark 1:35", "Luke 18:1", "Daniel 6:10"], keyPoints: ["Jesus prayed early in the morning", "Pray without ceasing", "Develop a consistent prayer schedule"], memoryVerse: "And in the morning, rising up a great while before day, he went out, and departed into a solitary place, and there prayed. - Mark 1:35", duration: "30 minutes" }
        ],
        quiz: [
          { question: "What is prayer?", options: ["A religious ritual", "Communication with God", "Reciting memorized words", "Only for emergencies"], correctAnswer: 1, explanation: "Prayer is simply talking to God and listening to Him - it's communication with your Heavenly Father." },
          { question: "Why do we pray in Jesus' Name?", options: ["It's just tradition", "Jesus gave us authority to use His Name", "It sounds nice", "We don't need to"], correctAnswer: 1, explanation: "John 14:13-14 shows that Jesus gave us authority to use His Name, and the Father answers prayers made in Jesus' Name." }
        ],
        assignment: { title: "My Prayer Journal", description: "Keep a prayer journal for one week, recording your prayers and God's answers.", type: "reflection", dueInDays: 7 },
        passingScore: 70,
        isActive: true,
        order: 5
      },
      {
        moduleNumber: 6,
        title: "Christian Doctrines",
        subtitle: "Foundations of Faith",
        description: "Learn the fundamental doctrines of the Christian faith.",
        icon: "Scroll",
        color: "#6366F1",
        duration: "3-4 hours",
        totalLessons: 5,
        lessons: [
          { lessonNumber: 1, title: "The Doctrine of God", content: "There is one God who exists eternally in three Persons: Father, Son, and Holy Spirit.", scriptureReferences: ["Deuteronomy 6:4", "Matthew 28:19", "2 Corinthians 13:14"], keyPoints: ["There is one God", "God exists in three Persons", "The Trinity is a mystery but true"], memoryVerse: "Hear, O Israel: The LORD our God is one LORD. - Deuteronomy 6:4", duration: "40 minutes" },
          { lessonNumber: 2, title: "The Doctrine of Christ", content: "Jesus Christ is the Son of God, fully God and fully man. He died for our sins and rose again.", scriptureReferences: ["John 1:1-14", "Colossians 2:9", "1 Corinthians 15:3-4"], keyPoints: ["Jesus is fully God", "Jesus is fully man", "He died and rose again for us"], memoryVerse: "For in him dwelleth all the fulness of the Godhead bodily. - Colossians 2:9", duration: "40 minutes" },
          { lessonNumber: 3, title: "The Doctrine of Salvation", content: "Salvation is by grace through faith in Jesus Christ. It is a gift, not earned by works.", scriptureReferences: ["Ephesians 2:8-9", "Romans 10:9-10", "Titus 3:5"], keyPoints: ["Salvation is by grace", "Through faith in Jesus", "Not of works"], memoryVerse: "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God. - Ephesians 2:8", duration: "40 minutes" },
          { lessonNumber: 4, title: "The Doctrine of The Church", content: "The Church is the Body of Christ, composed of all believers. It is both universal and local.", scriptureReferences: ["Ephesians 1:22-23", "1 Corinthians 12:27", "Hebrews 10:25"], keyPoints: ["The Church is Christ's Body", "All believers are members", "Gather together regularly"], memoryVerse: "And hath put all things under his feet, and gave him to be the head over all things to the church, which is his body. - Ephesians 1:22-23", duration: "40 minutes" },
          { lessonNumber: 5, title: "The Doctrine of Last Things", content: "Jesus is coming again! The dead in Christ will rise, and we will be caught up to meet Him.", scriptureReferences: ["1 Thessalonians 4:16-17", "John 14:1-3", "Revelation 21:1-4"], keyPoints: ["Jesus is coming again", "The dead will rise", "We will live with Him forever"], memoryVerse: "For the Lord himself shall descend from heaven with a shout... and the dead in Christ shall rise first. - 1 Thessalonians 4:16", duration: "40 minutes" }
        ],
        quiz: [
          { question: "How many Persons exist in the Godhead?", options: ["One", "Two", "Three", "Many"], correctAnswer: 2, explanation: "The Bible teaches that God exists eternally in three Persons: Father, Son, and Holy Spirit - this is called the Trinity." },
          { question: "According to Ephesians 2:8-9, salvation is:", options: ["Earned by good works", "Given to good people", "By grace through faith", "For religious people only"], correctAnswer: 2, explanation: "Salvation is by grace through faith - it is a gift from God, not earned by works." }
        ],
        assignment: { title: "Doctrine Summary", description: "Summarize each doctrine in your own words with scripture references.", type: "written", dueInDays: 7 },
        passingScore: 70,
        isActive: true,
        order: 6
      },
      {
        moduleNumber: 7,
        title: "Christian Living",
        subtitle: "Walking in Victory Every Day",
        description: "Practical principles for living the Christian life victoriously.",
        icon: "Heart",
        color: "#EF4444",
        duration: "2-3 hours",
        totalLessons: 5,
        lessons: [
          { lessonNumber: 1, title: "Living By Faith", content: "The righteous live by faith. Faith is trusting God and His Word regardless of circumstances.", scriptureReferences: ["Romans 1:17", "Hebrews 11:6", "2 Corinthians 5:7"], keyPoints: ["Live by faith, not by sight", "Without faith, you cannot please God", "Faith comes by hearing God's Word"], memoryVerse: "For therein is the righteousness of God revealed from faith to faith: as it is written, The just shall live by faith. - Romans 1:17", duration: "30 minutes" },
          { lessonNumber: 2, title: "Overcoming Temptation", content: "God provides a way of escape from every temptation. You can overcome through the Word and the Spirit.", scriptureReferences: ["1 Corinthians 10:13", "James 4:7", "Ephesians 6:11-17"], keyPoints: ["God provides a way out", "Resist the devil and he will flee", "Use the armor of God"], memoryVerse: "There hath no temptation taken you but such as is common to man: but God is faithful. - 1 Corinthians 10:13", duration: "30 minutes" },
          { lessonNumber: 3, title: "Fellowship With Believers", content: "God did not design you to live the Christian life alone. You need fellowship with other believers.", scriptureReferences: ["Hebrews 10:25", "Acts 2:42-47", "Proverbs 27:17"], keyPoints: ["Don't forsake assembling together", "The early church met regularly", "Iron sharpens iron"], memoryVerse: "Not forsaking the assembling of ourselves together, as the manner of some is. - Hebrews 10:25", duration: "30 minutes" },
          { lessonNumber: 4, title: "Witnessing For Christ", content: "You are called to be a witness for Jesus Christ. Share your faith with others!", scriptureReferences: ["Acts 1:8", "Mark 16:15", "Matthew 28:19-20"], keyPoints: ["You are a witness", "Go into all the world", "Make disciples"], memoryVerse: "Go ye into all the world, and preach the gospel to every creature. - Mark 16:15", duration: "30 minutes" },
          { lessonNumber: 5, title: "Giving And Stewardship", content: "Everything you have belongs to God. Be a faithful steward of your time, talents, and treasures.", scriptureReferences: ["Malachi 3:10", "2 Corinthians 9:6-7", "Luke 6:38"], keyPoints: ["Bring tithes to God's house", "Give cheerfully", "Give and it shall be given to you"], memoryVerse: "Bring ye all the tithes into the storehouse, that there may be meat in mine house. - Malachi 3:10", duration: "30 minutes" }
        ],
        quiz: [
          { question: "According to Romans 1:17, how should the righteous live?", options: ["By their feelings", "By circumstances", "By faith", "By their own strength"], correctAnswer: 2, explanation: "The Bible says 'the just shall live by faith' - we walk by faith, not by sight." },
          { question: "Why is fellowship with other believers important?", options: ["It's not important", "God designed us for community", "Only pastors need it", "It's optional"], correctAnswer: 1, explanation: "Hebrews 10:25 commands us not to forsake assembling together - God designed us for fellowship." }
        ],
        assignment: { title: "My Witness Plan", description: "Write a plan for sharing your faith with 3 people this month.", type: "practical", dueInDays: 14 },
        passingScore: 70,
        isActive: true,
        order: 7
      }
    ];

    // Clear existing modules and insert new ones
    await FoundationModule.deleteMany({});
    const inserted = await FoundationModule.insertMany(modules);

    console.log(`✅ Foundation School seeded: ${inserted.length} modules`);

    res.json({
      ok: true,
      message: `Successfully seeded ${inserted.length} Foundation School modules`,
      modules: inserted.map(m => ({ moduleNumber: m.moduleNumber, title: m.title, lessons: m.lessons?.length || 0 }))
    });
  } catch (err) {
    console.error('Run seed error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
