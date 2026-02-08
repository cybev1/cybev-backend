// ============================================
// FILE: services/dns-oauth.service.js
// CYBEV DNS Provider OAuth Integration
// VERSION: 1.0.0
// 
// Supports:
// - Cloudflare (OAuth + API Token)
// - GoDaddy (API Key)
// - Namecheap (API Key)
// - DigitalOcean (OAuth)
// - Vercel (OAuth)
// ============================================

const crypto = require('crypto');

// ==========================================
// ENCRYPTION FOR STORING TOKENS
// ==========================================

const ENCRYPTION_KEY = process.env.DNS_ENCRYPTION_KEY || 'cybev-dns-oauth-key-32chars!!';
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('Decryption error:', err.message);
    return null;
  }
}

// ==========================================
// PROVIDER CONFIGURATIONS
// ==========================================

const PROVIDERS = {
  cloudflare: {
    name: 'Cloudflare',
    type: 'oauth',
    authUrl: 'https://dash.cloudflare.com/oauth2/authorize',
    tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
    apiUrl: 'https://api.cloudflare.com/client/v4',
    scopes: ['zone:read', 'zone:edit', 'dns_records:read', 'dns_records:edit'],
    clientId: process.env.CLOUDFLARE_CLIENT_ID,
    clientSecret: process.env.CLOUDFLARE_CLIENT_SECRET,
    logo: 'https://www.cloudflare.com/favicon.ico',
    color: '#F38020'
  },
  godaddy: {
    name: 'GoDaddy',
    type: 'apikey',
    apiUrl: 'https://api.godaddy.com/v1',
    logo: 'https://www.godaddy.com/favicon.ico',
    color: '#00A4A6',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'Enter your GoDaddy API Key' },
      { key: 'apiSecret', label: 'API Secret', placeholder: 'Enter your GoDaddy API Secret', secret: true }
    ],
    helpUrl: 'https://developer.godaddy.com/keys'
  },
  namecheap: {
    name: 'Namecheap',
    type: 'apikey',
    apiUrl: 'https://api.namecheap.com/xml.response',
    logo: 'https://www.namecheap.com/favicon.ico',
    color: '#DE3723',
    fields: [
      { key: 'apiUser', label: 'API Username', placeholder: 'Your Namecheap username' },
      { key: 'apiKey', label: 'API Key', placeholder: 'Your Namecheap API Key', secret: true }
    ],
    helpUrl: 'https://www.namecheap.com/support/api/intro/',
    note: 'Your IP must be whitelisted in Namecheap API settings'
  },
  digitalocean: {
    name: 'DigitalOcean',
    type: 'oauth',
    authUrl: 'https://cloud.digitalocean.com/v1/oauth/authorize',
    tokenUrl: 'https://cloud.digitalocean.com/v1/oauth/token',
    apiUrl: 'https://api.digitalocean.com/v2',
    scopes: ['read', 'write'],
    clientId: process.env.DIGITALOCEAN_CLIENT_ID,
    clientSecret: process.env.DIGITALOCEAN_CLIENT_SECRET,
    logo: 'https://www.digitalocean.com/favicon.ico',
    color: '#0080FF'
  },
  vercel: {
    name: 'Vercel',
    type: 'apikey',
    apiUrl: 'https://api.vercel.com',
    logo: 'https://vercel.com/favicon.ico',
    color: '#000000',
    fields: [
      { key: 'token', label: 'Access Token', placeholder: 'Your Vercel Access Token', secret: true }
    ],
    helpUrl: 'https://vercel.com/account/tokens'
  },
  porkbun: {
    name: 'Porkbun',
    type: 'apikey',
    apiUrl: 'https://porkbun.com/api/json/v3',
    logo: 'https://porkbun.com/favicon.ico',
    color: '#F27999',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'pk1_...' },
      { key: 'secretKey', label: 'Secret Key', placeholder: 'sk1_...', secret: true }
    ],
    helpUrl: 'https://porkbun.com/account/api'
  },
  route53: {
    name: 'Amazon Route 53',
    type: 'apikey',
    apiUrl: 'https://route53.amazonaws.com',
    logo: 'https://aws.amazon.com/favicon.ico',
    color: '#FF9900',
    fields: [
      { key: 'accessKeyId', label: 'AWS Access Key ID', placeholder: 'AKIA...' },
      { key: 'secretAccessKey', label: 'AWS Secret Access Key', placeholder: 'Your secret key', secret: true },
      { key: 'region', label: 'Region', placeholder: 'us-east-1', default: 'us-east-1' }
    ],
    helpUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials'
  }
};

// ==========================================
// OAUTH FLOW HELPERS
// ==========================================

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

function getOAuthUrl(provider, redirectUri, state, userId) {
  const config = PROVIDERS[provider];
  if (!config || config.type !== 'oauth') {
    throw new Error('Provider does not support OAuth: ' + provider);
  }
  
  if (!config.clientId) {
    throw new Error('OAuth not configured for ' + provider + '. Missing client ID.');
  }
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: state + ':' + userId + ':' + provider
  });
  
  return config.authUrl + '?' + params.toString();
}

async function exchangeCodeForToken(provider, code, redirectUri) {
  const config = PROVIDERS[provider];
  if (!config || config.type !== 'oauth') {
    throw new Error('Provider does not support OAuth');
  }
  
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }).toString()
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error('Token exchange failed: ' + error);
  }
  
  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type
  };
}

// ==========================================
// CLOUDFLARE API
// ==========================================

async function cloudflareRequest(accessToken, endpoint, method, body) {
  const response = await fetch(PROVIDERS.cloudflare.apiUrl + endpoint, {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'Cloudflare API error');
  }
  return data.result;
}

async function cloudflareGetZones(accessToken) {
  return await cloudflareRequest(accessToken, '/zones', 'GET');
}

async function cloudflareGetZoneByDomain(accessToken, domain) {
  const zones = await cloudflareGetZones(accessToken);
  return zones.find(function(z) { return z.name === domain; });
}

async function cloudflareAddDnsRecord(accessToken, zoneId, record) {
  return await cloudflareRequest(accessToken, '/zones/' + zoneId + '/dns_records', 'POST', {
    type: record.type,
    name: record.name,
    content: record.value,
    ttl: 1, // Auto
    proxied: false
  });
}

async function cloudflareGetDnsRecords(accessToken, zoneId) {
  return await cloudflareRequest(accessToken, '/zones/' + zoneId + '/dns_records', 'GET');
}

// ==========================================
// GODADDY API
// ==========================================

async function godaddyRequest(apiKey, apiSecret, endpoint, method, body) {
  const response = await fetch(PROVIDERS.godaddy.apiUrl + endpoint, {
    method: method || 'GET',
    headers: {
      'Authorization': 'sso-key ' + apiKey + ':' + apiSecret,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    const error = await response.json().catch(function() { return {}; });
    throw new Error(error.message || 'GoDaddy API error: ' + response.status);
  }
  
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

async function godaddyGetDomains(apiKey, apiSecret) {
  return await godaddyRequest(apiKey, apiSecret, '/domains', 'GET');
}

async function godaddyGetDnsRecords(apiKey, apiSecret, domain) {
  return await godaddyRequest(apiKey, apiSecret, '/domains/' + domain + '/records', 'GET');
}

async function godaddyAddDnsRecord(apiKey, apiSecret, domain, record) {
  // GoDaddy uses PATCH to add records
  const recordName = record.name.replace('.' + domain, '').replace(domain, '@');
  
  return await godaddyRequest(apiKey, apiSecret, '/domains/' + domain + '/records', 'PATCH', [{
    type: record.type,
    name: recordName === '' ? '@' : recordName,
    data: record.value,
    ttl: 600
  }]);
}

// ==========================================
// NAMECHEAP API
// ==========================================

async function namecheapRequest(apiUser, apiKey, command, params) {
  const clientIp = params.clientIp || '0.0.0.0';
  
  const queryParams = new URLSearchParams({
    ApiUser: apiUser,
    ApiKey: apiKey,
    UserName: apiUser,
    Command: command,
    ClientIp: clientIp,
    ...params
  });
  
  const response = await fetch(PROVIDERS.namecheap.apiUrl + '?' + queryParams.toString());
  const text = await response.text();
  
  if (text.includes('Status="ERROR"')) {
    const errorMatch = text.match(/<Error[^>]*>([^<]+)<\/Error>/);
    throw new Error(errorMatch ? errorMatch[1] : 'Namecheap API error');
  }
  
  return text;
}

async function namecheapGetDomains(apiUser, apiKey, clientIp) {
  const response = await namecheapRequest(apiUser, apiKey, 'namecheap.domains.getList', { clientIp: clientIp });
  // Parse XML response
  const domains = [];
  const matches = response.matchAll(/<Domain[^>]+Name="([^"]+)"/g);
  for (const match of matches) {
    domains.push({ name: match[1] });
  }
  return domains;
}

async function namecheapAddDnsRecord(apiUser, apiKey, domain, record, clientIp) {
  const parts = domain.split('.');
  const tld = parts.pop();
  const sld = parts.join('.');
  
  // Get existing records first
  const existingResponse = await namecheapRequest(apiUser, apiKey, 'namecheap.domains.dns.getHosts', {
    SLD: sld,
    TLD: tld,
    clientIp: clientIp
  });
  
  // Parse existing records and add new one
  // Namecheap requires sending ALL records when updating
  const recordName = record.name.replace('.' + domain, '').replace(domain, '@');
  
  return await namecheapRequest(apiUser, apiKey, 'namecheap.domains.dns.setHosts', {
    SLD: sld,
    TLD: tld,
    HostName1: recordName === '' ? '@' : recordName,
    RecordType1: record.type,
    Address1: record.value,
    TTL1: '300',
    clientIp: clientIp
  });
}

// ==========================================
// DIGITALOCEAN API
// ==========================================

async function digitaloceanRequest(accessToken, endpoint, method, body) {
  const response = await fetch(PROVIDERS.digitalocean.apiUrl + endpoint, {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    const error = await response.json().catch(function() { return {}; });
    throw new Error(error.message || 'DigitalOcean API error');
  }
  
  return await response.json();
}

async function digitaloceanGetDomains(accessToken) {
  const data = await digitaloceanRequest(accessToken, '/domains', 'GET');
  return data.domains || [];
}

async function digitaloceanAddDnsRecord(accessToken, domain, record) {
  const recordName = record.name.replace('.' + domain, '').replace(domain, '@');
  
  return await digitaloceanRequest(accessToken, '/domains/' + domain + '/records', 'POST', {
    type: record.type,
    name: recordName === '' ? '@' : recordName,
    data: record.value,
    ttl: 300
  });
}

// ==========================================
// VERCEL API
// ==========================================

async function vercelRequest(token, endpoint, method, body) {
  const response = await fetch(PROVIDERS.vercel.apiUrl + endpoint, {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    const error = await response.json().catch(function() { return {}; });
    throw new Error(error.error?.message || 'Vercel API error');
  }
  
  return await response.json();
}

async function vercelGetDomains(token) {
  const data = await vercelRequest(token, '/v5/domains', 'GET');
  return data.domains || [];
}

async function vercelAddDnsRecord(token, domain, record) {
  const recordName = record.name.replace('.' + domain, '').replace(domain, '@');
  
  return await vercelRequest(token, '/v2/domains/' + domain + '/records', 'POST', {
    type: record.type,
    name: recordName === '' ? '@' : recordName,
    value: record.value,
    ttl: 300
  });
}

// ==========================================
// PORKBUN API
// ==========================================

async function porkbunRequest(apiKey, secretKey, endpoint, body) {
  const response = await fetch(PROVIDERS.porkbun.apiUrl + endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      apikey: apiKey,
      secretapikey: secretKey,
      ...body
    })
  });
  
  const data = await response.json();
  if (data.status !== 'SUCCESS') {
    throw new Error(data.message || 'Porkbun API error');
  }
  return data;
}

async function porkbunGetDomains(apiKey, secretKey) {
  const data = await porkbunRequest(apiKey, secretKey, '/domain/listAll', {});
  return data.domains || [];
}

async function porkbunAddDnsRecord(apiKey, secretKey, domain, record) {
  const recordName = record.name.replace('.' + domain, '').replace(domain, '');
  
  return await porkbunRequest(apiKey, secretKey, '/dns/create/' + domain, {
    type: record.type,
    name: recordName,
    content: record.value,
    ttl: '300'
  });
}

// ==========================================
// UNIVERSAL FUNCTIONS
// ==========================================

async function addDnsRecordToProvider(provider, credentials, domain, record) {
  switch (provider) {
    case 'cloudflare':
      var zone = await cloudflareGetZoneByDomain(credentials.accessToken, domain);
      if (!zone) throw new Error('Domain not found in Cloudflare account');
      return await cloudflareAddDnsRecord(credentials.accessToken, zone.id, record);
      
    case 'godaddy':
      return await godaddyAddDnsRecord(credentials.apiKey, credentials.apiSecret, domain, record);
      
    case 'namecheap':
      return await namecheapAddDnsRecord(credentials.apiUser, credentials.apiKey, domain, record, credentials.clientIp);
      
    case 'digitalocean':
      return await digitaloceanAddDnsRecord(credentials.accessToken, domain, record);
      
    case 'vercel':
      return await vercelAddDnsRecord(credentials.token, domain, record);
      
    case 'porkbun':
      return await porkbunAddDnsRecord(credentials.apiKey, credentials.secretKey, domain, record);
      
    default:
      throw new Error('Provider not supported for auto-setup: ' + provider);
  }
}

async function getDomainsFromProvider(provider, credentials) {
  switch (provider) {
    case 'cloudflare':
      return await cloudflareGetZones(credentials.accessToken);
      
    case 'godaddy':
      return await godaddyGetDomains(credentials.apiKey, credentials.apiSecret);
      
    case 'namecheap':
      return await namecheapGetDomains(credentials.apiUser, credentials.apiKey, credentials.clientIp);
      
    case 'digitalocean':
      return await digitaloceanGetDomains(credentials.accessToken);
      
    case 'vercel':
      return await vercelGetDomains(credentials.token);
      
    case 'porkbun':
      return await porkbunGetDomains(credentials.apiKey, credentials.secretKey);
      
    default:
      throw new Error('Provider not supported: ' + provider);
  }
}

async function testConnection(provider, credentials) {
  try {
    const domains = await getDomainsFromProvider(provider, credentials);
    return {
      success: true,
      domainCount: domains.length,
      domains: domains.slice(0, 5).map(function(d) { return d.name || d; })
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

// ==========================================
// ADD ALL DNS RECORDS FOR DOMAIN
// ==========================================

async function addAllDnsRecords(provider, credentials, domain, records) {
  const results = [];
  
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    try {
      await addDnsRecordToProvider(provider, credentials, domain, record);
      results.push({ record: record, success: true });
      // Small delay between records
      await new Promise(function(r) { setTimeout(r, 500); });
    } catch (err) {
      results.push({ record: record, success: false, error: err.message });
    }
  }
  
  return {
    success: results.every(function(r) { return r.success; }),
    results: results
  };
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  PROVIDERS: PROVIDERS,
  encrypt: encrypt,
  decrypt: decrypt,
  generateState: generateState,
  getOAuthUrl: getOAuthUrl,
  exchangeCodeForToken: exchangeCodeForToken,
  testConnection: testConnection,
  getDomainsFromProvider: getDomainsFromProvider,
  addDnsRecordToProvider: addDnsRecordToProvider,
  addAllDnsRecords: addAllDnsRecords,
  // Provider-specific exports
  cloudflare: {
    getZones: cloudflareGetZones,
    getZoneByDomain: cloudflareGetZoneByDomain,
    addDnsRecord: cloudflareAddDnsRecord,
    getDnsRecords: cloudflareGetDnsRecords
  },
  godaddy: {
    getDomains: godaddyGetDomains,
    getDnsRecords: godaddyGetDnsRecords,
    addDnsRecord: godaddyAddDnsRecord
  },
  digitalocean: {
    getDomains: digitaloceanGetDomains,
    addDnsRecord: digitaloceanAddDnsRecord
  },
  vercel: {
    getDomains: vercelGetDomains,
    addDnsRecord: vercelAddDnsRecord
  },
  porkbun: {
    getDomains: porkbunGetDomains,
    addDnsRecord: porkbunAddDnsRecord
  }
};
