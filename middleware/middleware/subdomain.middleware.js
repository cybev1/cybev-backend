// ============================================
// FILE: middleware/subdomain.middleware.js
// Handles wildcard subdomain routing
// VERSION: 1.0
// ============================================

const mongoose = require('mongoose');

/**
 * Subdomain Middleware
 * Extracts subdomain from request and attaches site data
 * 
 * Example:
 *   pastorchrislive.cybev.io → subdomain = "pastorchrislive"
 *   api.cybev.io → subdomain = "api" (skip)
 *   cybev.io → subdomain = null (main site)
 */

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'app', 'admin', 'mail', 'smtp', 'pop', 'imap',
  'ftp', 'ssh', 'cdn', 'assets', 'static', 'media', 'img', 'images',
  'blog', 'shop', 'store', 'help', 'support', 'docs', 'status',
  'billing', 'dashboard', 'studio', 'dev', 'staging', 'test',
  'ns1', 'ns2', 'mx', 'webmail', 'cpanel', 'whm', 'autoconfig',
  'autodiscover', '_dmarc', '_domainkey'
];

const getSitesCollection = () => mongoose.connection.db.collection('sites');

async function subdomainMiddleware(req, res, next) {
  try {
    // Get host from request
    const host = req.headers.host || req.hostname || '';
    
    // Parse subdomain
    // Examples:
    //   pastorchrislive.cybev.io → pastorchrislive
    //   www.cybev.io → www
    //   cybev.io → null
    //   localhost:3000 → null
    
    let subdomain = null;
    
    // Production domain
    if (host.includes('cybev.io')) {
      const parts = host.split('.');
      if (parts.length > 2) {
        subdomain = parts[0].toLowerCase();
      }
    }
    
    // Local development (subdomain.localhost:3000)
    if (host.includes('localhost')) {
      const parts = host.split('.');
      if (parts.length > 1 && parts[0] !== 'localhost') {
        subdomain = parts[0].toLowerCase();
      }
    }
    
    // Attach to request
    req.subdomain = subdomain;
    req.isSubdomainRequest = !!subdomain && !RESERVED_SUBDOMAINS.includes(subdomain);
    
    // If it's a user site subdomain, fetch site data
    if (req.isSubdomainRequest) {
      const site = await getSitesCollection().findOne({
        subdomain: subdomain,
        status: 'published'
      });
      
      if (site) {
        req.site = site;
        req.siteId = site._id;
        
        // Increment view count (non-blocking)
        getSitesCollection().updateOne(
          { _id: site._id },
          { $inc: { views: 1, 'stats.views': 1 } }
        ).catch(() => {});
      }
    }
    
    next();
  } catch (err) {
    console.error('Subdomain middleware error:', err);
    next();
  }
}

module.exports = subdomainMiddleware;
