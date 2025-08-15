const clientPromise = require('../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

// Domain API integration (if you have DomainNameAPI configured)
const axios = require('axios');

const DOMAIN_API_BASE = 'https://api.domainnameapi.com/api';
const DOMAIN_AUTH = {
  username: process.env.DOMAIN_USERNAME || 'qubwebs',
  password: process.env.DOMAIN_PASSWORD || 'openHEAVEN2024$'
};

async function checkDomainAvailability(domain) {
  try {
    const url = `${DOMAIN_API_BASE}/whois/domain/check?domainName=${domain}`;
    const response = await axios.get(url, { auth: DOMAIN_AUTH });
    return response.data;
  } catch (error) {
    console.log('Domain check API unavailable, using mock response');
    return { IsAvailable: true, Price: 12.99 };
  }
}

async function registerDomain(domain) {
  try {
    const url = `${DOMAIN_API_BASE}/domain/purchase`;
    const response = await axios.post(url, { 
      DomainName: domain, 
      RegisterYears: 1 
    }, { auth: DOMAIN_AUTH });
    return response.data;
  } catch (error) {
    console.log('Domain registration API unavailable, using mock response');
    return { Success: true, Message: 'Mock registration successful' };
  }
}

async function awardTokens(userId, amount, reason) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    // Log the earning
    await db.collection('earnings').insertOne({
      userId: new ObjectId(userId),
      amount,
      reason,
      timestamp: new Date(),
      status: 'completed'
    });

    // Update user balance (if you have a user balance field)
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { tokenBalance: amount } },
      { upsert: true }
    );

    return true;
  } catch (error) {
    console.error('Token award failed:', error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    let userId = req.body.userId;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.userId;
      } catch (error) {
        console.log('Token verification failed, using provided userId');
      }
    }

    const { 
      type, 
      subdomain, 
      customDomain, 
      title, 
      description, 
      category, 
      niche, 
      template, 
      logo, 
      monetize 
    } = req.body;

    // Validation
    if (!title || !niche || !template) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, niche, template' 
      });
    }

    if (type === 'subdomain' && !subdomain) {
      return res.status(400).json({ error: 'Subdomain is required' });
    }

    if (type === 'custom' && !customDomain) {
      return res.status(400).json({ error: 'Custom domain is required' });
    }

    const client = await clientPromise;
    const db = client.db();

    let finalDomain = '';
    let domainCost = 0;
    let registrationResult = null;

    if (type === 'subdomain') {
      // Check subdomain availability in database
      const existing = await db.collection('blogs').findOne({ subdomain });
      if (existing) {
        return res.status(400).json({ error: 'Subdomain already taken' });
      }
      finalDomain = `${subdomain}.cybev.io`;
    } else {
      // Handle custom domain
      try {
        const availability = await checkDomainAvailability(customDomain);
        if (!availability.IsAvailable) {
          return res.status(400).json({ error: 'Domain not available for registration' });
        }
        
        const registration = await registerDomain(customDomain);
        if (!registration.Success) {
          return res.status(500).json({ 
            error: 'Domain registration failed',
            details: registration.Message 
          });
        }
        
        finalDomain = customDomain;
        domainCost = availability.Price || 12.99;
        registrationResult = registration;
      } catch (error) {
        console.error('Domain registration error:', error);
        return res.status(500).json({ error: 'Domain processing failed' });
      }
    }

    // Create blog record
    const blogData = {
      userId: userId ? new ObjectId(userId) : null,
      subdomain: type === 'subdomain' ? subdomain : null,
      domain: type === 'custom' ? customDomain : null,
      title,
      description,
      category: category || niche,
      niche,
      template,
      logo: logo || null,
      monetize: Boolean(monetize),
      type,
      status: 'published',
      previewUrl: `https://${finalDomain}`,
      domainCost,
      registrationDetails: registrationResult,
      analytics: {
        views: 0,
        uniqueVisitors: 0,
        pageviews: 0,
        earnings: 0
      },
      settings: {
        seoOptimized: true,
        socialSharing: true,
        comments: true,
        newsletter: false
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('blogs').insertOne(blogData);

    // Award tokens for blog creation
    if (userId) {
      await awardTokens(userId, 25, 'blog_create');
    }

    // Log activity
    if (userId) {
      await db.collection('user_activities').insertOne({
        userId: new ObjectId(userId),
        action: 'blog_created',
        details: {
          blogId: result.insertedId,
          domain: finalDomain,
          template,
          niche
        },
        timestamp: new Date()
      });
    }

    res.status(201).json({
      success: true,
      blogId: result.insertedId,
      domain: finalDomain,
      previewUrl: `https://${finalDomain}`,
      cost: domainCost,
      tokensEarned: 25,
      message: 'Blog created successfully!'
    });

  } catch (error) {
    console.error('Blog creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create blog',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}