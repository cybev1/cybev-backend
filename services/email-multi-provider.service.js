// ============================================
// FILE: services/email-multi-provider.service.js
// CYBEV Multi-Provider Email Service
// VERSION: 2.2.0 - Fixed Provider Name Mapping
// CHANGELOG:
//   2.2.0 - Fixed provider name mapping (was using displayName instead of key), default sender to info@cybev.io
//   2.1.0 - Check BREVO_API_KEY dynamically at runtime, not just at module load
//   2.0.0 - Brevo Primary + Fixed ENV vars
// ============================================

const AWS = require('aws-sdk');

// ==========================================
// PROVIDER CONFIGURATION
// Priority: Lower number = tried first
// Brevo is PRIMARY since AWS SES is in sandbox
// ==========================================

const PROVIDERS = {
  brevo: {
    name: 'Brevo (Sendinblue)',
    priority: 1,  // PRIMARY - tried first
    enabled: !!process.env.BREVO_API_KEY,
    rateLimit: 10,
    dailyLimit: 300 // Free tier: 300/day, upgrade for more
  },
  ses: {
    name: 'Amazon SES',
    priority: 2,  // FALLBACK - tried if Brevo fails
    enabled: !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SES_ACCESS_KEY),
    rateLimit: 14,
    dailyLimit: 50000
  }
};

// ==========================================
// SES CLIENT
// ==========================================

let sesClient = null;

const getSESClient = () => {
  if (!sesClient && PROVIDERS.ses.enabled) {
    sesClient = new AWS.SES({
      apiVersion: '2010-12-01',
      region: process.env.AWS_REGION || process.env.AWS_SES_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SES_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SES_SECRET_KEY
      }
    });
  }
  return sesClient;
};

// ==========================================
// BREVO (SENDINBLUE) CLIENT
// ==========================================

const sendWithBrevo = async ({ to, from, fromName, subject, html, text, replyTo, tags }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('Brevo API key not configured');

  const payload = {
    sender: {
      email: from || process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM_EMAIL || 'info@cybev.io',
      name: fromName || 'CYBEV'
    },
    to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text || stripHtml(html)
  };

  if (replyTo) {
    payload.replyTo = { email: replyTo };
  }

  if (tags && tags.length) {
    payload.tags = tags;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Brevo error: ${response.status}`);
  }

  return {
    success: true,
    provider: 'brevo',
    messageId: data.messageId,
    response: data
  };
};

// Brevo Bulk Send
const sendBulkWithBrevo = async ({ recipients, from, fromName, subject, html, text, tags }) => {
  const results = [];
  
  // Brevo doesn't have native bulk API for transactional, so we batch
  const batchSize = 50;
  
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    
    const promises = batch.map(async (recipient) => {
      try {
        // Personalize content
        let personalizedHtml = html;
        let personalizedSubject = subject;
        
        if (recipient.data) {
          Object.entries(recipient.data).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'gi');
            personalizedHtml = personalizedHtml.replace(regex, value || '');
            personalizedSubject = personalizedSubject.replace(regex, value || '');
          });
        }
        
        const result = await sendWithBrevo({
          to: recipient.email,
          from,
          fromName,
          subject: personalizedSubject,
          html: personalizedHtml,
          text,
          tags
        });
        
        return { email: recipient.email, success: true, messageId: result.messageId, provider: 'brevo' };
      } catch (err) {
        return { email: recipient.email, success: false, error: err.message, provider: 'brevo' };
      }
    });
    
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
    
    // Rate limiting
    if (i + batchSize < recipients.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  return { results, provider: 'brevo' };
};

// ==========================================
// SES FUNCTIONS
// ==========================================

const sendWithSES = async ({ to, from, fromName, subject, html, text, replyTo, configSet }) => {
  const ses = getSESClient();
  if (!ses) throw new Error('SES not configured');

  const params = {
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to]
    },
    Message: {
      Body: {
        Html: { Charset: 'UTF-8', Data: html },
        Text: { Charset: 'UTF-8', Data: text || stripHtml(html) }
      },
      Subject: { Charset: 'UTF-8', Data: subject }
    },
    Source: fromName ? `${fromName} <${from}>` : from,
  };

  if (replyTo) {
    params.ReplyToAddresses = [replyTo];
  }

  if (configSet || process.env.AWS_SES_CONFIG_SET) {
    params.ConfigurationSetName = configSet || process.env.AWS_SES_CONFIG_SET;
  }

  const result = await ses.sendEmail(params).promise();

  return {
    success: true,
    provider: 'ses',
    messageId: result.MessageId,
    response: result
  };
};

const sendBulkWithSES = async ({ recipients, from, fromName, subject, html, text, configSet }) => {
  const ses = getSESClient();
  if (!ses) throw new Error('SES not configured');

  const results = [];
  const batchSize = 50;
  const delayMs = Math.ceil(1000 / PROVIDERS.ses.rateLimit);

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    const promises = batch.map(async (recipient) => {
      try {
        let personalizedHtml = html;
        let personalizedSubject = subject;
        
        if (recipient.data) {
          Object.entries(recipient.data).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'gi');
            personalizedHtml = personalizedHtml.replace(regex, value || '');
            personalizedSubject = personalizedSubject.replace(regex, value || '');
          });
        }

        const result = await sendWithSES({
          to: recipient.email,
          from,
          fromName,
          subject: personalizedSubject,
          html: personalizedHtml,
          text,
          configSet
        });

        return { email: recipient.email, success: true, messageId: result.messageId, provider: 'ses' };
      } catch (err) {
        return { email: recipient.email, success: false, error: err.message, provider: 'ses' };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // Rate limiting
    if (i + batchSize < recipients.length) {
      await new Promise(r => setTimeout(r, delayMs * batch.length));
    }
  }

  return { results, provider: 'ses' };
};

// ==========================================
// SMART PROVIDER SELECTION
// ==========================================

const getAvailableProviders = () => {
  // Check env vars dynamically at runtime, not just at module load
  const providers = {
    brevo: {
      displayName: 'Brevo (Sendinblue)',
      priority: 1,
      enabled: !!process.env.BREVO_API_KEY,
      rateLimit: 10,
      dailyLimit: 300
    },
    ses: {
      displayName: 'Amazon SES',
      priority: 2,
      enabled: !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SES_ACCESS_KEY),
      rateLimit: 14,
      dailyLimit: 50000
    }
  };
  
  const available = Object.entries(providers)
    .filter(([_, config]) => config.enabled)
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([key, config]) => ({ name: key, ...config }));
  
  console.log('📧 Available providers:', available.map(p => `${p.name} (priority: ${p.priority})`).join(', ') || 'none');
  return available;
};

const selectProvider = (preferredProvider = null) => {
  const available = getAvailableProviders();
  
  if (available.length === 0) {
    throw new Error('No email providers configured');
  }

  // Check if preferred provider is available
  if (preferredProvider) {
    const providerAvailable = available.find(p => p.name.toLowerCase().includes(preferredProvider.toLowerCase()));
    if (providerAvailable) {
      return preferredProvider;
    }
  }

  return available[0].name === 'Brevo (Sendinblue)' ? 'brevo' : 'ses';
};

// ==========================================
// MAIN SEND FUNCTIONS WITH FALLBACK
// ==========================================

const sendEmail = async (options) => {
  const { provider: preferredProvider, ...emailOptions } = options;
  const providers = getAvailableProviders();
  
  if (providers.length === 0) {
    throw new Error('No email providers configured. Set BREVO_API_KEY, MAILGUN_API_KEY, or AWS SES credentials.');
  }

  let lastError = null;

  // Try each provider in priority order
  for (const provider of providers) {
    try {
      console.log(`📧 Attempting to send via ${provider.name}...`);
      
      let result;
      switch (provider.name) {
        case 'ses':
          result = await sendWithSES(emailOptions);
          break;
        case 'brevo':
          result = await sendWithBrevo(emailOptions);
          break;
        default:
          continue;
      }

      console.log(`✅ Email sent via ${provider.name}: ${result.messageId}`);
      return result;

    } catch (err) {
      console.error(`❌ ${provider.name} failed:`, err.message);
      lastError = err;
      // Continue to next provider
    }
  }

  throw lastError || new Error('All email providers failed');
};

const sendBulkEmails = async (options) => {
  const { provider: preferredProvider, ...emailOptions } = options;
  const providers = getAvailableProviders();
  
  if (providers.length === 0) {
    throw new Error('No email providers configured');
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      console.log(`📧 Attempting bulk send via ${provider.name} (${emailOptions.recipients.length} recipients)...`);
      
      let result;
      switch (provider.name) {
        case 'ses':
          result = await sendBulkWithSES(emailOptions);
          break;
        case 'brevo':
          result = await sendBulkWithBrevo(emailOptions);
          break;
        default:
          continue;
      }

      const successful = result.results.filter(r => r.success).length;
      console.log(`✅ Bulk send via ${provider.name}: ${successful}/${result.results.length} successful`);
      return result;

    } catch (err) {
      console.error(`❌ ${provider.name} bulk send failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All email providers failed for bulk send');
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const stripHtml = (html) => {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const getProviderStatus = () => {
  return Object.entries(PROVIDERS).map(([name, config]) => ({
    name,
    displayName: config.name,
    enabled: config.enabled,
    priority: config.priority,
    rateLimit: config.rateLimit,
    dailyLimit: config.dailyLimit
  }));
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Main functions
  sendEmail,
  sendBulkEmails,
  
  // Individual providers (for direct use)
  sendWithSES,
  sendWithBrevo,
  sendBulkWithSES,
  sendBulkWithBrevo,
  
  // Utility
  getAvailableProviders,
  getProviderStatus,
  selectProvider,
  stripHtml,
  
  // Constants
  PROVIDERS
};
