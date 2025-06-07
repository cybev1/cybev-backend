
const Blog = require('../models/blog.model');

exports.registerSubdomain = async (req, res) => {
  const { userId, subdomain, title, description, category, niche, template, logo, monetize } = req.body;

  if (!subdomain || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = await Blog.findOne({ subdomain });
  if (existing) {
    return res.status(409).json({ error: 'Subdomain already taken' });
  }

  const blog = new Blog({
    userId,
    subdomain,
    title,
    description,
    category,
    niche,
    template,
    logo,
    monetize
  });

  await blog.save();
  return res.status(201).json({ message: 'Subdomain registered successfully', blog });
};
