// ============================================
// FILE: routes/sender-domains.routes.js
// CYBEV Sender Domain Verification API
// VERSION: 1.0.0 - Custom Domain Email Setup
// ============================================

const express = require('express');
const router = express.Router();
const dns = require('dns').promises;

// Import models and services
const { SenderDomain, EmailAddress } = require('../models/email.model');
const sesService = require('../services/ses.service');

// Auth middleware
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
// DOMAIN MANAGEMENT
// ==========================================

// Get all sender domains for user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    console.log('📧 Fetching sender domains for user:', userId);
    
    const domains = await SenderDomain.find({ user: userId })
      .sort({ createdAt: -1 });
    
    console.log(`📧 Found ${domains.length} domains for user ${userId}`);
    
    // If no domains, also check by string match (handle ObjectId vs string mismatch)
    if (domains.length === 0) {
      const allDomains = await SenderDomain.find().limit(5);
      console.log('📧 Sample domains in DB:', allDomains.map(d => ({ 
        domain: d.domain, 
        userId: d.user?.toString(),
        requestedUserId: userId
      })));
    }
    
    res.json({ domains });
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
    
    // Check if domain already exists
    const existing = await SenderDomain.findOne({ domain: cleanDomain });
    if (existing) {
      if (existing.user.toString() === userId) {
        return res.status(400).json({ error: 'You have already added this domain', domain: existing });
      }
      return res.status(400).json({ error: 'This domain is already registered by another user' });
    }
    
    // Initialize verification with SES
    let sesResult;
    try {
      sesResult = await sesService.verifyDomain(cleanDomain);
    } catch (sesErr) {
      console.error('SES verification error:', sesErr);
      // Continue without SES for now
      sesResult = {
        verificationToken: `cybev-verify-${Date.now()}`,
        txtRecord: {
          name: `_amazonses.${cleanDomain}`,
          value: `cybev-verify-${Date.now()}`
        }
      };
    }
    
    // Setup DKIM
    let dkimResult;
    try {
      dkimResult = await sesService.setupDkim(cleanDomain);
    } catch (dkimErr) {
      console.error('DKIM setup error:', dkimErr);
      dkimResult = { dkimRecords: [] };
    }
    
    // Create domain record
    const senderDomain = await SenderDomain.create({
      user: userId,
      domain: cleanDomain,
      status: 'pending',
      verification: {
        txtRecord: {
          name: sesResult.txtRecord.name,
          value: sesResult.txtRecord.value,
          verified: false
        },
        spfRecord: {
          name: cleanDomain,
          value: 'v=spf1 include:amazonses.com ~all',
          verified: false
        },
        dkimRecords: dkimResult.dkimRecords?.map(r => ({
          name: r.name,
          value: r.value,
          verified: false
        })) || [],
        dmarcRecord: {
          name: `_dmarc.${cleanDomain}`,
          value: 'v=DMARC1; p=none; rua=mailto:dmarc@cybev.io',
          verified: false
        }
      },
      dkimTokens: dkimResult.dkimTokens || []
    });
    
    res.json({ 
      ok: true, 
      domain: senderDomain,
      instructions: generateDnsInstructions(senderDomain)
    });
  } catch (err) {
    console.error('Add domain error:', err);
    res.status(500).json({ error: 'Failed to add domain' });
  }
});

// Get domain details with DNS records
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const domain = await SenderDomain.findOne({ _id: req.params.id, user: userId });
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    res.json({ 
      domain,
      instructions: generateDnsInstructions(domain)
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
    
    const results = {
      txt: false,
      spf: false,
      dkim: [],
      dmarc: false
    };
    
    // Check TXT record
    try {
      const txtRecords = await dns.resolveTxt(domain.verification.txtRecord.name.replace(domain.domain, '').replace('.', '') + '.' + domain.domain);
      const flatTxt = txtRecords.flat();
      results.txt = flatTxt.some(r => r.includes(domain.verification.txtRecord.value));
      
      if (results.txt) {
        domain.verification.txtRecord.verified = true;
        domain.verification.txtRecord.verifiedAt = new Date();
      }
    } catch (dnsErr) {
      console.log(`TXT lookup failed for ${domain.domain}:`, dnsErr.code);
    }
    
    // Check SPF record
    try {
      const txtRecords = await dns.resolveTxt(domain.domain);
      const flatTxt = txtRecords.flat();
      results.spf = flatTxt.some(r => r.includes('amazonses.com') || r.includes('spf'));
      
      if (results.spf) {
        domain.verification.spfRecord.verified = true;
        domain.verification.spfRecord.verifiedAt = new Date();
      }
    } catch (dnsErr) {
      console.log(`SPF lookup failed for ${domain.domain}:`, dnsErr.code);
    }
    
    // Check DKIM records
    for (let i = 0; i < domain.verification.dkimRecords.length; i++) {
      const dkimRecord = domain.verification.dkimRecords[i];
      try {
        const cnameRecords = await dns.resolveCname(dkimRecord.name);
        const verified = cnameRecords.some(r => r.includes('dkim.amazonses.com'));
        results.dkim.push(verified);
        
        if (verified) {
          domain.verification.dkimRecords[i].verified = true;
          domain.verification.dkimRecords[i].verifiedAt = new Date();
        }
      } catch (dnsErr) {
        results.dkim.push(false);
        console.log(`DKIM lookup failed for ${dkimRecord.name}:`, dnsErr.code);
      }
    }
    
    // Check DMARC record
    try {
      const txtRecords = await dns.resolveTxt(`_dmarc.${domain.domain}`);
      const flatTxt = txtRecords.flat();
      results.dmarc = flatTxt.some(r => r.includes('DMARC1'));
      
      if (results.dmarc) {
        domain.verification.dmarcRecord.verified = true;
        domain.verification.dmarcRecord.verifiedAt = new Date();
      }
    } catch (dnsErr) {
      console.log(`DMARC lookup failed for ${domain.domain}:`, dnsErr.code);
    }
    
    // Check SES status
    try {
      const sesStatus = await sesService.checkDomainStatus(domain.domain);
      if (sesStatus.verification.status === 'Success') {
        results.txt = true;
        domain.verification.txtRecord.verified = true;
      }
      if (sesStatus.dkim.status === 'Success') {
        results.dkim = domain.verification.dkimRecords.map(() => true);
        domain.verification.dkimRecords.forEach((r, i) => {
          domain.verification.dkimRecords[i].verified = true;
        });
      }
    } catch (sesErr) {
      console.log('SES status check failed:', sesErr.message);
    }
    
    // Update domain status
    const allDkimVerified = results.dkim.length > 0 && results.dkim.every(v => v);
    const isFullyVerified = results.txt && results.spf && allDkimVerified;
    
    if (isFullyVerified) {
      domain.status = 'verified';
      domain.verifiedAt = new Date();
    } else if (results.txt) {
      domain.status = 'verifying'; // Partially verified
    }
    
    await domain.save();
    
    res.json({
      ok: true,
      domain,
      verification: {
        txt: { verified: results.txt, record: domain.verification.txtRecord },
        spf: { verified: results.spf, record: domain.verification.spfRecord },
        dkim: { verified: allDkimVerified, records: domain.verification.dkimRecords },
        dmarc: { verified: results.dmarc, record: domain.verification.dmarcRecord }
      },
      isFullyVerified,
      message: isFullyVerified 
        ? 'Domain verified successfully! You can now send emails from this domain.'
        : 'Some DNS records are not yet propagated. DNS changes can take up to 48 hours.'
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
    
    // Delete associated email addresses
    await EmailAddress.deleteMany({ senderDomain: domain._id });
    
    // Remove from SES
    try {
      await sesService.removeDomain(domain.domain);
    } catch (sesErr) {
      console.log('SES domain removal failed:', sesErr.message);
    }
    
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
  
  // TXT Record for verification
  records.push({
    type: 'TXT',
    name: domain.verification.txtRecord.name,
    value: domain.verification.txtRecord.value,
    verified: domain.verification.txtRecord.verified,
    description: 'Domain ownership verification',
    required: true
  });
  
  // SPF Record
  records.push({
    type: 'TXT',
    name: domain.domain,
    value: domain.verification.spfRecord.value,
    verified: domain.verification.spfRecord.verified,
    description: 'SPF record for email authentication',
    required: true
  });
  
  // DKIM Records
  domain.verification.dkimRecords.forEach((dkim, i) => {
    records.push({
      type: 'CNAME',
      name: dkim.name,
      value: dkim.value,
      verified: dkim.verified,
      description: `DKIM signature ${i + 1}`,
      required: true
    });
  });
  
  // DMARC Record (recommended)
  records.push({
    type: 'TXT',
    name: domain.verification.dmarcRecord.name,
    value: domain.verification.dmarcRecord.value,
    verified: domain.verification.dmarcRecord.verified,
    description: 'DMARC policy (recommended)',
    required: false
  });
  
  return {
    records,
    tips: [
      'DNS changes can take up to 48 hours to propagate',
      'Make sure to copy the record values exactly',
      'If using Cloudflare, turn off the orange cloud (proxy) for CNAME records',
      'Contact your domain registrar if you need help adding DNS records'
    ]
  };
}

// ==========================================
// QUICK CHECK ENDPOINT
// ==========================================

// Quick DNS check without saving
router.post('/check-dns', auth, async (req, res) => {
  try {
    const { domain, recordType, recordName, expectedValue } = req.body;
    
    let found = false;
    let records = [];
    
    try {
      switch (recordType) {
        case 'TXT':
          const txtRecords = await dns.resolveTxt(recordName);
          records = txtRecords.flat();
          found = records.some(r => r.includes(expectedValue));
          break;
        case 'CNAME':
          records = await dns.resolveCname(recordName);
          found = records.some(r => r.includes(expectedValue));
          break;
        case 'MX':
          const mxRecords = await dns.resolveMx(recordName);
          records = mxRecords.map(r => `${r.priority} ${r.exchange}`);
          found = mxRecords.some(r => r.exchange.includes(expectedValue));
          break;
      }
    } catch (dnsErr) {
      records = [];
      found = false;
    }
    
    res.json({
      found,
      records,
      message: found ? 'Record found!' : 'Record not found. DNS may still be propagating.'
    });
  } catch (err) {
    console.error('DNS check error:', err);
    res.status(500).json({ error: 'Failed to check DNS' });
  }
});

module.exports = router;
