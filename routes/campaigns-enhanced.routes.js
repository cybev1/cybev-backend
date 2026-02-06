// ============================================
// FILE: routes/campaigns-enhanced.routes.js
// CYBEV Enhanced Campaign API - FIXED v6.1
// VERSION: 6.1.0 - Multi-Provider Email (SES + Brevo)
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import Multi-Provider Email Service (SES + Brevo with auto-fallback)
let emailService = null;
try {
  emailService = require('../services/email-multi-provider.service');
  const providers = emailService.getAvailableProviders();
  console.log('✅ Email Service loaded with providers:', providers.map(p => p.name).join(', ') || 'none');
} catch (err) {
  console.warn('⚠️ Multi-Provider Email Service not available:', err.message);
  // Try fallback to SES-only service
  try {
    emailService = require('../services/ses.service');
    console.log('✅ Fallback: SES Service loaded');
  } catch (e) {
    console.warn('⚠️ No email service available');
  }
}

// ==========================================
// MODELS (Inline definitions for standalone use)
// ==========================================

// Contact Schema
const contactSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  phone: { type: String, trim: true },
  company: { type: String, trim: true },
  status: { type: String, enum: ['subscribed', 'unsubscribed', 'bounced', 'complained'], default: 'subscribed' },
  tags: [{ type: String, trim: true }],
  list: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' },
  customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  engagementScore: { type: Number, default: 0 },
  lastEmailSent: Date,
  lastEmailOpened: Date,
  lastEmailClicked: Date,
  source: { type: String, default: 'manual' }
}, { timestamps: true });

contactSchema.index({ user: 1, email: 1 }, { unique: true });
contactSchema.index({ user: 1, status: 1 });
contactSchema.index({ user: 1, tags: 1 });
contactSchema.index({ user: 1, list: 1 });

const CampaignContact = mongoose.models.CampaignContact || mongoose.model('CampaignContact', contactSchema);

// List Schema
const listSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  contactCount: { type: Number, default: 0 }
}, { timestamps: true });

const ContactList = mongoose.models.ContactList || mongoose.model('ContactList', listSchema);

// Campaign Schema
const campaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  subject: { type: String, required: true },
  previewText: String,
  fromName: String,
  fromEmail: String,
  type: { type: String, enum: ['regular', 'automated', 'ab_test'], default: 'regular' },
  status: { type: String, enum: ['draft', 'scheduled', 'sending', 'sent', 'paused'], default: 'draft' },
  html: String,
  designJson: mongoose.Schema.Types.Mixed,
  audienceType: { type: String, default: 'all' },
  lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
  includeTags: [String],
  excludeTags: [String],
  scheduledFor: Date,
  sentAt: Date,
  stats: {
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 }
  }
}, { timestamps: true });

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);

// Sender Address Schema
const senderAddressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true },
  displayName: String,
  isDefault: { type: Boolean, default: false },
  verified: { type: Boolean, default: false }
}, { timestamps: true });

const SenderAddress = mongoose.models.SenderAddress || mongoose.model('SenderAddress', senderAddressSchema);

// Template Schema
const templateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  category: { type: String, default: 'General' },
  html: String,
  designJson: mongoose.Schema.Types.Mixed,
  thumbnail: String,
  isSystem: { type: Boolean, default: false }
}, { timestamps: true });

const EmailTemplate = mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', templateSchema);

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ==========================================
// HELPER: Get User ID
// ==========================================

const getUserId = (req) => {
  return req.user._id || req.user.id || req.user.userId;
};

// ==========================================
// STATIC ROUTES FIRST (before :id routes)
// ==========================================

// ---------- STATS ----------
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const [totalContacts, subscribedContacts, unsubscribedContacts, bouncedContacts, totalCampaigns, sentCampaigns] = await Promise.all([
      CampaignContact.countDocuments({ user: userId }),
      CampaignContact.countDocuments({ user: userId, status: 'subscribed' }),
      CampaignContact.countDocuments({ user: userId, status: 'unsubscribed' }),
      CampaignContact.countDocuments({ user: userId, status: 'bounced' }),
      Campaign.countDocuments({ user: userId }),
      Campaign.countDocuments({ user: userId, status: 'sent' })
    ]);
    
    // Get email provider status
    let emailProviders = [];
    if (emailService && emailService.getProviderStatus) {
      emailProviders = emailService.getProviderStatus();
    } else if (emailService && emailService.getServiceStatus) {
      // Fallback for ses.service
      const status = await emailService.getServiceStatus();
      emailProviders = [{ name: 'ses', displayName: 'Amazon SES', enabled: status.enabled }];
    }
    
    res.json({
      contacts: {
        total: totalContacts,
        subscribed: subscribedContacts,
        unsubscribed: unsubscribedContacts,
        bounced: bouncedContacts
      },
      campaigns: {
        total: totalCampaigns,
        sent: sentCampaigns,
        draft: totalCampaigns - sentCampaigns
      },
      emailProviders
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ---------- LISTS ----------
router.get('/lists', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    console.log('📋 Fetching lists for user:', userId);
    
    const lists = await ContactList.find({ user: userId }).sort({ createdAt: -1 });
    console.log('📋 Found', lists.length, 'lists');
    
    // Get contact counts for each list
    const listsWithCounts = await Promise.all(lists.map(async (list) => {
      const count = await CampaignContact.countDocuments({ user: userId, list: list._id });
      console.log(`📋 List "${list.name}" (${list._id}): ${count} contacts`);
      return { ...list.toObject(), contactCount: count };
    }));
    
    res.json({ lists: listsWithCounts });
  } catch (err) {
    console.error('Lists error:', err);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

router.post('/lists', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body;
    
    const list = new ContactList({ user: userId, name, description });
    await list.save();
    
    res.json({ list });
  } catch (err) {
    console.error('Create list error:', err);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

router.put('/lists/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body;
    
    const list = await ContactList.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { name, description },
      { new: true }
    );
    
    res.json({ list });
  } catch (err) {
    console.error('Update list error:', err);
    res.status(500).json({ error: 'Failed to update list' });
  }
});

router.delete('/lists/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Remove list reference from contacts
    await CampaignContact.updateMany({ user: userId, list: req.params.id }, { $unset: { list: 1 } });
    
    // Delete the list
    await ContactList.deleteOne({ _id: req.params.id, user: userId });
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete list error:', err);
    res.status(500).json({ error: 'Failed to delete list' });
  }
});

// ---------- TAGS ----------
router.get('/tags', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const tags = await CampaignContact.distinct('tags', { user: userId });
    res.json({ tags: tags.filter(t => t) });
  } catch (err) {
    console.error('Tags error:', err);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// ---------- SENDER ADDRESSES ----------
router.get('/addresses', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    let addresses = await SenderAddress.find({ user: userId });
    
    // Create default addresses if none exist
    if (addresses.length === 0) {
      const defaults = [
        { user: userId, email: 'noreply@cybev.io', displayName: 'CYBEV', isDefault: true, verified: true },
        { user: userId, email: 'info@cybev.io', displayName: 'CYBEV Info', isDefault: false, verified: true }
      ];
      addresses = await SenderAddress.insertMany(defaults);
    }
    
    res.json({ addresses });
  } catch (err) {
    console.error('Addresses error:', err);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

router.post('/addresses', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { email, displayName, isDefault } = req.body;
    
    if (isDefault) {
      await SenderAddress.updateMany({ user: userId }, { isDefault: false });
    }
    
    const address = new SenderAddress({ user: userId, email, displayName, isDefault, verified: false });
    await address.save();
    
    res.json({ address });
  } catch (err) {
    console.error('Create address error:', err);
    res.status(500).json({ error: 'Failed to create address' });
  }
});

router.put('/addresses/:id/default', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    await SenderAddress.updateMany({ user: userId }, { isDefault: false });
    const address = await SenderAddress.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { isDefault: true },
      { new: true }
    );
    
    res.json({ address });
  } catch (err) {
    console.error('Set default address error:', err);
    res.status(500).json({ error: 'Failed to set default' });
  }
});

router.delete('/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    await SenderAddress.deleteOne({ _id: req.params.id, user: userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete address error:', err);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

// ---------- TEMPLATES ----------

// Built-in templates with actual HTML content
const BUILTIN_TEMPLATES = {
  tpl_welcome: {
    _id: 'tpl_welcome',
    name: 'Welcome Series',
    category: 'welcome',
    subject: 'Welcome to {{company}}! 🎉',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 150 }, backgroundColor: '#7c3aed', padding: { top: 30, bottom: 30, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'image', data: { src: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&h=300&fit=crop', alt: 'Welcome', link: '', width: '100%', alignment: 'center', padding: { top: 0, bottom: 0, left: 0, right: 0 } } },
        { id: 'b3', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#7c3aed;">Welcome to Our Community! 🎉</h1>', fontSize: 32, lineHeight: 1.4, color: '#7c3aed', backgroundColor: '#ffffff', padding: { top: 30, bottom: 10, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b4', type: 'text', data: { content: '<p style="margin:0;text-align:center;font-size:18px;color:#6b7280;">We\'re thrilled to have you join us. Here\'s what you can expect:</p>', fontSize: 18, lineHeight: 1.6, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 10, bottom: 20, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b5', type: 'text', data: { content: '<ul style="color:#374151;font-size:16px;line-height:2;"><li>✨ Exclusive content and updates</li><li>🎁 Special offers just for members</li><li>📚 Tips and resources to help you succeed</li><li>🤝 A supportive community</li></ul>', fontSize: 16, lineHeight: 2, color: '#374151', backgroundColor: '#f9fafb', padding: { top: 20, bottom: 20, left: 60, right: 40 }, alignment: 'left' } },
        { id: 'b6', type: 'button', data: { text: 'Get Started Now', link: 'https://example.com/start', backgroundColor: '#7c3aed', textColor: '#ffffff', fontSize: 18, fontWeight: 'bold', borderRadius: 8, padding: { top: 16, bottom: 16, left: 40, right: 40 }, alignment: 'center', fullWidth: false } },
        { id: 'b7', type: 'text', data: { content: '<p style="text-align:center;color:#9ca3af;font-size:14px;">Need help? Just reply to this email - we\'re here for you!</p>', fontSize: 14, lineHeight: 1.6, color: '#9ca3af', backgroundColor: '#ffffff', padding: { top: 30, bottom: 20, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b8', type: 'footer', data: { companyName: 'Your Company', address: '123 Main St, City, Country', showSocial: true, socialLinks: { facebook: '#', twitter: '#', instagram: '#' }, unsubscribeText: 'Unsubscribe from these emails', backgroundColor: '#f3f4f6', textColor: '#6b7280', padding: { top: 30, bottom: 30, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_flash: {
    _id: 'tpl_flash',
    name: 'Flash Sale',
    category: 'promotional',
    subject: '⚡ Flash Sale - 24 Hours Only!',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 120 }, backgroundColor: '#dc2626', padding: { top: 20, bottom: 20, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#ffffff;font-size:48px;font-weight:800;">⚡ FLASH SALE ⚡</h1>', fontSize: 48, lineHeight: 1.2, color: '#ffffff', backgroundColor: '#dc2626', padding: { top: 30, bottom: 10, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<p style="margin:0;text-align:center;color:#fecaca;font-size:24px;">24 HOURS ONLY</p>', fontSize: 24, lineHeight: 1.4, color: '#fecaca', backgroundColor: '#dc2626', padding: { top: 0, bottom: 30, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b4', type: 'text', data: { content: '<div style="text-align:center;"><span style="font-size:72px;font-weight:800;color:#dc2626;">50% OFF</span></div>', fontSize: 72, lineHeight: 1, color: '#dc2626', backgroundColor: '#ffffff', padding: { top: 40, bottom: 20, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b5', type: 'text', data: { content: '<p style="text-align:center;font-size:20px;color:#374151;">Everything in store! No code needed.</p>', fontSize: 20, lineHeight: 1.6, color: '#374151', backgroundColor: '#ffffff', padding: { top: 10, bottom: 30, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b6', type: 'image', data: { src: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=600&h=300&fit=crop', alt: 'Sale Products', link: '', width: '100%', alignment: 'center', padding: { top: 0, bottom: 20, left: 20, right: 20 } } },
        { id: 'b7', type: 'button', data: { text: 'SHOP NOW →', link: 'https://example.com/sale', backgroundColor: '#dc2626', textColor: '#ffffff', fontSize: 20, fontWeight: 'bold', borderRadius: 0, padding: { top: 18, bottom: 18, left: 50, right: 50 }, alignment: 'center', fullWidth: false } },
        { id: 'b8', type: 'text', data: { content: '<p style="text-align:center;color:#9ca3af;font-size:14px;margin-top:30px;">Sale ends at midnight. Don\'t miss out!</p>', fontSize: 14, lineHeight: 1.6, color: '#9ca3af', backgroundColor: '#ffffff', padding: { top: 20, bottom: 30, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b9', type: 'footer', data: { companyName: 'Your Store', address: '123 Main St', showSocial: true, socialLinks: {}, unsubscribeText: 'Unsubscribe', backgroundColor: '#1f2937', textColor: '#9ca3af', padding: { top: 30, bottom: 30, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_digest: {
    _id: 'tpl_digest',
    name: 'Weekly Digest',
    category: 'newsletter',
    subject: 'Your Weekly Update 📬',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 150 }, backgroundColor: '#ffffff', padding: { top: 30, bottom: 20, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<h1 style="margin:0;color:#111827;font-size:28px;">Weekly Digest 📬</h1>', fontSize: 28, lineHeight: 1.4, color: '#111827', backgroundColor: '#ffffff', padding: { top: 20, bottom: 5, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b3', type: 'text', data: { content: '<p style="color:#6b7280;font-size:16px;">Here\'s what\'s new this week...</p>', fontSize: 16, lineHeight: 1.6, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 5, bottom: 20, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b4', type: 'divider', data: { style: 'solid', color: '#e5e7eb', thickness: 1, width: '100%', padding: { top: 10, bottom: 10, left: 30, right: 30 } } },
        { id: 'b5', type: 'text', data: { content: '<h2 style="margin:0;color:#7c3aed;font-size:20px;">📰 Featured Story</h2>', fontSize: 20, lineHeight: 1.4, color: '#7c3aed', backgroundColor: '#ffffff', padding: { top: 20, bottom: 10, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b6', type: 'image', data: { src: 'https://images.unsplash.com/photo-1586339949216-35c2747cc36d?w=600&h=250&fit=crop', alt: 'Featured', link: '', width: '100%', alignment: 'center', padding: { top: 10, bottom: 15, left: 30, right: 30 } } },
        { id: 'b7', type: 'text', data: { content: '<h3 style="margin:0 0 10px;color:#111827;">This Week\'s Highlight Article</h3><p style="color:#4b5563;">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>', fontSize: 16, lineHeight: 1.6, color: '#4b5563', backgroundColor: '#ffffff', padding: { top: 0, bottom: 15, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b8', type: 'button', data: { text: 'Read More', link: '#', backgroundColor: '#7c3aed', textColor: '#ffffff', fontSize: 14, fontWeight: '600', borderRadius: 6, padding: { top: 10, bottom: 10, left: 24, right: 24 }, alignment: 'left', fullWidth: false } },
        { id: 'b9', type: 'divider', data: { style: 'solid', color: '#e5e7eb', thickness: 1, width: '100%', padding: { top: 25, bottom: 15, left: 30, right: 30 } } },
        { id: 'b10', type: 'text', data: { content: '<h2 style="margin:0;color:#7c3aed;font-size:20px;">📚 Quick Reads</h2>', fontSize: 20, lineHeight: 1.4, color: '#7c3aed', backgroundColor: '#ffffff', padding: { top: 10, bottom: 15, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b11', type: 'text', data: { content: '<p style="margin:0 0 12px;"><strong>Article One:</strong> Brief description of the first article with a link to read more.</p><p style="margin:0 0 12px;"><strong>Article Two:</strong> Brief description of another interesting piece for your readers.</p><p style="margin:0;"><strong>Article Three:</strong> One more article summary to round out the digest.</p>', fontSize: 15, lineHeight: 1.7, color: '#374151', backgroundColor: '#f9fafb', padding: { top: 20, bottom: 20, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b12', type: 'footer', data: { companyName: 'Your Newsletter', address: 'your@email.com', showSocial: true, socialLinks: { twitter: '#', linkedin: '#' }, unsubscribeText: 'Unsubscribe from this newsletter', backgroundColor: '#f3f4f6', textColor: '#6b7280', padding: { top: 30, bottom: 30, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_cart: {
    _id: 'tpl_cart',
    name: 'Cart Recovery',
    category: 'ecommerce',
    subject: 'You left something behind 🛒',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 140 }, backgroundColor: '#ffffff', padding: { top: 25, bottom: 25, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#111827;font-size:28px;">Forgot Something? 🛒</h1>', fontSize: 28, lineHeight: 1.4, color: '#111827', backgroundColor: '#ffffff', padding: { top: 30, bottom: 10, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<p style="text-align:center;color:#6b7280;font-size:16px;">Your cart is waiting for you! Complete your purchase before these items sell out.</p>', fontSize: 16, lineHeight: 1.6, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 10, bottom: 25, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b4', type: 'image', data: { src: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=500&h=300&fit=crop', alt: 'Your Cart', link: '', width: '80%', alignment: 'center', padding: { top: 10, bottom: 20, left: 30, right: 30 } } },
        { id: 'b5', type: 'text', data: { content: '<div style="background:#f9fafb;border-radius:8px;padding:20px;text-align:center;"><p style="margin:0 0 5px;color:#374151;font-weight:600;">Product Name Here</p><p style="margin:0;color:#7c3aed;font-size:20px;font-weight:700;">$99.00</p></div>', fontSize: 16, lineHeight: 1.6, color: '#374151', backgroundColor: '#ffffff', padding: { top: 10, bottom: 20, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b6', type: 'button', data: { text: 'Complete My Order', link: 'https://example.com/cart', backgroundColor: '#10b981', textColor: '#ffffff', fontSize: 18, fontWeight: 'bold', borderRadius: 8, padding: { top: 16, bottom: 16, left: 40, right: 40 }, alignment: 'center', fullWidth: false } },
        { id: 'b7', type: 'text', data: { content: '<p style="text-align:center;color:#9ca3af;font-size:14px;margin-top:20px;">🔒 Secure checkout • Free shipping on orders over $50</p>', fontSize: 14, lineHeight: 1.6, color: '#9ca3af', backgroundColor: '#ffffff', padding: { top: 15, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b8', type: 'footer', data: { companyName: 'Your Store', address: '123 Shopping Lane', showSocial: false, socialLinks: {}, unsubscribeText: 'Unsubscribe', backgroundColor: '#f3f4f6', textColor: '#6b7280', padding: { top: 25, bottom: 25, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_event: {
    _id: 'tpl_event',
    name: 'Event Invitation',
    category: 'event',
    subject: 'You\'re Invited! 🎉',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'image', data: { src: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=300&fit=crop', alt: 'Event Banner', link: '', width: '100%', alignment: 'center', padding: { top: 0, bottom: 0, left: 0, right: 0 } } },
        { id: 'b2', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#7c3aed;font-size:32px;">You\'re Invited! 🎉</h1>', fontSize: 32, lineHeight: 1.3, color: '#7c3aed', backgroundColor: '#ffffff', padding: { top: 35, bottom: 10, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<h2 style="margin:0;text-align:center;color:#111827;font-size:24px;">Annual Conference 2026</h2>', fontSize: 24, lineHeight: 1.4, color: '#111827', backgroundColor: '#ffffff', padding: { top: 10, bottom: 25, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b4', type: 'text', data: { content: '<div style="background:#f3f4f6;border-radius:12px;padding:25px;text-align:center;"><p style="margin:0 0 8px;color:#6b7280;font-size:14px;">📅 DATE</p><p style="margin:0 0 20px;color:#111827;font-size:18px;font-weight:600;">March 15, 2026 • 10:00 AM</p><p style="margin:0 0 8px;color:#6b7280;font-size:14px;">📍 LOCATION</p><p style="margin:0;color:#111827;font-size:18px;font-weight:600;">Grand Convention Center, NYC</p></div>', fontSize: 16, lineHeight: 1.6, color: '#374151', backgroundColor: '#ffffff', padding: { top: 0, bottom: 25, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b5', type: 'text', data: { content: '<p style="text-align:center;color:#4b5563;font-size:16px;">Join us for an incredible day of learning, networking, and inspiration. We\'ve got amazing speakers, workshops, and surprises planned!</p>', fontSize: 16, lineHeight: 1.7, color: '#4b5563', backgroundColor: '#ffffff', padding: { top: 10, bottom: 25, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b6', type: 'button', data: { text: 'RSVP Now - It\'s Free!', link: 'https://example.com/rsvp', backgroundColor: '#7c3aed', textColor: '#ffffff', fontSize: 18, fontWeight: 'bold', borderRadius: 50, padding: { top: 16, bottom: 16, left: 40, right: 40 }, alignment: 'center', fullWidth: false } },
        { id: 'b7', type: 'text', data: { content: '<p style="text-align:center;color:#9ca3af;font-size:13px;margin-top:20px;">Limited spots available • RSVP by March 1st</p>', fontSize: 13, lineHeight: 1.5, color: '#9ca3af', backgroundColor: '#ffffff', padding: { top: 15, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b8', type: 'footer', data: { companyName: 'Event Organizers', address: 'events@example.com', showSocial: true, socialLinks: { twitter: '#', facebook: '#' }, unsubscribeText: 'Unsubscribe from event updates', backgroundColor: '#1f2937', textColor: '#9ca3af', padding: { top: 30, bottom: 30, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_launch: {
    _id: 'tpl_launch',
    name: 'Product Launch',
    category: 'announcement',
    subject: 'Introducing: {{product_name}} 🚀',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 130 }, backgroundColor: '#111827', padding: { top: 25, bottom: 25, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<p style="margin:0;text-align:center;color:#a78bfa;font-size:14px;letter-spacing:2px;text-transform:uppercase;">NOW AVAILABLE</p>', fontSize: 14, lineHeight: 1.4, color: '#a78bfa', backgroundColor: '#111827', padding: { top: 30, bottom: 10, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#ffffff;font-size:40px;font-weight:800;">The All-New Product</h1>', fontSize: 40, lineHeight: 1.2, color: '#ffffff', backgroundColor: '#111827', padding: { top: 10, bottom: 15, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b4', type: 'text', data: { content: '<p style="text-align:center;color:#9ca3af;font-size:18px;">Redesigned from the ground up. More powerful than ever.</p>', fontSize: 18, lineHeight: 1.5, color: '#9ca3af', backgroundColor: '#111827', padding: { top: 5, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b5', type: 'image', data: { src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=350&fit=crop', alt: 'New Product', link: '', width: '100%', alignment: 'center', padding: { top: 0, bottom: 0, left: 0, right: 0 } } },
        { id: 'b6', type: 'text', data: { content: '<h2 style="margin:0 0 20px;text-align:center;color:#111827;font-size:24px;">Key Features</h2><p style="text-align:center;color:#4b5563;font-size:16px;">✨ <strong>Feature One</strong> - Description of amazing feature<br/>🚀 <strong>Feature Two</strong> - Another incredible capability<br/>💎 <strong>Feature Three</strong> - Something your customers will love</p>', fontSize: 16, lineHeight: 1.8, color: '#4b5563', backgroundColor: '#ffffff', padding: { top: 35, bottom: 30, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b7', type: 'button', data: { text: 'Learn More →', link: 'https://example.com/product', backgroundColor: '#7c3aed', textColor: '#ffffff', fontSize: 18, fontWeight: 'bold', borderRadius: 8, padding: { top: 16, bottom: 16, left: 40, right: 40 }, alignment: 'center', fullWidth: false } },
        { id: 'b8', type: 'footer', data: { companyName: 'Your Company', address: 'hello@company.com', showSocial: true, socialLinks: { twitter: '#', instagram: '#' }, unsubscribeText: 'Unsubscribe', backgroundColor: '#111827', textColor: '#6b7280', padding: { top: 30, bottom: 30, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_winback: {
    _id: 'tpl_winback',
    name: 'We Miss You',
    category: 'promotional',
    subject: 'We miss you! Come back for 20% off',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 140 }, backgroundColor: '#ffffff', padding: { top: 25, bottom: 20, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#111827;font-size:32px;">We Miss You! 💔</h1>', fontSize: 32, lineHeight: 1.3, color: '#111827', backgroundColor: '#ffffff', padding: { top: 30, bottom: 15, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<p style="text-align:center;color:#6b7280;font-size:18px;">It\'s been a while since we\'ve seen you. We\'d love to welcome you back with a special offer:</p>', fontSize: 18, lineHeight: 1.6, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 0, bottom: 25, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b4', type: 'text', data: { content: '<div style="background:linear-gradient(135deg,#7c3aed,#a78bfa);border-radius:16px;padding:30px;text-align:center;"><p style="margin:0 0 10px;color:#ffffff;font-size:16px;">EXCLUSIVE OFFER</p><p style="margin:0;color:#ffffff;font-size:48px;font-weight:800;">20% OFF</p><p style="margin:10px 0 0;color:#e9d5ff;font-size:14px;">Use code: COMEBACK20</p></div>', fontSize: 16, lineHeight: 1.6, color: '#ffffff', backgroundColor: '#ffffff', padding: { top: 10, bottom: 30, left: 40, right: 40 }, alignment: 'center' } },
        { id: 'b5', type: 'image', data: { src: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=500&h=250&fit=crop', alt: 'Products', link: '', width: '90%', alignment: 'center', padding: { top: 10, bottom: 25, left: 30, right: 30 } } },
        { id: 'b6', type: 'button', data: { text: 'Claim My Discount', link: 'https://example.com/shop', backgroundColor: '#7c3aed', textColor: '#ffffff', fontSize: 18, fontWeight: 'bold', borderRadius: 8, padding: { top: 16, bottom: 16, left: 40, right: 40 }, alignment: 'center', fullWidth: false } },
        { id: 'b7', type: 'text', data: { content: '<p style="text-align:center;color:#9ca3af;font-size:14px;margin-top:20px;">Offer expires in 7 days • Free shipping included</p>', fontSize: 14, lineHeight: 1.5, color: '#9ca3af', backgroundColor: '#ffffff', padding: { top: 15, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b8', type: 'footer', data: { companyName: 'Your Store', address: 'support@store.com', showSocial: false, socialLinks: {}, unsubscribeText: 'Unsubscribe', backgroundColor: '#f3f4f6', textColor: '#6b7280', padding: { top: 25, bottom: 25, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_order: {
    _id: 'tpl_order',
    name: 'Order Confirmation',
    category: 'ecommerce',
    subject: 'Order Confirmed ✓',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 140 }, backgroundColor: '#ffffff', padding: { top: 25, bottom: 20, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<div style="text-align:center;"><span style="display:inline-block;background:#10b981;color:#ffffff;padding:8px 20px;border-radius:50px;font-size:14px;font-weight:600;">✓ ORDER CONFIRMED</span></div>', fontSize: 14, lineHeight: 1.4, color: '#10b981', backgroundColor: '#ffffff', padding: { top: 30, bottom: 20, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#111827;font-size:28px;">Thank You for Your Order!</h1>', fontSize: 28, lineHeight: 1.4, color: '#111827', backgroundColor: '#ffffff', padding: { top: 10, bottom: 10, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b4', type: 'text', data: { content: '<p style="text-align:center;color:#6b7280;font-size:16px;">Order #12345 • Placed on Feb 6, 2026</p>', fontSize: 16, lineHeight: 1.6, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 5, bottom: 25, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b5', type: 'text', data: { content: '<div style="background:#f9fafb;border-radius:12px;padding:25px;"><h3 style="margin:0 0 15px;color:#111827;font-size:16px;">Order Summary</h3><div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#374151;">Product Name × 1</span><span style="color:#111827;font-weight:600;">$99.00</span></div><div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#374151;">Shipping</span><span style="color:#10b981;font-weight:600;">FREE</span></div><div style="display:flex;justify-content:space-between;padding:15px 0 0;"><span style="color:#111827;font-weight:700;font-size:18px;">Total</span><span style="color:#111827;font-weight:700;font-size:18px;">$99.00</span></div></div>', fontSize: 16, lineHeight: 1.6, color: '#374151', backgroundColor: '#ffffff', padding: { top: 0, bottom: 25, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b6', type: 'button', data: { text: 'Track My Order', link: 'https://example.com/track', backgroundColor: '#7c3aed', textColor: '#ffffff', fontSize: 16, fontWeight: '600', borderRadius: 8, padding: { top: 14, bottom: 14, left: 32, right: 32 }, alignment: 'center', fullWidth: false } },
        { id: 'b7', type: 'text', data: { content: '<p style="text-align:center;color:#6b7280;font-size:14px;margin-top:25px;">Questions about your order? Reply to this email or contact support.</p>', fontSize: 14, lineHeight: 1.6, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 10, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b8', type: 'footer', data: { companyName: 'Your Store', address: '123 Main Street, City', showSocial: false, socialLinks: {}, unsubscribeText: 'Email Preferences', backgroundColor: '#f3f4f6', textColor: '#6b7280', padding: { top: 25, bottom: 25, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_minimal: {
    _id: 'tpl_minimal',
    name: 'Minimal Clean',
    category: 'newsletter',
    subject: 'Quick Update',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'text', data: { content: '<p style="margin:0;color:#6b7280;font-size:14px;">YOUR COMPANY</p>', fontSize: 14, lineHeight: 1.4, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 40, bottom: 5, left: 40, right: 40 }, alignment: 'left' } },
        { id: 'b2', type: 'text', data: { content: '<h1 style="margin:0;color:#111827;font-size:28px;font-weight:600;">A Quick Update for You</h1>', fontSize: 28, lineHeight: 1.4, color: '#111827', backgroundColor: '#ffffff', padding: { top: 10, bottom: 25, left: 40, right: 40 }, alignment: 'left' } },
        { id: 'b3', type: 'text', data: { content: '<p style="color:#374151;font-size:16px;line-height:1.8;">Hi there,</p><p style="color:#374151;font-size:16px;line-height:1.8;">Hope this email finds you well. I wanted to share a quick update on what we\'ve been working on.</p><p style="color:#374151;font-size:16px;line-height:1.8;">We\'ve been listening to your feedback and have made some exciting improvements that I think you\'ll love. Here\'s the summary:</p>', fontSize: 16, lineHeight: 1.8, color: '#374151', backgroundColor: '#ffffff', padding: { top: 0, bottom: 20, left: 40, right: 40 }, alignment: 'left' } },
        { id: 'b4', type: 'text', data: { content: '<ul style="color:#374151;font-size:16px;line-height:2;margin:0;padding-left:20px;"><li>First important point to mention</li><li>Second item worth highlighting</li><li>Third thing you should know about</li></ul>', fontSize: 16, lineHeight: 2, color: '#374151', backgroundColor: '#f9fafb', padding: { top: 20, bottom: 20, left: 50, right: 40 }, alignment: 'left' } },
        { id: 'b5', type: 'text', data: { content: '<p style="color:#374151;font-size:16px;line-height:1.8;">If you have any questions or feedback, just hit reply. I read every email personally.</p><p style="color:#374151;font-size:16px;line-height:1.8;">Best,<br/>Your Name</p>', fontSize: 16, lineHeight: 1.8, color: '#374151', backgroundColor: '#ffffff', padding: { top: 20, bottom: 40, left: 40, right: 40 }, alignment: 'left' } },
        { id: 'b6', type: 'divider', data: { style: 'solid', color: '#e5e7eb', thickness: 1, width: '100%', padding: { top: 10, bottom: 10, left: 40, right: 40 } } },
        { id: 'b7', type: 'text', data: { content: '<p style="text-align:center;color:#9ca3af;font-size:12px;">© 2026 Your Company • <a href="#" style="color:#9ca3af;">Unsubscribe</a></p>', fontSize: 12, lineHeight: 1.6, color: '#9ca3af', backgroundColor: '#ffffff', padding: { top: 20, bottom: 40, left: 40, right: 40 }, alignment: 'center' } }
      ]
    }
  },
  tpl_dark: {
    _id: 'tpl_dark',
    name: 'Dark Mode',
    category: 'newsletter',
    subject: 'The Latest News',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 140 }, backgroundColor: '#0f172a', padding: { top: 30, bottom: 25, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#ffffff;font-size:32px;">The Latest News</h1>', fontSize: 32, lineHeight: 1.3, color: '#ffffff', backgroundColor: '#0f172a', padding: { top: 30, bottom: 10, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<p style="text-align:center;color:#94a3b8;font-size:16px;">Your weekly dose of updates and insights</p>', fontSize: 16, lineHeight: 1.6, color: '#94a3b8', backgroundColor: '#0f172a', padding: { top: 5, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b4', type: 'image', data: { src: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&h=280&fit=crop', alt: 'Featured', link: '', width: '100%', alignment: 'center', padding: { top: 0, bottom: 0, left: 0, right: 0 } } },
        { id: 'b5', type: 'text', data: { content: '<h2 style="margin:0 0 15px;color:#ffffff;font-size:22px;">Featured Story</h2><p style="color:#cbd5e1;font-size:16px;line-height:1.7;">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.</p>', fontSize: 16, lineHeight: 1.7, color: '#cbd5e1', backgroundColor: '#1e293b', padding: { top: 30, bottom: 25, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b6', type: 'button', data: { text: 'Read Full Article', link: '#', backgroundColor: '#7c3aed', textColor: '#ffffff', fontSize: 16, fontWeight: '600', borderRadius: 8, padding: { top: 12, bottom: 12, left: 28, right: 28 }, alignment: 'left', fullWidth: false } },
        { id: 'b7', type: 'divider', data: { style: 'solid', color: '#334155', thickness: 1, width: '100%', padding: { top: 25, bottom: 25, left: 30, right: 30 } } },
        { id: 'b8', type: 'text', data: { content: '<h3 style="margin:0 0 15px;color:#ffffff;font-size:18px;">More Stories</h3><p style="color:#94a3b8;font-size:15px;line-height:1.8;">• <a href="#" style="color:#a78bfa;text-decoration:none;">Article title one with a short description</a></p><p style="color:#94a3b8;font-size:15px;line-height:1.8;">• <a href="#" style="color:#a78bfa;text-decoration:none;">Another interesting article to read</a></p><p style="color:#94a3b8;font-size:15px;line-height:1.8;">• <a href="#" style="color:#a78bfa;text-decoration:none;">Third story you might enjoy</a></p>', fontSize: 15, lineHeight: 1.8, color: '#94a3b8', backgroundColor: '#1e293b', padding: { top: 0, bottom: 30, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b9', type: 'footer', data: { companyName: 'Your Newsletter', address: 'news@example.com', showSocial: true, socialLinks: { twitter: '#', linkedin: '#' }, unsubscribeText: 'Unsubscribe', backgroundColor: '#0f172a', textColor: '#64748b', padding: { top: 30, bottom: 30, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_holiday: {
    _id: 'tpl_holiday',
    name: 'Holiday Special',
    category: 'promotional',
    subject: '🎄 Holiday Special Inside!',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'text', data: { content: '<div style="text-align:center;font-size:40px;padding:20px 0;">🎄 ❄️ 🎁</div>', fontSize: 40, lineHeight: 1, color: '#111827', backgroundColor: '#dc2626', padding: { top: 20, bottom: 10, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#ffffff;font-size:36px;font-weight:800;">HOLIDAY SALE</h1>', fontSize: 36, lineHeight: 1.2, color: '#ffffff', backgroundColor: '#dc2626', padding: { top: 10, bottom: 10, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<p style="margin:0;text-align:center;color:#fecaca;font-size:18px;">The most wonderful time to save!</p>', fontSize: 18, lineHeight: 1.4, color: '#fecaca', backgroundColor: '#dc2626', padding: { top: 5, bottom: 30, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b4', type: 'image', data: { src: 'https://images.unsplash.com/photo-1512389142860-9c449e58a814?w=600&h=300&fit=crop', alt: 'Holiday Sale', link: '', width: '100%', alignment: 'center', padding: { top: 0, bottom: 0, left: 0, right: 0 } } },
        { id: 'b5', type: 'text', data: { content: '<div style="text-align:center;padding:30px 0;"><p style="margin:0 0 10px;color:#6b7280;font-size:14px;">USE CODE</p><p style="margin:0;color:#dc2626;font-size:32px;font-weight:800;letter-spacing:4px;">HOLIDAY25</p></div>', fontSize: 16, lineHeight: 1.4, color: '#374151', backgroundColor: '#ffffff', padding: { top: 20, bottom: 0, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b6', type: 'text', data: { content: '<p style="text-align:center;color:#374151;font-size:20px;font-weight:600;">25% OFF EVERYTHING</p><p style="text-align:center;color:#6b7280;font-size:16px;">Free shipping on orders over $50</p>', fontSize: 16, lineHeight: 1.6, color: '#374151', backgroundColor: '#ffffff', padding: { top: 10, bottom: 25, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b7', type: 'button', data: { text: '🎁 Shop Holiday Deals', link: 'https://example.com/holiday', backgroundColor: '#dc2626', textColor: '#ffffff', fontSize: 18, fontWeight: 'bold', borderRadius: 8, padding: { top: 16, bottom: 16, left: 36, right: 36 }, alignment: 'center', fullWidth: false } },
        { id: 'b8', type: 'text', data: { content: '<p style="text-align:center;color:#9ca3af;font-size:14px;margin-top:25px;">Offer valid through December 31st</p>', fontSize: 14, lineHeight: 1.5, color: '#9ca3af', backgroundColor: '#ffffff', padding: { top: 15, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b9', type: 'footer', data: { companyName: 'Your Store', address: 'Happy Holidays from our team!', showSocial: true, socialLinks: { instagram: '#', facebook: '#' }, unsubscribeText: 'Unsubscribe', backgroundColor: '#166534', textColor: '#bbf7d0', padding: { top: 30, bottom: 30, left: 20, right: 20 } } }
      ]
    }
  },
  tpl_course: {
    _id: 'tpl_course',
    name: 'Course Update',
    category: 'educational',
    subject: 'New lesson available 📚',
    isSystem: true,
    content: {
      blocks: [
        { id: 'b1', type: 'header', data: { logo: { url: '', alt: 'Logo', width: 140 }, backgroundColor: '#7c3aed', padding: { top: 25, bottom: 25, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b2', type: 'text', data: { content: '<p style="margin:0;text-align:center;color:#c4b5fd;font-size:14px;">NEW LESSON AVAILABLE</p>', fontSize: 14, lineHeight: 1.4, color: '#c4b5fd', backgroundColor: '#7c3aed', padding: { top: 20, bottom: 5, left: 20, right: 20 }, alignment: 'center' } },
        { id: 'b3', type: 'text', data: { content: '<h1 style="margin:0;text-align:center;color:#ffffff;font-size:28px;">Module 5: Advanced Techniques</h1>', fontSize: 28, lineHeight: 1.4, color: '#ffffff', backgroundColor: '#7c3aed', padding: { top: 10, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b4', type: 'image', data: { src: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&h=280&fit=crop', alt: 'Lesson Preview', link: '', width: '100%', alignment: 'center', padding: { top: 0, bottom: 0, left: 0, right: 0 } } },
        { id: 'b5', type: 'text', data: { content: '<p style="color:#374151;font-size:16px;line-height:1.7;">Hi there! 👋</p><p style="color:#374151;font-size:16px;line-height:1.7;">Great news! Your next lesson is now available. In this module, you\'ll learn:</p>', fontSize: 16, lineHeight: 1.7, color: '#374151', backgroundColor: '#ffffff', padding: { top: 30, bottom: 10, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b6', type: 'text', data: { content: '<ul style="color:#374151;font-size:16px;line-height:2;"><li>📌 Key concept one explained simply</li><li>📌 Practical exercises to reinforce learning</li><li>📌 Real-world applications and examples</li><li>📌 Bonus resources and downloads</li></ul>', fontSize: 16, lineHeight: 2, color: '#374151', backgroundColor: '#f3f4f6', padding: { top: 20, bottom: 20, left: 50, right: 30 }, alignment: 'left' } },
        { id: 'b7', type: 'text', data: { content: '<p style="color:#6b7280;font-size:16px;line-height:1.7;">This lesson takes about 45 minutes to complete. Take your time and don\'t hesitate to reach out if you have questions!</p>', fontSize: 16, lineHeight: 1.7, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 15, bottom: 25, left: 30, right: 30 }, alignment: 'left' } },
        { id: 'b8', type: 'button', data: { text: 'Start Learning →', link: 'https://example.com/lesson', backgroundColor: '#7c3aed', textColor: '#ffffff', fontSize: 18, fontWeight: 'bold', borderRadius: 8, padding: { top: 16, bottom: 16, left: 40, right: 40 }, alignment: 'center', fullWidth: false } },
        { id: 'b9', type: 'text', data: { content: '<div style="background:#f3f4f6;border-radius:8px;padding:15px;margin-top:25px;text-align:center;"><p style="margin:0;color:#6b7280;font-size:14px;">📊 Your Progress: <strong style="color:#7c3aed;">4/10 modules completed</strong></p></div>', fontSize: 14, lineHeight: 1.6, color: '#6b7280', backgroundColor: '#ffffff', padding: { top: 10, bottom: 30, left: 30, right: 30 }, alignment: 'center' } },
        { id: 'b10', type: 'footer', data: { companyName: 'Your Course', address: 'support@course.com', showSocial: false, socialLinks: {}, unsubscribeText: 'Update email preferences', backgroundColor: '#f3f4f6', textColor: '#6b7280', padding: { top: 25, bottom: 25, left: 20, right: 20 } } }
      ]
    }
  }
};

// GET single template (including built-in templates)
router.get('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const templateId = req.params.id;
    
    // Check if it's a built-in template
    if (BUILTIN_TEMPLATES[templateId]) {
      console.log(`📧 Returning built-in template: ${templateId}`);
      return res.json({ template: BUILTIN_TEMPLATES[templateId] });
    }
    
    // Otherwise look in database
    const template = await EmailTemplate.findOne({ 
      _id: templateId, 
      $or: [{ user: userId }, { isSystem: true }] 
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ template });
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// GET all templates
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const templates = await EmailTemplate.find({ $or: [{ user: userId }, { isSystem: true }] }).sort({ createdAt: -1 });
    console.log(`📧 Found ${templates.length} templates for user ${userId}`);
    res.json({ templates });
  } catch (err) {
    console.error('Templates error:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create/Save a template
router.post('/templates', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, category, html, designJson, thumbnail } = req.body;
    
    if (!name || !html) {
      return res.status(400).json({ error: 'Name and HTML content are required' });
    }
    
    const template = new EmailTemplate({
      user: userId,
      name,
      category: category || 'General',
      html,
      designJson,
      thumbnail,
      isSystem: false
    });
    
    await template.save();
    console.log(`✅ Template "${name}" created for user ${userId}`);
    
    res.json({ ok: true, template });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update a template
router.put('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, category, html, designJson, thumbnail } = req.body;
    
    const template = await EmailTemplate.findOne({ _id: req.params.id, user: userId });
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (name) template.name = name;
    if (category) template.category = category;
    if (html) template.html = html;
    if (designJson !== undefined) template.designJson = designJson;
    if (thumbnail) template.thumbnail = thumbnail;
    
    await template.save();
    res.json({ ok: true, template });
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete a template
router.delete('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const template = await EmailTemplate.findOne({ _id: req.params.id, user: userId });
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (template.isSystem) {
      return res.status(403).json({ error: 'Cannot delete system templates' });
    }
    
    await template.deleteOne();
    res.json({ ok: true, message: 'Template deleted' });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ---------- CONTACTS BULK OPERATIONS (MUST BE BEFORE /contacts/:id) ----------

// DELETE ALL CONTACTS
router.delete('/contacts/delete-all', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { list } = req.query;
    
    const query = { user: userId };
    if (list) {
      query.list = list;
    }
    
    const result = await CampaignContact.deleteMany(query);
    
    console.log(`✅ Deleted ${result.deletedCount} contacts for user ${userId}`);
    
    res.json({ 
      ok: true, 
      deleted: result.deletedCount,
      message: `Successfully deleted ${result.deletedCount} contacts`
    });
  } catch (err) {
    console.error('❌ Delete all contacts error:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete contacts', details: err.message });
  }
});

// BULK DELETE SELECTED
router.post('/contacts/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { contactIds } = req.body;
    
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'No contacts selected' });
    }
    
    const result = await CampaignContact.deleteMany({
      _id: { $in: contactIds },
      user: userId
    });
    
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete contacts' });
  }
});

// BULK ADD TAG
router.post('/contacts/bulk-tag', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { contactIds, tag } = req.body;
    
    if (!contactIds || !tag) {
      return res.status(400).json({ ok: false, error: 'Missing contactIds or tag' });
    }
    
    const result = await CampaignContact.updateMany(
      { _id: { $in: contactIds }, user: userId },
      { $addToSet: { tags: tag } }
    );
    
    res.json({ ok: true, updated: result.modifiedCount });
  } catch (err) {
    console.error('Bulk tag error:', err);
    res.status(500).json({ ok: false, error: 'Failed to add tag' });
  }
});

// BULK MOVE TO LIST
router.post('/contacts/bulk-move', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { contactIds, listId } = req.body;
    
    console.log('📦 Bulk move:', contactIds?.length, 'contacts to list:', listId);
    
    // FIX: Ensure listId is stored as ObjectId
    let listObjectId = null;
    if (listId) {
      try {
        listObjectId = new mongoose.Types.ObjectId(listId);
      } catch (e) {
        listObjectId = listId;
      }
    }
    
    const result = await CampaignContact.updateMany(
      { _id: { $in: contactIds }, user: userId },
      { list: listObjectId }
    );
    
    console.log('📦 Moved', result.modifiedCount, 'contacts');
    res.json({ ok: true, updated: result.modifiedCount });
  } catch (err) {
    console.error('Bulk move error:', err);
    res.status(500).json({ ok: false, error: 'Failed to move contacts' });
  }
});

// AI CLEAN LIST
router.post('/contacts/ai-clean', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { list } = req.body;
    
    const query = { user: userId };
    if (list) query.list = list;
    
    const contacts = await CampaignContact.find(query);
    
    let duplicatesRemoved = 0;
    let emailsFixed = 0;
    let invalidRemoved = 0;
    let flagged = 0;
    
    const seenEmails = new Map();
    const toDelete = [];
    const toUpdate = [];
    
    for (const contact of contacts) {
      let email = contact.email?.toLowerCase().trim();
      
      if (email) {
        const originalEmail = email;
        email = email.replace(/\s/g, '').replace(/,/g, '.').replace(/\.+/g, '.');
        
        if (email !== originalEmail) {
          emailsFixed++;
          toUpdate.push({ id: contact._id, email });
        }
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        invalidRemoved++;
        toDelete.push(contact._id);
        continue;
      }
      
      if (seenEmails.has(email)) {
        duplicatesRemoved++;
        toDelete.push(contact._id);
      } else {
        seenEmails.set(email, contact._id);
      }
      
      const suspiciousDomains = ['tempmail', 'throwaway', '10minute', 'guerrilla', 'mailinator'];
      if (suspiciousDomains.some(d => email.includes(d))) {
        flagged++;
      }
    }
    
    for (const update of toUpdate) {
      await CampaignContact.updateOne({ _id: update.id }, { email: update.email });
    }
    
    if (toDelete.length > 0) {
      await CampaignContact.deleteMany({ _id: { $in: toDelete } });
    }
    
    res.json({ ok: true, duplicatesRemoved, emailsFixed, invalidRemoved, flagged });
  } catch (err) {
    console.error('AI Clean error:', err);
    res.status(500).json({ ok: false, error: 'AI cleaning failed' });
  }
});

// IMPORT CONTACTS
router.post('/contacts/import', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    // Handle multipart form data - you may need multer middleware
    res.json({ ok: true, imported: 0, duplicates: 0, message: 'Import endpoint ready' });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ ok: false, error: 'Import failed' });
  }
});

// EXPORT CONTACTS
router.get('/contacts/export', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { list, tag, status } = req.query;
    
    const query = { user: userId };
    if (list) query.list = list;
    if (tag) query.tags = tag;
    if (status) query.status = status;
    
    const contacts = await CampaignContact.find(query);
    
    // Create CSV
    const headers = 'email,firstName,lastName,phone,company,status,tags\n';
    const rows = contacts.map(c => 
      `${c.email},${c.firstName || ''},${c.lastName || ''},${c.phone || ''},${c.company || ''},${c.status},${(c.tags || []).join(';')}`
    ).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(headers + rows);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ ok: false, error: 'Export failed' });
  }
});

// ---------- CONTACTS CRUD ----------

// GET ALL CONTACTS
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page = 1, limit = 50, search, status, tag, list } = req.query;
    
    const query = { user: userId };
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }
    if (status && status !== 'all') query.status = status;
    if (tag) query.tags = tag;
    if (list) query.list = list;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [contacts, total] = await Promise.all([
      CampaignContact.find(query)
        .populate('list', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      CampaignContact.countDocuments(query)
    ]);
    
    // Add list name to contacts
    const contactsWithListName = contacts.map(c => ({
      ...c.toObject(),
      listName: c.list?.name || null
    }));
    
    res.json({
      contacts: contactsWithListName,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// CREATE CONTACT
router.post('/contacts', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { email, firstName, lastName, phone, company, tags, list } = req.body;
    
    // Check for existing
    const existing = await CampaignContact.findOne({ user: userId, email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Contact with this email already exists' });
    }
    
    const contact = new CampaignContact({
      user: userId,
      email: email.toLowerCase(),
      firstName,
      lastName,
      phone,
      company,
      tags: tags || [],
      list: list || null,
      status: 'subscribed'
    });
    
    await contact.save();
    res.json({ contact });
  } catch (err) {
    console.error('Create contact error:', err);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// GET SINGLE CONTACT
router.get('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const contact = await CampaignContact.findOne({ _id: req.params.id, user: userId }).populate('list', 'name');
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({ contact });
  } catch (err) {
    console.error('Get contact error:', err);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// UPDATE CONTACT
router.put('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const updates = req.body;
    
    const contact = await CampaignContact.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      updates,
      { new: true }
    );
    
    res.json({ contact });
  } catch (err) {
    console.error('Update contact error:', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE CONTACT
router.delete('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    await CampaignContact.deleteOne({ _id: req.params.id, user: userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete contact error:', err);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ---------- AI FEATURES ----------

router.post('/ai/subject-line', authenticateToken, async (req, res) => {
  try {
    const { context, tone = 'professional' } = req.body;
    
    // Fallback suggestions
    const suggestions = [
      `🚀 ${context} - Don't miss out!`,
      `Important: ${context}`,
      `[Action Required] ${context}`,
      `You're invited: ${context}`,
      `Quick update on ${context}`
    ];
    
    res.json({ suggestions });
  } catch (err) {
    console.error('AI subject error:', err);
    res.status(500).json({ error: 'AI generation failed' });
  }
});

router.post('/ai/email-content', authenticateToken, async (req, res) => {
  try {
    const { prompt, subject, tone = 'professional' } = req.body;
    
    // Simple fallback template
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">${subject || 'Hello!'}</h1>
        <p style="color: #666; line-height: 1.6;">${prompt}</p>
        <p style="color: #666;">Best regards,<br>The Team</p>
      </div>
    `;
    
    res.json({ html });
  } catch (err) {
    console.error('AI content error:', err);
    res.status(500).json({ error: 'AI generation failed' });
  }
});

// ---------- SEGMENTS PREVIEW ----------

router.post('/segments/preview', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { audienceType, lists, includeTags, excludeTags } = req.body;
    
    console.log('📊 Segment preview:', { audienceType, lists, includeTags });
    
    let query = { user: userId, status: 'subscribed' };
    
    if (audienceType === 'list' && lists?.length > 0) {
      // FIX: Convert string IDs to ObjectIds for proper matching
      const listObjectIds = lists.map(id => {
        try {
          return new mongoose.Types.ObjectId(id);
        } catch (e) {
          return id;
        }
      });
      query.list = { $in: listObjectIds };
      console.log('📊 Querying lists:', listObjectIds);
    } else if (audienceType === 'tags' && includeTags?.length > 0) {
      query.tags = { $in: includeTags };
      if (excludeTags?.length > 0) {
        query.tags = { ...query.tags, $nin: excludeTags };
      }
    }
    
    const count = await CampaignContact.countDocuments(query);
    console.log('📊 Preview count:', count);
    res.json({ count });
  } catch (err) {
    console.error('Segment preview error:', err);
    res.status(500).json({ error: 'Preview failed' });
  }
});

// ---------- CAMPAIGNS CRUD ----------

// GET ALL CAMPAIGNS
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const campaigns = await Campaign.find({ user: userId }).sort({ createdAt: -1 });
    res.json({ campaigns });
  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// CREATE CAMPAIGN
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const campaignData = { ...req.body, user: userId };
    
    const campaign = new Campaign(campaignData);
    await campaign.save();
    
    res.json({ campaign });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// SEND TEST EMAIL
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const { email, subject, html, fromEmail, fromName } = req.body;
    
    if (!email || !subject || !html) {
      return res.status(400).json({ ok: false, error: 'Email, subject, and HTML content are required' });
    }
    
    // Send via multi-provider service (tries SES first, then Brevo)
    if (emailService && emailService.sendEmail) {
      try {
        const result = await emailService.sendEmail({
          to: email,
          from: fromEmail || process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@cybev.io',
          fromName: fromName || 'CYBEV',
          subject: `[TEST] ${subject}`,
          html: html,
          tags: ['test', 'campaign']
        });
        
        console.log(`📧 Test email sent to ${email} via ${result.provider} | MessageId: ${result.messageId}`);
        return res.json({ 
          ok: true, 
          message: `Test email sent to ${email}`, 
          messageId: result.messageId,
          provider: result.provider 
        });
      } catch (emailError) {
        console.error('Email send error:', emailError.message);
        return res.status(500).json({ 
          ok: false, 
          error: `Failed to send: ${emailError.message}. Check BREVO_API_KEY or AWS SES config.` 
        });
      }
    }
    
    // No email service configured
    return res.status(503).json({ 
      ok: false, 
      error: 'No email service configured. Set BREVO_API_KEY in environment variables.' 
    });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ ok: false, error: 'Failed to send test email' });
  }
});

// SEND CAMPAIGN (create and send in one step)
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const campaignData = req.body;
    
    if (!campaignData.subject || !campaignData.html) {
      return res.status(400).json({ ok: false, error: 'Subject and HTML content are required' });
    }
    
    // Check if email service is available
    if (!emailService || !emailService.sendBulkEmails) {
      return res.status(503).json({ 
        ok: false, 
        error: 'Email service not configured. Set BREVO_API_KEY in environment.' 
      });
    }
    
    // Build recipient query
    let query = { user: userId, status: 'subscribed' };
    
    if (campaignData.audienceType === 'list' && campaignData.selectedLists?.length > 0) {
      // FIX: Convert to ObjectIds
      const listObjectIds = campaignData.selectedLists.map(id => {
        try {
          return new mongoose.Types.ObjectId(id);
        } catch (e) {
          return id;
        }
      });
      query.list = { $in: listObjectIds };
      console.log('📧 Sending to lists:', listObjectIds);
    } else if (campaignData.audienceType === 'tags' && campaignData.includeTags?.length > 0) {
      query.tags = { $in: campaignData.includeTags };
    }
    
    // Get recipients
    const recipients = await CampaignContact.find(query).lean();
    const recipientCount = recipients.length;
    
    if (recipientCount === 0) {
      return res.status(400).json({ ok: false, error: 'No recipients found' });
    }
    
    // Create campaign record
    const campaign = new Campaign({
      user: userId,
      name: campaignData.name || `Campaign ${new Date().toLocaleDateString()}`,
      subject: campaignData.subject,
      previewText: campaignData.previewText,
      fromName: campaignData.fromName,
      fromEmail: campaignData.fromEmail,
      html: campaignData.html,
      designJson: campaignData.designJson,
      audienceType: campaignData.audienceType || 'all',
      lists: campaignData.selectedLists,
      includeTags: campaignData.includeTags,
      excludeTags: campaignData.excludeTags,
      status: 'sending',
      sentAt: new Date(),
      stats: { recipientCount }
    });
    await campaign.save();
    
    console.log(`📤 Sending campaign "${campaign.name}" to ${recipientCount} recipients`);
    
    // Prepare recipients
    const emailRecipients = recipients.map(contact => ({
      email: contact.email,
      name: contact.firstName || contact.lastName ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : null,
      data: {
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        name: contact.firstName || contact.lastName ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : 'there',
        email: contact.email
      }
    }));
    
    // Send in background
    emailService.sendBulkEmails({
      recipients: emailRecipients,
      from: campaignData.fromEmail || process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@cybev.io',
      fromName: campaignData.fromName || 'CYBEV',
      subject: campaignData.subject,
      html: campaignData.html,
      tags: ['campaign', campaign._id.toString()]
    }).then(async (result) => {
      try {
        const successCount = result.results ? result.results.filter(r => r.success).length : recipientCount;
        const failCount = result.results ? result.results.filter(r => !r.success).length : 0;
        
        await Campaign.findByIdAndUpdate(campaign._id, {
          status: 'sent',
          'stats.sent': successCount,
          'stats.delivered': successCount,
          'stats.failed': failCount
        });
        console.log(`✅ Campaign completed via ${result.provider}: ${successCount} sent`);
      } catch (e) {
        console.error('Update stats error:', e);
      }
    }).catch(async (err) => {
      console.error('Send error:', err);
      await Campaign.findByIdAndUpdate(campaign._id, { status: 'draft' });
    });
    
    return res.json({ ok: true, sent: recipientCount, campaign });
    
  } catch (err) {
    console.error('Send campaign error:', err);
    res.status(500).json({ ok: false, error: 'Failed to send campaign' });
  }
});

// GET SINGLE CAMPAIGN
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId });
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    res.json({ campaign });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// UPDATE CAMPAIGN
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const updates = req.body;
    
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      updates,
      { new: true }
    );
    
    res.json({ campaign });
  } catch (err) {
    console.error('Update campaign error:', err);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// DELETE CAMPAIGN
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    await Campaign.deleteOne({ _id: req.params.id, user: userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ==========================================
// POST /:id/send - Send a specific campaign (v4.1.0)
// ==========================================
router.post('/:id/send', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId });

    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    if (!campaign.html && !campaign.designJson) {
      return res.status(400).json({ ok: false, error: 'Campaign has no email content' });
    }

    // Build recipient query
    let query = { user: userId, status: 'subscribed' };

    if (campaign.audienceType === 'list' && campaign.lists?.length > 0) {
      // FIX: Convert to ObjectIds
      const listObjectIds = campaign.lists.map(id => {
        try {
          return new mongoose.Types.ObjectId(id);
        } catch (e) {
          return id;
        }
      });
      query.list = { $in: listObjectIds };
      console.log('📧 Sending campaign', campaign._id, 'to lists:', listObjectIds);
    } else if (campaign.audienceType === 'tags' && campaign.includeTags?.length > 0) {
      query.tags = { $in: campaign.includeTags };
      if (campaign.excludeTags?.length > 0) {
        query.tags = { ...query.tags, $nin: campaign.excludeTags };
      }
    }

    // Get all recipients
    const recipients = await CampaignContact.find(query).lean();
    const recipientCount = recipients.length;

    if (recipientCount === 0) {
      return res.status(400).json({ ok: false, error: 'No recipients found for this campaign' });
    }

    // Update campaign status to sending
    campaign.status = 'sending';
    campaign.sentAt = new Date();
    campaign.stats = { ...campaign.stats, recipientCount };
    await campaign.save();

    console.log(`📤 Sending campaign "${campaign.name}" to ${recipientCount} recipients`);

    // Check if email service is available
    if (!emailService || !emailService.sendBulkEmails) {
      return res.status(503).json({ 
        ok: false, 
        error: 'Email service not configured. Set BREVO_API_KEY in environment.' 
      });
    }

    // Prepare recipients with personalization data
    const emailRecipients = recipients.map(contact => ({
      email: contact.email,
      name: contact.firstName || contact.lastName ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : null,
      data: {
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        name: contact.firstName || contact.lastName ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : 'there',
        email: contact.email,
        company: contact.company || ''
      }
    }));

    // Send in background (don't wait)
    emailService.sendBulkEmails({
      recipients: emailRecipients,
      from: campaign.fromEmail || process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@cybev.io',
      fromName: campaign.fromName || 'CYBEV',
      subject: campaign.subject,
      html: campaign.html,
      tags: ['campaign', campaign._id.toString()]
    }).then(async (result) => {
      // Update campaign stats after sending completes
      try {
        const successCount = result.results ? result.results.filter(r => r.success).length : recipientCount;
        const failCount = result.results ? result.results.filter(r => !r.success).length : 0;
        
        const updatedCampaign = await Campaign.findById(campaign._id);
        if (updatedCampaign) {
          updatedCampaign.status = 'sent';
          updatedCampaign.stats = {
            ...updatedCampaign.stats,
            sent: successCount,
            delivered: successCount,
            failed: failCount
          };
          await updatedCampaign.save();
          console.log(`✅ Campaign "${campaign.name}" completed via ${result.provider}: ${successCount} sent, ${failCount} failed`);
        }
      } catch (updateErr) {
        console.error('Failed to update campaign stats:', updateErr);
      }
    }).catch(async (sendErr) => {
      console.error('Bulk send error:', sendErr);
      // Mark campaign as failed/draft
      try {
        await Campaign.findByIdAndUpdate(campaign._id, { 
          status: 'draft', 
          'stats.error': sendErr.message 
        });
      } catch (e) {}
    });

    // Return immediately while emails send in background
    return res.json({ 
      ok: true, 
      message: `Campaign is being sent to ${recipientCount} recipients`,
      recipientCount,
      campaign: { ...campaign.toObject(), status: 'sending' }
    });

  } catch (err) {
    console.error('Send campaign error:', err);
    res.status(500).json({ ok: false, error: 'Failed to send campaign' });
  }
});

// ==========================================
// GET /:id/report - Get campaign analytics report
// ==========================================
router.get('/:id/report', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const campaign = await Campaign.findOne({ _id: req.params.id, user: userId });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Calculate rates
    const stats = campaign.stats || {};
    const sent = stats.sent || 0;
    const openRate = sent > 0 ? ((stats.opened || 0) / sent * 100).toFixed(1) : 0;
    const clickRate = sent > 0 ? ((stats.clicked || 0) / sent * 100).toFixed(1) : 0;
    const bounceRate = sent > 0 ? ((stats.bounced || 0) / sent * 100).toFixed(1) : 0;
    const unsubRate = sent > 0 ? ((stats.unsubscribed || 0) / sent * 100).toFixed(1) : 0;

    // Industry benchmarks for comparison
    const benchmarks = {
      openRate: 21.5,
      clickRate: 2.3,
      bounceRate: 0.5,
      unsubscribeRate: 0.1
    };

    res.json({
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        sentAt: campaign.sentAt,
        createdAt: campaign.createdAt
      },
      stats: {
        sent: sent,
        delivered: stats.delivered || 0,
        opened: stats.opened || 0,
        clicked: stats.clicked || 0,
        bounced: stats.bounced || 0,
        unsubscribed: stats.unsubscribed || 0,
        openRate: parseFloat(openRate),
        clickRate: parseFloat(clickRate),
        bounceRate: parseFloat(bounceRate),
        unsubscribeRate: parseFloat(unsubRate)
      },
      benchmarks,
      timeline: [], // TODO: Add hourly open/click data
      topLinks: [], // TODO: Add link click tracking
      deviceStats: { desktop: 60, mobile: 35, tablet: 5 }, // TODO: Real device tracking
      locationStats: [] // TODO: Geo tracking
    });
  } catch (err) {
    console.error('Campaign report error:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// ==========================================
// POST /:id/duplicate - Duplicate a campaign (v4.1.0)
// ==========================================
router.post('/:id/duplicate', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const original = await Campaign.findOne({ _id: req.params.id, user: userId }).lean();

    if (!original) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Remove unique fields
    delete original._id;
    delete original.createdAt;
    delete original.updatedAt;

    const duplicate = await Campaign.create({
      ...original,
      name: `${original.name} (Copy)`,
      status: 'draft',
      sentAt: null,
      recipientCount: 0,
      stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 }
    });

    res.json({ ok: true, campaign: duplicate });
  } catch (err) {
    console.error('Duplicate campaign error:', err);
    res.status(500).json({ ok: false, error: 'Failed to duplicate campaign' });
  }
});

module.exports = router;
