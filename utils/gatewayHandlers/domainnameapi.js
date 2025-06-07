
const axios = require('axios');

const DOMAIN_API_BASE = 'https://api.domainnameapi.com/api';
const AUTH = {
  username: 'qubwebs',
  password: 'openHEAVEN2024$'
};

exports.checkDomainAvailability = async (domain) => {
  const url = \`\${DOMAIN_API_BASE}/whois/domain/check?domainName=\${domain}\`;
  const response = await axios.get(url, { auth: AUTH });
  return response.data;
};

exports.registerDomain = async (domain) => {
  const url = \`\${DOMAIN_API_BASE}/domain/purchase\`;
  const response = await axios.post(url, { DomainName: domain, RegisterYears: 1 }, { auth: AUTH });
  return response.data;
};
