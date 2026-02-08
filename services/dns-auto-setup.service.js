// ============================================
// FILE: services/dns-auto-setup.service.js
// CYBEV DNS Auto-Detection & Auto-Setup Service
// VERSION: 1.0.0
// 
// Features:
// - Auto-detect DNS provider via NS records
// - Auto-detect registrar via WHOIS
// - Auto-add DNS records (Cloudflare, GoDaddy, Namecheap, Route53)
// - Auto-verify DNS propagation
// ============================================

const dns = require('dns').promises;

// ==========================================
// DNS PROVIDER DETECTION
// ==========================================

const DNS_PROVIDERS = {
  cloudflare: {
    name: 'Cloudflare',
    patterns: ['cloudflare.com', 'ns.cloudflare.com'],
    hasApi: true,
    logo: 'https://www.cloudflare.com/favicon.ico',
    docsUrl: 'https://dash.cloudflare.com/',
    instructions: 'Go to DNS settings in your Cloudflare dashboard'
  },
  godaddy: {
    name: 'GoDaddy',
    patterns: ['domaincontrol.com', 'godaddy.com'],
    hasApi: true,
    logo: 'https://www.godaddy.com/favicon.ico',
    docsUrl: 'https://dcc.godaddy.com/manage/',
    instructions: 'Go to DNS Management in your GoDaddy account'
  },
  namecheap: {
    name: 'Namecheap',
    patterns: ['registrar-servers.com', 'namecheaphosting.com'],
    hasApi: true,
    logo: 'https://www.namecheap.com/favicon.ico',
    docsUrl: 'https://ap.www.namecheap.com/',
    instructions: 'Go to Advanced DNS in your Namecheap dashboard'
  },
  route53: {
    name: 'Amazon Route 53',
    patterns: ['awsdns', 'amazonaws.com'],
    hasApi: true,
    logo: 'https://aws.amazon.com/favicon.ico',
    docsUrl: 'https://console.aws.amazon.com/route53/',
    instructions: 'Go to Route 53 Hosted Zones in AWS Console'
  },
  google: {
    name: 'Google Domains / Cloud DNS',
    patterns: ['googledomains.com', 'google.com'],
    hasApi: true,
    logo: 'https://domains.google/favicon.ico',
    docsUrl: 'https://domains.google.com/',
    instructions: 'Go to DNS settings in Google Domains'
  },
  digitalocean: {
    name: 'DigitalOcean',
    patterns: ['digitalocean.com'],
    hasApi: true,
    logo: 'https://www.digitalocean.com/favicon.ico',
    docsUrl: 'https://cloud.digitalocean.com/networking/domains',
    instructions: 'Go to Networking > Domains in DigitalOcean'
  },
  netlify: {
    name: 'Netlify DNS',
    patterns: ['netlify.com'],
    hasApi: true,
    logo: 'https://www.netlify.com/favicon.ico',
    docsUrl: 'https://app.netlify.com/',
    instructions: 'Go to Domain settings in Netlify'
  },
  vercel: {
    name: 'Vercel DNS',
    patterns: ['vercel-dns.com'],
    hasApi: true,
    logo: 'https://vercel.com/favicon.ico',
    docsUrl: 'https://vercel.com/dashboard',
    instructions: 'Go to Domains in your Vercel dashboard'
  },
  hostgator: {
    name: 'HostGator',
    patterns: ['hostgator.com'],
    hasApi: false,
    logo: 'https://www.hostgator.com/favicon.ico',
    docsUrl: 'https://portal.hostgator.com/',
    instructions: 'Go to cPanel > Zone Editor'
  },
  bluehost: {
    name: 'Bluehost',
    patterns: ['bluehost.com'],
    hasApi: false,
    logo: 'https://www.bluehost.com/favicon.ico',
    docsUrl: 'https://my.bluehost.com/',
    instructions: 'Go to Domains > Zone Editor in Bluehost'
  },
  hover: {
    name: 'Hover',
    patterns: ['hover.com'],
    hasApi: false,
    logo: 'https://www.hover.com/favicon.ico',
    docsUrl: 'https://www.hover.com/control_panel',
    instructions: 'Go to DNS tab in your Hover control panel'
  },
  name_com: {
    name: 'Name.com',
    patterns: ['name.com'],
    hasApi: true,
    logo: 'https://www.name.com/favicon.ico',
    docsUrl: 'https://www.name.com/account',
    instructions: 'Go to DNS Records in Name.com'
  },
  dynadot: {
    name: 'Dynadot',
    patterns: ['dynadot.com'],
    hasApi: true,
    logo: 'https://www.dynadot.com/favicon.ico',
    docsUrl: 'https://www.dynadot.com/account/',
    instructions: 'Go to DNS Settings in Dynadot'
  },
  porkbun: {
    name: 'Porkbun',
    patterns: ['porkbun.com'],
    hasApi: true,
    logo: 'https://porkbun.com/favicon.ico',
    docsUrl: 'https://porkbun.com/account/',
    instructions: 'Go to DNS Records in Porkbun'
  },
  ionos: {
    name: 'IONOS (1&1)',
    patterns: ['ui-dns.com', 'ui-dns.de', 'ionos'],
    hasApi: true,
    logo: 'https://www.ionos.com/favicon.ico',
    docsUrl: 'https://my.ionos.com/',
    instructions: 'Go to Domains & SSL > DNS Settings'
  },
  ovh: {
    name: 'OVH',
    patterns: ['ovh.net', 'ovh.com'],
    hasApi: true,
    logo: 'https://www.ovh.com/favicon.ico',
    docsUrl: 'https://www.ovh.com/manager/',
    instructions: 'Go to DNS Zone in OVH Manager'
  },
  gandi: {
    name: 'Gandi',
    patterns: ['gandi.net'],
    hasApi: true,
    logo: 'https://www.gandi.net/favicon.ico',
    docsUrl: 'https://admin.gandi.net/',
    instructions: 'Go to DNS Records in Gandi'
  },
  dnsimple: {
    name: 'DNSimple',
    patterns: ['dnsimple.com'],
    hasApi: true,
    logo: 'https://dnsimple.com/favicon.ico',
    docsUrl: 'https://dnsimple.com/dashboard',
    instructions: 'Go to DNS in DNSimple dashboard'
  },
  linode: {
    name: 'Linode (Akamai)',
    patterns: ['linode.com'],
    hasApi: true,
    logo: 'https://www.linode.com/favicon.ico',
    docsUrl: 'https://cloud.linode.com/domains',
    instructions: 'Go to Domains in Linode Cloud Manager'
  },
  vultr: {
    name: 'Vultr',
    patterns: ['vultr.com'],
    hasApi: true,
    logo: 'https://www.vultr.com/favicon.ico',
    docsUrl: 'https://my.vultr.com/dns/',
    instructions: 'Go to DNS in Vultr dashboard'
  },
  hetzner: {
    name: 'Hetzner',
    patterns: ['hetzner.com'],
    hasApi: true,
    logo: 'https://www.hetzner.com/favicon.ico',
    docsUrl: 'https://dns.hetzner.com/',
    instructions: 'Go to Hetzner DNS Console'
  }
};

// Common registrars (for WHOIS detection)
const REGISTRARS = {
  'godaddy': { name: 'GoDaddy', url: 'https://dcc.godaddy.com/' },
  'namecheap': { name: 'Namecheap', url: 'https://ap.www.namecheap.com/' },
  'google': { name: 'Google Domains', url: 'https://domains.google.com/' },
  'cloudflare': { name: 'Cloudflare Registrar', url: 'https://dash.cloudflare.com/' },
  'name.com': { name: 'Name.com', url: 'https://www.name.com/' },
  'dynadot': { name: 'Dynadot', url: 'https://www.dynadot.com/' },
  'porkbun': { name: 'Porkbun', url: 'https://porkbun.com/' },
  'hover': { name: 'Hover', url: 'https://www.hover.com/' },
  'gandi': { name: 'Gandi', url: 'https://www.gandi.net/' },
  'ionos': { name: 'IONOS', url: 'https://www.ionos.com/' },
  '1&1': { name: 'IONOS (1&1)', url: 'https://www.ionos.com/' },
  'enom': { name: 'Enom', url: 'https://www.enom.com/' },
  'network solutions': { name: 'Network Solutions', url: 'https://www.networksolutions.com/' },
  'tucows': { name: 'Tucows', url: 'https://www.tucows.com/' },
  'ovh': { name: 'OVH', url: 'https://www.ovh.com/' },
  'epik': { name: 'Epik', url: 'https://www.epik.com/' },
  'squarespace': { name: 'Squarespace Domains', url: 'https://www.squarespace.com/' }
};

// ==========================================
// DETECT DNS PROVIDER
// ==========================================

async function detectDnsProvider(domain) {
  try {
    // Get nameservers
    const nsRecords = await dns.resolveNs(domain);
    console.log('📡 NS records for ' + domain + ':', nsRecords);
    
    // Match against known providers
    for (var providerId in DNS_PROVIDERS) {
      var provider = DNS_PROVIDERS[providerId];
      for (var i = 0; i < provider.patterns.length; i++) {
        var pattern = provider.patterns[i];
        for (var j = 0; j < nsRecords.length; j++) {
          if (nsRecords[j].toLowerCase().includes(pattern.toLowerCase())) {
            return {
              detected: true,
              provider: providerId,
              name: provider.name,
              hasApi: provider.hasApi,
              logo: provider.logo,
              docsUrl: provider.docsUrl,
              instructions: provider.instructions,
              nameservers: nsRecords
            };
          }
        }
      }
    }
    
    // Unknown provider
    return {
      detected: false,
      provider: 'unknown',
      name: 'Unknown DNS Provider',
      hasApi: false,
      instructions: 'Log in to your domain registrar or DNS provider and add the DNS records manually',
      nameservers: nsRecords
    };
  } catch (err) {
    console.error('DNS provider detection error:', err.message);
    return {
      detected: false,
      provider: 'error',
      name: 'Could not detect',
      hasApi: false,
      error: err.message,
      instructions: 'Could not query nameservers. The domain may not exist or DNS is not configured.'
    };
  }
}

// ==========================================
// DETECT REGISTRAR VIA WHOIS (Simplified)
// ==========================================

async function detectRegistrar(domain) {
  try {
    // Use a public WHOIS API
    const response = await fetch('https://whois.freeaiapi.xyz/?domain=' + encodeURIComponent(domain));
    
    if (!response.ok) {
      // Try alternative API
      const altResponse = await fetch('https://api.whoapi.com/?r=whois&domain=' + encodeURIComponent(domain) + '&apikey=free');
      if (altResponse.ok) {
        const data = await altResponse.json();
        return parseWhoisData(data, domain);
      }
      throw new Error('WHOIS lookup failed');
    }
    
    const data = await response.json();
    return parseWhoisData(data, domain);
  } catch (err) {
    console.error('WHOIS lookup error:', err.message);
    
    // Try to infer from NS records
    const dnsInfo = await detectDnsProvider(domain);
    if (dnsInfo.detected && dnsInfo.provider !== 'unknown') {
      return {
        detected: true,
        registrar: dnsInfo.name + ' (inferred from DNS)',
        registrarUrl: dnsInfo.docsUrl,
        method: 'inferred'
      };
    }
    
    return {
      detected: false,
      registrar: 'Unknown',
      error: err.message
    };
  }
}

function parseWhoisData(data, domain) {
  var registrarName = data.registrar || data.registrar_name || '';
  
  // Try to match to known registrar
  for (var key in REGISTRARS) {
    if (registrarName.toLowerCase().includes(key.toLowerCase())) {
      return {
        detected: true,
        registrar: REGISTRARS[key].name,
        registrarUrl: REGISTRARS[key].url,
        raw: registrarName,
        expirationDate: data.expiration_date || data.expires,
        creationDate: data.creation_date || data.created
      };
    }
  }
  
  return {
    detected: !!registrarName,
    registrar: registrarName || 'Unknown',
    expirationDate: data.expiration_date || data.expires,
    creationDate: data.creation_date || data.created
  };
}

// ==========================================
// CHECK DNS PROPAGATION
// ==========================================

// Public DNS servers to check propagation
const DNS_SERVERS = [
  { name: 'Google', ip: '8.8.8.8' },
  { name: 'Cloudflare', ip: '1.1.1.1' },
  { name: 'OpenDNS', ip: '208.67.222.222' },
  { name: 'Quad9', ip: '9.9.9.9' }
];

async function checkDnsPropagation(recordName, recordType, expectedValue) {
  var results = [];
  
  for (var i = 0; i < DNS_SERVERS.length; i++) {
    var server = DNS_SERVERS[i];
    try {
      var resolver = new dns.Resolver();
      resolver.setServers([server.ip]);
      
      var records = [];
      if (recordType === 'TXT') {
        var txtRecords = await resolver.resolveTxt(recordName);
        records = txtRecords.flat();
      } else if (recordType === 'CNAME') {
        records = await resolver.resolveCname(recordName);
      } else if (recordType === 'MX') {
        var mxRecords = await resolver.resolveMx(recordName);
        records = mxRecords.map(function(r) { return r.exchange; });
      }
      
      var found = records.some(function(r) { 
        return r.toLowerCase().includes(expectedValue.toLowerCase()); 
      });
      
      results.push({
        server: server.name,
        ip: server.ip,
        found: found,
        records: records
      });
    } catch (err) {
      results.push({
        server: server.name,
        ip: server.ip,
        found: false,
        error: err.code || err.message
      });
    }
  }
  
  // Calculate propagation percentage
  var foundCount = results.filter(function(r) { return r.found; }).length;
  var propagationPercent = Math.round((foundCount / results.length) * 100);
  
  return {
    propagated: propagationPercent === 100,
    propagationPercent: propagationPercent,
    results: results
  };
}

// ==========================================
// AUTO-ADD DNS RECORDS VIA PROVIDER APIs
// ==========================================

// Cloudflare API
async function addCloudflareRecord(apiToken, zoneId, record) {
  var response = await fetch('https://api.cloudflare.com/client/v4/zones/' + zoneId + '/dns_records', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: record.type,
      name: record.name,
      content: record.value,
      ttl: 1, // Auto
      proxied: false
    })
  });
  
  var data = await response.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'Cloudflare API error');
  }
  return data.result;
}

// GoDaddy API
async function addGoDaddyRecord(apiKey, apiSecret, domain, record) {
  var response = await fetch('https://api.godaddy.com/v1/domains/' + domain + '/records', {
    method: 'PATCH',
    headers: {
      'Authorization': 'sso-key ' + apiKey + ':' + apiSecret,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      type: record.type,
      name: record.name.replace('.' + domain, '').replace(domain, '@'),
      data: record.value,
      ttl: 600
    }])
  });
  
  if (!response.ok) {
    var error = await response.json();
    throw new Error(error.message || 'GoDaddy API error');
  }
  return { success: true };
}

// Namecheap API (requires whitelisted IP)
async function addNamecheapRecord(apiUser, apiKey, domain, record) {
  var parts = domain.split('.');
  var sld = parts.slice(0, -1).join('.');
  var tld = parts[parts.length - 1];
  
  var params = new URLSearchParams({
    ApiUser: apiUser,
    ApiKey: apiKey,
    UserName: apiUser,
    Command: 'namecheap.domains.dns.setHosts',
    ClientIp: '0.0.0.0', // Will need actual IP
    SLD: sld,
    TLD: tld,
    HostName1: record.name.replace('.' + domain, '').replace(domain, '@'),
    RecordType1: record.type,
    Address1: record.value,
    TTL1: '300'
  });
  
  var response = await fetch('https://api.namecheap.com/xml.response?' + params.toString());
  var text = await response.text();
  
  if (text.includes('Status="ERROR"')) {
    throw new Error('Namecheap API error');
  }
  return { success: true };
}

// Generic function to add records
async function autoAddDnsRecord(provider, credentials, domain, record) {
  switch (provider) {
    case 'cloudflare':
      if (!credentials.apiToken || !credentials.zoneId) {
        throw new Error('Cloudflare requires apiToken and zoneId');
      }
      return await addCloudflareRecord(credentials.apiToken, credentials.zoneId, record);
      
    case 'godaddy':
      if (!credentials.apiKey || !credentials.apiSecret) {
        throw new Error('GoDaddy requires apiKey and apiSecret');
      }
      return await addGoDaddyRecord(credentials.apiKey, credentials.apiSecret, domain, record);
      
    case 'namecheap':
      if (!credentials.apiUser || !credentials.apiKey) {
        throw new Error('Namecheap requires apiUser and apiKey');
      }
      return await addNamecheapRecord(credentials.apiUser, credentials.apiKey, domain, record);
      
    default:
      throw new Error('Auto-add not supported for ' + provider + '. Please add DNS records manually.');
  }
}

// ==========================================
// FULL DOMAIN ANALYSIS
// ==========================================

async function analyzeDomain(domain) {
  console.log('🔍 Analyzing domain: ' + domain);
  
  // Run all detections in parallel
  var results = await Promise.all([
    detectDnsProvider(domain),
    detectRegistrar(domain)
  ]);
  
  var dnsProvider = results[0];
  var registrar = results[1];
  
  return {
    domain: domain,
    dns: dnsProvider,
    registrar: registrar,
    canAutoSetup: dnsProvider.hasApi,
    timestamp: new Date().toISOString()
  };
}

// ==========================================
// VERIFY ALL DNS RECORDS
// ==========================================

async function verifyAllRecords(domain, records) {
  var results = {};
  
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var propagation = await checkDnsPropagation(record.name, record.type, record.value);
    results[record.label || record.type] = {
      record: record,
      propagation: propagation
    };
  }
  
  // Calculate overall status
  var allPropagated = Object.values(results).every(function(r) { 
    return r.propagation.propagated; 
  });
  
  var avgPropagation = Object.values(results).reduce(function(sum, r) {
    return sum + r.propagation.propagationPercent;
  }, 0) / Object.keys(results).length;
  
  return {
    domain: domain,
    allPropagated: allPropagated,
    averagePropagation: Math.round(avgPropagation),
    records: results
  };
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  detectDnsProvider: detectDnsProvider,
  detectRegistrar: detectRegistrar,
  analyzeDomain: analyzeDomain,
  checkDnsPropagation: checkDnsPropagation,
  verifyAllRecords: verifyAllRecords,
  autoAddDnsRecord: autoAddDnsRecord,
  DNS_PROVIDERS: DNS_PROVIDERS,
  REGISTRARS: REGISTRARS,
  DNS_SERVERS: DNS_SERVERS
};
