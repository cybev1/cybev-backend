
const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  subdomain: { type: String, unique: true, sparse: true },
  domain: { type: String, unique: true, sparse: true },
  title: String,
  description: String,
  category: String,
  niche: String,
  template: String,
  logo: String,
  monetize: Boolean,
  status: { type: String, default: 'published' },
  previewUrl: String,
  type: { type: String, enum: ['subdomain', 'custom'], default: 'subdomain' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Blog', blogSchema);
