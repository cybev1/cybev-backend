// ============================================
// FILE: services/domain.service.js
// DomainNameAPI.com Full Integration
// VERSION: 1.0
// ============================================

const axios = require('axios');

// Configuration
const DOMAIN_API_BASE = process.env.DOMAIN_API_URL || 'https://api.domainnameapi.com';
const DOMAIN_API_USERNAME = process.env.DOMAIN_API_USERNAME;
const DOMAIN_API_PASSWORD = process.env.DOMAIN_API_PASSWORD;

// Default contact info for domain registration
const DEFAULT_CONTACT = {
  FirstName: process.env.DOMAIN_CONTACT_FIRSTNAME || 'CYBEV',
  LastName: process.env.DOMAIN_CONTACT_LASTNAME || 'Platform',
  Company: process.env.DOMAIN_CONTACT_COMPANY || 'CYBEV Ltd',
  EMail: process.env.DOMAIN_CONTACT_EMAIL || 'domains@cybev.io',
  Phone: process.env.DOMAIN_CONTACT_PHONE || '+1.5551234567',
  Fax: '',
  Address1: process.env.DOMAIN_CONTACT_ADDRESS || '123 Tech Street',
  Address2: '',
  City: process.env.DOMAIN_CONTACT_CITY || 'Accra',
  State: process.env.DOMAIN_CONTACT_STATE || 'Greater Accra',
  Country: process.env.DOMAIN_CONTACT_COUNTRY || 'GH',
  PostalCode: process.env.DOMAIN_CONTACT_POSTALCODE || '00233'
};

// API client with authentication
const apiClient = axios.create({
  baseURL: DOMAIN_API_BASE,
  auth: {
    username: DOMAIN_API_USERNAME,
    password: DOMAIN_API_PASSWORD
  },
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// Response parser
const parseResponse = (response) => {
  if (response.data?.Result === 'OK' || response.data?.result === 'OK') {
    return { success: true, data: response.data };
  }
  return { 
    success: false, 
    error: response.data?.Message || response.data?.message || 'Unknown error',
    data: response.data 
  };
};

/**
 * Check if domain is available for registration
 * @param {string} domain - Full domain name (e.g., "example.com")
 */
exports.checkAvailability = async (domain) => {
  try {
    const response = await apiClient.get('/api/whois/domain/check', {
      params: { domainName: domain }
    });
    
    const result = parseResponse(response);
    if (result.success) {
      return {
        available: response.data.Available === true || response.data.available === true,
        domain: domain,
        premium: response.data.Premium || false,
        price: response.data.Price || null
      };
    }
    return { available: false, error: result.error };
  } catch (error) {
    console.error('Domain availability check error:', error.message);
    return { available: false, error: error.message };
  }
};

/**
 * Check multiple domains at once
 * @param {string[]} domains - Array of domain names
 */
exports.checkMultipleAvailability = async (domains) => {
  try {
    const response = await apiClient.post('/api/whois/domain/check-multiple', {
      DomainNames: domains
    });
    
    const result = parseResponse(response);
    if (result.success && response.data.Domains) {
      return response.data.Domains.map(d => ({
        domain: d.DomainName,
        available: d.Available,
        premium: d.Premium || false,
        price: d.Price || null
      }));
    }
    return domains.map(d => ({ domain: d, available: false, error: result.error }));
  } catch (error) {
    console.error('Multi domain check error:', error.message);
    return domains.map(d => ({ domain: d, available: false, error: error.message }));
  }
};

/**
 * Get domain pricing
 * @param {string} tld - Top level domain (e.g., "com", "io", "net")
 */
exports.getPricing = async (tld = 'com') => {
  try {
    const response = await apiClient.get('/api/domain/tld-pricing', {
      params: { tld }
    });
    
    const result = parseResponse(response);
    if (result.success) {
      return {
        tld: tld,
        registration: response.data.RegistrationPrice,
        renewal: response.data.RenewalPrice,
        transfer: response.data.TransferPrice,
        currency: response.data.Currency || 'USD'
      };
    }
    return null;
  } catch (error) {
    console.error('Get pricing error:', error.message);
    return null;
  }
};

/**
 * Get all available TLDs with pricing
 */
exports.getAllTLDs = async () => {
  try {
    const response = await apiClient.get('/api/domain/tld-list');
    
    const result = parseResponse(response);
    if (result.success && response.data.TLDs) {
      return response.data.TLDs.map(tld => ({
        tld: tld.TLD,
        registration: tld.RegistrationPrice,
        renewal: tld.RenewalPrice,
        transfer: tld.TransferPrice,
        currency: tld.Currency || 'USD'
      }));
    }
    return [];
  } catch (error) {
    console.error('Get TLDs error:', error.message);
    return [];
  }
};

/**
 * Register a new domain
 * @param {string} domain - Full domain name
 * @param {number} years - Registration period (1-10)
 * @param {object} contact - Contact information (optional, uses defaults)
 * @param {string[]} nameservers - Custom nameservers (optional)
 */
exports.registerDomain = async (domain, years = 1, contact = null, nameservers = null) => {
  try {
    const contactInfo = contact || DEFAULT_CONTACT;
    
    const payload = {
      DomainName: domain,
      Period: years,
      // Contact information
      AdministrativeContact: contactInfo,
      BillingContact: contactInfo,
      TechnicalContact: contactInfo,
      RegistrantContact: contactInfo,
      // Nameservers (use CYBEV's if not specified)
      Nameservers: nameservers || [
        'ns1.cybev.io',
        'ns2.cybev.io'
      ],
      // Privacy protection
      PrivacyProtection: true,
      // Auto-renew
      AutoRenew: true
    };

    const response = await apiClient.post('/api/domain/register', payload);
    
    const result = parseResponse(response);
    if (result.success) {
      return {
        success: true,
        domain: domain,
        orderId: response.data.OrderId,
        expirationDate: response.data.ExpirationDate,
        status: response.data.Status || 'registered'
      };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Domain registration error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Renew an existing domain
 * @param {string} domain - Full domain name
 * @param {number} years - Renewal period (1-10)
 */
exports.renewDomain = async (domain, years = 1) => {
  try {
    const response = await apiClient.post('/api/domain/renew', {
      DomainName: domain,
      Period: years
    });
    
    const result = parseResponse(response);
    if (result.success) {
      return {
        success: true,
        domain: domain,
        newExpirationDate: response.data.ExpirationDate
      };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Domain renewal error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get domain details/info
 * @param {string} domain - Full domain name
 */
exports.getDomainInfo = async (domain) => {
  try {
    const response = await apiClient.get('/api/domain/info', {
      params: { domainName: domain }
    });
    
    const result = parseResponse(response);
    if (result.success) {
      return {
        domain: domain,
        status: response.data.Status,
        createdDate: response.data.CreatedDate,
        expirationDate: response.data.ExpirationDate,
        nameservers: response.data.Nameservers || [],
        locked: response.data.Locked || false,
        autoRenew: response.data.AutoRenew || false,
        privacyProtection: response.data.PrivacyProtection || false
      };
    }
    return null;
  } catch (error) {
    console.error('Get domain info error:', error.message);
    return null;
  }
};

/**
 * Update nameservers for a domain
 * @param {string} domain - Full domain name
 * @param {string[]} nameservers - Array of nameserver hostnames
 */
exports.updateNameservers = async (domain, nameservers) => {
  try {
    const response = await apiClient.post('/api/domain/update-nameservers', {
      DomainName: domain,
      Nameservers: nameservers
    });
    
    const result = parseResponse(response);
    return { success: result.success, error: result.error };
  } catch (error) {
    console.error('Update nameservers error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get DNS records for a domain
 * @param {string} domain - Full domain name
 */
exports.getDNSRecords = async (domain) => {
  try {
    const response = await apiClient.get('/api/dns/records', {
      params: { domainName: domain }
    });
    
    const result = parseResponse(response);
    if (result.success && response.data.Records) {
      return response.data.Records.map(r => ({
        id: r.Id,
        type: r.Type,
        name: r.Name,
        value: r.Value,
        ttl: r.TTL,
        priority: r.Priority
      }));
    }
    return [];
  } catch (error) {
    console.error('Get DNS records error:', error.message);
    return [];
  }
};

/**
 * Add DNS record
 * @param {string} domain - Full domain name
 * @param {object} record - Record details { type, name, value, ttl, priority }
 */
exports.addDNSRecord = async (domain, record) => {
  try {
    const response = await apiClient.post('/api/dns/add-record', {
      DomainName: domain,
      Type: record.type,
      Name: record.name,
      Value: record.value,
      TTL: record.ttl || 3600,
      Priority: record.priority || 0
    });
    
    const result = parseResponse(response);
    if (result.success) {
      return { success: true, recordId: response.data.RecordId };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Add DNS record error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Delete DNS record
 * @param {string} domain - Full domain name
 * @param {string} recordId - Record ID to delete
 */
exports.deleteDNSRecord = async (domain, recordId) => {
  try {
    const response = await apiClient.delete('/api/dns/delete-record', {
      data: {
        DomainName: domain,
        RecordId: recordId
      }
    });
    
    const result = parseResponse(response);
    return { success: result.success, error: result.error };
  } catch (error) {
    console.error('Delete DNS record error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Setup DNS for CYBEV site (adds required records)
 * @param {string} domain - Full domain name
 * @param {string} subdomain - User's CYBEV subdomain
 */
exports.setupCYBEVDNS = async (domain, subdomain) => {
  try {
    // Add CNAME for root domain pointing to CYBEV
    const results = [];
    
    // A record or CNAME for root
    results.push(await exports.addDNSRecord(domain, {
      type: 'CNAME',
      name: '@',
      value: 'sites.cybev.io',
      ttl: 3600
    }));
    
    // CNAME for www
    results.push(await exports.addDNSRecord(domain, {
      type: 'CNAME',
      name: 'www',
      value: 'sites.cybev.io',
      ttl: 3600
    }));
    
    // Verification TXT record
    results.push(await exports.addDNSRecord(domain, {
      type: 'TXT',
      name: '_cybev-verify',
      value: `cybev-site=${subdomain}`,
      ttl: 3600
    }));
    
    const allSuccess = results.every(r => r.success);
    return { 
      success: allSuccess, 
      records: results,
      error: allSuccess ? null : 'Some DNS records failed to add'
    };
  } catch (error) {
    console.error('Setup CYBEV DNS error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get domain transfer auth code
 * @param {string} domain - Full domain name
 */
exports.getTransferAuthCode = async (domain) => {
  try {
    const response = await apiClient.get('/api/domain/auth-code', {
      params: { domainName: domain }
    });
    
    const result = parseResponse(response);
    if (result.success) {
      return { success: true, authCode: response.data.AuthCode };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Get auth code error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Transfer domain to DomainNameAPI
 * @param {string} domain - Full domain name
 * @param {string} authCode - Transfer authorization code
 */
exports.transferDomain = async (domain, authCode) => {
  try {
    const response = await apiClient.post('/api/domain/transfer', {
      DomainName: domain,
      AuthCode: authCode,
      AdministrativeContact: DEFAULT_CONTACT,
      BillingContact: DEFAULT_CONTACT,
      TechnicalContact: DEFAULT_CONTACT,
      RegistrantContact: DEFAULT_CONTACT
    });
    
    const result = parseResponse(response);
    if (result.success) {
      return {
        success: true,
        transferId: response.data.TransferId,
        status: response.data.Status
      };
    }
    return { success: false, error: result.error };
  } catch (error) {
    console.error('Domain transfer error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Lock/Unlock domain
 * @param {string} domain - Full domain name
 * @param {boolean} lock - True to lock, false to unlock
 */
exports.setDomainLock = async (domain, lock = true) => {
  try {
    const response = await apiClient.post('/api/domain/set-lock', {
      DomainName: domain,
      Lock: lock
    });
    
    const result = parseResponse(response);
    return { success: result.success, error: result.error };
  } catch (error) {
    console.error('Set domain lock error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Enable/Disable auto-renew
 * @param {string} domain - Full domain name
 * @param {boolean} enable - True to enable, false to disable
 */
exports.setAutoRenew = async (domain, enable = true) => {
  try {
    const response = await apiClient.post('/api/domain/set-autorenew', {
      DomainName: domain,
      AutoRenew: enable
    });
    
    const result = parseResponse(response);
    return { success: result.success, error: result.error };
  } catch (error) {
    console.error('Set auto-renew error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get user's registered domains
 */
exports.getMyDomains = async () => {
  try {
    const response = await apiClient.get('/api/domain/list');
    
    const result = parseResponse(response);
    if (result.success && response.data.Domains) {
      return response.data.Domains.map(d => ({
        domain: d.DomainName,
        status: d.Status,
        expirationDate: d.ExpirationDate,
        autoRenew: d.AutoRenew,
        locked: d.Locked
      }));
    }
    return [];
  } catch (error) {
    console.error('Get my domains error:', error.message);
    return [];
  }
};

/**
 * Search domain suggestions
 * @param {string} keyword - Search keyword
 * @param {string[]} tlds - TLDs to search (optional)
 */
exports.suggestDomains = async (keyword, tlds = ['com', 'io', 'net', 'org', 'co']) => {
  const suggestions = [];
  
  // Check each TLD
  for (const tld of tlds) {
    const domain = `${keyword}.${tld}`;
    const result = await exports.checkAvailability(domain);
    suggestions.push({
      domain,
      tld,
      available: result.available,
      premium: result.premium || false,
      price: result.price
    });
  }
  
  return suggestions;
};

// Export configuration check
exports.isConfigured = () => {
  return !!(DOMAIN_API_USERNAME && DOMAIN_API_PASSWORD);
};
