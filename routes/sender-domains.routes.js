// ============================================
// FILE: routes/sender-domains.routes.js
// CYBEV Sender Domain Verification API
// VERSION: 3.0.0 - Auto DNS Detection & Setup
// CHANGELOG:
//   3.0.0 - Auto-detect DNS provider, registrar, propagation checking
//   2.0.0 - Brevo domain verification
//   1.0.0 - Initial AWS SES implementation
// ============================================

const express = require('express');
const router = express.Router();
const dns = require('dns').promises;
const mongoose = require('mongoose');

// Import DNS auto-setup service
let dnsService = null;
try {
  dnsService = require('../services/dns-auto-setup.service');
  console.log('✅ DNS Auto-Setup Service loaded');
} catch (err) {
  console.warn('⚠️ DNS Auto-Setup Service not available:', err.message);
}

// ==========================================
// MODELS
// ==========================================

const SenderDomainSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'verifying', 'verified', 'failed'], default: 'pending' },
  brevoId: { type: Number },
  dnsProvider: {
    name: String,
    provider: String,
    hasApi: Boolean,
    detected: Boolean
  },
  registrar: {
    name: String,
    url: String,
    detected: Boolean
  },
  verification: {
    txtRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
      propagation: { type: Number, default: 0 }
    },
    spfRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
      propagation: { type: Number, default: 0 }
    },
    dkimRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
      propagation: { type: Number, default: 0 }
    },
    dmarcRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
      propagation: { type: Number, default: 0 }
    }
  },
  autoSetupCredentials: {
    encrypted: String // Encrypted API credentials for auto-setup
  },
  verifiedAt: Date,
  lastVerificationAttempt: Date,
  verificationAttempts: { type: Number, default: 0 }
}, { timestamps: true });

let SenderDomain;
try {
  SenderDomain = mongoose.model('SenderDomain');
} catch (e) {
  SenderDomain = mongoose.model('SenderDomain', SenderDomainSchema);
}

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// BREVO API HELPERS
// ==========================================

const BREVO_API = 'https://api.brevo.com/v3';

async function brevoRequest(endpoint, method, body) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY not configured');

  const options = {
    method: method || 'GET',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    }
  };

  if (body) options.body = JSON.stringify(body);

  const response = await fetch(BREVO_API + endpoint, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = { message: text }; }
  }

  if (!response.ok) {
    throw new Error(data?.message || 'Brevo API error: ' + response.status);
  }
  return data;
}

async function getBrevoSenders() {
  try {
    const data = await brevoRequest('/senders', 'GET');
    return data?.senders || [];
  } catch (err) {
    console.error('Failed to get Brevo senders:', err.message);
    return [];
  }
}

async function addBrevoSender(name, email) {
  return await brevoRequest('/senders', 'POST', { name: name, email: email });
}

async function getBrevoDomainDetails(domain) {
  try {
    return await brevoRequest('/senders/domains/' + encodeURIComponent(domain), 'GET');
  } catch (err) {
    return null;
  }
}

async function authenticateBrevoDomain(domain) {
  return await brevoRequest('/senders/domains/' + encodeURIComponent(domain) + '/authenticate', 'PUT');
}

// ==========================================
// DOMAIN ROUTES
// ==========================================

// Get all sender domains
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const domains = await SenderDomain.find({ user: userId }).sort({ createdAt: -1 });
    res.json({ domains: domains });
  } catch (err) {
    console.error('Get domains error:', err);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// Analyze domain (detect DNS provider + registrar)
router.post('/analyze', auth, async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    // Clean domain
    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    
    if (!dnsService) {
      return res.status(503).json({ error: 'DNS service not available' });
    }
    
    console.log('🔍 Analyzing domain: ' + cleanDomain);
    
    const analysis = await dnsService.analyzeDomain(cleanDomain);
    
    res.json({
      ok: true,
      domain: cleanDomain,
      analysis: analysis
    });
  } catch (err) {
    console.error('Analyze domain error:', err);
    res.status(500).json({ error: err.message || 'Failed to analyze domain' });
  }
});

// Add new domain
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    
    // Validate domain format
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/;
    if (!domainRegex.test(cleanDomain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }
    
    // Check if domain already exists
    const existing = await SenderDomain.findOne({ domain: cleanDomain });
    if (existing) {
      if (existing.user.toString() === userId) {
        return res.status(400).json({ error: 'You have already added this domain', domain: existing });
      }
      return res.status(400).json({ error: 'This domain is already registered by another user' });
    }
    
    // Auto-detect DNS provider and registrar
    let dnsInfo = { detected: false, provider: 'unknown', name: 'Unknown' };
    let registrarInfo = { detected: false, registrar: 'Unknown' };
    
    if (dnsService) {
      try {
        const analysis = await dnsService.analyzeDomain(cleanDomain);
        dnsInfo = analysis.dns;
        registrarInfo = analysis.registrar;
        console.log('📡 Detected DNS: ' + dnsInfo.name + ', Registrar: ' + registrarInfo.registrar);
      } catch (e) {
        console.log('DNS detection failed:', e.message);
      }
    }
    
    // Get Brevo domain details
    let brevoDetails = await getBrevoDomainDetails(cleanDomain);
    
    if (!brevoDetails) {
      try {
        await addBrevoSender('CYBEV', 'noreply@' + cleanDomain);
        await new Promise(function(r) { setTimeout(r, 1000); });
        brevoDetails = await getBrevoDomainDetails(cleanDomain);
      } catch (e) {
        console.log('Brevo sender add failed:', e.message);
      }
    }
    
    // Build verification records
    const verification = {
      txtRecord: {
        name: brevoDetails?.dns?.domain_verification?.host || '_amazonses.' + cleanDomain,
        value: brevoDetails?.dns?.domain_verification?.value || 'brevo-verify-' + Date.now(),
        verified: brevoDetails?.dns?.domain_verification?.verified || false
      },
      spfRecord: {
        name: '@ or ' + cleanDomain,
        value: brevoDetails?.dns?.spf?.value || 'v=spf1 include:spf.sendinblue.com ~all',
        verified: brevoDetails?.dns?.spf?.verified || false
      },
      dkimRecord: {
        name: brevoDetails?.dns?.dkim?.host || 'mail._domainkey.' + cleanDomain,
        value: brevoDetails?.dns?.dkim?.value || 'Check Brevo dashboard for DKIM value',
        verified: brevoDetails?.dns?.dkim?.verified || false
      },
      dmarcRecord: {
        name: '_dmarc.' + cleanDomain,
        value: 'v=DMARC1; p=none; rua=mailto:dmarc@cybev.io',
        verified: false
      }
    };
    
    // Create domain record
    const senderDomain = await SenderDomain.create({
      user: userId,
      domain: cleanDomain,
      status: 'pending',
      brevoId: brevoDetails?.id,
      dnsProvider: {
        name: dnsInfo.name,
        provider: dnsInfo.provider,
        hasApi: dnsInfo.hasApi,
        detected: dnsInfo.detected
      },
      registrar: {
        name: registrarInfo.registrar,
        url: registrarInfo.registrarUrl,
        detected: registrarInfo.detected
      },
      verification: verification
    });
    
    res.json({ 
      ok: true, 
      domain: senderDomain,
      dnsProvider: dnsInfo,
      registrar: registrarInfo,
      instructions: generateDnsInstructions(senderDomain, dnsInfo),
      brevoDetails: brevoDetails
    });
  } catch (err) {
    console.error('Add domain error:', err);
    res.status(500).json({ error: err.message || 'Failed to add domain' });
  }
});

// Get domain details
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const domain = await SenderDomain.findOne({ _id: req.params.id, user: userId });
    
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    const brevoDetails = await getBrevoDomainDetails(domain.domain);
    
    res.json({ 
      domain: domain,
      instructions: generateDnsInstructions(domain, domain.dnsProvider),
      brevoDetails: brevoDetails
    });
  } catch (err) {
    console.error('Get domain error:', err);
    res.status(500).json({ error: 'Failed to fetch domain' });
  }
});

// Check DNS propagation for a domain
router.post('/:id/check-propagation', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const domain = await SenderDomain.findOne({ _id: req.params.id, user: userId });
    
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    if (!dnsService) {
      return res.status(503).json({ error: 'DNS service not available' });
    }
    
    const records = [];
    
    if (domain.verification.txtRecord?.name && domain.verification.txtRecord?.value) {
      records.push({
        label: 'Domain Verification',
        type: 'TXT',
        name: domain.verification.txtRecord.name,
        value: domain.verification.txtRecord.value
      });
    }
    
    if (domain.verification.spfRecord?.value) {
      records.push({
        label: 'SPF',
        type: 'TXT',
        name: domain.domain,
        value: 'spf'
      });
    }
    
    if (domain.verification.dmarcRecord?.name) {
      records.push({
        label: 'DMARC',
        type: 'TXT',
        name: domain.verification.dmarcRecord.name,
        value: 'DMARC1'
      });
    }
    
    const propagationResults = await dnsService.verifyAllRecords(domain.domain, records);
    
    // Update propagation percentages
    if (propagationResults.records['Domain Verification']) {
      domain.verification.txtRecord.propagation = propagationResults.records['Domain Verification'].propagation.propagationPercent;
    }
    if (propagationResults.records['SPF']) {
      domain.verification.spfRecord.propagation = propagationResults.records['SPF'].propagation.propagationPercent;
    }
    if (propagationResults.records['DMARC']) {
      domain.verification.dmarcRecord.propagation = propagationResults.records['DMARC'].propagation.propagationPercent;
    }
    
    await domain.save();
    
    res.json({
      ok: true,
      domain: domain.domain,
      propagation: propagationResults,
      message: propagationResults.allPropagated 
        ? 'All DNS records have propagated! Click Verify to complete setup.'
        : 'DNS propagation in progress (' + propagationResults.averagePropagation + '%). This can take up to 48 hours.'
    });
  } catch (err) {
    console.error('Check propagation error:', err);
    res.status(500).json({ error: 'Failed to check propagation' });
  }
});

// Verify domain
router.post('/:id/verify', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const domain = await SenderDomain.findOne({ _id: req.params.id, user: userId });
    
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    domain.lastVerificationAttempt = new Date();
    domain.verificationAttempts += 1;
    
    // Try Brevo authentication
    let brevoResult = null;
    try {
      brevoResult = await authenticateBrevoDomain(domain.domain);
    } catch (e) {
      console.log('Brevo auth attempt:', e.message);
    }
    
    // Get latest status from Brevo
    const brevoDetails = await getBrevoDomainDetails(domain.domain);
    
    const results = { txt: false, spf: false, dkim: false, dmarc: false };
    
    if (brevoDetails?.dns) {
      if (brevoDetails.dns.domain_verification) {
        results.txt = brevoDetails.dns.domain_verification.verified || false;
        domain.verification.txtRecord.verified = results.txt;
        if (results.txt) domain.verification.txtRecord.verifiedAt = new Date();
      }
      if (brevoDetails.dns.spf) {
        results.spf = brevoDetails.dns.spf.verified || false;
        domain.verification.spfRecord.verified = results.spf;
        if (results.spf) domain.verification.spfRecord.verifiedAt = new Date();
      }
      if (brevoDetails.dns.dkim) {
        results.dkim = brevoDetails.dns.dkim.verified || false;
        domain.verification.dkimRecord.verified = results.dkim;
        if (results.dkim) domain.verification.dkimRecord.verifiedAt = new Date();
      }
    }
    
    // Manual DMARC check
    try {
      const txtRecords = await dns.resolveTxt('_dmarc.' + domain.domain);
      results.dmarc = txtRecords.flat().some(function(r) { return r.includes('DMARC1'); });
      domain.verification.dmarcRecord.verified = results.dmarc;
      if (results.dmarc) domain.verification.dmarcRecord.verifiedAt = new Date();
    } catch (e) {}
    
    const isFullyVerified = results.txt && results.spf && results.dkim;
    
    if (isFullyVerified) {
      domain.status = 'verified';
      domain.verifiedAt = new Date();
    } else if (results.txt || results.spf || results.dkim) {
      domain.status = 'verifying';
    }
    
    await domain.save();
    
    res.json({
      ok: true,
      domain: domain,
      verification: {
        txt: { verified: results.txt, record: domain.verification.txtRecord },
        spf: { verified: results.spf, record: domain.verification.spfRecord },
        dkim: { verified: results.dkim, record: domain.verification.dkimRecord },
        dmarc: { verified: results.dmarc, record: domain.verification.dmarcRecord }
      },
      isFullyVerified: isFullyVerified,
      brevoDetails: brevoDetails,
      message: isFullyVerified 
        ? 'Domain verified successfully! You can now send emails from this domain.'
        : 'Some DNS records are not yet verified. DNS changes can take up to 48 hours.'
    });
  } catch (err) {
    console.error('Verify domain error:', err);
    res.status(500).json({ error: 'Failed to verify domain' });
  }
});

// Auto-add DNS records (for supported providers)
router.post('/:id/auto-setup', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { credentials } = req.body;
    
    const domain = await SenderDomain.findOne({ _id: req.params.id, user: userId });
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    if (!dnsService) {
      return res.status(503).json({ error: 'DNS service not available' });
    }
    
    if (!domain.dnsProvider?.hasApi) {
      return res.status(400).json({ 
        error: 'Auto-setup not supported for ' + (domain.dnsProvider?.name || 'this provider'),
        instructions: 'Please add DNS records manually'
      });
    }
    
    const records = [
      { type: 'TXT', name: domain.verification.txtRecord.name, value: domain.verification.txtRecord.value },
      { type: 'TXT', name: domain.domain, value: domain.verification.spfRecord.value },
      { type: 'TXT', name: domain.verification.dmarcRecord.name, value: domain.verification.dmarcRecord.value }
    ];
    
    if (domain.verification.dkimRecord?.value && !domain.verification.dkimRecord.value.includes('Check Brevo')) {
      records.push({ type: 'TXT', name: domain.verification.dkimRecord.name, value: domain.verification.dkimRecord.value });
    }
    
    const results = [];
    for (var i = 0; i < records.length; i++) {
      try {
        await dnsService.autoAddDnsRecord(domain.dnsProvider.provider, credentials, domain.domain, records[i]);
        results.push({ record: records[i], success: true });
      } catch (err) {
        results.push({ record: records[i], success: false, error: err.message });
      }
    }
    
    const allSuccess = results.every(function(r) { return r.success; });
    
    res.json({
      ok: allSuccess,
      results: results,
      message: allSuccess 
        ? 'All DNS records added successfully! Verification may take a few minutes.'
        : 'Some records failed. Please add them manually.'
    });
  } catch (err) {
    console.error('Auto-setup error:', err);
    res.status(500).json({ error: err.message || 'Auto-setup failed' });
  }
});

// Delete domain
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const domain = await SenderDomain.findOne({ _id: req.params.id, user: userId });
    
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    await domain.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete domain error:', err);
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

// Get Brevo senders
router.get('/brevo/senders', auth, async (req, res) => {
  try {
    const senders = await getBrevoSenders();
    res.json({ senders: senders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Brevo senders' });
  }
});

// Get supported DNS providers
router.get('/providers/list', auth, async (req, res) => {
  try {
    if (!dnsService) {
      return res.json({ providers: [] });
    }
    
    const providers = Object.entries(dnsService.DNS_PROVIDERS).map(function([id, p]) {
      return {
        id: id,
        name: p.name,
        hasApi: p.hasApi,
        logo: p.logo,
        docsUrl: p.docsUrl
      };
    });
    
    res.json({ providers: providers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get providers' });
  }
});

// ==========================================
// DNS INSTRUCTIONS GENERATOR
// ==========================================

function generateDnsInstructions(domain, dnsProvider) {
  const records = [];
  
  if (domain.verification?.txtRecord) {
    records.push({
      type: 'TXT',
      name: domain.verification.txtRecord.name,
      value: domain.verification.txtRecord.value,
      verified: domain.verification.txtRecord.verified,
      propagation: domain.verification.txtRecord.propagation || 0,
      description: 'Domain Verification',
      required: true
    });
  }
  
  if (domain.verification?.spfRecord) {
    records.push({
      type: 'TXT',
      name: domain.verification.spfRecord.name || '@ or ' + domain.domain,
      value: domain.verification.spfRecord.value,
      verified: domain.verification.spfRecord.verified,
      propagation: domain.verification.spfRecord.propagation || 0,
      description: 'SPF Record',
      required: true
    });
  }
  
  if (domain.verification?.dkimRecord) {
    records.push({
      type: 'TXT',
      name: domain.verification.dkimRecord.name,
      value: domain.verification.dkimRecord.value,
      verified: domain.verification.dkimRecord.verified,
      propagation: domain.verification.dkimRecord.propagation || 0,
      description: 'DKIM',
      required: true
    });
  }
  
  if (domain.verification?.dmarcRecord) {
    records.push({
      type: 'TXT',
      name: domain.verification.dmarcRecord.name,
      value: domain.verification.dmarcRecord.value,
      verified: domain.verification.dmarcRecord.verified,
      propagation: domain.verification.dmarcRecord.propagation || 0,
      description: 'DMARC (Recommended)',
      required: false
    });
  }
  
  const providerInstructions = dnsProvider?.instructions || 'Log in to your DNS provider and add the records below';
  const providerUrl = dnsProvider?.docsUrl || null;
  
  return {
    records: records,
    provider: {
      name: dnsProvider?.name || 'Unknown',
      hasApi: dnsProvider?.hasApi || false,
      instructions: providerInstructions,
      url: providerUrl
    },
    tips: [
      'DNS changes can take up to 48 hours to propagate worldwide',
      'Click "Check Propagation" to see real-time DNS status',
      'Make sure to copy the record values exactly as shown',
      dnsProvider?.hasApi ? 'Auto-setup is available for ' + dnsProvider.name : null
    ].filter(Boolean)
  };
}

module.exports = router;
