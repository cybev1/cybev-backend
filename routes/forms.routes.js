// ============================================
// FILE: routes/forms.routes.js
// Forms API - Google Forms-like Feature
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const { Form, FormResponse } = require('../models/form.model');

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

// Helper: Generate unique field ID
const generateFieldId = () => `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// ==========================================
// POST /api/forms - Create form
// ==========================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { title, description, type, organizationId, fields, settings, branding } = req.body;
    
    if (!title) {
      return res.status(400).json({ ok: false, error: 'Title is required' });
    }
    
    // Add IDs to fields if not present
    const processedFields = (fields || []).map((field, index) => ({
      ...field,
      id: field.id || generateFieldId(),
      order: field.order ?? index
    }));
    
    const form = new Form({
      title,
      description,
      type: type || 'general',
      organization: organizationId || null,
      creator: userId,
      fields: processedFields,
      settings: settings || {},
      branding: branding || {},
      status: 'draft'
    });
    
    await form.save();
    
    console.log(`📝 Form created: ${title} by ${userId}`);
    
    res.status(201).json({ ok: true, form });
  } catch (err) {
    console.error('Create form error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/forms - List my forms
// ==========================================
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { status, type, orgId, page = 1, limit = 20 } = req.query;
    
    const query = { creator: userId };
    if (status) query.status = status;
    if (type) query.type = type;
    if (orgId) query.organization = new ObjectId(orgId);
    
    const forms = await Form.find(query)
      .populate('organization', 'name slug type')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Form.countDocuments(query);
    
    res.json({
      ok: true,
      forms,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List forms error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/forms/org/:orgId - List org forms
// ==========================================
router.get('/org/:orgId', optionalAuth, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { status = 'published' } = req.query;
    
    const query = { 
      organization: new ObjectId(orgId),
      status: status === 'all' ? { $ne: 'archived' } : status
    };
    
    const forms = await Form.find(query)
      .select('title description type slug stats settings.startDate settings.endDate status')
      .sort({ createdAt: -1 });
    
    res.json({ ok: true, forms });
  } catch (err) {
    console.error('List org forms error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/forms/:id - Get form details
// ==========================================
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const form = await Form.findById(req.params.id)
      .populate('creator', 'name username profilePicture')
      .populate('organization', 'name slug type');
    
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    // Check access
    const userId = req.user?.id || req.user?._id;
    const isOwner = userId && form.creator._id.toString() === userId.toString();
    
    if (!isOwner && form.status !== 'published') {
      return res.status(403).json({ ok: false, error: 'Form not available' });
    }
    
    // Check if form is within date range
    const now = new Date();
    if (form.settings.startDate && new Date(form.settings.startDate) > now) {
      return res.status(403).json({ ok: false, error: 'Form not yet available' });
    }
    if (form.settings.endDate && new Date(form.settings.endDate) < now) {
      return res.status(403).json({ ok: false, error: 'Form has closed', closedMessage: form.settings.closedMessage });
    }
    
    // Increment views
    if (!isOwner) {
      await Form.findByIdAndUpdate(form._id, { $inc: { 'stats.views': 1 } });
    }
    
    res.json({ ok: true, form, isOwner });
  } catch (err) {
    console.error('Get form error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/forms/slug/:slug - Get form by slug
// ==========================================
router.get('/slug/:slug', optionalAuth, async (req, res) => {
  try {
    const form = await Form.findOne({ slug: req.params.slug })
      .populate('creator', 'name username profilePicture')
      .populate('organization', 'name slug type logo');
    
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    const userId = req.user?.id || req.user?._id;
    const isOwner = userId && form.creator._id.toString() === userId.toString();
    
    if (!isOwner && form.status !== 'published') {
      return res.status(403).json({ ok: false, error: 'Form not available' });
    }
    
    // Check date range
    const now = new Date();
    if (form.settings.startDate && new Date(form.settings.startDate) > now) {
      return res.status(403).json({ ok: false, error: 'Form not yet available' });
    }
    if (form.settings.endDate && new Date(form.settings.endDate) < now) {
      return res.status(403).json({ ok: false, error: 'Form has closed', closedMessage: form.settings.closedMessage });
    }
    
    // Check max responses
    if (form.settings.maxResponses && form.stats.completions >= form.settings.maxResponses) {
      return res.status(403).json({ ok: false, error: 'Form has reached maximum responses' });
    }
    
    // Increment views
    if (!isOwner) {
      await Form.findByIdAndUpdate(form._id, { $inc: { 'stats.views': 1 } });
    }
    
    res.json({ ok: true, form, isOwner });
  } catch (err) {
    console.error('Get form by slug error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// PUT /api/forms/:id - Update form
// ==========================================
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    if (form.creator.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const { title, description, type, fields, settings, branding, sections } = req.body;
    
    // Process fields
    const processedFields = (fields || form.fields).map((field, index) => ({
      ...field,
      id: field.id || generateFieldId(),
      order: field.order ?? index
    }));
    
    const updates = {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(type && { type }),
      fields: processedFields,
      ...(settings && { settings: { ...form.settings, ...settings } }),
      ...(branding && { branding: { ...form.branding, ...branding } }),
      ...(sections && { sections }),
      updatedAt: new Date()
    };
    
    const updatedForm = await Form.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );
    
    res.json({ ok: true, form: updatedForm });
  } catch (err) {
    console.error('Update form error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/forms/:id/publish - Publish form
// ==========================================
router.post('/:id/publish', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    if (form.creator.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    if (form.fields.length === 0) {
      return res.status(400).json({ ok: false, error: 'Form must have at least one field' });
    }
    
    form.status = 'published';
    form.publishedAt = new Date();
    await form.save();
    
    res.json({ ok: true, form, shareUrl: `/forms/${form.slug}` });
  } catch (err) {
    console.error('Publish form error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/forms/:id/close - Close form
// ==========================================
router.post('/:id/close', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    if (form.creator.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    form.status = 'closed';
    form.closedAt = new Date();
    await form.save();
    
    res.json({ ok: true, form });
  } catch (err) {
    console.error('Close form error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// DELETE /api/forms/:id - Delete form
// ==========================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    if (form.creator.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    // Delete responses too
    await FormResponse.deleteMany({ form: form._id });
    await Form.findByIdAndDelete(form._id);
    
    res.json({ ok: true, message: 'Form deleted' });
  } catch (err) {
    console.error('Delete form error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/forms/:id/responses - Submit response
// ==========================================
router.post('/:id/responses', optionalAuth, async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    if (form.status !== 'published') {
      return res.status(403).json({ ok: false, error: 'Form is not accepting responses' });
    }
    
    // Check date range
    const now = new Date();
    if (form.settings.startDate && new Date(form.settings.startDate) > now) {
      return res.status(403).json({ ok: false, error: 'Form not yet available' });
    }
    if (form.settings.endDate && new Date(form.settings.endDate) < now) {
      return res.status(403).json({ ok: false, error: 'Form has closed' });
    }
    
    // Check max responses
    if (form.settings.maxResponses && form.stats.completions >= form.settings.maxResponses) {
      return res.status(403).json({ ok: false, error: 'Form has reached maximum responses' });
    }
    
    const userId = req.user?.id || req.user?._id;
    const { responses, email, startedAt } = req.body;
    
    // Check one response per user
    if (form.settings.oneResponsePerUser && userId) {
      const existing = await FormResponse.findOne({ form: form._id, respondent: userId });
      if (existing) {
        return res.status(400).json({ ok: false, error: 'You have already submitted a response' });
      }
    }
    
    // Check login required
    if (form.settings.requireLogin && !userId) {
      return res.status(401).json({ ok: false, error: 'Login required to submit' });
    }
    
    // Validate required fields
    const requiredFields = form.fields.filter(f => f.required);
    for (const field of requiredFields) {
      const response = responses.find(r => r.fieldId === field.id);
      if (!response || response.value === null || response.value === '' || 
          (Array.isArray(response.value) && response.value.length === 0)) {
        return res.status(400).json({ ok: false, error: `${field.label} is required` });
      }
    }
    
    // Calculate completion time
    const completionTime = startedAt ? Math.round((Date.now() - new Date(startedAt).getTime()) / 1000) : null;
    
    const formResponse = new FormResponse({
      form: form._id,
      respondent: userId || null,
      email: email || null,
      responses,
      startedAt: startedAt ? new Date(startedAt) : null,
      completedAt: new Date(),
      completionTime,
      status: 'completed',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      device: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop'
    });
    
    await formResponse.save();
    
    // Update form stats
    const avgTime = form.stats.avgCompletionTime || 0;
    const completions = form.stats.completions;
    const newAvg = completionTime ? Math.round((avgTime * completions + completionTime) / (completions + 1)) : avgTime;
    
    await Form.findByIdAndUpdate(form._id, {
      $inc: { 'stats.completions': 1 },
      $set: { 'stats.avgCompletionTime': newAvg }
    });
    
    res.status(201).json({ 
      ok: true, 
      response: formResponse,
      confirmationMessage: form.settings.confirmationMessage,
      redirectUrl: form.settings.redirectUrl
    });
  } catch (err) {
    console.error('Submit response error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/forms/:id/responses - Get responses
// ==========================================
router.get('/:id/responses', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { page = 1, limit = 50 } = req.query;
    
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    if (form.creator.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    const responses = await FormResponse.find({ form: form._id, status: 'completed' })
      .populate('respondent', 'name username email profilePicture')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await FormResponse.countDocuments({ form: form._id, status: 'completed' });
    
    res.json({
      ok: true,
      responses,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Get responses error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/forms/:id/analytics - Form analytics
// ==========================================
router.get('/:id/analytics', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    if (form.creator.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    // Basic stats
    const totalResponses = form.stats.completions;
    const conversionRate = form.stats.views > 0 
      ? Math.round((form.stats.completions / form.stats.views) * 100) 
      : 0;
    
    // Responses over time
    const responsesOverTime = await FormResponse.aggregate([
      { $match: { form: form._id, status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);
    
    // Field analysis
    const fieldAnalysis = {};
    for (const field of form.fields) {
      if (['select', 'radio', 'checkbox', 'multiselect', 'rating', 'scale'].includes(field.type)) {
        const values = await FormResponse.aggregate([
          { $match: { form: form._id, status: 'completed' } },
          { $unwind: '$responses' },
          { $match: { 'responses.fieldId': field.id } },
          {
            $group: {
              _id: '$responses.value',
              count: { $sum: 1 }
            }
          }
        ]);
        
        fieldAnalysis[field.id] = {
          label: field.label,
          type: field.type,
          values: values
        };
      }
    }
    
    res.json({
      ok: true,
      analytics: {
        views: form.stats.views,
        starts: form.stats.starts,
        completions: totalResponses,
        conversionRate,
        avgCompletionTime: form.stats.avgCompletionTime,
        responsesOverTime,
        fieldAnalysis
      }
    });
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/forms/:id/duplicate - Duplicate form
// ==========================================
router.post('/:id/duplicate', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const original = await Form.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    
    // Create duplicate
    const duplicate = new Form({
      title: `${original.title} (Copy)`,
      description: original.description,
      type: original.type,
      organization: original.organization,
      creator: userId,
      fields: original.fields,
      sections: original.sections,
      branding: original.branding,
      settings: { ...original.settings, maxResponses: null, startDate: null, endDate: null },
      status: 'draft'
    });
    
    await duplicate.save();
    
    res.status(201).json({ ok: true, form: duplicate });
  } catch (err) {
    console.error('Duplicate form error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('📝 Forms routes loaded');

module.exports = router;
