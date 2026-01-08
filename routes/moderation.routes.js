// ============================================
// FILE: routes/moderation.routes.js
// Content Moderation API Routes
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// Admin check middleware
const requireAdmin = async (req, res, next) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const user = await User.findById(req.user.id);
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    req.userRole = user.role;
    next();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// Get models
const getModels = () => {
  try {
    return require('../models/moderation.model');
  } catch (err) {
    console.error('Moderation models not found:', err.message);
    return {};
  }
};

// Get moderation service
const getModerationService = () => {
  try {
    return require('../services/moderation.service');
  } catch (err) {
    console.error('Moderation service not found:', err.message);
    return null;
  }
};

// ==========================================
// USER REPORTING
// ==========================================

/**
 * Report content
 * POST /api/moderation/report
 */
router.post('/report', verifyToken, async (req, res) => {
  try {
    const { ContentReport } = getModels();
    const moderationService = getModerationService();
    const {
      contentType,
      contentId,
      reason,
      reasonDetails
    } = req.body;

    // Validate
    if (!contentType || !contentId || !reason) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Content type, ID, and reason are required' 
      });
    }

    // Check for duplicate report from same user
    const existingReport = await ContentReport.findOne({
      reporter: req.user.id,
      contentType,
      contentId,
      status: { $in: ['pending', 'reviewing'] }
    });

    if (existingReport) {
      return res.status(400).json({ 
        ok: false, 
        error: 'You have already reported this content' 
      });
    }

    // Get content snapshot
    let contentSnapshot = {};
    let contentAuthor = null;

    try {
      const ModelMap = {
        'post': mongoose.models.Post || require('../models/post.model'),
        'blog': mongoose.models.Blog || require('../models/blog.model'),
        'comment': mongoose.models.Comment || require('../models/comment.model'),
        'user': mongoose.models.User || require('../models/user.model'),
        'group': mongoose.models.Group || require('../models/group.model'),
        'event': mongoose.models.Event || require('../models/event.model')
      };

      const Model = ModelMap[contentType];
      if (Model) {
        const content = await Model.findById(contentId).lean();
        if (content) {
          contentSnapshot = {
            text: content.content || content.text || content.description || content.bio,
            media: content.media || content.images || [],
            metadata: {
              title: content.title,
              createdAt: content.createdAt
            }
          };
          contentAuthor = content.author || content.authorId || content.creator || 
                          content.organizer || content._id;
        }
      }
    } catch (e) {
      console.log('Could not get content snapshot:', e.message);
    }

    // Run AI analysis if available
    let aiAnalysis = null;
    if (moderationService && contentSnapshot.text) {
      const analysis = await moderationService.analyzeContent(contentSnapshot.text, { useAI: true });
      aiAnalysis = {
        flagged: !analysis.safe,
        categories: Object.entries(analysis.scores).map(([name, score]) => ({
          name,
          score,
          flagged: score > 0.7
        })),
        toxicityScore: analysis.scores.toxicity,
        spamScore: analysis.scores.spam,
        nsfwScore: analysis.scores.nsfw,
        analyzedAt: new Date()
      };
    }

    // Calculate priority
    const priority = moderationService ? 
      moderationService.calculatePriority({ reason, aiAnalysis, contentAuthor }) : 
      'medium';

    // Create report
    const report = new ContentReport({
      reporter: req.user.id,
      contentType,
      contentId,
      contentAuthor,
      contentSnapshot,
      reason,
      reasonDetails,
      aiAnalysis,
      priority,
      status: 'pending'
    });

    // Check for related reports
    const relatedReports = await ContentReport.find({
      contentType,
      contentId,
      _id: { $ne: report._id }
    }).select('_id');

    report.relatedReports = relatedReports.map(r => r._id);

    // Update priority if multiple reports
    if (relatedReports.length >= 3 && priority !== 'critical') {
      report.priority = 'high';
    }

    await report.save();

    res.status(201).json({
      ok: true,
      message: 'Report submitted successfully',
      reportId: report._id
    });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get user's reports
 * GET /api/moderation/my-reports
 */
router.get('/my-reports', verifyToken, async (req, res) => {
  try {
    const { ContentReport } = getModels();
    const { status, page = 1, limit = 20 } = req.query;

    const query = { reporter: req.user.id };
    if (status) query.status = status;

    const [reports, total] = await Promise.all([
      ContentReport.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .select('-contentSnapshot')
        .lean(),
      ContentReport.countDocuments(query)
    ]);

    res.json({
      ok: true,
      reports,
      pagination: { page: parseInt(page), limit: parseInt(limit), total }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// ADMIN MODERATION
// ==========================================

/**
 * Get all reports (admin)
 * GET /api/moderation/admin/reports
 */
router.get('/admin/reports', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ContentReport } = getModels();
    const { 
      status = 'pending',
      priority,
      contentType,
      reason,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};
    if (status !== 'all') query.status = status;
    if (priority) query.priority = priority;
    if (contentType) query.contentType = contentType;
    if (reason) query.reason = reason;

    const [reports, total] = await Promise.all([
      ContentReport.find(query)
        .sort({ priority: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('reporter', 'name username avatar')
        .populate('contentAuthor', 'name username avatar')
        .populate('resolution.moderator', 'name username')
        .lean(),
      ContentReport.countDocuments(query)
    ]);

    // Get stats
    const stats = await ContentReport.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = stats.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    res.json({
      ok: true,
      reports,
      stats: statusCounts,
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin reports error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get single report details (admin)
 * GET /api/moderation/admin/reports/:id
 */
router.get('/admin/reports/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ContentReport, ModerationAction } = getModels();
    const { id } = req.params;

    const report = await ContentReport.findById(id)
      .populate('reporter', 'name username avatar email')
      .populate('contentAuthor', 'name username avatar email')
      .populate('resolution.moderator', 'name username')
      .populate('relatedReports')
      .lean();

    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    // Get user's moderation history
    let userHistory = [];
    if (report.contentAuthor) {
      userHistory = await ModerationAction.find({
        targetUser: report.contentAuthor._id
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('moderator', 'name username')
        .lean();
    }

    res.json({
      ok: true,
      report,
      userHistory
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Take action on report (admin)
 * POST /api/moderation/admin/reports/:id/action
 */
router.post('/admin/reports/:id/action', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ContentReport, ModerationAction } = getModels();
    const { id } = req.params;
    const { action, duration, reason, internalNotes } = req.body;

    const report = await ContentReport.findById(id);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    // Update report status
    report.status = 'resolved';
    report.resolution = {
      action,
      moderator: req.user.id,
      notes: internalNotes,
      resolvedAt: new Date()
    };

    await report.save();

    // Create moderation action
    if (action !== 'no-action' && action !== 'dismissed') {
      const moderationAction = new ModerationAction({
        targetType: report.contentType === 'user' ? 'user' : 'content',
        targetUser: report.contentAuthor,
        targetContent: {
          contentType: report.contentType,
          contentId: report.contentId
        },
        action,
        duration: duration || 0,
        expiresAt: duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null,
        reason: reason || `Report: ${report.reason}`,
        internalNotes,
        report: report._id,
        moderator: req.user.id
      });

      await moderationAction.save();

      // Apply action
      await applyModerationAction(moderationAction, report);
    }

    // Mark related reports as resolved
    if (report.relatedReports?.length > 0) {
      await ContentReport.updateMany(
        { _id: { $in: report.relatedReports } },
        {
          status: 'resolved',
          resolution: {
            action: 'resolved-with-related',
            moderator: req.user.id,
            notes: `Resolved with report ${id}`,
            resolvedAt: new Date()
          }
        }
      );
    }

    res.json({
      ok: true,
      message: 'Action taken successfully',
      report
    });
  } catch (error) {
    console.error('Action error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Dismiss report (admin)
 * POST /api/moderation/admin/reports/:id/dismiss
 */
router.post('/admin/reports/:id/dismiss', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ContentReport } = getModels();
    const { id } = req.params;
    const { reason } = req.body;

    const report = await ContentReport.findByIdAndUpdate(
      id,
      {
        status: 'dismissed',
        resolution: {
          action: 'no-action',
          moderator: req.user.id,
          notes: reason || 'Report dismissed',
          resolvedAt: new Date()
        }
      },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ ok: false, error: 'Report not found' });
    }

    res.json({ ok: true, message: 'Report dismissed', report });
  } catch (error) {
    console.error('Dismiss error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// USER ACTIONS (WARNINGS, SUSPENSIONS)
// ==========================================

/**
 * Get user moderation history (admin)
 * GET /api/moderation/admin/users/:userId/history
 */
router.get('/admin/users/:userId/history', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ModerationAction, ContentReport, UserTrustScore } = getModels();
    const { userId } = req.params;

    const [actions, reports, trustScore] = await Promise.all([
      ModerationAction.find({ targetUser: userId })
        .sort({ createdAt: -1 })
        .populate('moderator', 'name username')
        .lean(),
      ContentReport.find({ contentAuthor: userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      UserTrustScore.findOne({ user: userId }).lean()
    ]);

    res.json({
      ok: true,
      actions,
      reports,
      trustScore,
      stats: {
        totalActions: actions.length,
        totalReports: reports.length,
        activeRestrictions: actions.filter(a => a.status === 'active').length
      }
    });
  } catch (error) {
    console.error('User history error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Issue warning to user (admin)
 * POST /api/moderation/admin/users/:userId/warn
 */
router.post('/admin/users/:userId/warn', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ModerationAction } = getModels();
    const User = mongoose.models.User || require('../models/user.model');
    const { userId } = req.params;
    const { reason, internalNotes } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const action = new ModerationAction({
      targetType: 'user',
      targetUser: userId,
      action: 'warning',
      reason,
      internalNotes,
      moderator: req.user.id
    });

    await action.save();

    // Update user warning count
    await User.findByIdAndUpdate(userId, {
      $inc: { warningCount: 1 },
      $push: {
        moderationHistory: {
          action: 'warning',
          reason,
          date: new Date(),
          moderator: req.user.id
        }
      }
    });

    // TODO: Send notification to user about warning

    res.json({
      ok: true,
      message: 'Warning issued',
      action
    });
  } catch (error) {
    console.error('Warn user error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Suspend user (admin)
 * POST /api/moderation/admin/users/:userId/suspend
 */
router.post('/admin/users/:userId/suspend', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ModerationAction } = getModels();
    const User = mongoose.models.User || require('../models/user.model');
    const { userId } = req.params;
    const { reason, duration, internalNotes } = req.body; // duration in hours

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Can't suspend admins
    if (user.role === 'admin') {
      return res.status(403).json({ ok: false, error: 'Cannot suspend admin users' });
    }

    const expiresAt = duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null;

    const action = new ModerationAction({
      targetType: 'user',
      targetUser: userId,
      action: 'account-suspended',
      duration: duration || 0,
      expiresAt,
      reason,
      internalNotes,
      moderator: req.user.id
    });

    await action.save();

    // Update user
    await User.findByIdAndUpdate(userId, {
      suspended: true,
      suspendedUntil: expiresAt,
      suspendedReason: reason,
      $push: {
        moderationHistory: {
          action: 'suspended',
          reason,
          duration,
          date: new Date(),
          moderator: req.user.id
        }
      }
    });

    res.json({
      ok: true,
      message: `User suspended${duration ? ` for ${duration} hours` : ' permanently'}`,
      action
    });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Unsuspend user (admin)
 * POST /api/moderation/admin/users/:userId/unsuspend
 */
router.post('/admin/users/:userId/unsuspend', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ModerationAction } = getModels();
    const User = mongoose.models.User || require('../models/user.model');
    const { userId } = req.params;
    const { reason } = req.body;

    // Update user
    await User.findByIdAndUpdate(userId, {
      suspended: false,
      suspendedUntil: null,
      suspendedReason: null,
      $push: {
        moderationHistory: {
          action: 'unsuspended',
          reason,
          date: new Date(),
          moderator: req.user.id
        }
      }
    });

    // Revoke active suspension actions
    await ModerationAction.updateMany(
      {
        targetUser: userId,
        action: 'account-suspended',
        status: 'active'
      },
      {
        status: 'revoked',
        revokedBy: req.user.id,
        revokedAt: new Date()
      }
    );

    // Create new action record
    const action = new ModerationAction({
      targetType: 'user',
      targetUser: userId,
      action: 'restriction-lifted',
      reason: reason || 'Suspension lifted',
      moderator: req.user.id
    });

    await action.save();

    res.json({ ok: true, message: 'User unsuspended' });
  } catch (error) {
    console.error('Unsuspend error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// WORD FILTERS
// ==========================================

/**
 * Get word filters (admin)
 * GET /api/moderation/admin/filters
 */
router.get('/admin/filters', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { WordFilter } = getModels();
    const { category, isActive } = req.query;

    const query = {};
    if (category) query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const filters = await WordFilter.find(query)
      .sort({ category: 1, word: 1 })
      .lean();

    res.json({ ok: true, filters });
  } catch (error) {
    console.error('Get filters error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Add word filter (admin)
 * POST /api/moderation/admin/filters
 */
router.post('/admin/filters', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { WordFilter } = getModels();
    const { word, category, severity, action, replacement, isRegex } = req.body;

    const filter = new WordFilter({
      word: word.toLowerCase(),
      category: category || 'custom',
      severity: severity || 'medium',
      action: action || 'flag',
      replacement,
      isRegex: isRegex || false,
      addedBy: req.user.id
    });

    await filter.save();

    res.status(201).json({ ok: true, filter });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ ok: false, error: 'Word already exists in filter' });
    }
    console.error('Add filter error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Delete word filter (admin)
 * DELETE /api/moderation/admin/filters/:id
 */
router.delete('/admin/filters/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { WordFilter } = getModels();
    await WordFilter.findByIdAndDelete(req.params.id);
    res.json({ ok: true, message: 'Filter deleted' });
  } catch (error) {
    console.error('Delete filter error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// AUTO-MODERATION RULES
// ==========================================

/**
 * Get auto-moderation rules (admin)
 * GET /api/moderation/admin/rules
 */
router.get('/admin/rules', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { AutoModerationRule } = getModels();
    const rules = await AutoModerationRule.find()
      .populate('createdBy', 'name username')
      .lean();

    res.json({ ok: true, rules });
  } catch (error) {
    console.error('Get rules error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Create auto-moderation rule (admin)
 * POST /api/moderation/admin/rules
 */
router.post('/admin/rules', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { AutoModerationRule } = getModels();
    const { name, description, type, conditions, action, applyTo, isActive } = req.body;

    const rule = new AutoModerationRule({
      name,
      description,
      type,
      conditions,
      action: action || 'flag',
      applyTo: applyTo || 'all',
      isActive: isActive !== false,
      createdBy: req.user.id
    });

    await rule.save();

    res.status(201).json({ ok: true, rule });
  } catch (error) {
    console.error('Create rule error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Toggle rule status (admin)
 * PUT /api/moderation/admin/rules/:id/toggle
 */
router.put('/admin/rules/:id/toggle', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { AutoModerationRule } = getModels();
    const rule = await AutoModerationRule.findById(req.params.id);
    
    if (!rule) {
      return res.status(404).json({ ok: false, error: 'Rule not found' });
    }

    rule.isActive = !rule.isActive;
    await rule.save();

    res.json({ ok: true, rule });
  } catch (error) {
    console.error('Toggle rule error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// CONTENT ANALYSIS
// ==========================================

/**
 * Analyze content (preview before posting)
 * POST /api/moderation/analyze
 */
router.post('/analyze', verifyToken, async (req, res) => {
  try {
    const moderationService = getModerationService();
    const { text, media } = req.body;

    if (!moderationService) {
      return res.json({ ok: true, safe: true, message: 'Moderation service not configured' });
    }

    const result = await moderationService.analyzeContent(text, { useAI: false });

    // Don't expose detailed scores to users
    res.json({
      ok: true,
      safe: result.safe,
      warnings: result.issues.filter(i => i.severity !== 'critical').length > 0,
      blocked: result.issues.some(i => i.severity === 'critical'),
      message: result.safe ? 'Content looks good!' : 'Content may violate community guidelines'
    });
  } catch (error) {
    console.error('Analyze error:', error);
    res.json({ ok: true, safe: true }); // Fail open
  }
});

// ==========================================
// MODERATION STATS
// ==========================================

/**
 * Get moderation dashboard stats (admin)
 * GET /api/moderation/admin/stats
 */
router.get('/admin/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ContentReport, ModerationAction } = getModels();
    const { period = '7d' } = req.query;

    const periodMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    }[period] || 7 * 24 * 60 * 60 * 1000;

    const startDate = new Date(Date.now() - periodMs);

    const [
      reportsByStatus,
      reportsByReason,
      reportsByDay,
      actionsByType,
      avgResolutionTime
    ] = await Promise.all([
      ContentReport.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      ContentReport.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      ContentReport.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      ModerationAction.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$action', count: { $sum: 1 } } }
      ]),
      ContentReport.aggregate([
        { $match: { status: 'resolved', 'resolution.resolvedAt': { $exists: true } } },
        {
          $project: {
            resolutionTime: {
              $subtract: ['$resolution.resolvedAt', '$createdAt']
            }
          }
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: '$resolutionTime' }
          }
        }
      ])
    ]);

    res.json({
      ok: true,
      stats: {
        reportsByStatus: reportsByStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        reportsByReason,
        reportsByDay,
        actionsByType: actionsByType.reduce((acc, a) => ({ ...acc, [a._id]: a.count }), {}),
        avgResolutionTime: avgResolutionTime[0]?.avgTime 
          ? Math.round(avgResolutionTime[0].avgTime / (1000 * 60 * 60)) + ' hours'
          : 'N/A'
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// HELPER: Apply moderation action
// ==========================================

async function applyModerationAction(action, report) {
  try {
    const contentType = report.contentType;
    const contentId = report.contentId;

    switch (action.action) {
      case 'content-hidden':
      case 'content-removed':
        // Hide/remove content based on type
        const ModelMap = {
          'post': mongoose.models.Post,
          'blog': mongoose.models.Blog,
          'comment': mongoose.models.Comment
        };
        const Model = ModelMap[contentType];
        if (Model) {
          await Model.findByIdAndUpdate(contentId, {
            hidden: true,
            hiddenReason: action.reason,
            hiddenAt: new Date()
          });
        }
        break;

      case 'user-suspended':
      case 'account-suspended':
        const User = mongoose.models.User || require('../models/user.model');
        await User.findByIdAndUpdate(report.contentAuthor, {
          suspended: true,
          suspendedUntil: action.expiresAt,
          suspendedReason: action.reason
        });
        break;
    }
  } catch (error) {
    console.error('Apply action error:', error);
  }
}

module.exports = router;
