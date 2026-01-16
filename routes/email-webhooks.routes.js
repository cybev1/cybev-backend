// ============================================
// FILE: routes/email-webhooks.routes.js
// CYBEV Email Webhooks - SNS & Tracking
// VERSION: 1.0.0 - Handle SES notifications
// ============================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const sesInbound = require('../services/ses-inbound.service');

// ==========================================
// SNS MESSAGE VALIDATION
// ==========================================

/**
 * Verify SNS message signature
 */
async function verifySNSSignature(message) {
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_SNS_VALIDATION === 'true') {
    return true;
  }
  
  try {
    const https = require('https');
    
    // Get the certificate
    const certUrl = new URL(message.SigningCertURL);
    if (!certUrl.hostname.endsWith('.amazonaws.com')) {
      console.error('Invalid certificate URL hostname');
      return false;
    }
    
    const cert = await new Promise((resolve, reject) => {
      https.get(message.SigningCertURL, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });
    });
    
    // Build the string to sign
    let stringToSign = '';
    if (message.Type === 'Notification') {
      stringToSign = `Message\n${message.Message}\nMessageId\n${message.MessageId}\n`;
      if (message.Subject) stringToSign += `Subject\n${message.Subject}\n`;
      stringToSign += `Timestamp\n${message.Timestamp}\nTopicArn\n${message.TopicArn}\nType\n${message.Type}\n`;
    } else {
      stringToSign = `Message\n${message.Message}\nMessageId\n${message.MessageId}\n`;
      stringToSign += `SubscribeURL\n${message.SubscribeURL}\nTimestamp\n${message.Timestamp}\n`;
      stringToSign += `Token\n${message.Token}\nTopicArn\n${message.TopicArn}\nType\n${message.Type}\n`;
    }
    
    // Verify signature
    const verifier = crypto.createVerify('SHA1');
    verifier.update(stringToSign);
    return verifier.verify(cert, message.Signature, 'base64');
  } catch (error) {
    console.error('SNS signature verification error:', error);
    return false;
  }
}

// ==========================================
// SNS WEBHOOK ENDPOINT
// ==========================================

/**
 * Handle SNS notifications from SES
 * This handles: delivery, bounce, complaint, inbound email
 */
router.post('/sns', express.text({ type: '*/*' }), async (req, res) => {
  try {
    let message;
    
    // Parse the message
    try {
      message = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      console.error('Invalid SNS message format');
      return res.status(400).json({ error: 'Invalid message format' });
    }
    
    console.log(`📬 SNS ${message.Type}: ${message.TopicArn}`);
    
    // Handle subscription confirmation
    if (message.Type === 'SubscriptionConfirmation') {
      console.log('📬 SNS Subscription confirmation request');
      console.log('Subscribe URL:', message.SubscribeURL);
      
      // Auto-confirm subscription
      const https = require('https');
      https.get(message.SubscribeURL, (confirmRes) => {
        console.log('📬 SNS Subscription confirmed:', confirmRes.statusCode);
      });
      
      return res.json({ ok: true, message: 'Subscription confirmation requested' });
    }
    
    // Verify signature for notifications
    if (message.Type === 'Notification') {
      const isValid = await verifySNSSignature(message);
      if (!isValid && process.env.NODE_ENV === 'production') {
        console.error('Invalid SNS signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
      
      // Parse the actual SES notification
      let notification;
      try {
        notification = JSON.parse(message.Message);
      } catch (e) {
        console.error('Invalid notification message format');
        return res.status(400).json({ error: 'Invalid notification format' });
      }
      
      const { notificationType } = notification;
      console.log(`📬 SES Notification: ${notificationType}`);
      
      // Handle different notification types
      switch (notificationType) {
        case 'Received':
          // Inbound email
          await sesInbound.processInboundEmail(notification);
          break;
          
        case 'Delivery':
        case 'Bounce':
        case 'Complaint':
          // Delivery status notifications
          await sesInbound.handleDeliveryNotification(notification);
          break;
          
        default:
          console.log(`📬 Unknown notification type: ${notificationType}`);
      }
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('SNS webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ==========================================
// TRACKING ENDPOINTS
// ==========================================

/**
 * Track email open (pixel)
 * URL format: /track/open/:trackingId
 */
router.get('/track/open/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    // Get metadata
    const metadata = {
      ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
      userAgent: req.headers['user-agent'],
      location: {} // Would use IP geolocation service in production
    };
    
    // Track the open
    await sesInbound.trackEmailOpen(trackingId, metadata);
    
    // Return transparent 1x1 pixel
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(pixel);
  } catch (error) {
    console.error('Track open error:', error);
    // Still return pixel even on error
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.send(pixel);
  }
});

/**
 * Track link click
 * URL format: /track/click/:trackingId?url=<encoded_url>
 */
router.get('/track/click/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    const decodedUrl = decodeURIComponent(url);
    
    // Validate URL
    try {
      new URL(decodedUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    
    // Get metadata
    const metadata = {
      ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
      userAgent: req.headers['user-agent']
    };
    
    // Track the click
    await sesInbound.trackEmailClick(trackingId, decodedUrl, metadata);
    
    // Redirect to actual URL
    res.redirect(302, decodedUrl);
  } catch (error) {
    console.error('Track click error:', error);
    // Try to redirect anyway
    const { url } = req.query;
    if (url) {
      res.redirect(302, decodeURIComponent(url));
    } else {
      res.status(500).json({ error: 'Tracking failed' });
    }
  }
});

// ==========================================
// UNSUBSCRIBE ENDPOINT
// ==========================================

/**
 * Handle unsubscribe requests
 */
router.get('/unsubscribe', async (req, res) => {
  try {
    const { email, campaign, auto, list } = req.query;
    
    if (!email) {
      return res.status(400).send('Email address required');
    }
    
    // Render unsubscribe confirmation page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribe</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; text-align: center; }
          h1 { color: #333; }
          p { color: #666; line-height: 1.6; }
          form { margin-top: 30px; }
          button { background: #dc3545; color: white; border: none; padding: 12px 30px; font-size: 16px; cursor: pointer; border-radius: 5px; }
          button:hover { background: #c82333; }
          .reason { margin: 20px 0; }
          .reason label { display: block; margin: 10px 0; cursor: pointer; }
          .reason input { margin-right: 10px; }
          textarea { width: 100%; padding: 10px; margin-top: 10px; border: 1px solid #ddd; border-radius: 5px; }
          .success { color: #28a745; }
        </style>
      </head>
      <body>
        <h1>Unsubscribe</h1>
        <p>We're sorry to see you go! You are about to unsubscribe <strong>${email}</strong> from our mailing list.</p>
        
        <form action="/api/email-webhooks/unsubscribe/confirm" method="POST">
          <input type="hidden" name="email" value="${email}">
          <input type="hidden" name="campaign" value="${campaign || ''}">
          <input type="hidden" name="automation" value="${auto || ''}">
          <input type="hidden" name="list" value="${list || ''}">
          
          <div class="reason">
            <p><strong>Please tell us why (optional):</strong></p>
            <label><input type="radio" name="reason" value="too_many"> Too many emails</label>
            <label><input type="radio" name="reason" value="not_relevant"> Content not relevant</label>
            <label><input type="radio" name="reason" value="never_subscribed"> I never subscribed</label>
            <label><input type="radio" name="reason" value="other"> Other</label>
            <textarea name="feedback" placeholder="Additional feedback (optional)"></textarea>
          </div>
          
          <button type="submit">Confirm Unsubscribe</button>
        </form>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Unsubscribe page error:', error);
    res.status(500).send('Error loading unsubscribe page');
  }
});

/**
 * Process unsubscribe confirmation
 */
router.post('/unsubscribe/confirm', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { email, campaign, automation, list, reason, feedback } = req.body;
    
    if (!email) {
      return res.status(400).send('Email address required');
    }
    
    const { EmailContact, Unsubscribe } = require('../models/email.model');
    const { Campaign, CampaignRecipient } = require('../models/campaign.model');
    const { AutomationSubscriber } = require('../models/automation.model');
    
    // Find the user context
    let userId = null;
    
    if (campaign) {
      const camp = await Campaign.findById(campaign);
      if (camp) userId = camp.user;
    }
    
    if (!userId && automation) {
      const { AutomationWorkflow } = require('../models/automation.model');
      const auto = await AutomationWorkflow.findById(automation);
      if (auto) userId = auto.user;
    }
    
    if (!userId) {
      // Try to find user from contact
      const contact = await EmailContact.findOne({ email: email.toLowerCase() });
      if (contact) userId = contact.user;
    }
    
    if (!userId) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Unsubscribed</title>
        <style>body { font-family: sans-serif; max-width: 500px; margin: 50px auto; text-align: center; }</style>
        </head>
        <body><h1>Unsubscribed</h1><p>You have been unsubscribed from our mailing list.</p></body>
        </html>
      `);
    }
    
    // Create unsubscribe record
    await Unsubscribe.findOneAndUpdate(
      { email: email.toLowerCase(), user: userId },
      {
        email: email.toLowerCase(),
        user: userId,
        campaign: campaign || undefined,
        source: 'link',
        reason,
        feedback,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      },
      { upsert: true }
    );
    
    // Update contact
    await EmailContact.findOneAndUpdate(
      { email: email.toLowerCase(), user: userId },
      { subscribed: false, unsubscribedAt: new Date(), unsubscribeReason: reason }
    );
    
    // Update campaign recipient if applicable
    if (campaign) {
      await CampaignRecipient.findOneAndUpdate(
        { campaign, email: email.toLowerCase() },
        { status: 'unsubscribed' }
      );
      
      await Campaign.findByIdAndUpdate(campaign, {
        $inc: { 'stats.unsubscribed': 1 }
      });
    }
    
    // Exit automation if applicable
    if (automation) {
      await AutomationSubscriber.updateMany(
        { automation, email: email.toLowerCase(), status: 'active' },
        { status: 'exited', exitReason: 'unsubscribed', exitedAt: new Date() }
      );
    }
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body { font-family: -apple-system, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; text-align: center; }
          h1 { color: #28a745; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <h1>✓ Unsubscribed</h1>
        <p>You have been successfully unsubscribed from our mailing list.</p>
        <p>We're sorry to see you go. If you change your mind, you can always subscribe again.</p>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Unsubscribe confirm error:', error);
    res.status(500).send('Error processing unsubscribe request');
  }
});

// ==========================================
// WEBHOOK STATUS / TEST
// ==========================================

router.get('/status', (req, res) => {
  res.json({
    ok: true,
    service: 'email-webhooks',
    version: '1.0.0',
    endpoints: {
      sns: '/api/email-webhooks/sns',
      trackOpen: '/api/email-webhooks/track/open/:trackingId',
      trackClick: '/api/email-webhooks/track/click/:trackingId',
      unsubscribe: '/api/email-webhooks/unsubscribe'
    }
  });
});

module.exports = router;
