const mongoose = require('mongoose');

const BlogSiteSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    siteName: { type: String, trim: true, default: 'My CYBEV Blog' },
    tagline: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },

    logoUrl: { type: String, trim: true, default: '' },
    coverImageUrl: { type: String, trim: true, default: '' },

    templateId: { type: String, trim: true, default: 'classic' },

    theme: {
      primaryColor: { type: String, trim: true, default: '#3b82f6' },
      fontFamily: { type: String, trim: true, default: 'system-ui' },
    },

    socialLinks: {
      facebook: { type: String, trim: true, default: '' },
      instagram: { type: String, trim: true, default: '' },
      twitter: { type: String, trim: true, default: '' },
      youtube: { type: String, trim: true, default: '' },
      tiktok: { type: String, trim: true, default: '' },
      website: { type: String, trim: true, default: '' },
    },

    // Optional future use
    customDomain: { type: String, trim: true, default: '' },
    subdomain: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BlogSite', BlogSiteSchema);
