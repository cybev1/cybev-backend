// ============================================
// FILE: routes/ai-site.routes.js
// AI Site Generation with Images
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Import AI service
let aiService;
try {
  aiService = require('../services/ai.service');
} catch (e) {
  console.log('AI service not found, using fallback');
}

// Import middleware
let verifyToken;
try {
  verifyToken = require('../middleware/auth.middleware');
  if (verifyToken.verifyToken) verifyToken = verifyToken.verifyToken;
} catch (e) {
  verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: 'No token' });
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret');
      next();
    } catch (err) {
      res.status(401).json({ ok: false, error: 'Invalid token' });
    }
  };
}

const getSitesCollection = () => mongoose.connection.db.collection('sites');

// Pexels/Unsplash image search
async function searchImage(query, orientation = 'landscape') {
  try {
    // Try Pexels first
    if (process.env.PEXELS_API_KEY) {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`,
        { headers: { Authorization: process.env.PEXELS_API_KEY } }
      );
      const data = await res.json();
      if (data.photos?.length) {
        return data.photos[0].src.large2x || data.photos[0].src.large;
      }
    }
    
    // Try Unsplash
    if (process.env.UNSPLASH_ACCESS_KEY) {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`,
        { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }
      );
      const data = await res.json();
      if (data.results?.length) {
        return data.results[0].urls.regular;
      }
    }
    
    // Fallback to placeholder
    return `https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=800&fit=crop`;
  } catch (err) {
    console.error('Image search error:', err);
    return null;
  }
}

// Generate AI content for site
async function generateSiteContent(prompt, template) {
  const templatePrompts = {
    business: 'professional business company corporate services',
    portfolio: 'creative designer artist portfolio showcase work',
    blog: 'writer blogger content creator articles stories',
    shop: 'ecommerce store products shopping retail',
    startup: 'tech startup innovation product launch',
    saas: 'software app platform technology solution',
    music: 'musician artist band music entertainment',
    community: 'community group organization members social'
  };
  
  const context = templatePrompts[template] || 'website';
  const fullPrompt = `${prompt} ${context}`;
  
  // Get relevant images
  const heroImage = await searchImage(fullPrompt, 'landscape');
  const featureImages = await Promise.all([
    searchImage(`${prompt} innovation`, 'square'),
    searchImage(`${prompt} quality`, 'square'),
    searchImage(`${prompt} team`, 'square')
  ]);
  const galleryImages = await Promise.all([
    searchImage(`${prompt} work 1`, 'landscape'),
    searchImage(`${prompt} work 2`, 'landscape'),
    searchImage(`${prompt} work 3`, 'landscape'),
    searchImage(`${prompt} work 4`, 'landscape')
  ]);
  const testimonialAvatars = [
    'https://randomuser.me/api/portraits/men/32.jpg',
    'https://randomuser.me/api/portraits/women/44.jpg',
    'https://randomuser.me/api/portraits/men/67.jpg'
  ];
  
  return {
    heroImage,
    featureImages: featureImages.filter(Boolean),
    galleryImages: galleryImages.filter(Boolean),
    testimonialAvatars
  };
}

// Template-specific block generators
function generateBlocks(template, siteName, description, images) {
  const blocks = [];
  
  // Hero Block - Always first
  blocks.push({
    id: `block-${Date.now()}-hero`,
    type: 'hero',
    content: {
      title: getHeroTitle(template, siteName),
      subtitle: getHeroSubtitle(template, description),
      buttonText: getButtonText(template),
      buttonLink: '#contact',
      backgroundImage: images.heroImage,
      align: 'center',
      overlay: true
    }
  });
  
  // Template-specific blocks
  switch (template) {
    case 'business':
      blocks.push(
        createFeaturesBlock(images, 'business'),
        createServicesBlock(),
        createTestimonialsBlock(images.testimonialAvatars),
        createStatsBlock(),
        createCtaBlock('Ready to grow your business?', 'Partner with us today'),
        createContactBlock(),
        createFooterBlock(siteName)
      );
      break;
      
    case 'portfolio':
      blocks.push(
        createAboutBlock(),
        createGalleryBlock(images.galleryImages, 'My Work'),
        createSkillsBlock(),
        createTestimonialsBlock(images.testimonialAvatars),
        createCtaBlock('Let\'s work together', 'Have a project in mind?'),
        createContactBlock(),
        createFooterBlock(siteName)
      );
      break;
      
    case 'blog':
      blocks.push(
        createAboutBlock(),
        createFeaturedPostsBlock(images.galleryImages),
        createNewsletterBlock(),
        createCtaBlock('Join 10,000+ readers', 'Get weekly insights delivered'),
        createFooterBlock(siteName)
      );
      break;
      
    case 'shop':
      blocks.push(
        createFeaturesBlock(images, 'shop'),
        createProductsBlock(images.galleryImages),
        createTestimonialsBlock(images.testimonialAvatars),
        createCtaBlock('Shop Now', 'Free shipping on orders over $50'),
        createFooterBlock(siteName)
      );
      break;
      
    case 'startup':
      blocks.push(
        createFeaturesBlock(images, 'startup'),
        createHowItWorksBlock(),
        createPricingBlock(),
        createTestimonialsBlock(images.testimonialAvatars),
        createCtaBlock('Ready to get started?', 'Join thousands of happy users'),
        createFooterBlock(siteName)
      );
      break;
      
    case 'saas':
      blocks.push(
        createFeaturesBlock(images, 'saas'),
        createIntegrationsBlock(),
        createPricingBlock(),
        createFaqBlock(),
        createCtaBlock('Start your free trial', 'No credit card required'),
        createFooterBlock(siteName)
      );
      break;
      
    case 'music':
      blocks.push(
        createMusicPlayerBlock(),
        createGalleryBlock(images.galleryImages, 'Gallery'),
        createTourDatesBlock(),
        createNewsletterBlock(),
        createCtaBlock('Get exclusive content', 'Join the fan club'),
        createFooterBlock(siteName)
      );
      break;
      
    case 'community':
      blocks.push(
        createFeaturesBlock(images, 'community'),
        createStatsBlock(),
        createTestimonialsBlock(images.testimonialAvatars),
        createEventsBlock(),
        createCtaBlock('Join our community', 'Connect with like-minded people'),
        createFooterBlock(siteName)
      );
      break;
      
    default:
      blocks.push(
        createFeaturesBlock(images, 'business'),
        createCtaBlock('Get Started Today', 'Join us now'),
        createContactBlock(),
        createFooterBlock(siteName)
      );
  }
  
  return blocks;
}

// Block creators
function getHeroTitle(template, siteName) {
  const titles = {
    business: `Welcome to ${siteName}`,
    portfolio: `Hi, I'm ${siteName}`,
    blog: `${siteName}`,
    shop: `Discover ${siteName}`,
    startup: `${siteName}`,
    saas: `${siteName}`,
    music: siteName,
    community: `Welcome to ${siteName}`
  };
  return titles[template] || `Welcome to ${siteName}`;
}

function getHeroSubtitle(template, description) {
  if (description) return description;
  const subtitles = {
    business: 'Professional solutions for modern enterprises',
    portfolio: 'Creative Designer & Developer',
    blog: 'Thoughts, stories and ideas',
    shop: 'Quality products, exceptional service',
    startup: 'The future starts here',
    saas: 'Streamline your workflow',
    music: 'New album out now',
    community: 'Connect, learn, grow together'
  };
  return subtitles[template] || 'Create amazing experiences';
}

function getButtonText(template) {
  const buttons = {
    business: 'Get Started',
    portfolio: 'View My Work',
    blog: 'Read Latest',
    shop: 'Shop Now',
    startup: 'Get Early Access',
    saas: 'Start Free Trial',
    music: 'Listen Now',
    community: 'Join Us'
  };
  return buttons[template] || 'Learn More';
}

function createFeaturesBlock(images, type) {
  const featuresByType = {
    business: [
      { icon: 'briefcase', title: 'Expert Team', description: 'Industry professionals with years of experience' },
      { icon: 'shield', title: 'Trusted Partner', description: 'Reliable service you can count on' },
      { icon: 'trending-up', title: 'Growth Focused', description: 'Strategies that drive real results' }
    ],
    shop: [
      { icon: 'truck', title: 'Free Shipping', description: 'On orders over $50' },
      { icon: 'refresh-cw', title: 'Easy Returns', description: '30-day money back guarantee' },
      { icon: 'lock', title: 'Secure Payment', description: 'Your data is protected' }
    ],
    startup: [
      { icon: 'zap', title: 'Lightning Fast', description: 'Built for speed and performance' },
      { icon: 'shield', title: 'Secure', description: 'Enterprise-grade security' },
      { icon: 'users', title: 'Team Ready', description: 'Collaborate seamlessly' }
    ],
    saas: [
      { icon: 'cloud', title: 'Cloud Based', description: 'Access from anywhere' },
      { icon: 'cpu', title: 'AI Powered', description: 'Smart automation' },
      { icon: 'bar-chart', title: 'Analytics', description: 'Deep insights' }
    ],
    community: [
      { icon: 'users', title: '10K+ Members', description: 'Growing community' },
      { icon: 'message-circle', title: 'Active Forums', description: 'Daily discussions' },
      { icon: 'calendar', title: 'Weekly Events', description: 'Connect in person' }
    ]
  };
  
  return {
    id: `block-${Date.now()}-features`,
    type: 'features',
    content: {
      title: 'Why Choose Us',
      subtitle: 'Everything you need to succeed',
      items: featuresByType[type] || featuresByType.business,
      images: images.featureImages
    }
  };
}

function createServicesBlock() {
  return {
    id: `block-${Date.now()}-services`,
    type: 'services',
    content: {
      title: 'Our Services',
      items: [
        { icon: 'code', title: 'Development', description: 'Custom solutions built for your needs' },
        { icon: 'palette', title: 'Design', description: 'Beautiful interfaces that convert' },
        { icon: 'megaphone', title: 'Marketing', description: 'Strategies that drive growth' },
        { icon: 'headphones', title: 'Support', description: '24/7 dedicated assistance' }
      ]
    }
  };
}

function createTestimonialsBlock(avatars) {
  return {
    id: `block-${Date.now()}-testimonials`,
    type: 'testimonials',
    content: {
      title: 'What Our Customers Say',
      items: [
        { name: 'John Smith', role: 'CEO, TechCorp', quote: 'Absolutely amazing service! Exceeded all expectations.', avatar: avatars[0] },
        { name: 'Sarah Johnson', role: 'Marketing Director', quote: 'The best decision we made for our business.', avatar: avatars[1] },
        { name: 'Michael Chen', role: 'Startup Founder', quote: 'Professional, reliable, and results-driven.', avatar: avatars[2] }
      ]
    }
  };
}

function createStatsBlock() {
  return {
    id: `block-${Date.now()}-stats`,
    type: 'stats',
    content: {
      items: [
        { value: '10K+', label: 'Happy Customers' },
        { value: '500+', label: 'Projects Completed' },
        { value: '99%', label: 'Satisfaction Rate' },
        { value: '24/7', label: 'Support' }
      ]
    }
  };
}

function createCtaBlock(title, subtitle) {
  return {
    id: `block-${Date.now()}-cta`,
    type: 'cta',
    content: {
      title,
      description: subtitle,
      buttonText: 'Get Started',
      buttonLink: '#contact'
    }
  };
}

function createContactBlock() {
  return {
    id: `block-${Date.now()}-contact`,
    type: 'contact',
    content: {
      title: 'Get in Touch',
      email: 'hello@example.com',
      phone: '+1 (555) 123-4567',
      address: '123 Business Street, City, Country',
      showForm: true
    }
  };
}

function createFooterBlock(siteName) {
  return {
    id: `block-${Date.now()}-footer`,
    type: 'footer',
    content: {
      logo: siteName,
      copyright: `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`,
      links: [
        { label: 'Privacy Policy', url: '/privacy' },
        { label: 'Terms of Service', url: '/terms' },
        { label: 'Contact', url: '#contact' }
      ],
      social: {
        twitter: '#',
        facebook: '#',
        instagram: '#',
        linkedin: '#'
      }
    }
  };
}

function createAboutBlock() {
  return {
    id: `block-${Date.now()}-about`,
    type: 'about',
    content: {
      title: 'About Me',
      text: 'I\'m a passionate creator dedicated to crafting exceptional experiences. With years of expertise and a commitment to excellence, I help bring visions to life.',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop'
    }
  };
}

function createGalleryBlock(images, title) {
  return {
    id: `block-${Date.now()}-gallery`,
    type: 'gallery',
    content: {
      title,
      images: images.map((src, i) => ({
        src,
        alt: `Project ${i + 1}`,
        title: `Project ${i + 1}`
      }))
    }
  };
}

function createSkillsBlock() {
  return {
    id: `block-${Date.now()}-skills`,
    type: 'skills',
    content: {
      title: 'My Skills',
      items: [
        { name: 'Design', level: 95 },
        { name: 'Development', level: 90 },
        { name: 'Marketing', level: 85 },
        { name: 'Strategy', level: 88 }
      ]
    }
  };
}

function createFeaturedPostsBlock(images) {
  return {
    id: `block-${Date.now()}-posts`,
    type: 'blog-posts',
    content: {
      title: 'Latest Articles',
      posts: [
        { title: '10 Tips for Success', excerpt: 'Learn the secrets to achieving your goals...', image: images[0], date: 'Jan 5, 2026' },
        { title: 'The Future of Technology', excerpt: 'Exploring what\'s next in the tech world...', image: images[1], date: 'Jan 3, 2026' },
        { title: 'Building Better Habits', excerpt: 'Transform your life one habit at a time...', image: images[2], date: 'Jan 1, 2026' }
      ]
    }
  };
}

function createNewsletterBlock() {
  return {
    id: `block-${Date.now()}-newsletter`,
    type: 'newsletter',
    content: {
      title: 'Stay Updated',
      description: 'Get the latest news and updates delivered to your inbox.',
      placeholder: 'Enter your email',
      buttonText: 'Subscribe'
    }
  };
}

function createProductsBlock(images) {
  return {
    id: `block-${Date.now()}-products`,
    type: 'products',
    content: {
      title: 'Featured Products',
      items: [
        { name: 'Premium Package', price: '$99', image: images[0], badge: 'Best Seller' },
        { name: 'Standard Package', price: '$49', image: images[1] },
        { name: 'Basic Package', price: '$29', image: images[2] },
        { name: 'Starter Pack', price: '$19', image: images[3] }
      ]
    }
  };
}

function createHowItWorksBlock() {
  return {
    id: `block-${Date.now()}-howitworks`,
    type: 'how-it-works',
    content: {
      title: 'How It Works',
      steps: [
        { number: '1', title: 'Sign Up', description: 'Create your free account in seconds' },
        { number: '2', title: 'Configure', description: 'Set up your preferences and settings' },
        { number: '3', title: 'Launch', description: 'Go live and start seeing results' }
      ]
    }
  };
}

function createPricingBlock() {
  return {
    id: `block-${Date.now()}-pricing`,
    type: 'pricing',
    content: {
      title: 'Simple Pricing',
      subtitle: 'Choose the plan that works for you',
      plans: [
        { name: 'Starter', price: '$9', period: '/month', features: ['5 Projects', '1GB Storage', 'Email Support'], buttonText: 'Get Started' },
        { name: 'Pro', price: '$29', period: '/month', features: ['Unlimited Projects', '10GB Storage', 'Priority Support', 'Analytics'], buttonText: 'Get Started', featured: true },
        { name: 'Enterprise', price: '$99', period: '/month', features: ['Everything in Pro', 'Unlimited Storage', '24/7 Support', 'Custom Integrations'], buttonText: 'Contact Sales' }
      ]
    }
  };
}

function createFaqBlock() {
  return {
    id: `block-${Date.now()}-faq`,
    type: 'faq',
    content: {
      title: 'Frequently Asked Questions',
      items: [
        { question: 'How do I get started?', answer: 'Simply sign up for a free account and follow our quick setup guide.' },
        { question: 'Can I cancel anytime?', answer: 'Yes, you can cancel your subscription at any time with no penalties.' },
        { question: 'Is there a free trial?', answer: 'Yes! All plans come with a 14-day free trial.' },
        { question: 'Do you offer support?', answer: 'We offer 24/7 support via chat, email, and phone for all customers.' }
      ]
    }
  };
}

function createIntegrationsBlock() {
  return {
    id: `block-${Date.now()}-integrations`,
    type: 'integrations',
    content: {
      title: 'Integrations',
      subtitle: 'Works with the tools you love',
      logos: ['Slack', 'Google', 'Dropbox', 'Stripe', 'Zapier', 'Notion']
    }
  };
}

function createMusicPlayerBlock() {
  return {
    id: `block-${Date.now()}-player`,
    type: 'music-player',
    content: {
      title: 'Latest Tracks',
      tracks: [
        { title: 'Track One', duration: '3:45' },
        { title: 'Track Two', duration: '4:12' },
        { title: 'Track Three', duration: '3:58' }
      ],
      streamingLinks: {
        spotify: '#',
        apple: '#',
        youtube: '#'
      }
    }
  };
}

function createTourDatesBlock() {
  return {
    id: `block-${Date.now()}-tour`,
    type: 'tour-dates',
    content: {
      title: 'Upcoming Shows',
      dates: [
        { date: 'Jan 15, 2026', venue: 'Madison Square Garden', city: 'New York, NY', ticketLink: '#' },
        { date: 'Jan 22, 2026', venue: 'The Forum', city: 'Los Angeles, CA', ticketLink: '#' },
        { date: 'Feb 5, 2026', venue: 'O2 Arena', city: 'London, UK', ticketLink: '#' }
      ]
    }
  };
}

function createEventsBlock() {
  return {
    id: `block-${Date.now()}-events`,
    type: 'events',
    content: {
      title: 'Upcoming Events',
      events: [
        { title: 'Monthly Meetup', date: 'Jan 20, 2026', time: '6:00 PM', location: 'Virtual' },
        { title: 'Workshop: Getting Started', date: 'Jan 25, 2026', time: '2:00 PM', location: 'Virtual' },
        { title: 'Annual Conference', date: 'Feb 15, 2026', time: '9:00 AM', location: 'San Francisco, CA' }
      ]
    }
  };
}

// ==========================================
// POST /api/ai/generate-site - Generate AI site content
// ==========================================
router.post('/generate-site', verifyToken, async (req, res) => {
  try {
    const { prompt, template } = req.body;
    
    console.log('🤖 Generating AI site:', prompt, template);
    
    // Generate images and content
    const images = await generateSiteContent(prompt, template || 'business');
    
    // Generate site name from prompt
    const words = prompt.split(' ').slice(0, 3);
    const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    
    // Generate subdomain
    const subdomain = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    
    // Suggest template based on keywords
    let suggestedTemplate = template || 'business';
    const promptLower = prompt.toLowerCase();
    if (promptLower.includes('portfolio') || promptLower.includes('designer') || promptLower.includes('artist')) {
      suggestedTemplate = 'portfolio';
    } else if (promptLower.includes('blog') || promptLower.includes('writer')) {
      suggestedTemplate = 'blog';
    } else if (promptLower.includes('shop') || promptLower.includes('store') || promptLower.includes('product')) {
      suggestedTemplate = 'shop';
    } else if (promptLower.includes('startup') || promptLower.includes('launch')) {
      suggestedTemplate = 'startup';
    } else if (promptLower.includes('software') || promptLower.includes('saas') || promptLower.includes('app')) {
      suggestedTemplate = 'saas';
    } else if (promptLower.includes('music') || promptLower.includes('band') || promptLower.includes('artist')) {
      suggestedTemplate = 'music';
    } else if (promptLower.includes('community') || promptLower.includes('group') || promptLower.includes('club')) {
      suggestedTemplate = 'community';
    }
    
    // Generate description
    const description = `${name} - ${getHeroSubtitle(suggestedTemplate)}`;
    
    // Generate blocks
    const blocks = generateBlocks(suggestedTemplate, name, description, images);
    
    res.json({
      ok: true,
      suggestion: {
        name,
        subdomain,
        description,
        template: suggestedTemplate,
        colorTheme: 'purple',
        blocks,
        heroImage: images.heroImage
      }
    });
    
  } catch (err) {
    console.error('Generate site error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// POST /api/ai/create-site - Create site with AI content
// ==========================================
router.post('/create-site', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const { name, subdomain, description, template, theme, prompt } = req.body;
    
    console.log('🤖 Creating AI site:', name, subdomain);
    
    if (!name || !subdomain) {
      return res.status(400).json({ ok: false, error: 'Name and subdomain required' });
    }
    
    // Check subdomain
    const existing = await getSitesCollection().findOne({ subdomain: subdomain.toLowerCase() });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Subdomain already taken' });
    }
    
    // Generate AI content
    const images = await generateSiteContent(prompt || name, template || 'business');
    const blocks = generateBlocks(template || 'business', name, description, images);
    
    // Create site
    const doc = {
      owner: new ObjectId(userId),
      name: name.trim(),
      description: (description || '').trim(),
      subdomain: subdomain.toLowerCase().trim(),
      template: template || 'business',
      status: 'draft',
      theme: theme || { colorTheme: 'purple', fontPair: 'modern' },
      blocks,
      pages: [{ id: 'home', name: 'Home', slug: '/', blocks }],
      views: 0,
      aiGenerated: {
        isAiGenerated: true,
        prompt: prompt || name,
        generatedAt: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await getSitesCollection().insertOne(doc);
    
    if (result.insertedId) {
      const site = await getSitesCollection().findOne({ _id: result.insertedId });
      console.log('✅ AI Site created:', site.subdomain);
      res.status(201).json({ ok: true, site });
    } else {
      throw new Error('Insert failed');
    }
  } catch (err) {
    console.error('Create AI site error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('✅ AI Site routes loaded');

module.exports = router;
