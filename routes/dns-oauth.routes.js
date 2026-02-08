// ============================================
// FILE: routes/dns-oauth.routes.js
// CYBEV DNS Provider OAuth & Connection Routes
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import DNS OAuth service
let dnsOAuth = null;
try {
  dnsOAuth = require('../services/dns-oauth.service');
  console.log('✅ DNS OAuth Service loaded');
} catch (err) {
  console.warn('⚠️ DNS OAuth Service not available:', err.message);
}

// ==========================================
// MODELS
// ==========================================

const DnsConnectionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, required: true },
  providerName: String,
  connected: { type: Boolean, default: false },
  credentials: {
    encrypted: String // Encrypted credentials
  },
  domains: [{ name: String, id: String }],
  lastSync: Date,
  error: String
}, { timestamps: true });

// Compound index for user + provider
DnsConnectionSchema.index({ user: 1, provider: 1 }, { unique: true });

let DnsConnection;
try {
  DnsConnection = mongoose.model('DnsConnection');
} catch (e) {
  DnsConnection = mongoose.model('DnsConnection', DnsConnectionSchema);
}

// OAuth state storage (in-memory, should use Redis in production)
const oauthStates = new Map();

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
// GET AVAILABLE PROVIDERS
// ==========================================

router.get('/providers', auth, async (req, res) => {
  try {
    if (!dnsOAuth) {
      return res.json({ providers: [] });
    }
    
    const providers = Object.entries(dnsOAuth.PROVIDERS).map(function([id, p]) {
      return {
        id: id,
        name: p.name,
        type: p.type,
        logo: p.logo,
        color: p.color,
        fields: p.fields || null,
        helpUrl: p.helpUrl || null,
        note: p.note || null,
        oauthAvailable: p.type === 'oauth' && !!p.clientId
      };
    });
    
    res.json({ providers: providers });
  } catch (err) {
    console.error('Get providers error:', err);
    res.status(500).json({ error: 'Failed to get providers' });
  }
});

// ==========================================
// GET USER'S CONNECTIONS
// ==========================================

router.get('/connections', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const connections = await DnsConnection.find({ user: userId }).select('-credentials');
    
    res.json({ connections: connections });
  } catch (err) {
    console.error('Get connections error:', err);
    res.status(500).json({ error: 'Failed to get connections' });
  }
});

// ==========================================
// OAUTH FLOW - INITIATE
// ==========================================

router.get('/oauth/:provider/start', auth, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.userId || req.user.id;
    
    if (!dnsOAuth) {
      return res.status(503).json({ error: 'DNS OAuth service not available' });
    }
    
    const providerConfig = dnsOAuth.PROVIDERS[provider];
    if (!providerConfig) {
      return res.status(400).json({ error: 'Unknown provider: ' + provider });
    }
    
    if (providerConfig.type !== 'oauth') {
      return res.status(400).json({ error: provider + ' uses API keys, not OAuth' });
    }
    
    // Generate state for CSRF protection
    const state = dnsOAuth.generateState();
    oauthStates.set(state, { userId: userId, provider: provider, timestamp: Date.now() });
    
    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 600000;
    for (const [key, value] of oauthStates.entries()) {
      if (value.timestamp < tenMinutesAgo) {
        oauthStates.delete(key);
      }
    }
    
    const redirectUri = process.env.API_URL + '/api/dns-oauth/oauth/' + provider + '/callback';
    const authUrl = dnsOAuth.getOAuthUrl(provider, redirectUri, state, userId);
    
    res.json({ authUrl: authUrl });
  } catch (err) {
    console.error('OAuth start error:', err);
    res.status(500).json({ error: err.message || 'Failed to start OAuth' });
  }
});

// ==========================================
// OAUTH FLOW - CALLBACK
// ==========================================

router.get('/oauth/:provider/callback', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error } = req.query;
    
    // Build frontend redirect URL
    const frontendUrl = process.env.FRONTEND_URL || 'https://cybev.io';
    const successUrl = frontendUrl + '/studio/email/domains?connected=' + provider;
    const errorUrl = frontendUrl + '/studio/email/domains?error=';
    
    if (error) {
      return res.redirect(errorUrl + encodeURIComponent(error));
    }
    
    if (!code || !state) {
      return res.redirect(errorUrl + encodeURIComponent('Missing code or state'));
    }
    
    // Validate state
    const stateData = oauthStates.get(state);
    if (!stateData) {
      return res.redirect(errorUrl + encodeURIComponent('Invalid or expired state'));
    }
    oauthStates.delete(state);
    
    if (!dnsOAuth) {
      return res.redirect(errorUrl + encodeURIComponent('OAuth service not available'));
    }
    
    // Exchange code for token
    const redirectUri = process.env.API_URL + '/api/dns-oauth/oauth/' + provider + '/callback';
    const tokens = await dnsOAuth.exchangeCodeForToken(provider, code, redirectUri);
    
    // Encrypt and store credentials
    const credentials = dnsOAuth.encrypt(JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + (tokens.expiresIn * 1000)
    }));
    
    // Test connection and get domains
    const testResult = await dnsOAuth.testConnection(provider, { accessToken: tokens.accessToken });
    
    // Save connection
    await DnsConnection.findOneAndUpdate(
      { user: stateData.userId, provider: provider },
      {
        user: stateData.userId,
        provider: provider,
        providerName: dnsOAuth.PROVIDERS[provider].name,
        connected: testResult.success,
        credentials: { encrypted: credentials },
        domains: testResult.success ? testResult.domains.map(function(d) { 
          return { name: typeof d === 'string' ? d : d.name, id: d.id }; 
        }) : [],
        lastSync: new Date(),
        error: testResult.success ? null : testResult.error
      },
      { upsert: true, new: true }
    );
    
    res.redirect(successUrl);
  } catch (err) {
    console.error('OAuth callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'https://cybev.io';
    res.redirect(frontendUrl + '/studio/email/domains?error=' + encodeURIComponent(err.message));
  }
});

// ==========================================
// API KEY CONNECTION
// ==========================================

router.post('/connect/:provider', auth, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.userId || req.user.id;
    const { credentials } = req.body;
    
    if (!dnsOAuth) {
      return res.status(503).json({ error: 'DNS OAuth service not available' });
    }
    
    const providerConfig = dnsOAuth.PROVIDERS[provider];
    if (!providerConfig) {
      return res.status(400).json({ error: 'Unknown provider: ' + provider });
    }
    
    // Validate required fields
    if (providerConfig.fields) {
      for (var i = 0; i < providerConfig.fields.length; i++) {
        var field = providerConfig.fields[i];
        if (!credentials[field.key] && !field.default) {
          return res.status(400).json({ error: 'Missing required field: ' + field.label });
        }
      }
    }
    
    // Add client IP for Namecheap
    if (provider === 'namecheap') {
      credentials.clientIp = req.ip || req.headers['x-forwarded-for'] || '0.0.0.0';
    }
    
    // Test connection
    const testResult = await dnsOAuth.testConnection(provider, credentials);
    
    if (!testResult.success) {
      return res.status(400).json({ 
        error: 'Connection failed: ' + testResult.error,
        details: testResult
      });
    }
    
    // Encrypt and store credentials
    const encryptedCreds = dnsOAuth.encrypt(JSON.stringify(credentials));
    
    // Save connection
    const connection = await DnsConnection.findOneAndUpdate(
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
      domains: testResult.domains
    });
  } catch (err) {
    console.error('Connect error:', err);
    res.status(500).json({ error: err.message || 'Connection failed' });
  }
});

// ==========================================
// DISCONNECT PROVIDER
// ==========================================

router.delete('/connections/:provider', auth, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.userId || req.user.id;
    
    await DnsConnection.deleteOne({ user: userId, provider: provider });
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ==========================================
// SYNC DOMAINS FROM PROVIDER
// ==========================================

router.post('/connections/:provider/sync', auth, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.userId || req.user.id;
    
    if (!dnsOAuth) {
      return res.status(503).json({ error: 'DNS OAuth service not available' });
    }
    
    const connection = await DnsConnection.findOne({ user: userId, provider: provider });
    if (!connection || !connection.connected) {
      return res.status(400).json({ error: 'Provider not connected' });
    }
    
    // Decrypt credentials
    const credentials = JSON.parse(dnsOAuth.decrypt(connection.credentials.encrypted));
    
    // Get domains
    const domains = await dnsOAuth.getDomainsFromProvider(provider, credentials);
    
    // Update connection
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

// ==========================================
// ADD DNS RECORDS AUTOMATICALLY
// ==========================================

router.post('/auto-setup/:provider', auth, async (req, res) => {
  try {
    const { provider } = req.params;
    const { domain, records } = req.body;
    const userId = req.user.userId || req.user.id;
    
    if (!dnsOAuth) {
      return res.status(503).json({ error: 'DNS OAuth service not available' });
    }
    
    if (!domain || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Domain and records are required' });
    }
    
    const connection = await DnsConnection.findOne({ user: userId, provider: provider });
    if (!connection || !connection.connected) {
      return res.status(400).json({ error: 'Provider not connected. Please connect your ' + provider + ' account first.' });
    }
    
    // Decrypt credentials
    const credentials = JSON.parse(dnsOAuth.decrypt(connection.credentials.encrypted));
    
    // Add all records
    const result = await dnsOAuth.addAllDnsRecords(provider, credentials, domain, records);
    
    res.json({
      ok: result.success,
      results: result.results,
      message: result.success 
        ? 'All DNS records added successfully! Verification may take a few minutes.'
        : 'Some records failed. Check the results for details.'
    });
  } catch (err) {
    console.error('Auto-setup error:', err);
    res.status(500).json({ error: err.message || 'Auto-setup failed' });
  }
});

// ==========================================
// CHECK IF DOMAIN IS IN CONNECTED PROVIDER
// ==========================================

router.get('/check-domain/:domain', auth, async (req, res) => {
  try {
    const { domain } = req.params;
    const userId = req.user.userId || req.user.id;
    
    const connections = await DnsConnection.find({ user: userId, connected: true });
    
    const matches = [];
    for (var i = 0; i < connections.length; i++) {
      var conn = connections[i];
      var domainMatch = conn.domains.find(function(d) { return d.name === domain; });
      if (domainMatch) {
        matches.push({
          provider: conn.provider,
          providerName: conn.providerName,
          domainId: domainMatch.id
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
