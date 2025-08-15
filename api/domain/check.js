const clientPromise = require('../../lib/mongodb');
const axios = require('axios');

// Domain API configuration
const DOMAIN_API_BASE = 'https://api.domainnameapi.com/api';
const DOMAIN_AUTH = {
  username: process.env.DOMAIN_USERNAME || 'qubwebs',
  password: process.env.DOMAIN_PASSWORD || 'openHEAVEN2024
};

async function checkDomainAvailability(domain) {
  try {
    const url = `${DOMAIN_API_BASE}/whois/domain/check?domainName=${domain}`;
    const response = await axios.get(url, { 
      auth: DOMAIN_AUTH,
      timeout: 10000 
    });
    return {
      available: response.data.IsAvailable,
      price: response.data.Price || 12.99,
      currency: 'USD'
    };
  } catch (error) {
    console.log('Domain API unavailable, using mock response');
    // Return mock data for development
    return {
      available: Math.random() > 0.3, // 70% chance available
      price: 12.99,
      currency: 'USD'
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { domain } = req.query;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }

    // Clean the domain input
    const cleanDomain = domain.toLowerCase().trim();

    // Check if it's a subdomain request (no dots)
    if (!cleanDomain.includes('.')) {
      // Check subdomain availability in database
      const client = await clientPromise;
      const db = client.db();
      
      const existing = await db.collection('blogs').findOne({ 
        subdomain: cleanDomain 
      });
      
      return res.json({
        available: !existing,
        type: 'subdomain',
        fullDomain: `${cleanDomain}.cybev.io`,
        price: 0,
        currency: 'USD'
      });
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(cleanDomain)) {
      return res.status(400).json({ 
        error: 'Invalid domain format',
        available: false 
      });
    }

    // Check custom domain availability
    const result = await checkDomainAvailability(cleanDomain);
    
    res.json({
      available: result.available,
      type: 'custom',
      fullDomain: cleanDomain,
      price: result.price,
      currency: result.currency,
      registrar: 'DomainNameAPI'
    });

  } catch (error) {
    console.error('Domain check error:', error);
    res.status(500).json({ 
      error: 'Domain check failed',
      available: false 
    });
  }
}