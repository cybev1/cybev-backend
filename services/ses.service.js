// ============================================
// FILE: services/ses.service.js
// AWS SES Email Service - Bulk & Transactional
// VERSION: 1.0.0 - CYBEV Email Platform
// ============================================

const { SESClient, SendEmailCommand, SendBulkTemplatedEmailCommand, 
        CreateTemplateCommand, GetSendQuotaCommand, GetSendStatisticsCommand,
        VerifyDomainIdentityCommand, VerifyDomainDkimCommand,
        GetIdentityVerificationAttributesCommand, GetIdentityDkimAttributesCommand,
        DeleteIdentityCommand, ListIdentitiesCommand } = require('@aws-sdk/client-ses');

// Configuration
const AWS_REGION = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const DEFAULT_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@cybev.io';
const DEFAULT_FROM_NAME = process.env.SES_FROM_NAME || 'CYBEV';
const CYBEV_DOMAIN = 'cybev.io';

// Initialize SES Client
const sesClient = new SESClient({
  region: AWS_REGION,
  credentials: AWS_ACCESS_KEY && AWS_SECRET_KEY ? {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_KEY
  } : undefined // Use IAM role if no credentials
});

// ==========================================
// SENDING FUNCTIONS
// ==========================================

/**
 * Send a single email
 */
async function sendEmail({ to, from, fromName, subject, html, text, replyTo, headers = {} }) {
  const fromAddress = from || DEFAULT_FROM_EMAIL;
  const senderName = fromName || DEFAULT_FROM_NAME;
  
  const params = {
    Source: `${senderName} <${fromAddress}>`,
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to]
    },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text || stripHtml(html), Charset: 'UTF-8' }
      }
    },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    Tags: [
      { Name: 'Platform', Value: 'CYBEV' },
      { Name: 'Type', Value: headers.type || 'transactional' }
    ]
  };

  // Add custom headers for tracking
  if (headers.campaignId) {
    params.Tags.push({ Name: 'CampaignId', Value: headers.campaignId });
  }
  if (headers.userId) {
    params.Tags.push({ Name: 'UserId', Value: headers.userId });
  }

  try {
    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);
    
    console.log(`📧 SES: Email sent to ${to} | MessageId: ${result.MessageId}`);
    
    return {
      success: true,
      messageId: result.MessageId,
      provider: 'ses'
    };
  } catch (error) {
    console.error('📧 SES Error:', error.message);
    throw error;
  }
}

/**
 * Send bulk emails (up to 50 per call)
 */
async function sendBulkEmail({ recipients, from, fromName, subject, html, text, campaignId }) {
  const fromAddress = from || DEFAULT_FROM_EMAIL;
  const senderName = fromName || DEFAULT_FROM_NAME;
  
  // SES bulk send limit is 50 per request
  const BATCH_SIZE = 50;
  const results = [];
  
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    
    // Send each email in batch (SES doesn't have true bulk without templates)
    const batchPromises = batch.map(async (recipient) => {
      try {
        // Personalize content if recipient has custom data
        let personalizedHtml = html;
        let personalizedSubject = subject;
        
        if (recipient.data) {
          Object.keys(recipient.data).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            personalizedHtml = personalizedHtml.replace(regex, recipient.data[key]);
            personalizedSubject = personalizedSubject.replace(regex, recipient.data[key]);
          });
        }
        
        // Replace common merge tags
        personalizedHtml = personalizedHtml
          .replace(/{{name}}/g, recipient.name || 'there')
          .replace(/{{email}}/g, recipient.email)
          .replace(/{{unsubscribe_url}}/g, `https://cybev.io/unsubscribe?email=${encodeURIComponent(recipient.email)}&campaign=${campaignId}`);
        
        const result = await sendEmail({
          to: recipient.email,
          from: fromAddress,
          fromName: senderName,
          subject: personalizedSubject,
          html: personalizedHtml,
          text: text,
          headers: { campaignId, type: 'campaign' }
        });
        
        return { email: recipient.email, success: true, messageId: result.messageId };
      } catch (error) {
        return { email: recipient.email, success: false, error: error.message };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Rate limiting - SES has send rate limits
    if (i + BATCH_SIZE < recipients.length) {
      await sleep(100); // 100ms between batches
    }
  }
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`📧 SES Bulk: ${successful} sent, ${failed} failed`);
  
  return {
    success: true,
    total: recipients.length,
    sent: successful,
    failed: failed,
    results: results
  };
}

// ==========================================
// DOMAIN VERIFICATION
// ==========================================

/**
 * Start domain verification process
 * Returns TXT record that user must add to DNS
 */
async function verifyDomain(domain) {
  try {
    const command = new VerifyDomainIdentityCommand({ Domain: domain });
    const result = await sesClient.send(command);
    
    console.log(`📧 SES: Domain verification initiated for ${domain}`);
    
    return {
      success: true,
      domain: domain,
      verificationToken: result.VerificationToken,
      txtRecord: {
        name: `_amazonses.${domain}`,
        type: 'TXT',
        value: result.VerificationToken
      }
    };
  } catch (error) {
    console.error('📧 SES Domain Verification Error:', error.message);
    throw error;
  }
}

/**
 * Setup DKIM for a domain
 * Returns CNAME records for DKIM
 */
async function setupDkim(domain) {
  try {
    const command = new VerifyDomainDkimCommand({ Domain: domain });
    const result = await sesClient.send(command);
    
    const dkimRecords = result.DkimTokens.map(token => ({
      name: `${token}._domainkey.${domain}`,
      type: 'CNAME',
      value: `${token}.dkim.amazonses.com`
    }));
    
    console.log(`📧 SES: DKIM setup initiated for ${domain}`);
    
    return {
      success: true,
      domain: domain,
      dkimTokens: result.DkimTokens,
      dkimRecords: dkimRecords
    };
  } catch (error) {
    console.error('📧 SES DKIM Setup Error:', error.message);
    throw error;
  }
}

/**
 * Check domain verification status
 */
async function checkDomainStatus(domain) {
  try {
    // Check verification status
    const verifyCommand = new GetIdentityVerificationAttributesCommand({
      Identities: [domain]
    });
    const verifyResult = await sesClient.send(verifyCommand);
    
    // Check DKIM status
    const dkimCommand = new GetIdentityDkimAttributesCommand({
      Identities: [domain]
    });
    const dkimResult = await sesClient.send(dkimCommand);
    
    const verificationAttr = verifyResult.VerificationAttributes[domain] || {};
    const dkimAttr = dkimResult.DkimAttributes[domain] || {};
    
    return {
      success: true,
      domain: domain,
      verification: {
        status: verificationAttr.VerificationStatus || 'NotStarted',
        token: verificationAttr.VerificationToken
      },
      dkim: {
        enabled: dkimAttr.DkimEnabled || false,
        status: dkimAttr.DkimVerificationStatus || 'NotStarted',
        tokens: dkimAttr.DkimTokens || []
      }
    };
  } catch (error) {
    console.error('📧 SES Status Check Error:', error.message);
    throw error;
  }
}

/**
 * Remove a domain identity
 */
async function removeDomain(domain) {
  try {
    const command = new DeleteIdentityCommand({ Identity: domain });
    await sesClient.send(command);
    
    console.log(`📧 SES: Domain ${domain} removed`);
    return { success: true, domain: domain };
  } catch (error) {
    console.error('📧 SES Remove Domain Error:', error.message);
    throw error;
  }
}

/**
 * List all verified identities
 */
async function listIdentities() {
  try {
    const command = new ListIdentitiesCommand({ IdentityType: 'Domain' });
    const result = await sesClient.send(command);
    
    return {
      success: true,
      identities: result.Identities || []
    };
  } catch (error) {
    console.error('📧 SES List Identities Error:', error.message);
    throw error;
  }
}

// ==========================================
// QUOTA & STATISTICS
// ==========================================

/**
 * Get sending quota
 */
async function getSendingQuota() {
  try {
    const command = new GetSendQuotaCommand({});
    const result = await sesClient.send(command);
    
    return {
      success: true,
      max24HourSend: result.Max24HourSend,
      maxSendRate: result.MaxSendRate, // emails per second
      sentLast24Hours: result.SentLast24Hours
    };
  } catch (error) {
    console.error('📧 SES Quota Error:', error.message);
    throw error;
  }
}

/**
 * Get sending statistics
 */
async function getSendingStats() {
  try {
    const command = new GetSendStatisticsCommand({});
    const result = await sesClient.send(command);
    
    // Aggregate stats
    const stats = {
      deliveryAttempts: 0,
      bounces: 0,
      complaints: 0,
      rejects: 0
    };
    
    (result.SendDataPoints || []).forEach(point => {
      stats.deliveryAttempts += point.DeliveryAttempts || 0;
      stats.bounces += point.Bounces || 0;
      stats.complaints += point.Complaints || 0;
      stats.rejects += point.Rejects || 0;
    });
    
    return {
      success: true,
      stats: stats,
      dataPoints: result.SendDataPoints || []
    };
  } catch (error) {
    console.error('📧 SES Stats Error:', error.message);
    throw error;
  }
}

// ==========================================
// CYBEV.IO EMAIL HELPERS
// ==========================================

/**
 * Generate CYBEV email address for user
 */
function generateCybevEmail(username) {
  // Sanitize username for email
  const sanitized = username
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .substring(0, 64);
  
  return `${sanitized}@${CYBEV_DOMAIN}`;
}

/**
 * Check if email is a CYBEV domain email
 */
function isCybevEmail(email) {
  return email && email.toLowerCase().endsWith(`@${CYBEV_DOMAIN}`);
}

/**
 * Send from user's CYBEV email
 */
async function sendFromCybevEmail(userEmail, { to, subject, html, text, replyTo }) {
  if (!isCybevEmail(userEmail)) {
    throw new Error('Invalid CYBEV email address');
  }
  
  return sendEmail({
    to,
    from: userEmail,
    fromName: userEmail.split('@')[0],
    subject,
    html,
    text,
    replyTo: replyTo || userEmail
  });
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// SERVICE STATUS
// ==========================================

async function getServiceStatus() {
  try {
    const quota = await getSendingQuota();
    return {
      enabled: true,
      provider: 'aws-ses',
      region: AWS_REGION,
      configured: !!AWS_ACCESS_KEY || process.env.AWS_EXECUTION_ENV,
      quota: quota
    };
  } catch (error) {
    return {
      enabled: false,
      provider: 'aws-ses',
      error: error.message
    };
  }
}

// Log on startup
console.log(`📧 AWS SES Service initialized | Region: ${AWS_REGION}`);

module.exports = {
  // Sending
  sendEmail,
  sendBulkEmail,
  
  // Domain verification
  verifyDomain,
  setupDkim,
  checkDomainStatus,
  removeDomain,
  listIdentities,
  
  // Quota & Stats
  getSendingQuota,
  getSendingStats,
  
  // CYBEV helpers
  generateCybevEmail,
  isCybevEmail,
  sendFromCybevEmail,
  
  // Service
  getServiceStatus,
  
  // Constants
  CYBEV_DOMAIN,
  DEFAULT_FROM_EMAIL
};
