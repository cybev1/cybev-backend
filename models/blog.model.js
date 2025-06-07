
const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  subdomain: { type: String, required: true, unique: true },
  title: String,
  description: String,
  category: String,
  niche: String,
  template: String,
  logo: String,
  monetize: Boolean,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Blog', blogSchema);
