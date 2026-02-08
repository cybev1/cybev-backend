// ============================================
// FILE: services/email-multi-provider.service.js
// CYBEV Multi-Provider Email Service
// VERSION: 3.1.0 - Brevo Only (Clean)
// ============================================

// ==========================================
// BREVO (SENDINBLUE) - PRIMARY PROVIDER
// ==========================================

const sendWithBrevo = async ({ to, from, fromName, subject, html, text, replyTo, tags }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('Brevo API key not configured');

  const payload = {
    sender: {
      email: from || process.env.BREVO_SENDER_EMAIL || 'info@cybev.io',
      name: fromName || 'CYBEV'
    },
    to: Array.isArray(to) ? to.map(function(email) { 
      return typeof email === 'string' ? { email: email } : email; 
    }) : [{ email: to }],
    subject: subject,
    htmlContent: html,
    textContent: text || stripHtml(html)
  };

  if (replyTo) {
    payload.replyTo = { email: replyTo };
  }

  if (tags && tags.length) {
    payload.tags = tags;
  }

  var recipientInfo = Array.isArray(to) ? to.length + ' recipients' : to;
  console.log('📧 Sending via Brevo to: ' + recipientInfo);

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
    console.error('❌ Brevo error:', data);
    throw new Error(data.message || 'Brevo API error: ' + response.status);
  }

  console.log('✅ Brevo email sent! MessageId: ' + data.messageId);
  return {
    success: true,
    messageId: data.messageId,
    provider: 'brevo'
  };
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// ==========================================
// PROVIDER MANAGEMENT
// ==========================================

const getAvailableProviders = () => {
  const providers = [];
  
  if (process.env.BREVO_API_KEY) {
    providers.push({
      name: 'brevo',
      displayName: 'Brevo (Sendinblue)',
      priority: 1,
      enabled: true
    });
    console.log('✅ Brevo provider enabled');
  } else {
    console.log('⚠️ BREVO_API_KEY not set');
  }
  
  return providers;
};

// ==========================================
// MAIN SEND FUNCTIONS
// ==========================================

const sendEmail = async (options) => {
  const providers = getAvailableProviders();
  
  if (providers.length === 0) {
    throw new Error('No email providers configured. Set BREVO_API_KEY in environment.');
  }

  return await sendWithBrevo(options);
};

const sendBulkEmails = async (options) => {
  const recipients = options.recipients;
  const from = options.from;
  const fromName = options.fromName;
  const subject = options.subject;
  const html = options.html;
  const text = options.text;
  const tags = options.tags;
  
  const providers = getAvailableProviders();
  
  if (providers.length === 0) {
    throw new Error('No email providers configured. Set BREVO_API_KEY in environment.');
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    
    try {
      // Personalize HTML if recipient has data
      let personalizedHtml = html;
      if (recipient.data) {
        Object.keys(recipient.data).forEach(function(key) {
          const value = recipient.data[key];
          const regex = new RegExp('{{' + key + '}}', 'gi');
          personalizedHtml = personalizedHtml.replace(regex, value || '');
        });
      }

      await sendWithBrevo({
        to: recipient.email,
        from: from || process.env.BREVO_SENDER_EMAIL || 'info@cybev.io',
        fromName: fromName || 'CYBEV',
        subject: subject,
        html: personalizedHtml,
        text: text,
        tags: tags
      });

      results.push({ email: recipient.email, success: true });
      successCount++;
      
      // Small delay to respect rate limits (10/sec for Brevo free)
      await new Promise(function(resolve) { setTimeout(resolve, 120); });
      
    } catch (err) {
      console.error('❌ Failed to send to ' + recipient.email + ':', err.message);
      results.push({ email: recipient.email, success: false, error: err.message });
      failCount++;
    }
  }

  console.log('📧 Bulk send complete: ' + successCount + ' sent, ' + failCount + ' failed');

  return {
    success: failCount === 0,
    sent: successCount,
    failed: failCount,
    results: results,
    provider: 'brevo'
  };
};

// ==========================================
// STATUS & EXPORTS
// ==========================================

const getProviderStatus = () => {
  return getAvailableProviders().map(function(p) {
    return {
      name: p.displayName,
      enabled: p.enabled,
      primary: p.priority === 1
    };
  });
};

const getServiceStatus = async () => {
  const providers = getAvailableProviders();
  return {
    available: providers.length > 0,
    providers: providers.map(function(p) { return p.displayName; }),
    primary: providers[0] ? providers[0].displayName : 'none'
  };
};

module.exports = {
  sendEmail: sendEmail,
  sendBulkEmails: sendBulkEmails,
  getAvailableProviders: getAvailableProviders,
  getProviderStatus: getProviderStatus,
  getServiceStatus: getServiceStatus
};
