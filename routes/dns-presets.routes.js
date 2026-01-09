// ============================================
// FILE: routes/dns-presets.routes.js
// DNS Template Presets - One-click Setup - v6.4
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const getDomainModel = () => mongoose.models.Domain || require('../models/domain.model');

let domainService;
try { domainService = require('../services/domain.service'); } catch (err) {}

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// DNS Presets
const DNS_PRESETS = {
  cybev: {
    name: 'CYBEV Website',
    description: 'Point domain to your CYBEV site',
    icon: '🌐',
    records: [
      { type: 'CNAME', name: '@', value: 'sites.cybev.io', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: 'sites.cybev.io', ttl: 3600 },
      { type: 'TXT', name: '_cybev-verify', value: '{{VERIFICATION_TOKEN}}', ttl: 3600 }
    ],
    nameservers: ['ns1.cybev.io', 'ns2.cybev.io']
  },
  googleWorkspace: {
    name: 'Google Workspace Email',
    description: 'Gmail for your domain',
    icon: '📧',
    records: [
      { type: 'MX', name: '@', value: 'aspmx.l.google.com', priority: 1, ttl: 3600 },
      { type: 'MX', name: '@', value: 'alt1.aspmx.l.google.com', priority: 5, ttl: 3600 },
      { type: 'MX', name: '@', value: 'alt2.aspmx.l.google.com', priority: 5, ttl: 3600 },
      { type: 'MX', name: '@', value: 'alt3.aspmx.l.google.com', priority: 10, ttl: 3600 },
      { type: 'MX', name: '@', value: 'alt4.aspmx.l.google.com', priority: 10, ttl: 3600 },
      { type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 }
    ]
  },
  microsoft365: {
    name: 'Microsoft 365 Email',
    description: 'Outlook for your domain',
    icon: '📬',
    records: [
      { type: 'MX', name: '@', value: '{{DOMAIN}}.mail.protection.outlook.com', priority: 0, ttl: 3600 },
      { type: 'TXT', name: '@', value: 'v=spf1 include:spf.protection.outlook.com -all', ttl: 3600 },
      { type: 'CNAME', name: 'autodiscover', value: 'autodiscover.outlook.com', ttl: 3600 }
    ]
  },
  zohoMail: {
    name: 'Zoho Mail',
    description: 'Zoho email for your domain',
    icon: '✉️',
    records: [
      { type: 'MX', name: '@', value: 'mx.zoho.com', priority: 10, ttl: 3600 },
      { type: 'MX', name: '@', value: 'mx2.zoho.com', priority: 20, ttl: 3600 },
      { type: 'MX', name: '@', value: 'mx3.zoho.com', priority: 50, ttl: 3600 },
      { type: 'TXT', name: '@', value: 'v=spf1 include:zoho.com ~all', ttl: 3600 }
    ]
  },
  vercel: {
    name: 'Vercel Hosting',
    description: 'Point to Vercel deployment',
    icon: '▲',
    records: [
      { type: 'A', name: '@', value: '76.76.21.21', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', ttl: 3600 }
    ]
  },
  netlify: {
    name: 'Netlify Hosting',
    description: 'Point to Netlify site',
    icon: '🔷',
    records: [
      { type: 'A', name: '@', value: '75.2.60.5', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: '{{netlifySubdomain}}.netlify.app', ttl: 3600 }
    ],
    requiresInput: ['netlifySubdomain']
  },
  cloudflare: {
    name: 'Cloudflare Pages',
    description: 'Point to Cloudflare Pages',
    icon: '☁️',
    records: [
      { type: 'CNAME', name: '@', value: '{{project}}.pages.dev', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: '{{project}}.pages.dev', ttl: 3600 }
    ],
    requiresInput: ['project']
  },
  github: {
    name: 'GitHub Pages',
    description: 'Point to GitHub Pages',
    icon: '🐙',
    records: [
      { type: 'A', name: '@', value: '185.199.108.153', ttl: 3600 },
      { type: 'A', name: '@', value: '185.199.109.153', ttl: 3600 },
      { type: 'A', name: '@', value: '185.199.110.153', ttl: 3600 },
      { type: 'A', name: '@', value: '185.199.111.153', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: '{{username}}.github.io', ttl: 3600 }
    ],
    requiresInput: ['username']
  },
  shopify: {
    name: 'Shopify Store',
    description: 'Connect to Shopify',
    icon: '🛒',
    records: [
      { type: 'A', name: '@', value: '23.227.38.65', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: 'shops.myshopify.com', ttl: 3600 }
    ]
  },
  cybevWithEmail: {
    name: 'CYBEV + Google Email',
    description: 'Website + Gmail combo',
    icon: '🚀',
    records: [
      { type: 'CNAME', name: '@', value: 'sites.cybev.io', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: 'sites.cybev.io', ttl: 3600 },
      { type: 'MX', name: '@', value: 'aspmx.l.google.com', priority: 1, ttl: 3600 },
      { type: 'MX', name: '@', value: 'alt1.aspmx.l.google.com', priority: 5, ttl: 3600 },
      { type: 'MX', name: '@', value: 'alt2.aspmx.l.google.com', priority: 5, ttl: 3600 },
      { type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com include:cybev.io ~all', ttl: 3600 }
    ]
  },
  redirect: {
    name: 'URL Redirect',
    description: 'Redirect to another URL',
    icon: '↗️',
    records: [
      { type: 'A', name: '@', value: '{{redirectIP}}', ttl: 3600 },
      { type: 'CNAME', name: 'www', value: '{{redirectTarget}}', ttl: 3600 }
    ],
    requiresInput: ['redirectIP', 'redirectTarget']
  }
};

// GET /api/dns-presets - List all presets
router.get('/', async (req, res) => {
  try {
    const presets = Object.entries(DNS_PRESETS).map(([id, preset]) => ({
      id,
      name: preset.name,
      description: preset.description,
      icon: preset.icon,
      requiresInput: preset.requiresInput || []
    }));
    res.json({ ok: true, presets });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/dns-presets/:presetId - Get preset details
router.get('/:presetId', async (req, res) => {
  try {
    const preset = DNS_PRESETS[req.params.presetId];
    if (!preset) return res.status(404).json({ ok: false, error: 'Preset not found' });
    res.json({ ok: true, preset: { id: req.params.presetId, ...preset } });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/dns-presets/apply - Apply preset to domain
router.post('/apply', verifyToken, async (req, res) => {
  try {
    const { domainId, presetId, inputs = {} } = req.body;

    if (!domainId || !presetId) return res.status(400).json({ ok: false, error: 'Domain and preset required' });

    const preset = DNS_PRESETS[presetId];
    if (!preset) return res.status(404).json({ ok: false, error: 'Preset not found' });

    // Check required inputs
    if (preset.requiresInput) {
      for (const input of preset.requiresInput) {
        if (!inputs[input]) return res.status(400).json({ ok: false, error: `Missing: ${input}` });
      }
    }

    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: domainId, owner: req.user.id });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    // Process records with variable substitution
    const processedRecords = preset.records.map(record => {
      let value = record.value;
      value = value.replace('{{VERIFICATION_TOKEN}}', domain.registrar?.authCode || `cybev-${domain._id}`);
      value = value.replace('{{DOMAIN}}', domain.domain.replace(/\./g, '-'));
      Object.entries(inputs).forEach(([key, val]) => {
        value = value.replace(`{{${key}}}`, val);
      });
      return { ...record, value };
    });

    // Apply DNS records
    const results = [];
    if (domainService?.isConfigured?.()) {
      for (const record of processedRecords) {
        try {
          const result = await domainService.addDNSRecord(domain.domain, record);
          results.push({ ...record, success: result.success, recordId: result.recordId });
        } catch (err) {
          results.push({ ...record, success: false, error: err.message });
        }
      }
      if (preset.nameservers) {
        await domainService.updateNameservers(domain.domain, preset.nameservers);
      }
    }

    // Update domain record
    domain.dns.preset = presetId;
    domain.dns.records = processedRecords.map((r, i) => ({ ...r, id: results[i]?.recordId || `local-${i}` }));
    domain.dns.nameservers = preset.nameservers || domain.dns.nameservers;
    domain.dns.configured = results.length === 0 || results.some(r => r.success);
    await domain.save();

    res.json({
      ok: true,
      message: `Applied ${preset.name} preset`,
      results,
      domain: { domain: domain.domain, dns: domain.dns }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/dns-presets/preview - Preview records for a preset
router.post('/preview', verifyToken, async (req, res) => {
  try {
    const { presetId, inputs = {}, domainName } = req.body;

    const preset = DNS_PRESETS[presetId];
    if (!preset) return res.status(404).json({ ok: false, error: 'Preset not found' });

    const processedRecords = preset.records.map(record => {
      let value = record.value;
      value = value.replace('{{VERIFICATION_TOKEN}}', `cybev-preview`);
      value = value.replace('{{DOMAIN}}', (domainName || 'example.com').replace(/\./g, '-'));
      Object.entries(inputs).forEach(([key, val]) => {
        value = value.replace(`{{${key}}}`, val);
      });
      return { ...record, value };
    });

    res.json({ ok: true, preset: { id: presetId, name: preset.name }, records: processedRecords, nameservers: preset.nameservers || [] });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/dns-presets/domain/:domainId - Get current DNS config
router.get('/domain/:domainId', verifyToken, async (req, res) => {
  try {
    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: req.params.domainId, owner: req.user.id });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    let liveRecords = [];
    if (domainService?.isConfigured?.()) {
      try { liveRecords = await domainService.getDNSRecords(domain.domain); } catch (err) {}
    }

    res.json({
      ok: true,
      domain: domain.domain,
      currentPreset: domain.dns.preset,
      configured: domain.dns.configured,
      savedRecords: domain.dns.records,
      liveRecords,
      nameservers: domain.dns.nameservers
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/dns-presets/reset/:domainId - Reset to CYBEV defaults
router.post('/reset/:domainId', verifyToken, async (req, res) => {
  try {
    const Domain = getDomainModel();
    const domain = await Domain.findOne({ _id: req.params.domainId, owner: req.user.id });
    if (!domain) return res.status(404).json({ ok: false, error: 'Domain not found' });

    const cybevPreset = DNS_PRESETS.cybev;

    if (domainService?.isConfigured?.()) {
      await domainService.setupCYBEVDNS(domain.domain, domain.domain.split('.')[0]);
    }

    domain.dns.preset = 'cybev';
    domain.dns.records = cybevPreset.records.map(r => ({ ...r, value: r.value.replace('{{VERIFICATION_TOKEN}}', `cybev-${domain._id}`) }));
    domain.dns.nameservers = cybevPreset.nameservers;
    domain.dns.configured = true;
    await domain.save();

    res.json({ ok: true, message: 'DNS reset to CYBEV defaults', dns: domain.dns });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
