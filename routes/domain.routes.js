// ============================================
// FILE: routes/domain.routes.js
// Domain Management Routes (DomainNameAPI.com)
// VERSION: 2.0
// Full domain registration, DNS, transfer support
// ============================================

const express = require('express');
const router = express.Router();

// Get domain service
let domainService;
try {
  domainService = require('../services/domain.service');
} catch (err) {
  console.log('Domain service not found, using fallback');
}

// Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// ==========================================
// DOMAIN AVAILABILITY & SEARCH
// ==========================================

/**
 * Check domain availability
 * GET /api/domains/check?domain=example.com
 */
router.get('/check', async (req, res) => {
  try {
    const { domain } = req.query;
    
    if (!domain) {
      return res.status(400).json({ ok: false, error: 'Domain required' });
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ ok: false, error: 'Invalid domain format' });
    }

    if (!domainService || !domainService.isConfigured()) {
      // Fallback: Just validate format
      return res.json({ 
        ok: true, 
        available: true, 
        domain,
        note: 'Domain API not configured - availability not verified'
      });
    }

    const result = await domainService.checkAvailability(domain.toLowerCase());
    
    res.json({
      ok: true,
      domain: domain.toLowerCase(),
      available: result.available,
      premium: result.premium || false,
      price: result.price,
      error: result.error
    });
  } catch (error) {
    console.error('Check domain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Search/suggest domains
 * GET /api/domains/search?keyword=mybrand
 */
router.get('/search', async (req, res) => {
  try {
    const { keyword, tlds } = req.query;
    
    if (!keyword || keyword.length < 2) {
      return res.status(400).json({ ok: false, error: 'Keyword must be at least 2 characters' });
    }

    // Clean keyword
    const cleanKeyword = keyword.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    if (!domainService || !domainService.isConfigured()) {
      // Generate suggestions without API check
      const defaultTlds = ['com', 'io', 'net', 'org', 'co'];
      const suggestions = defaultTlds.map(tld => ({
        domain: `${cleanKeyword}.${tld}`,
        tld,
        available: null,
        price: null
      }));
      return res.json({ ok: true, suggestions, note: 'Availability not verified' });
    }

    const tldList = tlds ? tlds.split(',') : ['com', 'io', 'net', 'org', 'co'];
    const suggestions = await domainService.suggestDomains(cleanKeyword, tldList);
    
    res.json({ ok: true, suggestions });
  } catch (error) {
    console.error('Search domains error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get TLD pricing
 * GET /api/domains/pricing
 */
router.get('/pricing', async (req, res) => {
  try {
    if (!domainService || !domainService.isConfigured()) {
      // Return default pricing
      return res.json({
        ok: true,
        pricing: [
          { tld: 'com', registration: 12.99, renewal: 14.99, currency: 'USD' },
          { tld: 'io', registration: 39.99, renewal: 39.99, currency: 'USD' },
          { tld: 'net', registration: 12.99, renewal: 14.99, currency: 'USD' },
          { tld: 'org', registration: 12.99, renewal: 14.99, currency: 'USD' },
          { tld: 'co', registration: 29.99, renewal: 29.99, currency: 'USD' }
        ],
        note: 'Default pricing - API not configured'
      });
    }

    const pricing = await domainService.getAllTLDs();
    res.json({ ok: true, pricing });
  } catch (error) {
    console.error('Get pricing error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// DOMAIN REGISTRATION
// ==========================================

/**
 * Register a new domain
 * POST /api/domains/register
 */
router.post('/register', verifyToken, async (req, res) => {
  try {
    const { domain, years = 1, contact } = req.body;
    
    if (!domain) {
      return res.status(400).json({ ok: false, error: 'Domain required' });
    }

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ 
        ok: false, 
        error: 'Domain registration not available - API not configured' 
      });
    }

    // First check availability
    const availability = await domainService.checkAvailability(domain.toLowerCase());
    if (!availability.available) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Domain is not available for registration' 
      });
    }

    // Register the domain
    const result = await domainService.registerDomain(
      domain.toLowerCase(),
      years,
      contact
    );

    if (result.success) {
      // Log the registration
      console.log(`Domain registered: ${domain} for user ${req.user.id}`);
      
      res.json({
        ok: true,
        domain: result.domain,
        orderId: result.orderId,
        expirationDate: result.expirationDate,
        status: result.status
      });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Register domain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Renew a domain
 * POST /api/domains/renew
 */
router.post('/renew', verifyToken, async (req, res) => {
  try {
    const { domain, years = 1 } = req.body;
    
    if (!domain) {
      return res.status(400).json({ ok: false, error: 'Domain required' });
    }

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.renewDomain(domain.toLowerCase(), years);
    
    if (result.success) {
      res.json({
        ok: true,
        domain: result.domain,
        newExpirationDate: result.newExpirationDate
      });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Renew domain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// DOMAIN INFO & MANAGEMENT
// ==========================================

/**
 * Get domain info
 * GET /api/domains/info/:domain
 */
router.get('/info/:domain', verifyToken, async (req, res) => {
  try {
    const { domain } = req.params;
    
    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const info = await domainService.getDomainInfo(domain.toLowerCase());
    
    if (info) {
      res.json({ ok: true, domain: info });
    } else {
      res.status(404).json({ ok: false, error: 'Domain not found' });
    }
  } catch (error) {
    console.error('Get domain info error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Get user's domains
 * GET /api/domains/my-domains
 */
router.get('/my-domains', verifyToken, async (req, res) => {
  try {
    if (!domainService || !domainService.isConfigured()) {
      return res.json({ ok: true, domains: [], note: 'Domain API not configured' });
    }

    const domains = await domainService.getMyDomains();
    res.json({ ok: true, domains });
  } catch (error) {
    console.error('Get my domains error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Update nameservers
 * PUT /api/domains/:domain/nameservers
 */
router.put('/:domain/nameservers', verifyToken, async (req, res) => {
  try {
    const { domain } = req.params;
    const { nameservers } = req.body;
    
    if (!nameservers || !Array.isArray(nameservers) || nameservers.length < 2) {
      return res.status(400).json({ ok: false, error: 'At least 2 nameservers required' });
    }

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.updateNameservers(domain.toLowerCase(), nameservers);
    
    if (result.success) {
      res.json({ ok: true, message: 'Nameservers updated' });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Update nameservers error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Lock/Unlock domain
 * PUT /api/domains/:domain/lock
 */
router.put('/:domain/lock', verifyToken, async (req, res) => {
  try {
    const { domain } = req.params;
    const { lock = true } = req.body;

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.setDomainLock(domain.toLowerCase(), lock);
    
    if (result.success) {
      res.json({ ok: true, message: lock ? 'Domain locked' : 'Domain unlocked' });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Set domain lock error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Set auto-renew
 * PUT /api/domains/:domain/auto-renew
 */
router.put('/:domain/auto-renew', verifyToken, async (req, res) => {
  try {
    const { domain } = req.params;
    const { enable = true } = req.body;

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.setAutoRenew(domain.toLowerCase(), enable);
    
    if (result.success) {
      res.json({ ok: true, message: enable ? 'Auto-renew enabled' : 'Auto-renew disabled' });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Set auto-renew error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// DNS MANAGEMENT
// ==========================================

/**
 * Get DNS records
 * GET /api/domains/:domain/dns
 */
router.get('/:domain/dns', verifyToken, async (req, res) => {
  try {
    const { domain } = req.params;

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const records = await domainService.getDNSRecords(domain.toLowerCase());
    res.json({ ok: true, records });
  } catch (error) {
    console.error('Get DNS records error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Add DNS record
 * POST /api/domains/:domain/dns
 */
router.post('/:domain/dns', verifyToken, async (req, res) => {
  try {
    const { domain } = req.params;
    const { type, name, value, ttl = 3600, priority = 0 } = req.body;
    
    if (!type || !name || !value) {
      return res.status(400).json({ ok: false, error: 'Type, name, and value required' });
    }

    const validTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({ ok: false, error: 'Invalid record type' });
    }

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.addDNSRecord(domain.toLowerCase(), {
      type: type.toUpperCase(),
      name,
      value,
      ttl,
      priority
    });
    
    if (result.success) {
      res.json({ ok: true, recordId: result.recordId });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Add DNS record error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Delete DNS record
 * DELETE /api/domains/:domain/dns/:recordId
 */
router.delete('/:domain/dns/:recordId', verifyToken, async (req, res) => {
  try {
    const { domain, recordId } = req.params;

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.deleteDNSRecord(domain.toLowerCase(), recordId);
    
    if (result.success) {
      res.json({ ok: true, message: 'Record deleted' });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Delete DNS record error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Setup CYBEV DNS (auto-configure for website)
 * POST /api/domains/:domain/setup-cybev
 */
router.post('/:domain/setup-cybev', verifyToken, async (req, res) => {
  try {
    const { domain } = req.params;
    const { subdomain } = req.body; // User's CYBEV subdomain
    
    if (!subdomain) {
      return res.status(400).json({ ok: false, error: 'CYBEV subdomain required' });
    }

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.setupCYBEVDNS(domain.toLowerCase(), subdomain);
    
    if (result.success) {
      res.json({ 
        ok: true, 
        message: 'DNS configured for CYBEV',
        records: result.records
      });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Setup CYBEV DNS error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ==========================================
// DOMAIN TRANSFER
// ==========================================

/**
 * Get transfer auth code
 * GET /api/domains/:domain/auth-code
 */
router.get('/:domain/auth-code', verifyToken, async (req, res) => {
  try {
    const { domain } = req.params;

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.getTransferAuthCode(domain.toLowerCase());
    
    if (result.success) {
      res.json({ ok: true, authCode: result.authCode });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Get auth code error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Transfer domain in
 * POST /api/domains/transfer
 */
router.post('/transfer', verifyToken, async (req, res) => {
  try {
    const { domain, authCode } = req.body;
    
    if (!domain || !authCode) {
      return res.status(400).json({ ok: false, error: 'Domain and auth code required' });
    }

    if (!domainService || !domainService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Domain API not configured' });
    }

    const result = await domainService.transferDomain(domain.toLowerCase(), authCode);
    
    if (result.success) {
      res.json({
        ok: true,
        transferId: result.transferId,
        status: result.status
      });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Transfer domain error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
