// ============================================
// FILE: routes/forms.routes.js
// CYBEV Form Builder API - Pop-ups, Embedded Forms
// VERSION: 1.0.0 - Klaviyo-Quality Forms
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import models
const { Form, FormSubmission } = require('../models/form.model');

// Contact model (for creating contacts on form submit)
const contactSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true },
  firstName: String,
  lastName: String,
  phone: String,
  company: String,
  status: { type: String, default: 'subscribed' },
  tags: [String],
  list: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
  source: String,
  customFields: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const CampaignContact = mongoose.models.CampaignContact || mongoose.model('CampaignContact', contactSchema);

// List model
const listSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  contactCount: { type: Number, default: 0 }
}, { timestamps: true });

const ContactList = mongoose.models.ContactList || mongoose.model('ContactList', listSchema);

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const getUserId = (req) => req.user.userId || req.user.id || req.user._id;

// ==========================================
// FORM CRUD OPERATIONS
// ==========================================

// Get all forms for user
router.get('/', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { status, type } = req.query;
    
    const query = { user: userId };
    if (status) query.status = status;
    if (type) query.type = type;
    
    const forms = await Form.find(query)
      .sort({ createdAt: -1 })
      .populate('integration.addToList', 'name');
    
    res.json({ ok: true, forms });
  } catch (err) {
    console.error('Get forms error:', err);
    res.status(500).json({ error: 'Failed to fetch forms' });
  }
});

// Get single form
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const form = await Form.findOne({ _id: req.params.id, user: userId })
      .populate('integration.addToList', 'name');
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    res.json({ ok: true, form });
  } catch (err) {
    console.error('Get form error:', err);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

// Create new form
router.post('/', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, type, design, content, fields, targeting, integration } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Form name is required' });
    }
    
    // Default fields if not provided
    const defaultFields = fields || [
      { id: 'email', type: 'email', label: 'Email', placeholder: 'Enter your email', required: true, order: 0, mapTo: 'email' }
    ];
    
    const form = new Form({
      user: userId,
      name,
      type: type || 'popup',
      design: design || {},
      content: content || {},
      fields: defaultFields,
      targeting: targeting || {},
      integration: integration || {},
      status: 'draft'
    });
    
    await form.save();
    
    // Generate embed code
    form.embedCode = generateEmbedCode(form);
    await form.save();
    
    console.log(`✅ Form "${name}" created for user ${userId}`);
    res.json({ ok: true, form });
  } catch (err) {
    console.error('Create form error:', err);
    res.status(500).json({ error: 'Failed to create form' });
  }
});

// Update form
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const updates = req.body;
    
    const form = await Form.findOne({ _id: req.params.id, user: userId });
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    // Update fields
    const allowedUpdates = ['name', 'description', 'type', 'design', 'content', 'fields', 'targeting', 'integration', 'status'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        form[field] = updates[field];
      }
    });
    
    // Regenerate embed code
    form.embedCode = generateEmbedCode(form);
    
    await form.save();
    res.json({ ok: true, form });
  } catch (err) {
    console.error('Update form error:', err);
    res.status(500).json({ error: 'Failed to update form' });
  }
});

// Delete form
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const form = await Form.findOneAndDelete({ _id: req.params.id, user: userId });
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    // Also delete submissions
    await FormSubmission.deleteMany({ form: req.params.id });
    
    res.json({ ok: true, message: 'Form deleted' });
  } catch (err) {
    console.error('Delete form error:', err);
    res.status(500).json({ error: 'Failed to delete form' });
  }
});

// ==========================================
// FORM STATUS OPERATIONS
// ==========================================

// Activate form
router.post('/:id/activate', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const form = await Form.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { status: 'active' },
      { new: true }
    );
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    res.json({ ok: true, form });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate form' });
  }
});

// Pause form
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const form = await Form.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { status: 'paused' },
      { new: true }
    );
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    res.json({ ok: true, form });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pause form' });
  }
});

// Duplicate form
router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const original = await Form.findOne({ _id: req.params.id, user: userId });
    
    if (!original) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    const duplicate = new Form({
      ...original.toObject(),
      _id: undefined,
      name: `${original.name} (Copy)`,
      status: 'draft',
      shortCode: undefined,
      embedCode: undefined,
      stats: { views: 0, submissions: 0, conversionRate: 0 },
      createdAt: undefined,
      updatedAt: undefined
    });
    
    await duplicate.save();
    duplicate.embedCode = generateEmbedCode(duplicate);
    await duplicate.save();
    
    res.json({ ok: true, form: duplicate });
  } catch (err) {
    console.error('Duplicate form error:', err);
    res.status(500).json({ error: 'Failed to duplicate form' });
  }
});

// ==========================================
// FORM SUBMISSIONS
// ==========================================

// Get form submissions
router.get('/:id/submissions', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page = 1, limit = 50 } = req.query;
    
    // Verify form ownership
    const form = await Form.findOne({ _id: req.params.id, user: userId });
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    const submissions = await FormSubmission.find({ form: req.params.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await FormSubmission.countDocuments({ form: req.params.id });
    
    res.json({
      ok: true,
      submissions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Get submissions error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// ==========================================
// PUBLIC FORM ENDPOINTS (No Auth Required)
// ==========================================

// Get form by short code (for embed)
router.get('/embed/:shortCode', async (req, res) => {
  try {
    const form = await Form.findOne({ shortCode: req.params.shortCode, status: 'active' });
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }
    
    // Increment view count
    await Form.updateOne({ _id: form._id }, { $inc: { 'stats.views': 1 } });
    
    // Return public form data
    res.json({
      ok: true,
      form: {
        id: form._id,
        type: form.type,
        design: form.design,
        content: form.content,
        fields: form.fields,
        targeting: form.targeting
      }
    });
  } catch (err) {
    console.error('Get embed form error:', err);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

// Submit form (public endpoint)
router.post('/submit/:shortCode', async (req, res) => {
  try {
    const form = await Form.findOne({ shortCode: req.params.shortCode, status: 'active' });
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }
    
    const { data, source, utm } = req.body;
    
    // Validate required fields
    const requiredFields = form.fields.filter(f => f.required);
    for (const field of requiredFields) {
      if (!data[field.id]) {
        return res.status(400).json({ error: `${field.label} is required` });
      }
    }
    
    // Get email from data
    const emailField = form.fields.find(f => f.mapTo === 'email' || f.type === 'email');
    const email = emailField ? data[emailField.id] : null;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Create submission record
    const submission = new FormSubmission({
      form: form._id,
      user: form.user,
      data,
      email,
      source: {
        url: source?.url || req.headers.referer,
        referrer: source?.referrer,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        device: detectDevice(req.headers['user-agent'])
      },
      utm: utm || {},
      status: form.integration.doubleOptIn ? 'pending' : 'confirmed'
    });
    
    await submission.save();
    
    // Create or update contact
    let contact = await CampaignContact.findOne({ user: form.user, email });
    
    if (!contact) {
      // Create new contact
      const contactData = {
        user: form.user,
        email,
        source: `form:${form.shortCode}`,
        tags: form.integration.addTags || [],
        status: form.integration.doubleOptIn ? 'pending' : 'subscribed'
      };
      
      // Map form fields to contact fields
      form.fields.forEach(field => {
        if (field.mapTo && data[field.id]) {
          contactData[field.mapTo] = data[field.id];
        }
      });
      
      if (form.integration.addToList) {
        contactData.list = form.integration.addToList;
      }
      
      contact = new CampaignContact(contactData);
      await contact.save();
      
      // Update list count
      if (form.integration.addToList) {
        await ContactList.updateOne(
          { _id: form.integration.addToList },
          { $inc: { contactCount: 1 } }
        );
      }
    } else {
      // Update existing contact - add tags
      const newTags = [...new Set([...contact.tags, ...(form.integration.addTags || [])])];
      await CampaignContact.updateOne(
        { _id: contact._id },
        { $set: { tags: newTags } }
      );
    }
    
    // Update submission with contact reference
    submission.contact = contact._id;
    await submission.save();
    
    // Update form stats
    await Form.updateOne(
      { _id: form._id },
      { 
        $inc: { 'stats.submissions': 1 },
        $set: { 'stats.conversionRate': ((form.stats.submissions + 1) / (form.stats.views || 1) * 100).toFixed(2) }
      }
    );
    
    // TODO: Trigger automation if configured
    // TODO: Send confirmation email if double opt-in
    // TODO: Call webhook if configured
    
    res.json({
      ok: true,
      message: form.content.successMessage || 'Thanks for subscribing!',
      submissionId: submission._id
    });
  } catch (err) {
    console.error('Form submit error:', err);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// ==========================================
// FORM ANALYTICS
// ==========================================

// Get form analytics
router.get('/:id/analytics', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { period = '30d' } = req.query;
    
    const form = await Form.findOne({ _id: req.params.id, user: userId });
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    switch (period) {
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      default: startDate.setDate(now.getDate() - 30);
    }
    
    // Get submissions in period
    const submissions = await FormSubmission.find({
      form: req.params.id,
      createdAt: { $gte: startDate }
    });
    
    // Group by day
    const dailyData = {};
    submissions.forEach(sub => {
      const day = sub.createdAt.toISOString().split('T')[0];
      dailyData[day] = (dailyData[day] || 0) + 1;
    });
    
    // Device breakdown
    const deviceBreakdown = {
      desktop: submissions.filter(s => s.source?.device === 'desktop').length,
      mobile: submissions.filter(s => s.source?.device === 'mobile').length,
      tablet: submissions.filter(s => s.source?.device === 'tablet').length
    };
    
    // Source breakdown
    const sourceBreakdown = {};
    submissions.forEach(sub => {
      const source = sub.utm?.source || 'direct';
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
    });
    
    res.json({
      ok: true,
      analytics: {
        period,
        totalViews: form.stats.views,
        totalSubmissions: form.stats.submissions,
        conversionRate: form.stats.conversionRate,
        periodSubmissions: submissions.length,
        dailyData: Object.entries(dailyData).map(([date, count]) => ({ date, count })),
        deviceBreakdown,
        sourceBreakdown
      }
    });
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function generateEmbedCode(form) {
  const baseUrl = process.env.CLIENT_URL || 'https://cybev.io';
  
  return `<!-- CYBEV Form: ${form.name} -->
<script>
(function(c,y,b,e,v){
  c.CYBEVForms=c.CYBEVForms||[];
  var s=y.createElement('script');
  s.src='${baseUrl}/forms/embed.js';
  s.async=true;
  s.onload=function(){
    c.CYBEVForms.push({id:'${form.shortCode}',type:'${form.type}'});
  };
  y.head.appendChild(s);
})(window,document);
</script>
<div id="cybev-form-${form.shortCode}"></div>
<!-- End CYBEV Form -->`;
}

function detectDevice(userAgent) {
  if (!userAgent) return 'desktop';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(ua)) return 'mobile';
  if (/tablet|ipad/.test(ua)) return 'tablet';
  return 'desktop';
}

module.exports = router;
