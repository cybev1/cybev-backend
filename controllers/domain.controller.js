
const Blog = require('../models/blog.model');
const { checkDomainAvailability, registerDomain } = require('../utils/domainnameapi');

exports.registerCustomDomain = async (req, res) => {
  const { userId, domain, title, description, category, niche, template, logo, monetize } = req.body;

  if (!domain || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const availability = await checkDomainAvailability(domain);
    if (!availability.IsAvailable) {
      return res.status(409).json({ error: 'Domain not available' });
    }

    const purchaseResult = await registerDomain(domain);
    if (!purchaseResult.Success) {
      return res.status(500).json({ error: 'Failed to register domain' });
    }

    const blog = new Blog({
      userId,
      subdomain: null,
      domain,
      title,
      description,
      category,
      niche,
      template,
      logo,
      monetize,
      type: 'custom'
    });

    await blog.save();
    res.status(201).json({ message: 'Custom domain registered successfully', blog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
