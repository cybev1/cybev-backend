// ============================================
// FILE: models/site.model.js
// Website/Blog Site Model
// VERSION: 2.0 - Fixed for Website Builder
// Squarespace-like website builder
// ============================================

const mongoose = require('mongoose');

// Page Section Schema (for drag-drop builder) - Made flexible with Mixed
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
      'contact-form', 'newsletter', 'contact',
      'faq', 'accordion',
      'social-links', 'social-feed',
      'map', 'embed',
      'divider', 'spacer',
      'cta', 'footer',
      'custom-html'
    ]
  },
  content: mongoose.Schema.Types.Mixed,
  settings: mongoose.Schema.Types.Mixed,
  order: { type: Number, default: 0 }
}, { _id: false, strict: false });

// Page Schema - Made flexible
const pageSchema = new mongoose.Schema({
  id: String,
  title: String,
  name: String,
  slug: String,
  description: String,
  isHomePage: { type: Boolean, default: false },
  isPublished: { type: Boolean, default: true },
  sections: [sectionSchema],
  blocks: [mongoose.Schema.Types.Mixed], // NEW: Support blocks array
  seo: mongoose.Schema.Types.Mixed,
  order: { type: Number, default: 0 }
}, { timestamps: true, _id: false, strict: false });

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
    maxlength: 2000
  },
  category: {
    type: String,
    enum: [
      'personal-blog', 'portfolio', 'business', 'restaurant',
      'photography', 'music', 'art', 'church', 'ministry',
      'podcast', 'magazine', 'news', 'education', 'nonprofit',
      'consultant', 'agency', 'ecommerce', 'startup', 'saas',
      'community', 'shop', 'blog', 'landing', 'other'
    ],
    default: 'business'
  },

  // Template (NEW)
  template: {
    type: String,
    default: 'business'
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
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Theme & Design - Made flexible with Mixed
  theme: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      template: 'minimal',
      primaryColor: '#7c3aed',
      secondaryColor: '#ec4899',
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      fontHeading: 'Inter',
      fontBody: 'Inter',
      colorTheme: 'purple',
      fontPair: 'modern'
    }
  },

  // Branding
  branding: {
    logo: String,
    logoAlt: String,
    favicon: String,
    ogImage: String
  },

  // NEW: Simple blocks array for website builder
  blocks: [mongoose.Schema.Types.Mixed],

  // Navigation - Made flexible
  navigation: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      style: 'standard',
      items: [],
      showSocial: true
    }
  },

  // Footer - Made flexible
  footer: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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

  // Pages - Made flexible
  pages: [mongoose.Schema.Types.Mixed],

  // Blog Settings
  blogSettings: {
    enabled: { type: Boolean, default: true },
    postsPerPage: { type: Number, default: 10 },
    showAuthor: { type: Boolean, default: true },
    showDate: { type: Boolean, default: true },
    showComments: { type: Boolean, default: true },
    layout: { type: String, enum: ['grid', 'list', 'magazine'], default: 'grid' }
  },

  // SEO - Made flexible
  seo: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // SEO Fields (flat for easy access)
  favicon: String,
  ogImage: String,
  ogTitle: String,
  ogDescription: String,
  googleAnalytics: String,

  // Integrations
  integrations: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Advanced
  customHead: String,
  customCss: String,
  password: String,

  // Stats
  stats: {
    views: { type: Number, default: 0 },
    visitors: { type: Number, default: 0 },
    pageViews: { type: Number, default: 0 }
  },
  views: { type: Number, default: 0 },
  thumbnail: String,

  // Status
  status: {
    type: String,
    enum: ['draft', 'published', 'maintenance', 'suspended', 'archived'],
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
  timestamps: true,
  strict: false // Allow additional fields
});

// Indexes
siteSchema.index({ owner: 1 });
siteSchema.index({ subdomain: 1 }, { unique: true, sparse: true });
siteSchema.index({ 'customDomain.domain': 1 }, { sparse: true });
siteSchema.index({ status: 1 });
siteSchema.index({ category: 1 });
siteSchema.index({ template: 1 });

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
  
  // Sync views
  if (this.stats?.views && !this.views) {
    this.views = this.stats.views;
  }
  
  next();
});

// Methods
siteSchema.methods.getHomePage = function() {
  return this.pages?.find(p => p.isHomePage) || this.pages?.[0];
};

siteSchema.methods.getPageBySlug = function(slug) {
  return this.pages?.find(p => p.slug === slug);
};

siteSchema.methods.publish = async function() {
  this.status = 'published';
  this.publishedAt = new Date();
  return this.save();
};

siteSchema.methods.unpublish = async function() {
  this.status = 'draft';
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

siteSchema.statics.findBySubdomain = function(subdomain) {
  return this.findOne({ subdomain: subdomain.toLowerCase() })
    .populate('owner', 'name username avatar');
};

// Check if model exists before creating
let Site;
try {
  Site = mongoose.model('Site');
} catch {
  Site = mongoose.model('Site', siteSchema);
}

module.exports = Site;
