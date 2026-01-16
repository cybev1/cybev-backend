// ============================================
// FILE: services/ses-inbound.service.js
// AWS SES Inbound Email Processing Service
// VERSION: 2.0.0 - CYBEV Email Platform Advanced
// Handles: MX records, S3 storage, SNS webhooks
// ============================================

const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SetActiveReceiptRuleSetCommand, CreateReceiptRuleSetCommand,
        CreateReceiptRuleCommand, DeleteReceiptRuleCommand, DescribeReceiptRuleSetCommand } = require('@aws-sdk/client-ses');
const { simpleParser } = require('mailparser');
const mongoose = require('mongoose');

// Configuration
const AWS_REGION = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET = process.env.SES_INBOUND_BUCKET || 'cybev-inbound-emails';
const RULE_SET_NAME = process.env.SES_RULE_SET || 'cybev-inbound-rules';

// Initialize clients
const s3Client = new S3Client({ region: AWS_REGION });
const sesClient = new SESClient({ region: AWS_REGION });

// ==========================================
// INBOUND EMAIL PROCESSING
// ==========================================

/**
 * Process inbound email from S3 (triggered by SNS notification)
 * @param {Object} notification - SNS notification payload
 */
async function processInboundEmail(notification) {
  const { mail, receipt } = notification;
  
  console.log(`📥 Processing inbound email: ${mail.messageId}`);
  
  try {
    // Get email from S3
    const s3Key = `incoming/${mail.messageId}`;
    const rawEmail = await getEmailFromS3(s3Key);
    
    if (!rawEmail) {
      console.error('Email not found in S3:', s3Key);
      return { success: false, error: 'Email not found in S3' };
    }
    
    // Parse email
    const parsed = await simpleParser(rawEmail);
    
    // Extract recipient info
    const recipients = receipt.recipients || [];
    const toAddresses = parsed.to?.value || [];
    
    // Process for each recipient
    const results = [];
    for (const recipientEmail of recipients) {
      const result = await saveInboundEmail(parsed, recipientEmail, mail, receipt);
      results.push(result);
    }
    
    // Clean up S3 after processing (optional - can keep for archival)
    if (process.env.SES_DELETE_AFTER_PROCESSING === 'true') {
      await deleteEmailFromS3(s3Key);
    }
    
    console.log(`📥 Processed ${results.length} recipient(s) for message ${mail.messageId}`);
    
    return { success: true, results };
  } catch (error) {
    console.error('Inbound email processing error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save parsed email to database for a specific recipient
 */
async function saveInboundEmail(parsed, recipientEmail, mail, receipt) {
  const { EmailAddress, EmailMessage, EmailThread, EmailContact } = require('../models/email.model');
  
  // Find the recipient's email address record
  const emailAddress = await EmailAddress.findOne({ 
    email: recipientEmail.toLowerCase(),
    isActive: true 
  });
  
  if (!emailAddress) {
    console.log(`📥 No active email address found for: ${recipientEmail}`);
    return { email: recipientEmail, success: false, error: 'Email address not found' };
  }
  
  const userId = emailAddress.user;
  
  // Check spam/virus verdict
  const isSpam = receipt.spamVerdict?.status === 'FAIL';
  const hasVirus = receipt.virusVerdict?.status === 'FAIL';
  
  // Determine folder
  let folder = 'inbox';
  if (hasVirus) folder = 'trash'; // Auto-delete viruses
  else if (isSpam) folder = 'spam';
  
  // Extract sender info
  const fromAddress = parsed.from?.value?.[0] || {};
  const fromEmail = fromAddress.address?.toLowerCase() || 'unknown@unknown.com';
  const fromName = fromAddress.name || fromEmail.split('@')[0];
  
  // Generate thread ID from subject/references
  const threadId = generateThreadId(parsed);
  
  // Check if this is a reply to an existing thread
  let existingThread = null;
  if (parsed.inReplyTo || parsed.references?.length) {
    existingThread = await EmailThread.findOne({
      user: userId,
      threadId: threadId
    });
  }
  
  // Create message
  const message = await EmailMessage.create({
    user: userId,
    emailAddress: emailAddress._id,
    messageId: mail.messageId,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references || [],
    threadId: threadId,
    threadPosition: existingThread ? (existingThread.messageCount || 0) : 0,
    folder,
    direction: 'inbound',
    from: { email: fromEmail, name: fromName },
    to: (parsed.to?.value || []).map(a => ({ email: a.address, name: a.name })),
    cc: (parsed.cc?.value || []).map(a => ({ email: a.address, name: a.name })),
    replyTo: parsed.replyTo?.value?.[0] ? {
      email: parsed.replyTo.value[0].address,
      name: parsed.replyTo.value[0].name
    } : undefined,
    subject: parsed.subject || '(No Subject)',
    bodyText: parsed.text,
    bodyHtml: parsed.html || parsed.textAsHtml,
    snippet: (parsed.text || '').substring(0, 200).replace(/\s+/g, ' ').trim(),
    attachments: await processAttachments(parsed.attachments, mail.messageId, userId),
    headers: {
      received: mail.timestamp,
      spamVerdict: receipt.spamVerdict?.status,
      virusVerdict: receipt.virusVerdict?.status,
      spfVerdict: receipt.spfVerdict?.status,
      dkimVerdict: receipt.dkimVerdict?.status,
      dmarcVerdict: receipt.dmarcVerdict?.status
    },
    rawSize: mail.commonHeaders?.contentLength || 0
  });
  
  // Update or create thread
  if (existingThread) {
    existingThread.messageCount += 1;
    existingThread.unreadCount += 1;
    existingThread.lastMessage = {
      messageId: message._id,
      snippet: message.snippet,
      from: message.from,
      date: message.createdAt
    };
    await existingThread.save();
  } else {
    await EmailThread.create({
      user: userId,
      threadId: threadId,
      subject: message.subject,
      participants: [message.from, ...message.to],
      lastMessage: {
        messageId: message._id,
        snippet: message.snippet,
        from: message.from,
        date: message.createdAt
      },
      messageCount: 1,
      unreadCount: 1,
      folder
    });
  }
  
  // Update/create contact
  await EmailContact.findOneAndUpdate(
    { user: userId, email: fromEmail },
    {
      $set: { name: fromName, source: 'received' },
      $inc: { contactCount: 1 },
      $setOnInsert: { user: userId, email: fromEmail }
    },
    { upsert: true }
  );
  
  // Update email address stats
  await EmailAddress.findByIdAndUpdate(emailAddress._id, {
    $inc: { 'stats.received': 1 },
    $set: { 'stats.lastReceivedAt': new Date() }
  });
  
  // Emit real-time notification
  if (global.io) {
    global.io.to(`user:${userId}`).emit('new-email', {
      messageId: message._id,
      from: message.from,
      subject: message.subject,
      snippet: message.snippet,
      folder
    });
  }
  
  // Check for automation triggers
  await checkAutomationTriggers(message, userId);
  
  return { email: recipientEmail, success: true, messageId: message._id };
}

/**
 * Process and store attachments
 */
async function processAttachments(attachments, messageId, userId) {
  if (!attachments || !attachments.length) return [];
  
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const processed = [];
  
  for (const att of attachments) {
    try {
      const s3Key = `attachments/${userId}/${messageId}/${att.filename}`;
      
      // Upload to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: att.content,
        ContentType: att.contentType,
        Metadata: {
          userId: userId.toString(),
          messageId: messageId
        }
      }));
      
      processed.push({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        url: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`,
        contentId: att.contentId
      });
    } catch (error) {
      console.error('Attachment upload error:', error);
    }
  }
  
  return processed;
}

/**
 * Generate thread ID from email headers
 */
function generateThreadId(parsed) {
  // Use References header first, then In-Reply-To, then generate from subject
  if (parsed.references && parsed.references.length > 0) {
    return `thread_${hashString(parsed.references[0])}`;
  }
  if (parsed.inReplyTo) {
    return `thread_${hashString(parsed.inReplyTo)}`;
  }
  // Generate from subject (strip Re:, Fwd:, etc.)
  const cleanSubject = (parsed.subject || '')
    .replace(/^(re|fwd|fw):\s*/gi, '')
    .toLowerCase()
    .trim();
  return `thread_${hashString(cleanSubject + '_' + Date.now())}`;
}

function hashString(str) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
}

// ==========================================
// S3 OPERATIONS
// ==========================================

async function getEmailFromS3(key) {
  try {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const response = await s3Client.send(command);
    return await streamToString(response.Body);
  } catch (error) {
    console.error('S3 get error:', error);
    return null;
  }
}

async function deleteEmailFromS3(key) {
  try {
    const command = new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key });
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('S3 delete error:', error);
    return false;
  }
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// ==========================================
// SES RECEIPT RULES MANAGEMENT
// ==========================================

/**
 * Setup receipt rule for a domain
 * Called when a custom domain is verified and MX records are configured
 */
async function setupReceiptRule(domain, s3Prefix = 'incoming') {
  const ruleName = `cybev-${domain.replace(/\./g, '-')}`;
  
  try {
    // Ensure rule set exists
    await ensureRuleSetExists();
    
    // Create receipt rule
    await sesClient.send(new CreateReceiptRuleCommand({
      RuleSetName: RULE_SET_NAME,
      Rule: {
        Name: ruleName,
        Enabled: true,
        Recipients: [domain, `.${domain}`], // domain and all subdomains
        ScanEnabled: true, // Enable spam/virus scanning
        Actions: [
          {
            S3Action: {
              BucketName: S3_BUCKET,
              ObjectKeyPrefix: s3Prefix,
              TopicArn: process.env.SES_SNS_TOPIC_ARN // SNS topic for notifications
            }
          }
        ]
      }
    }));
    
    console.log(`📧 Receipt rule created for ${domain}`);
    return { success: true, ruleName };
  } catch (error) {
    if (error.name === 'AlreadyExistsException') {
      return { success: true, ruleName, existed: true };
    }
    console.error('Create receipt rule error:', error);
    throw error;
  }
}

/**
 * Remove receipt rule for a domain
 */
async function removeReceiptRule(domain) {
  const ruleName = `cybev-${domain.replace(/\./g, '-')}`;
  
  try {
    await sesClient.send(new DeleteReceiptRuleCommand({
      RuleSetName: RULE_SET_NAME,
      RuleName: ruleName
    }));
    
    console.log(`📧 Receipt rule removed for ${domain}`);
    return { success: true };
  } catch (error) {
    console.error('Delete receipt rule error:', error);
    throw error;
  }
}

/**
 * Ensure rule set exists and is active
 */
async function ensureRuleSetExists() {
  try {
    // Try to describe the rule set
    await sesClient.send(new DescribeReceiptRuleSetCommand({
      RuleSetName: RULE_SET_NAME
    }));
  } catch (error) {
    if (error.name === 'RuleSetDoesNotExistException') {
      // Create the rule set
      await sesClient.send(new CreateReceiptRuleSetCommand({
        RuleSetName: RULE_SET_NAME
      }));
      
      // Make it active
      await sesClient.send(new SetActiveReceiptRuleSetCommand({
        RuleSetName: RULE_SET_NAME
      }));
      
      console.log(`📧 Created and activated rule set: ${RULE_SET_NAME}`);
    } else {
      throw error;
    }
  }
}

// ==========================================
// MX RECORD HELPERS
// ==========================================

/**
 * Get MX records that user needs to configure
 */
function getMxRecords(domain) {
  // SES inbound MX records vary by region
  const mxEndpoints = {
    'us-east-1': 'inbound-smtp.us-east-1.amazonaws.com',
    'us-west-2': 'inbound-smtp.us-west-2.amazonaws.com',
    'eu-west-1': 'inbound-smtp.eu-west-1.amazonaws.com'
  };
  
  const mxEndpoint = mxEndpoints[AWS_REGION] || mxEndpoints['us-east-1'];
  
  return [
    {
      name: domain,
      type: 'MX',
      priority: 10,
      value: mxEndpoint,
      ttl: 3600
    }
  ];
}

// ==========================================
// AUTOMATION TRIGGERS
// ==========================================

/**
 * Check if incoming email triggers any automations
 */
async function checkAutomationTriggers(message, userId) {
  try {
    const { AutomationWorkflow } = require('../models/automation.model');
    
    // Find active automations with email triggers
    const automations = await AutomationWorkflow.find({
      user: userId,
      status: 'active',
      'trigger.type': 'email_received'
    });
    
    for (const automation of automations) {
      const trigger = automation.trigger;
      let shouldTrigger = true;
      
      // Check trigger conditions
      if (trigger.conditions) {
        if (trigger.conditions.fromContains && 
            !message.from.email.includes(trigger.conditions.fromContains)) {
          shouldTrigger = false;
        }
        if (trigger.conditions.subjectContains && 
            !message.subject.toLowerCase().includes(trigger.conditions.subjectContains.toLowerCase())) {
          shouldTrigger = false;
        }
        if (trigger.conditions.labels && trigger.conditions.labels.length > 0 &&
            !trigger.conditions.labels.some(l => message.labels?.includes(l))) {
          shouldTrigger = false;
        }
      }
      
      if (shouldTrigger) {
        // Queue automation execution
        const { queueAutomationExecution } = require('./automation.service');
        await queueAutomationExecution(automation._id, {
          triggerType: 'email_received',
          emailId: message._id,
          contactEmail: message.from.email
        });
      }
    }
  } catch (error) {
    console.error('Automation trigger check error:', error);
  }
}

// ==========================================
// WEBHOOK HANDLERS (SNS Notifications)
// ==========================================

/**
 * Handle SNS notification for delivery status
 */
async function handleDeliveryNotification(notification) {
  const { EmailMessage } = require('../models/email.model');
  const { CampaignRecipient } = require('../models/campaign.model');
  
  const { notificationType, mail, delivery, bounce, complaint } = notification;
  
  try {
    switch (notificationType) {
      case 'Delivery':
        // Update delivery status
        await EmailMessage.findOneAndUpdate(
          { 'delivery.sesMessageId': mail.messageId },
          { 
            'delivery.status': 'delivered',
            'delivery.deliveredAt': new Date(delivery.timestamp)
          }
        );
        await CampaignRecipient.findOneAndUpdate(
          { sesMessageId: mail.messageId },
          { status: 'delivered', deliveredAt: new Date(delivery.timestamp) }
        );
        break;
        
      case 'Bounce':
        await EmailMessage.findOneAndUpdate(
          { 'delivery.sesMessageId': mail.messageId },
          { 
            'delivery.status': 'bounced',
            'delivery.bouncedAt': new Date(bounce.timestamp),
            'delivery.bounceType': bounce.bounceType,
            'delivery.bounceMessage': bounce.bouncedRecipients?.[0]?.diagnosticCode
          }
        );
        await CampaignRecipient.findOneAndUpdate(
          { sesMessageId: mail.messageId },
          { 
            status: 'bounced', 
            bouncedAt: new Date(bounce.timestamp),
            'error.type': bounce.bounceType,
            'error.message': bounce.bouncedRecipients?.[0]?.diagnosticCode
          }
        );
        
        // Handle hard bounces - mark email as unsubscribed
        if (bounce.bounceType === 'Permanent') {
          const { EmailContact, Unsubscribe } = require('../models/email.model');
          const { Campaign } = require('../models/campaign.model');
          
          for (const recipient of bounce.bouncedRecipients || []) {
            // Find the campaign to get user
            const campaignRecip = await CampaignRecipient.findOne({ sesMessageId: mail.messageId });
            if (campaignRecip) {
              const campaign = await Campaign.findById(campaignRecip.campaign);
              if (campaign) {
                await Unsubscribe.findOneAndUpdate(
                  { email: recipient.emailAddress, user: campaign.user },
                  { 
                    email: recipient.emailAddress,
                    user: campaign.user,
                    source: 'bounce',
                    campaign: campaign._id
                  },
                  { upsert: true }
                );
                
                await EmailContact.findOneAndUpdate(
                  { email: recipient.emailAddress, user: campaign.user },
                  { subscribed: false, unsubscribedAt: new Date(), unsubscribeReason: 'Hard bounce' }
                );
              }
            }
          }
        }
        break;
        
      case 'Complaint':
        await EmailMessage.findOneAndUpdate(
          { 'delivery.sesMessageId': mail.messageId },
          { 'delivery.status': 'complained' }
        );
        await CampaignRecipient.findOneAndUpdate(
          { sesMessageId: mail.messageId },
          { status: 'complained' }
        );
        
        // Auto-unsubscribe complainers
        for (const recipient of complaint.complainedRecipients || []) {
          const campaignRecip = await CampaignRecipient.findOne({ sesMessageId: mail.messageId });
          if (campaignRecip) {
            const campaign = await Campaign.findById(campaignRecip.campaign);
            if (campaign) {
              const { Unsubscribe, EmailContact } = require('../models/email.model');
              await Unsubscribe.findOneAndUpdate(
                { email: recipient.emailAddress, user: campaign.user },
                { 
                  email: recipient.emailAddress,
                  user: campaign.user,
                  source: 'complaint',
                  campaign: campaign._id
                },
                { upsert: true }
              );
              
              await EmailContact.findOneAndUpdate(
                { email: recipient.emailAddress, user: campaign.user },
                { subscribed: false, unsubscribedAt: new Date(), unsubscribeReason: 'Spam complaint' }
              );
            }
          }
        }
        break;
    }
    
    return { success: true, type: notificationType };
  } catch (error) {
    console.error('Delivery notification error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle open tracking pixel
 */
async function trackEmailOpen(trackingId, metadata) {
  const { EmailMessage } = require('../models/email.model');
  const { CampaignRecipient, Campaign } = require('../models/campaign.model');
  
  try {
    // Parse tracking ID: format is "msg_<messageId>" or "camp_<campaignId>_<recipientId>"
    if (trackingId.startsWith('msg_')) {
      const messageId = trackingId.replace('msg_', '');
      await EmailMessage.findByIdAndUpdate(messageId, {
        $inc: { 'tracking.opens': 1 },
        $set: { 
          'tracking.lastOpenedAt': new Date(),
          ...(!await EmailMessage.findOne({ _id: messageId, 'tracking.firstOpenedAt': { $exists: true } }) 
            ? { 'tracking.firstOpenedAt': new Date() } : {})
        }
      });
    } else if (trackingId.startsWith('camp_')) {
      const [, campaignId, recipientId] = trackingId.split('_');
      
      // Update recipient
      const recipient = await CampaignRecipient.findById(recipientId);
      if (recipient) {
        const isFirstOpen = !recipient.firstOpenedAt;
        
        recipient.opens.push({
          timestamp: new Date(),
          ip: metadata.ip,
          userAgent: metadata.userAgent,
          location: metadata.location
        });
        
        if (isFirstOpen) {
          recipient.firstOpenedAt = new Date();
          recipient.status = 'opened';
        }
        await recipient.save();
        
        // Update campaign stats
        await Campaign.findByIdAndUpdate(campaignId, {
          $inc: { 
            'stats.opened': 1,
            'stats.uniqueOpens': isFirstOpen ? 1 : 0
          }
        });
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Track open error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle click tracking
 */
async function trackEmailClick(trackingId, url, metadata) {
  const { EmailMessage } = require('../models/email.model');
  const { CampaignRecipient, Campaign } = require('../models/campaign.model');
  
  try {
    if (trackingId.startsWith('msg_')) {
      const messageId = trackingId.replace('msg_', '');
      await EmailMessage.findByIdAndUpdate(messageId, {
        $inc: { 'tracking.clicks': 1 },
        $push: {
          'tracking.clickedLinks': {
            url,
            clicks: 1,
            firstClickedAt: new Date()
          }
        }
      });
    } else if (trackingId.startsWith('camp_')) {
      const [, campaignId, recipientId] = trackingId.split('_');
      
      const recipient = await CampaignRecipient.findById(recipientId);
      if (recipient) {
        const isFirstClick = !recipient.firstClickedAt;
        
        recipient.clicks.push({
          timestamp: new Date(),
          url,
          ip: metadata.ip,
          userAgent: metadata.userAgent
        });
        
        if (isFirstClick) {
          recipient.firstClickedAt = new Date();
          recipient.status = 'clicked';
        }
        await recipient.save();
        
        await Campaign.findByIdAndUpdate(campaignId, {
          $inc: { 
            'stats.clicked': 1,
            'stats.uniqueClicks': isFirstClick ? 1 : 0
          }
        });
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Track click error:', error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Inbound processing
  processInboundEmail,
  saveInboundEmail,
  
  // S3 operations
  getEmailFromS3,
  deleteEmailFromS3,
  
  // Receipt rules
  setupReceiptRule,
  removeReceiptRule,
  ensureRuleSetExists,
  
  // MX records
  getMxRecords,
  
  // Webhooks
  handleDeliveryNotification,
  trackEmailOpen,
  trackEmailClick
};
