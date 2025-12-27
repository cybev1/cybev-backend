const mongoose = require('mongoose');

const blogSiteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true, unique: true },

    description: { type: String, trim: true, maxlength: 280, default: '' },

    templateKey: { type: String, trim: true, default: 'minimal' },

    branding: {
      logoUrl: { type: String, trim: true, default: '' },
      coverImageUrl: { type: String, trim: true, default: '' },
      primaryColor: { type: String, trim: true, default: '' }
    },

    domain: {
      subdomain: { type: String, trim: true, lowercase: true, default: '' },
      customDomain: { type: String, trim: true, lowercase: true, default: '' },
      verified: { type: Boolean, default: false }
    },

    isPublished: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Index for public lookup
blogSiteSchema.index({ slug: 1 });
blogSiteSchema.index({ 'domain.subdomain': 1 });
blogSiteSchema.index({ 'domain.customDomain': 1 });

module.exports = mongoose.model('BlogSite', blogSiteSchema);
