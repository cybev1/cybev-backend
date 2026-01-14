// ============================================
// FILE: utils/email.service.js
// Email Service - Multi-Provider Support
// VERSION: 3.0 - Fixed Brevo (uses HTTP API)
// Supports: Brevo, Resend, SendGrid, SMTP
// ============================================

const nodemailer = require('nodemailer');

// Configuration
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'console');
const FROM_EMAIL = process.env.BREVO_SENDER_EMAIL || process.env.FROM_EMAIL || 'noreply@cybev.io';
const FROM_NAME = process.env.FROM_NAME || 'CYBEV';
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://cybev.io';

const BREVO_API_KEY = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// ==========================================
// Email Templates
// ==========================================

const templates = {
  custom: (data) => ({
    subject: data.subject || 'Message from CYBEV',
    html: data.html || `<p>${data.text || 'No content'}</p>`,
    text: data.text || data.html?.replace(/<[^>]*>/g, '') || 'No content'
  }),

  verification: (data) => ({
    subject: 'Verify your CYBEV account',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr><td align="center">
            <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <tr><td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 40px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">CYBEV</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Verify Your Email</p>
              </td></tr>
              <tr><td style="padding: 40px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Hi ${data.name || 'there'},</p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">Thanks for signing up for CYBEV! Please verify your email address by clicking the button below.</p>
                <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
                  <a href="${data.verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px;">Verify Email</a>
                </td></tr></table>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">Or copy and paste this link: <a href="${data.verificationUrl}" style="color: #9333ea;">${data.verificationUrl}</a></p>
                <p style="color: #9ca3af; font-size: 12px; margin: 20px 0 0 0;">This link expires in 24 hours.</p>
              </td></tr>
              <tr><td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} CYBEV. All rights reserved.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
    text: `Hi ${data.name || 'there'},\n\nThanks for signing up! Please verify your email:\n${data.verificationUrl}\n\nThis link expires in 24 hours.`
  }),

  passwordReset: (data) => ({
    subject: 'Reset your CYBEV password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fff; border-radius: 10px;">
        <div style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: #ffffff; margin: 0;">CYBEV</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Password Reset</p>
        </div>
        <div style="padding: 30px;">
          <p style="color: #374151;">Hi ${data.name || 'there'},</p>
          <p style="color: #374151;">Click below to reset your password:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${data.resetUrl}" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">Reset Password</a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, please ignore.</p>
        </div>
      </div>
    `,
    text: `Hi ${data.name},\n\nReset your password: ${data.resetUrl}\n\nExpires in 1 hour.`
  }),

  welcome: (data) => ({
    subject: 'Welcome to CYBEV! 🎉',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 40px; text-align: center; border-radius: 16px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 32px;">Welcome to CYBEV! 🎉</h1>
        </div>
        <div style="padding: 30px; background: #fff; border-radius: 0 0 16px 16px;">
          <p style="color: #374151; font-size: 16px;">Hi ${data.name || 'there'},</p>
          <p style="color: #374151; font-size: 16px;">Your email is verified! Start creating amazing content with AI.</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${FRONTEND_URL}" style="background: linear-gradient(to right, #8B5CF6, #EC4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold;">Get Started</a>
          </p>
        </div>
      </div>
    `,
    text: `Welcome to CYBEV, ${data.name}! Your email is verified. Visit: ${FRONTEND_URL}`
  }),

  securityAlert: (data) => ({
    subject: '🔐 Security Alert - New Login Detected',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #EF4444;">Security Alert 🔐</h1>
        <p>Hi ${data.name},</p>
        <p>We detected a new login to your CYBEV account:</p>
        <ul style="background: #f3f4f6; padding: 20px; border-radius: 8px; list-style: none;">
          <li><strong>Time:</strong> ${data.time || new Date().toISOString()}</li>
          <li><strong>IP Address:</strong> ${data.ip || 'Unknown'}</li>
          <li><strong>Location:</strong> ${data.location || 'Unknown'}</li>
        </ul>
        <p>If this was you, you can ignore this email.</p>
        <p style="color: #EF4444;"><strong>If this wasn't you, please secure your account immediately.</strong></p>
      </div>
    `,
    text: `Security Alert: New login to your CYBEV account from IP: ${data.ip}`
  }),

  newFollower: (data) => ({
    subject: `${data.followerName} started following you on CYBEV`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #8B5CF6;">New Follower! 🎉</h1>
        <p>Hi ${data.name},</p>
        <p><strong>${data.followerName}</strong> (@${data.followerUsername}) started following you!</p>
        <a href="${FRONTEND_URL}/profile/${data.followerUsername}" style="display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px;">View Profile</a>
      </div>
    `,
    text: `${data.followerName} started following you on CYBEV!`
  }),

  comment: (data) => ({
    subject: `${data.commenterName} commented on your post`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #8B5CF6;">New Comment 💬</h1>
        <p>Hi ${data.name},</p>
        <p><strong>${data.commenterName}</strong> commented on your post:</p>
        <blockquote style="background: #f3f4f6; padding: 15px; border-left: 4px solid #8B5CF6; margin: 20px 0;">"${data.commentPreview}"</blockquote>
        <a href="${data.postUrl}" style="display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">View Comment</a>
      </div>
    `,
    text: `${data.commenterName} commented: "${data.commentPreview}"`
  })
};

// ==========================================
// Provider Functions
// ==========================================

async function sendWithConsole(to, subject, html, text) {
  console.log('📧 [Console Mode] To:', to, '| Subject:', subject);
  return { success: true, provider: 'console', messageId: `console-${Date.now()}` };
}

// BREVO - Using HTTP API directly (more reliable than SDK)
async function sendWithBrevo(to, subject, html, text) {
  console.log('📧 Sending via Brevo HTTP API to:', to);
  
  const fetch = require('node-fetch');
  
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html,
      textContent: text
    })
  });

  const result = await response.json();
  
  if (response.ok) {
    console.log('📧 ✅ Brevo email sent! MessageId:', result.messageId);
    return { success: true, provider: 'brevo', messageId: result.messageId };
  } else {
    console.error('📧 ❌ Brevo API error:', result);
    throw new Error(result.message || `Brevo error: ${response.status}`);
  }
}

async function sendWithResend(to, subject, html, text) {
  const { Resend } = require('resend');
  const resend = new Resend(RESEND_API_KEY);
  const result = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [to], subject, html, text
  });
  console.log('📧 Sent via Resend:', result.id);
  return { success: true, provider: 'resend', messageId: result.id };
}

async function sendWithSendGrid(to, subject, html, text) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(SENDGRID_API_KEY);
  const result = await sgMail.send({ to, from: { name: FROM_NAME, email: FROM_EMAIL }, subject, text, html });
  console.log('📧 Sent via SendGrid');
  return { success: true, provider: 'sendgrid', messageId: result[0]?.headers?.['x-message-id'] };
}

async function sendWithSMTP(to, subject, html, text) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  const result = await transporter.sendMail({ from: `"${FROM_NAME}" <${FROM_EMAIL}>`, to, subject, text, html });
  console.log('📧 Sent via SMTP:', result.messageId);
  return { success: true, provider: 'smtp', messageId: result.messageId };
}

// ==========================================
// Main Send Function
// ==========================================

async function sendEmail(to, templateName, data = {}) {
  if (!to) {
    console.warn('⚠️ No recipient email provided');
    return { success: false, error: 'No recipient' };
  }

  const template = templates[templateName];
  if (!template) {
    console.error(`❌ Unknown email template: ${templateName}`);
    return { success: false, error: `Unknown template: ${templateName}` };
  }

  const { subject, html, text } = template(data);
  const provider = EMAIL_PROVIDER.toLowerCase();

  console.log(`📧 Sending "${templateName}" email to ${to} via ${provider}`);

  try {
    switch (provider) {
      case 'brevo':
      case 'sendinblue':
        return await sendWithBrevo(to, subject, html, text);
      case 'resend':
        return await sendWithResend(to, subject, html, text);
      case 'sendgrid':
        return await sendWithSendGrid(to, subject, html, text);
      case 'smtp':
        return await sendWithSMTP(to, subject, html, text);
      default:
        return await sendWithConsole(to, subject, html, text);
    }
  } catch (error) {
    console.error('📧 ❌ Email send failed:', error.message);
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Falling back to console...');
      return await sendWithConsole(to, subject, html, text);
    }
    return { success: false, error: error.message };
  }
}

// ==========================================
// Helper Functions
// ==========================================

async function sendVerificationEmail(user, token) {
  const verificationUrl = `${FRONTEND_URL}/auth/verify-email?token=${token}`;
  return sendEmail(user.email, 'verification', { name: user.name, verificationUrl });
}

async function sendPasswordResetEmail(user, token) {
  const resetUrl = `${FRONTEND_URL}/auth/reset-password?token=${token}`;
  return sendEmail(user.email, 'passwordReset', { name: user.name, resetUrl });
}

async function sendWelcomeEmail(user) {
  return sendEmail(user.email, 'welcome', { name: user.name });
}

async function sendSecurityAlertEmail(user, data) {
  return sendEmail(user.email, 'securityAlert', { name: user.name, ...data });
}

async function sendNewFollowerEmail(user, follower) {
  if (user.preferences?.notifications?.follows === false) {
    return { success: true, skipped: true };
  }
  return sendEmail(user.email, 'newFollower', {
    name: user.name, followerName: follower.name, followerUsername: follower.username
  });
}

async function sendCommentEmail(postOwner, commenter, post, comment) {
  if (postOwner.preferences?.notifications?.comments === false) {
    return { success: true, skipped: true };
  }
  return sendEmail(postOwner.email, 'comment', {
    name: postOwner.name, commenterName: commenter.name,
    commentPreview: comment.content?.substring(0, 100) || 'No content',
    postUrl: `${FRONTEND_URL}/post/${post._id}`
  });
}

function getEmailStatus() {
  return {
    enabled: EMAIL_PROVIDER !== 'console',
    provider: EMAIL_PROVIDER,
    configured: !!BREVO_API_KEY || !!RESEND_API_KEY || !!SENDGRID_API_KEY || !!SMTP_HOST,
    fromEmail: FROM_EMAIL,
    fromName: FROM_NAME,
    availableProviders: [
      BREVO_API_KEY ? 'brevo' : null,
      RESEND_API_KEY ? 'resend' : null,
      SENDGRID_API_KEY ? 'sendgrid' : null,
      SMTP_HOST ? 'smtp' : null
    ].filter(Boolean)
  };
}

// Log on startup
console.log(`📧 Email Service: ${EMAIL_PROVIDER} | From: ${FROM_EMAIL}`);
if (BREVO_API_KEY) console.log(`📧 Brevo API Key: ${BREVO_API_KEY.substring(0, 12)}...`);

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendSecurityAlertEmail,
  sendNewFollowerEmail,
  sendCommentEmail,
  getEmailStatus,
  templates
};
