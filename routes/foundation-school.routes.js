/**
 * ============================================
 * FILE: foundation-school.routes.js
 * PATH: cybev-backend-main/routes/foundation-school.routes.js
 * VERSION: 2.0.0 - March 2025 Manual
 * STATUS: NEW FILE - Copy to routes/
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

module.exports = router;
