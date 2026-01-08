// ============================================
// FILE: models/site.model.js
// Website/Blog Site Model
// VERSION: 1.0
// Squarespace-like website builder
// ============================================

const mongoose = require('mongoose');

// Page Section Schema (for drag-drop builder)
const sectionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'hero', 'hero-video', 'hero-slideshow',
      'text', 'text-image', 'text-columns',
      'image', 'image-gallery', 'image-grid',
      'video', 'video-grid',
      'blog-posts', 'blog-featured',
      'testimonials', 'team',
      'pricing', 'features',
      'contact-form', 'newsletter',
      'faq', 'accordion',
      'social-links', 'social-feed',
      'map', 'embed',
      'divider', 'spacer',
      'custom-html'
    ],
    required: true
  },
  content: mongoose.Schema.Types.Mixed,
  settings: {
    backgroundColor: String,
    backgroundImage: String,
    textColor: String,
    padding: { type: String, default: 'medium' },
    alignment: { type: String, default: 'center' },
    animation: String,
    customCss: String
  },
  order: { type: Number, default: 0 }
});

// Page Schema
const pageSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true },
  description: String,
  isHomePage: { type: Boolean, default: false },
  isPublished: { type: Boolean, default: false },
  sections: [sectionSchema],
  seo: {
    title: String,
    description: String,
    keywords: [String],
    ogImage: String
  },
  order: { type: Number, default: 0 }
}, { timestamps: true });

// Main Site Schema
const siteSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Basic Info
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  tagline: {
    type: String,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  category: {
    type: String,
    enum: [
      'personal-blog', 'portfolio', 'business', 'restaurant',
      'photography', 'music', 'art', 'church', 'ministry',
      'podcast', 'magazine', 'news', 'education', 'nonprofit',
      'consultant', 'agency', 'ecommerce', 'other'
    ],
    default: 'personal-blog'
  },

  // Domain Settings
  subdomain: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  customDomain: {
    domain: String,
    verified: { type: Boolean, default: false },
    verificationToken: String,
    sslEnabled: { type: Boolean, default: false },
    verifiedAt: Date
  },

  // Theme & Design
  theme: {
    template: { type: String, default: 'minimal' },
    primaryColor: { type: String, default: '#7c3aed' },
    secondaryColor: { type: String, default: '#ec4899' },
    backgroundColor: { type: String, default: '#ffffff' },
    textColor: { type: String, default: '#1f2937' },
    fontHeading: { type: String, default: 'Inter' },
    fontBody: { type: String, default: 'Inter' },
    borderRadius: { type: String, default: '8px' },
    customCss: String
  },

  // Branding
  branding: {
    logo: String,
    logoAlt: String,
    favicon: String,
    ogImage: String
  },

  // Navigation
  navigation: {
    style: { type: String, enum: ['standard', 'centered', 'sidebar', 'overlay'], default: 'standard' },
    items: [{
      label: String,
      url: String,
      pageId: mongoose.Schema.Types.ObjectId,
      isExternal: Boolean,
      order: Number
    }],
    showSocial: { type: Boolean, default: true }
  },

  // Footer
  footer: {
    content: String,
    showSocial: { type: Boolean, default: true },
    showNewsletter: { type: Boolean, default: false },
    columns: [{
      title: String,
      links: [{
        label: String,
        url: String
      }]
    }],
    copyright: String
  },

  // Social Links
  socialLinks: {
    facebook: String,
    twitter: String,
    instagram: String,
    youtube: String,
    tiktok: String,
    linkedin: String,
    github: String,
    website: String
  },

  // Contact
  contact: {
    email: String,
    phone: String,
    address: String,
    showContactForm: { type: Boolean, default: true }
  },

  // Pages
  pages: [pageSchema],

  // Blog Settings
  blogSettings: {
    enabled: { type: Boolean, default: true },
    postsPerPage: { type: Number, default: 10 },
    showAuthor: { type: Boolean, default: true },
    showDate: { type: Boolean, default: true },
    showComments: { type: Boolean, default: true },
    layout: { type: String, enum: ['grid', 'list', 'magazine'], default: 'grid' }
  },

  // SEO
  seo: {
    title: String,
    description: String,
    keywords: [String],
    googleAnalyticsId: String,
    enableIndexing: { type: Boolean, default: true }
  },

  // Integrations
  integrations: {
    googleAnalytics: String,
    facebookPixel: String,
    mailchimpApiKey: String,
    mailchimpListId: String,
    customScripts: {
      head: String,
      body: String
    }
  },

  // Stats
  stats: {
    views: { type: Number, default: 0 },
    visitors: { type: Number, default: 0 },
    pageViews: { type: Number, default: 0 }
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'published', 'maintenance', 'suspended'],
    default: 'draft'
  },
  publishedAt: Date,

  // AI Generated
  aiGenerated: {
    isAiGenerated: { type: Boolean, default: false },
    prompt: String,
    generatedAt: Date
  }

}, {
  timestamps: true
});

// Indexes
siteSchema.index({ owner: 1 });
siteSchema.index({ subdomain: 1 }, { unique: true, sparse: true });
siteSchema.index({ 'customDomain.domain': 1 }, { sparse: true });
siteSchema.index({ status: 1 });
siteSchema.index({ category: 1 });

// Virtual for full URL
siteSchema.virtual('url').get(function() {
  if (this.customDomain?.verified && this.customDomain?.domain) {
    return `https://${this.customDomain.domain}`;
  }
  if (this.subdomain) {
    return `https://${this.subdomain}.cybev.io`;
  }
  return null;
});

// Pre-save: Generate subdomain from name if not set
siteSchema.pre('save', async function(next) {
  if (!this.subdomain && this.name) {
    let baseSubdomain = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 30);
    
    // Check uniqueness
    let subdomain = baseSubdomain;
    let counter = 1;
    const Site = this.constructor;
    
    while (await Site.findOne({ subdomain, _id: { $ne: this._id } })) {
      subdomain = `${baseSubdomain}-${counter}`;
      counter++;
    }
    
    this.subdomain = subdomain;
  }
  next();
});

// Methods
siteSchema.methods.getHomePage = function() {
  return this.pages.find(p => p.isHomePage) || this.pages[0];
};

siteSchema.methods.getPageBySlug = function(slug) {
  return this.pages.find(p => p.slug === slug);
};

siteSchema.methods.publish = async function() {
  this.status = 'published';
  this.publishedAt = new Date();
  return this.save();
};

// Statics
siteSchema.statics.findByDomain = function(domain) {
  return this.findOne({
    $or: [
      { subdomain: domain },
      { 'customDomain.domain': domain, 'customDomain.verified': true }
    ]
  }).populate('owner', 'name username avatar');
};

module.exports = mongoose.model('Site', siteSchema);
