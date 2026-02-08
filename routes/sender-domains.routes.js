// ============================================
// FILE: routes/sender-domains.routes.js
// CYBEV Sender Domain Verification API
// VERSION: 2.0.0 - Brevo Domain Verification
// CHANGELOG:
//   2.0.0 - Switch from AWS SES to Brevo for domain verification
//   1.0.0 - Initial AWS SES implementation
// ============================================

const express = require('express');
const router = express.Router();
const dns = require('dns').promises;
const mongoose = require('mongoose');

// ==========================================
// MODELS
// ==========================================

// Sender Domain Schema
const SenderDomainSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'verifying', 'verified', 'failed'], default: 'pending' },
  brevoId: { type: Number },
  verification: {
    txtRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    spfRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    dkimRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    dmarcRecord: {
      name: String,
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    }
  },
  verifiedAt: Date,
  lastVerificationAttempt: Date,
  verificationAttempts: { type: Number, default: 0 }
}, { timestamps: true });

// Get or create model
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
  if (!apiKey) {
    throw new Error('BREVO_API_KEY not configured');
  }

  const options = {
    method: method || 'GET',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(BREVO_API + endpoint, options);
  
  // Handle empty responses
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || 'Brevo API error: ' + response.status;
    throw new Error(errorMsg);
  }

  return data;
}

// Get domains from Brevo
async function getBrevoSenders() {
  try {
    const data = await brevoRequest('/senders', 'GET');
    return data?.senders || [];
  } catch (err) {
    console.error('Failed to get Brevo senders:', err.message);
    return [];
  }
}

// Add domain to Brevo
async function addBrevoSender(name, email) {
  return await brevoRequest('/senders', 'POST', {
    name: name,
    email: email
  });
}

// Get domain authentication details from Brevo
async function getBrevoDomainDetails(domain) {
  try {
    const data = await brevoRequest('/senders/domains/' + encodeURIComponent(domain), 'GET');
    return data;
  } catch (err) {
    console.error('Failed to get Brevo domain details:', err.message);
    return null;
  }
}

// Authenticate/verify domain in Brevo
async function authenticateBrevoDomain(domain) {
  return await brevoRequest('/senders/domains/' + encodeURIComponent(domain) + '/authenticate', 'PUT');
}

// ==========================================
// DOMAIN ROUTES
// ==========================================

// Get all sender domains for user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    console.log('📧 Fetching sender domains for user:', userId);
    
    const domains = await SenderDomain.find({ user: userId }).sort({ createdAt: -1 });
    
    console.log('📧 Found ' + domains.length + ' domains');
    
    res.json({ domains: domains });
  } catch (err) {
    console.error('Get domains error:', err);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// Add new domain for verification
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    // Clean domain
    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    
    // Validate domain format
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/;
    if (!domainRegex.test(cleanDomain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }
    
    // Check if domain already exists in our DB
    const existing = await SenderDomain.findOne({ domain: cleanDomain });
    if (existing) {
      if (existing.user.toString() === userId) {
        return res.status(400).json({ error: 'You have already added this domain', domain: existing });
      }
      return res.status(400).json({ error: 'This domain is already registered by another user' });
    }
    
    // Get domain details from Brevo to get DNS records
    let brevoDetails = await getBrevoDomainDetails(cleanDomain);
    
    // If domain not in Brevo yet, add a sender with this domain
    if (!brevoDetails) {
      try {
        // Add a sender to register the domain
        const senderEmail = 'noreply@' + cleanDomain;
        await addBrevoSender('CYBEV', senderEmail);
        console.log('📧 Added sender to Brevo: ' + senderEmail);
        
        // Wait a moment for Brevo to process
        await new Promise(function(resolve) { setTimeout(resolve, 1000); });
        
        // Get domain details again
        brevoDetails = await getBrevoDomainDetails(cleanDomain);
      } catch (addErr) {
        console.error('Failed to add Brevo sender:', addErr.message);
      }
    }
    
    // Generate DNS records based on Brevo requirements
    const verification = {
      txtRecord: {
        name: '_amazonses.' + cleanDomain,
        value: brevoDetails?.dns?.domain_verification?.value || 'brevo-verification-' + Date.now(),
        verified: false
      },
      spfRecord: {
        name: '@ or ' + cleanDomain,
        value: 'v=spf1 include:spf.sendinblue.com ~all',
        verified: brevoDetails?.dns?.spf?.verified || false
      },
      dkimRecord: {
        name: brevoDetails?.dns?.dkim?.host || 'mail._domainkey.' + cleanDomain,
        value: brevoDetails?.dns?.dkim?.value || 'TBD - Check Brevo dashboard',
        verified: brevoDetails?.dns?.dkim?.verified || false
      },
      dmarcRecord: {
        name: '_dmarc.' + cleanDomain,
        value: 'v=DMARC1; p=none; rua=mailto:dmarc@cybev.io',
        verified: false
      }
    };
    
    // If we got Brevo details, use their DNS records
    if (brevoDetails && brevoDetails.dns) {
      if (brevoDetails.dns.domain_verification) {
        verification.txtRecord.name = brevoDetails.dns.domain_verification.host || verification.txtRecord.name;
        verification.txtRecord.value = brevoDetails.dns.domain_verification.value || verification.txtRecord.value;
        verification.txtRecord.verified = brevoDetails.dns.domain_verification.verified || false;
      }
      if (brevoDetails.dns.spf) {
        verification.spfRecord.name = brevoDetails.dns.spf.host || verification.spfRecord.name;
        verification.spfRecord.value = brevoDetails.dns.spf.value || verification.spfRecord.value;
        verification.spfRecord.verified = brevoDetails.dns.spf.verified || false;
      }
      if (brevoDetails.dns.dkim) {
        verification.dkimRecord.name = brevoDetails.dns.dkim.host || verification.dkimRecord.name;
        verification.dkimRecord.value = brevoDetails.dns.dkim.value || verification.dkimRecord.value;
        verification.dkimRecord.verified = brevoDetails.dns.dkim.verified || false;
      }
    }
    
    // Create domain record
    const senderDomain = await SenderDomain.create({
      user: userId,
      domain: cleanDomain,
      status: 'pending',
      brevoId: brevoDetails?.id,
      verification: verification
    });
    
    res.json({ 
      ok: true, 
      domain: senderDomain,
      instructions: generateDnsInstructions(senderDomain),
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
    
    // Get latest status from Brevo
    const brevoDetails = await getBrevoDomainDetails(domain.domain);
    
    res.json({ 
      domain: domain,
      instructions: generateDnsInstructions(domain),
      brevoDetails: brevoDetails
    });
  } catch (err) {
    console.error('Get domain error:', err);
    res.status(500).json({ error: 'Failed to fetch domain' });
  }
});

// Verify domain DNS records
router.post('/:id/verify', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const domain = await SenderDomain.findOne({ _id: req.params.id, user: userId });
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    domain.lastVerificationAttempt = new Date();
    domain.verificationAttempts += 1;
    
    // Try to authenticate domain with Brevo
    let brevoResult = null;
    try {
      brevoResult = await authenticateBrevoDomain(domain.domain);
      console.log('📧 Brevo authentication result:', brevoResult);
    } catch (brevoErr) {
      console.log('📧 Brevo authentication attempt:', brevoErr.message);
    }
    
    // Get latest domain status from Brevo
    const brevoDetails = await getBrevoDomainDetails(domain.domain);
    
    const results = {
      txt: false,
      spf: false,
      dkim: false,
      dmarc: false
    };
    
    // Update from Brevo status
    if (brevoDetails && brevoDetails.dns) {
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
    
    // Also do manual DNS check for DMARC
    try {
      const txtRecords = await dns.resolveTxt('_dmarc.' + domain.domain);
      const flatTxt = txtRecords.flat();
      results.dmarc = flatTxt.some(function(r) { return r.includes('DMARC1'); });
      domain.verification.dmarcRecord.verified = results.dmarc;
      if (results.dmarc) domain.verification.dmarcRecord.verifiedAt = new Date();
    } catch (dnsErr) {
      console.log('DMARC lookup failed for ' + domain.domain + ':', dnsErr.code);
    }
    
    // Update domain status
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

// Delete domain
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const domain = await SenderDomain.findOne({ _id: req.params.id, user: userId });
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    // Note: Brevo doesn't have a direct domain delete API
    // The domain will remain in Brevo but we remove from our DB
    
    await domain.deleteOne();
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete domain error:', err);
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

// ==========================================
// DNS INSTRUCTIONS GENERATOR
// ==========================================

function generateDnsInstructions(domain) {
  const records = [];
  
  // Domain Verification TXT Record
  if (domain.verification.txtRecord) {
    records.push({
      type: 'TXT',
      name: domain.verification.txtRecord.name,
      value: domain.verification.txtRecord.value,
      verified: domain.verification.txtRecord.verified,
      description: 'Domain Verification',
      required: true
    });
  }
  
  // SPF Record
  if (domain.verification.spfRecord) {
    records.push({
      type: 'TXT',
      name: domain.verification.spfRecord.name,
      value: domain.verification.spfRecord.value,
      verified: domain.verification.spfRecord.verified,
      description: 'SPF Record',
      required: true
    });
  }
  
  // DKIM Record
  if (domain.verification.dkimRecord) {
    records.push({
      type: 'TXT',
      name: domain.verification.dkimRecord.name,
      value: domain.verification.dkimRecord.value,
      verified: domain.verification.dkimRecord.verified,
      description: 'DKIM',
      required: true
    });
  }
  
  // DMARC Record (recommended)
  if (domain.verification.dmarcRecord) {
    records.push({
      type: 'TXT',
      name: domain.verification.dmarcRecord.name,
      value: domain.verification.dmarcRecord.value,
      verified: domain.verification.dmarcRecord.verified,
      description: 'DMARC (Recommended)',
      required: false
    });
  }
  
  return {
    records: records,
    tips: [
      'DNS changes can take up to 48 hours to propagate',
      'Make sure to copy the record values exactly',
      'If using Cloudflare, disable proxy (orange cloud) for CNAME records',
      'You must verify your domain in Brevo to send emails from it'
    ]
  };
}

// ==========================================
// GET BREVO SENDERS (for dropdown)
// ==========================================

router.get('/brevo/senders', auth, async (req, res) => {
  try {
    const senders = await getBrevoSenders();
    res.json({ senders: senders });
  } catch (err) {
    console.error('Get Brevo senders error:', err);
    res.status(500).json({ error: 'Failed to fetch Brevo senders' });
  }
});

// ==========================================
// QUICK DNS CHECK
// ==========================================

router.post('/check-dns', auth, async (req, res) => {
  try {
    const { domain, recordType, recordName, expectedValue } = req.body;
    
    let found = false;
    let records = [];
    
    try {
      switch (recordType) {
        case 'TXT':
          var txtRecords = await dns.resolveTxt(recordName);
          records = txtRecords.flat();
          found = records.some(function(r) { return r.includes(expectedValue); });
          break;
        case 'CNAME':
          records = await dns.resolveCname(recordName);
          found = records.some(function(r) { return r.includes(expectedValue); });
          break;
        case 'MX':
          var mxRecords = await dns.resolveMx(recordName);
          records = mxRecords.map(function(r) { return r.priority + ' ' + r.exchange; });
          found = mxRecords.some(function(r) { return r.exchange.includes(expectedValue); });
          break;
      }
    } catch (dnsErr) {
      records = [];
      found = false;
    }
    
    res.json({
      found: found,
      records: records,
      message: found ? 'Record found!' : 'Record not found. DNS may still be propagating.'
    });
  } catch (err) {
    console.error('DNS check error:', err);
    res.status(500).json({ error: 'Failed to check DNS' });
  }
});

module.exports = router;
