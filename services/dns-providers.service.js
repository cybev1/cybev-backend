// ============================================
// FILE: services/dns-providers.service.js
// CYBEV DNS Provider Integration (Simplified)
// VERSION: 1.0.0
// 
// Supports: Cloudflare, GoDaddy, Namecheap, Porkbun
// All via API keys (no OAuth complexity)
// ============================================

const crypto = require('crypto');

// ==========================================
// ENCRYPTION FOR STORING USER CREDENTIALS
// ==========================================

const ENCRYPTION_KEY = process.env.DNS_ENCRYPTION_KEY || 'cybev-dns-secure-key-2026-feb!!';
const IV_LENGTH = 16;

function encrypt(text) {
  var iv = crypto.randomBytes(IV_LENGTH);
  var cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  var encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  try {
    var parts = text.split(':');
    var iv = Buffer.from(parts[0], 'hex');
    var encrypted = Buffer.from(parts[1], 'hex');
    var decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
    var decrypted = decipher.update(encrypted);
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
    logo: 'https://www.cloudflare.com/favicon.ico',
    color: '#F38020',
    fields: [
      { key: 'apiToken', label: 'API Token', placeholder: 'Your Cloudflare API Token', secret: true }
    ],
    helpUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    helpText: 'Create a token with "Zone.DNS" edit permissions'
  },
  godaddy: {
    name: 'GoDaddy',
    logo: 'https://www.godaddy.com/favicon.ico',
    color: '#00A4A6',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'Your GoDaddy API Key' },
      { key: 'apiSecret', label: 'API Secret', placeholder: 'Your GoDaddy API Secret', secret: true }
    ],
    helpUrl: 'https://developer.godaddy.com/keys',
    helpText: 'Create a Production API key'
  },
  namecheap: {
    name: 'Namecheap',
    logo: 'https://www.namecheap.com/favicon.ico',
    color: '#DE3723',
    fields: [
      { key: 'apiUser', label: 'API Username', placeholder: 'Your Namecheap username' },
      { key: 'apiKey', label: 'API Key', placeholder: 'Your Namecheap API Key', secret: true }
    ],
    helpUrl: 'https://www.namecheap.com/support/api/intro/',
    helpText: 'Enable API access and whitelist your IP address',
    note: 'Your IP must be whitelisted in Namecheap API settings'
  },
  porkbun: {
    name: 'Porkbun',
    logo: 'https://porkbun.com/favicon.ico',
    color: '#F27999',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'pk1_...' },
      { key: 'secretKey', label: 'Secret Key', placeholder: 'sk1_...', secret: true }
    ],
    helpUrl: 'https://porkbun.com/account/api',
    helpText: 'Enable API access in your account settings'
  }
};

// ==========================================
// CLOUDFLARE API
// ==========================================

async function cloudflareRequest(apiToken, endpoint, method, body) {
  var response = await fetch('https://api.cloudflare.com/client/v4' + endpoint, {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + apiToken,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  var data = await response.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'Cloudflare API error');
  }
  return data.result;
}

async function cloudflareGetZones(apiToken) {
  return await cloudflareRequest(apiToken, '/zones?per_page=50', 'GET');
}

async function cloudflareGetZoneByDomain(apiToken, domain) {
  var zones = await cloudflareGetZones(apiToken);
  return zones.find(function(z) { return z.name === domain; });
}

async function cloudflareAddRecord(apiToken, zoneId, record) {
  return await cloudflareRequest(apiToken, '/zones/' + zoneId + '/dns_records', 'POST', {
    type: record.type,
    name: record.name,
    content: record.value,
    ttl: 1,
    proxied: false
  });
}

// ==========================================
// GODADDY API
// ==========================================

async function godaddyRequest(apiKey, apiSecret, endpoint, method, body) {
  var response = await fetch('https://api.godaddy.com/v1' + endpoint, {
    method: method || 'GET',
    headers: {
      'Authorization': 'sso-key ' + apiKey + ':' + apiSecret,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    var error = await response.json().catch(function() { return {}; });
    throw new Error(error.message || 'GoDaddy API error: ' + response.status);
  }
  
  var text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

async function godaddyGetDomains(apiKey, apiSecret) {
  return await godaddyRequest(apiKey, apiSecret, '/domains?statuses=ACTIVE', 'GET');
}

async function godaddyAddRecord(apiKey, apiSecret, domain, record) {
  var recordName = record.name.replace('.' + domain, '').replace(domain, '@');
  if (recordName === '') recordName = '@';
  
  return await godaddyRequest(apiKey, apiSecret, '/domains/' + domain + '/records', 'PATCH', [{
    type: record.type,
    name: recordName,
    data: record.value,
    ttl: 600
  }]);
}

// ==========================================
// NAMECHEAP API
// ==========================================

async function namecheapRequest(apiUser, apiKey, command, params, clientIp) {
  var queryParams = new URLSearchParams({
    ApiUser: apiUser,
    ApiKey: apiKey,
    UserName: apiUser,
    Command: command,
    ClientIp: clientIp || '127.0.0.1'
  });
  
  // Add extra params
  for (var key in params) {
    queryParams.append(key, params[key]);
  }
  
  var response = await fetch('https://api.namecheap.com/xml.response?' + queryParams.toString());
  var text = await response.text();
  
  if (text.includes('Status="ERROR"')) {
    var errorMatch = text.match(/<Error[^>]*>([^<]+)<\/Error>/);
    throw new Error(errorMatch ? errorMatch[1] : 'Namecheap API error');
  }
  
  return text;
}

async function namecheapGetDomains(apiUser, apiKey, clientIp) {
  var response = await namecheapRequest(apiUser, apiKey, 'namecheap.domains.getList', {}, clientIp);
  var domains = [];
  var matches = response.matchAll(/Name="([^"]+)"/g);
  for (var match of matches) {
    if (match[1].includes('.')) {
      domains.push({ name: match[1] });
    }
  }
  return domains;
}

async function namecheapAddRecord(apiUser, apiKey, domain, record, clientIp) {
  var parts = domain.split('.');
  var tld = parts.pop();
  var sld = parts.join('.');
  
  var recordName = record.name.replace('.' + domain, '').replace(domain, '@');
  if (recordName === '') recordName = '@';
  
  // Note: Namecheap requires all records to be sent together
  // This simplified version just adds one record
  return await namecheapRequest(apiUser, apiKey, 'namecheap.domains.dns.setHosts', {
    SLD: sld,
    TLD: tld,
    HostName1: recordName,
    RecordType1: record.type,
    Address1: record.value,
    TTL1: '300'
  }, clientIp);
}

// ==========================================
// PORKBUN API
// ==========================================

async function porkbunRequest(apiKey, secretKey, endpoint, extraBody) {
  var body = {
    apikey: apiKey,
    secretapikey: secretKey
  };
  
  if (extraBody) {
    for (var key in extraBody) {
      body[key] = extraBody[key];
    }
  }
  
  var response = await fetch('https://porkbun.com/api/json/v3' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  var data = await response.json();
  if (data.status !== 'SUCCESS') {
    throw new Error(data.message || 'Porkbun API error');
  }
  return data;
}

async function porkbunGetDomains(apiKey, secretKey) {
  var data = await porkbunRequest(apiKey, secretKey, '/domain/listAll', {});
  return (data.domains || []).map(function(d) { return { name: d.domain }; });
}

async function porkbunAddRecord(apiKey, secretKey, domain, record) {
  var recordName = record.name.replace('.' + domain, '').replace(domain, '');
  
  return await porkbunRequest(apiKey, secretKey, '/dns/create/' + domain, {
    type: record.type,
    name: recordName,
    content: record.value,
    ttl: '300'
  });
}

// ==========================================
// UNIFIED FUNCTIONS
// ==========================================

async function testConnection(provider, credentials) {
  try {
    var domains = await getDomains(provider, credentials);
    return {
      success: true,
      domainCount: domains.length,
      domains: domains.slice(0, 10).map(function(d) { return d.name || d; })
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

async function getDomains(provider, credentials) {
  switch (provider) {
    case 'cloudflare':
      var zones = await cloudflareGetZones(credentials.apiToken);
      return zones.map(function(z) { return { name: z.name, id: z.id }; });
      
    case 'godaddy':
      return await godaddyGetDomains(credentials.apiKey, credentials.apiSecret);
      
    case 'namecheap':
      return await namecheapGetDomains(credentials.apiUser, credentials.apiKey, credentials.clientIp);
      
    case 'porkbun':
      return await porkbunGetDomains(credentials.apiKey, credentials.secretKey);
      
    default:
      throw new Error('Unknown provider: ' + provider);
  }
}

async function addDnsRecord(provider, credentials, domain, record) {
  console.log('📝 Adding DNS record to ' + provider + ': ' + record.type + ' ' + record.name);
  
  switch (provider) {
    case 'cloudflare':
      var zone = await cloudflareGetZoneByDomain(credentials.apiToken, domain);
      if (!zone) throw new Error('Domain not found in your Cloudflare account');
      return await cloudflareAddRecord(credentials.apiToken, zone.id, record);
      
    case 'godaddy':
      return await godaddyAddRecord(credentials.apiKey, credentials.apiSecret, domain, record);
      
    case 'namecheap':
      return await namecheapAddRecord(credentials.apiUser, credentials.apiKey, domain, record, credentials.clientIp);
      
    case 'porkbun':
      return await porkbunAddRecord(credentials.apiKey, credentials.secretKey, domain, record);
      
    default:
      throw new Error('Unknown provider: ' + provider);
  }
}

async function addAllDnsRecords(provider, credentials, domain, records) {
  var results = [];
  
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    try {
      await addDnsRecord(provider, credentials, domain, record);
      results.push({ record: record, success: true });
      console.log('✅ Added: ' + record.type + ' ' + record.name);
      // Small delay between records
      await new Promise(function(r) { setTimeout(r, 500); });
    } catch (err) {
      results.push({ record: record, success: false, error: err.message });
      console.log('❌ Failed: ' + record.type + ' ' + record.name + ' - ' + err.message);
    }
  }
  
  var successCount = results.filter(function(r) { return r.success; }).length;
  
  return {
    success: successCount === results.length,
    successCount: successCount,
    totalCount: results.length,
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
  testConnection: testConnection,
  getDomains: getDomains,
  addDnsRecord: addDnsRecord,
  addAllDnsRecords: addAllDnsRecords
};
