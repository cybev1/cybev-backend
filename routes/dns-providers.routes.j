// ============================================
// FILE: routes/dns-providers.routes.js
// CYBEV DNS Provider Connection Routes (Simplified)
// VERSION: 1.0.0
// No OAuth - just API keys
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import DNS service
var dnsService = null;
try {
  dnsService = require('../services/dns-providers.service');
  console.log('✅ DNS Providers Service loaded');
} catch (err) {
  console.warn('⚠️ DNS Providers Service not available:', err.message);
}

// ==========================================
// MODEL
// ==========================================

var DnsConnectionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, required: true },
  providerName: String,
  connected: { type: Boolean, default: false },
  credentials: { encrypted: String },
  domains: [{ name: String, id: String }],
  lastSync: Date,
  error: String
}, { timestamps: true });

DnsConnectionSchema.index({ user: 1, provider: 1 }, { unique: true });

var DnsConnection;
try {
  DnsConnection = mongoose.model('DnsConnection');
} catch (e) {
  DnsConnection = mongoose.model('DnsConnection', DnsConnectionSchema);
}

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

var auth = function(req, res, next) {
  var token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    var jwt = require('jsonwebtoken');
    var decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// ROUTES
// ==========================================

// Get available providers
router.get('/providers', auth, function(req, res) {
  if (!dnsService) {
    return res.json({ providers: [] });
  }
  
  var providers = Object.keys(dnsService.PROVIDERS).map(function(id) {
    var p = dnsService.PROVIDERS[id];
    return {
      id: id,
      name: p.name,
      logo: p.logo,
      color: p.color,
      fields: p.fields,
      helpUrl: p.helpUrl,
      helpText: p.helpText,
      note: p.note || null
    };
  });
  
  res.json({ providers: providers });
});

// Get user's connections
router.get('/connections', auth, async function(req, res) {
  try {
    var userId = req.user.userId || req.user.id;
    var connections = await DnsConnection.find({ user: userId }).select('-credentials');
    res.json({ connections: connections });
  } catch (err) {
    console.error('Get connections error:', err);
    res.status(500).json({ error: 'Failed to get connections' });
  }
});

// Connect a provider
router.post('/connect/:provider', auth, async function(req, res) {
  try {
    var provider = req.params.provider;
    var userId = req.user.userId || req.user.id;
    var credentials = req.body.credentials;
    
    if (!dnsService) {
      return res.status(503).json({ error: 'DNS service not available' });
    }
    
    var providerConfig = dnsService.PROVIDERS[provider];
    if (!providerConfig) {
      return res.status(400).json({ error: 'Unknown provider: ' + provider });
    }
    
    // Validate required fields
    for (var i = 0; i < providerConfig.fields.length; i++) {
      var field = providerConfig.fields[i];
      if (!credentials[field.key]) {
        return res.status(400).json({ error: 'Missing: ' + field.label });
      }
    }
    
    // Add client IP for Namecheap
    if (provider === 'namecheap') {
      credentials.clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || '127.0.0.1';
    }
    
    // Test connection
    console.log('🔌 Testing connection to ' + provider + '...');
    var testResult = await dnsService.testConnection(provider, credentials);
    
    if (!testResult.success) {
      return res.status(400).json({ 
        error: 'Connection failed: ' + testResult.error
      });
    }
    
    console.log('✅ Connected to ' + provider + ': ' + testResult.domainCount + ' domains found');
    
    // Encrypt and store
    var encryptedCreds = dnsService.encrypt(JSON.stringify(credentials));
    
    var connection = await DnsConnection.findOneAndUpdate(
      { user: userId, provider: provider },
      {
        user: userId,
        provider: provider,
        providerName: providerConfig.name,
        connected: true,
        credentials: { encrypted: encryptedCreds },
        domains: testResult.domains.map(function(d) { 
          return { name: typeof d === 'string' ? d : d.name, id: d.id }; 
        }),
        lastSync: new Date(),
        error: null
      },
      { upsert: true, new: true }
    );
    
    res.json({ 
      ok: true, 
      connection: {
        _id: connection._id,
        provider: connection.provider,
        providerName: connection.providerName,
        connected: connection.connected,
        domains: connection.domains,
        lastSync: connection.lastSync
      },
      domainCount: testResult.domainCount
    });
  } catch (err) {
    console.error('Connect error:', err);
    res.status(500).json({ error: err.message || 'Connection failed' });
  }
});

// Disconnect a provider
router.delete('/connections/:provider', auth, async function(req, res) {
  try {
    var provider = req.params.provider;
    var userId = req.user.userId || req.user.id;
    
    await DnsConnection.deleteOne({ user: userId, provider: provider });
    console.log('🔌 Disconnected ' + provider + ' for user ' + userId);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync domains from provider
router.post('/connections/:provider/sync', auth, async function(req, res) {
  try {
    var provider = req.params.provider;
    var userId = req.user.userId || req.user.id;
    
    if (!dnsService) {
      return res.status(503).json({ error: 'DNS service not available' });
    }
    
    var connection = await DnsConnection.findOne({ user: userId, provider: provider });
    if (!connection || !connection.connected) {
      return res.status(400).json({ error: 'Provider not connected' });
    }
    
    var credentials = JSON.parse(dnsService.decrypt(connection.credentials.encrypted));
    var domains = await dnsService.getDomains(provider, credentials);
    
    connection.domains = domains.map(function(d) { 
      return { name: typeof d === 'string' ? d : d.name, id: d.id }; 
    });
    connection.lastSync = new Date();
    await connection.save();
    
    res.json({ 
      ok: true, 
      domains: connection.domains,
      lastSync: connection.lastSync
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// Auto-add DNS records
router.post('/auto-setup/:provider', auth, async function(req, res) {
  try {
    var provider = req.params.provider;
    var domain = req.body.domain;
    var records = req.body.records;
    var userId = req.user.userId || req.user.id;
    
    if (!dnsService) {
      return res.status(503).json({ error: 'DNS service not available' });
    }
    
    if (!domain || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Domain and records are required' });
    }
    
    var connection = await DnsConnection.findOne({ user: userId, provider: provider });
    if (!connection || !connection.connected) {
      return res.status(400).json({ error: 'Please connect your ' + provider + ' account first' });
    }
    
    var credentials = JSON.parse(dnsService.decrypt(connection.credentials.encrypted));
    
    console.log('🚀 Auto-setup DNS for ' + domain + ' via ' + provider);
    var result = await dnsService.addAllDnsRecords(provider, credentials, domain, records);
    
    res.json({
      ok: result.success,
      successCount: result.successCount,
      totalCount: result.totalCount,
      results: result.results,
      message: result.success 
        ? 'All ' + result.successCount + ' DNS records added successfully!'
        : result.successCount + ' of ' + result.totalCount + ' records added. Check results for details.'
    });
  } catch (err) {
    console.error('Auto-setup error:', err);
    res.status(500).json({ error: err.message || 'Auto-setup failed' });
  }
});

// Check if domain exists in connected provider
router.get('/check-domain/:domain', auth, async function(req, res) {
  try {
    var domain = req.params.domain;
    var userId = req.user.userId || req.user.id;
    
    var connections = await DnsConnection.find({ user: userId, connected: true });
    
    var matches = [];
    for (var i = 0; i < connections.length; i++) {
      var conn = connections[i];
      var found = conn.domains.find(function(d) { return d.name === domain; });
      if (found) {
        matches.push({
          provider: conn.provider,
          providerName: conn.providerName
        });
      }
    }
    
    res.json({
      found: matches.length > 0,
      matches: matches
    });
  } catch (err) {
    console.error('Check domain error:', err);
    res.status(500).json({ error: 'Failed to check domain' });
  }
});

module.exports = router;
