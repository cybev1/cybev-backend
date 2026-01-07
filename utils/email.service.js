// ============================================
// FILE: utils/email.service.js
// Email Service - Multi-Provider Support
// VERSION: 2.0
// Supports: Brevo (Sendinblue), Resend, SendGrid, SMTP
// ============================================

const nodemailer = require('nodemailer');

// ==========================================
// Configuration
// ==========================================

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'console');
const FROM_EMAIL = process.env.BREVO_SENDER_EMAIL || process.env.FROM_EMAIL || 'noreply@cybev.io';
const FROM_NAME = process.env.FROM_NAME || 'CYBEV';
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://cybev.io';

// Provider-specific configs
const BREVO_API_KEY = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

// SMTP Config
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// ==========================================
// Email Templates
// ==========================================

const templates = {
  // Custom template (raw html/text)
  custom: (data) => ({
    subject: data.subject || 'Message from CYBEV',
    html: data.html || `<p>${data.text || 'No content'}</p>`,
    text: data.text || data.html?.replace(/<[^>]*>/g, '') || 'No content'
  }),

  // Email Verification
  verification: (data) => ({
    subject: 'Verify your CYBEV account',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 40px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">CYBEV</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Verify Your Email</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                      Hi ${data.name || 'there'},
                    </p>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                      Thanks for signing up for CYBEV! Please verify your email address by clicking the button below.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${data.verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px;">
                            Verify Email
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                      Or copy and paste this link in your browser:
                    </p>
                    <p style="color: #9333ea; font-size: 14px; word-break: break-all; margin: 10px 0 0 0;">
                      ${data.verificationUrl}
                    </p>
                    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                      This link will expire in 24 hours.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0;">
                      © ${new Date().getFullYear()} CYBEV. All rights reserved.
                    </p>
                    <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
                      If you didn't create an account, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Hi ${data.name || 'there'},\n\nThanks for signing up for CYBEV! Please verify your email by visiting:\n\n${data.verificationUrl}\n\nThis link expires in 24 hours.\n\n- The CYBEV Team`
  }),

  // Password Reset
  passwordReset: (data) => ({
    subject: 'Reset your CYBEV password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 40px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">CYBEV</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Password Reset</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                      Hi ${data.name || 'there'},
                    </p>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                      We received a request to reset your password. Click the button below to create a new password.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${data.resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px;">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                      This link will expire in 1 hour. If you didn't request this, please ignore this email.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0;">© ${new Date().getFullYear()} CYBEV</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Hi ${data.name || 'there'},\n\nWe received a request to reset your password. Visit this link to create a new password:\n\n${data.resetUrl}\n\nThis link expires in 1 hour.\n\n- The CYBEV Team`
  }),

  // Welcome Email
  welcome: (data) => ({
    subject: 'Welcome to CYBEV! 🎉',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 40px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Welcome to CYBEV!</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Your creative journey starts here</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                      Hi ${data.name || 'Creator'},
                    </p>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                      Welcome to CYBEV! We're thrilled to have you join our community of creators, writers, and innovators.
                    </p>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                      Here's what you can do:
                    </p>
                    <ul style="color: #374151; font-size: 16px; line-height: 1.8; margin: 0 0 30px 0; padding-left: 20px;">
                      <li>📝 Write blogs with AI assistance</li>
                      <li>📹 Go live and connect with your audience</li>
                      <li>🎬 Share vlogs and short videos</li>
                      <li>💰 Earn tokens for your engagement</li>
                      <li>🖼️ Mint your content as NFTs</li>
                    </ul>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${FRONTEND_URL}/feed" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px;">
                            Start Exploring
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0;">Happy creating! 🚀</p>
                    <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">© ${new Date().getFullYear()} CYBEV</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Hi ${data.name || 'Creator'},\n\nWelcome to CYBEV! We're thrilled to have you.\n\nHere's what you can do:\n- Write blogs with AI assistance\n- Go live and connect with your audience\n- Share vlogs and short videos\n- Earn tokens for your engagement\n- Mint your content as NFTs\n\nStart exploring: ${FRONTEND_URL}/feed\n\nHappy creating!\n- The CYBEV Team`
  }),

  // New Follower
  newFollower: (data) => ({
    subject: `${data.followerName} started following you on CYBEV`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Follower! 🎉</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; text-align: center;">
                    <img src="${data.followerAvatar || `${FRONTEND_URL}/default-avatar.png`}" alt="${data.followerName}" style="width: 80px; height: 80px; border-radius: 50%; margin-bottom: 20px;">
                    <p style="color: #374151; font-size: 18px; font-weight: 600; margin: 0 0 10px 0;">
                      ${data.followerName}
                    </p>
                    <p style="color: #6b7280; font-size: 14px; margin: 0 0 30px 0;">
                      @${data.followerUsername}
                    </p>
                    <a href="${FRONTEND_URL}/${data.followerUsername}" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 10px; font-weight: 600;">
                      View Profile
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                      <a href="${FRONTEND_URL}/settings" style="color: #9ca3af;">Manage notifications</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `${data.followerName} (@${data.followerUsername}) started following you on CYBEV!\n\nView their profile: ${FRONTEND_URL}/${data.followerUsername}`
  }),

  // Weekly Digest
  weeklyDigest: (data) => ({
    subject: `Your CYBEV Weekly Digest 📊`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 40px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Your Weekly Digest</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${data.weekRange}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <p style="color: #374151; font-size: 16px; margin: 0 0 30px 0;">
                      Hi ${data.name || 'Creator'}, here's your weekly summary:
                    </p>
                    
                    <!-- Stats Grid -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td width="50%" style="padding: 15px; background-color: #f3f4f6; border-radius: 12px; text-align: center;">
                          <p style="color: #9333ea; font-size: 32px; font-weight: bold; margin: 0;">${data.stats?.newFollowers || 0}</p>
                          <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">New Followers</p>
                        </td>
                        <td width="10"></td>
                        <td width="50%" style="padding: 15px; background-color: #f3f4f6; border-radius: 12px; text-align: center;">
                          <p style="color: #ec4899; font-size: 32px; font-weight: bold; margin: 0;">${data.stats?.totalLikes || 0}</p>
                          <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">Total Likes</p>
                        </td>
                      </tr>
                      <tr><td colspan="3" height="10"></td></tr>
                      <tr>
                        <td width="50%" style="padding: 15px; background-color: #f3f4f6; border-radius: 12px; text-align: center;">
                          <p style="color: #3b82f6; font-size: 32px; font-weight: bold; margin: 0;">${data.stats?.totalComments || 0}</p>
                          <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">Comments</p>
                        </td>
                        <td width="10"></td>
                        <td width="50%" style="padding: 15px; background-color: #f3f4f6; border-radius: 12px; text-align: center;">
                          <p style="color: #10b981; font-size: 32px; font-weight: bold; margin: 0;">${data.stats?.profileViews || 0}</p>
                          <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">Profile Views</p>
                        </td>
                      </tr>
                    </table>

                    ${data.topPost ? `
                    <!-- Top Post -->
                    <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                      <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 10px 0;">🔥 Your Top Post</p>
                      <p style="color: #374151; font-size: 16px; margin: 0 0 10px 0;">${data.topPost.content?.substring(0, 100)}...</p>
                      <p style="color: #9333ea; font-size: 14px; margin: 0;">
                        ${data.topPost.likes || 0} likes • ${data.topPost.comments || 0} comments
                      </p>
                    </div>
                    ` : ''}

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${FRONTEND_URL}/feed" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600;">
                            See What's New
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                      <a href="${FRONTEND_URL}/settings" style="color: #9ca3af;">Unsubscribe from digest</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Your CYBEV Weekly Digest\n\n${data.weekRange}\n\nHi ${data.name},\n\nNew Followers: ${data.stats?.newFollowers || 0}\nTotal Likes: ${data.stats?.totalLikes || 0}\nComments: ${data.stats?.totalComments || 0}\nProfile Views: ${data.stats?.profileViews || 0}\n\nSee what's new: ${FRONTEND_URL}/feed`
  }),

  // Comment Notification
  newComment: (data) => ({
    subject: `${data.commenterName} commented on your post`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Comment 💬</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <div style="display: flex; align-items: center; margin-bottom: 20px;">
                      <img src="${data.commenterAvatar || `${FRONTEND_URL}/default-avatar.png`}" alt="" style="width: 48px; height: 48px; border-radius: 50%; margin-right: 15px;">
                      <div>
                        <p style="color: #374151; font-size: 16px; font-weight: 600; margin: 0;">${data.commenterName}</p>
                        <p style="color: #6b7280; font-size: 14px; margin: 0;">@${data.commenterUsername}</p>
                      </div>
                    </div>
                    <div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                      <p style="color: #374151; font-size: 16px; margin: 0; font-style: italic;">
                        "${data.comment}"
                      </p>
                    </div>
                    <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px 0;">
                      On your post: "${data.postPreview?.substring(0, 50)}..."
                    </p>
                    <a href="${data.postUrl}" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 10px; font-weight: 600;">
                      View Comment
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                      <a href="${FRONTEND_URL}/settings" style="color: #9ca3af;">Manage notifications</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `${data.commenterName} commented on your post:\n\n"${data.comment}"\n\nView it here: ${data.postUrl}`
  })
};

// ==========================================
// Email Providers
// ==========================================

// Console Provider (Development/Fallback)
async function sendWithConsole(to, subject, html, text) {
  console.log('📧 [EMAIL - Console Mode]');
  console.log(`   To: ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Preview: ${text?.substring(0, 100)}...`);
  return { success: true, provider: 'console', messageId: `console-${Date.now()}` };
}

// Brevo (Sendinblue) Provider
async function sendWithBrevo(to, subject, html, text) {
  try {
    const SibApiV3Sdk = require('@getbrevo/brevo');
    
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY);

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    sendSmtpEmail.textContent = text;
    sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
    sendSmtpEmail.to = [{ email: to }];

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('📧 Email sent via Brevo:', result.messageId);
    return { success: true, provider: 'brevo', messageId: result.messageId };
  } catch (error) {
    console.error('❌ Brevo email error:', error.message);
    throw error;
  }
}

// Resend Provider
async function sendWithResend(to, subject, html, text) {
  try {
    const { Resend } = require('resend');
    const resend = new Resend(RESEND_API_KEY);

    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text
    });

    console.log('📧 Email sent via Resend:', result.id);
    return { success: true, provider: 'resend', messageId: result.id };
  } catch (error) {
    console.error('❌ Resend email error:', error.message);
    throw error;
  }
}

// SendGrid Provider
async function sendWithSendGrid(to, subject, html, text) {
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(SENDGRID_API_KEY);

    const msg = {
      to,
      from: { name: FROM_NAME, email: FROM_EMAIL },
      subject,
      text,
      html
    };

    const result = await sgMail.send(msg);
    console.log('📧 Email sent via SendGrid');
    return { success: true, provider: 'sendgrid', messageId: result[0]?.headers?.['x-message-id'] };
  } catch (error) {
    console.error('❌ SendGrid email error:', error.message);
    throw error;
  }
}

// SMTP Provider (Nodemailer)
async function sendWithSMTP(to, subject, html, text) {
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    const result = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      text,
      html
    });

    console.log('📧 Email sent via SMTP:', result.messageId);
    return { success: true, provider: 'smtp', messageId: result.messageId };
  } catch (error) {
    console.error('❌ SMTP email error:', error.message);
    throw error;
  }
}

// ==========================================
// Main Send Function
// ==========================================

async function sendEmail(to, templateName, data = {}) {
  // Check if email is enabled
  if (!to) {
    console.warn('⚠️ No recipient email provided');
    return { success: false, error: 'No recipient' };
  }

  // Get template
  const template = templates[templateName];
  if (!template) {
    console.error(`❌ Unknown email template: ${templateName}`);
    return { success: false, error: 'Unknown template' };
  }

  // Generate email content
  const { subject, html, text } = template(data);

  // Send based on provider
  try {
    let result;

    switch (EMAIL_PROVIDER.toLowerCase()) {
      case 'brevo':
      case 'sendinblue':
        result = await sendWithBrevo(to, subject, html, text);
        break;
      case 'resend':
        result = await sendWithResend(to, subject, html, text);
        break;
      case 'sendgrid':
        result = await sendWithSendGrid(to, subject, html, text);
        break;
      case 'smtp':
        result = await sendWithSMTP(to, subject, html, text);
        break;
      case 'console':
      default:
        result = await sendWithConsole(to, subject, html, text);
    }

    return result;
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    
    // Fallback to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Falling back to console output...');
      return await sendWithConsole(to, subject, html, text);
    }
    
    return { success: false, error: error.message };
  }
}

// ==========================================
// Helper Functions
// ==========================================

// Send verification email
async function sendVerificationEmail(user, token) {
  const verificationUrl = `${FRONTEND_URL}/auth/verify-email?token=${token}`;
  return sendEmail(user.email, 'verification', {
    name: user.name,
    verificationUrl
  });
}

// Send password reset email
async function sendPasswordResetEmail(user, token) {
  const resetUrl = `${FRONTEND_URL}/auth/reset-password?token=${token}`;
  return sendEmail(user.email, 'passwordReset', {
    name: user.name,
    resetUrl
  });
}

// Send welcome email
async function sendWelcomeEmail(user) {
  return sendEmail(user.email, 'welcome', {
    name: user.name
  });
}

// Send new follower email
async function sendNewFollowerEmail(user, follower) {
  // Check user preferences
  if (user.preferences?.notifications?.follows === false) {
    return { success: true, skipped: true, reason: 'User disabled follow notifications' };
  }
  
  return sendEmail(user.email, 'newFollower', {
    name: user.name,
    followerName: follower.name,
    followerUsername: follower.username,
    followerAvatar: follower.avatar
  });
}

// Send comment notification email
async function sendCommentEmail(postOwner, commenter, post, comment) {
  // Check user preferences
  if (postOwner.preferences?.notifications?.comments === false) {
    return { success: true, skipped: true, reason: 'User disabled comment notifications' };
  }
  
  return sendEmail(postOwner.email, 'newComment', {
    name: postOwner.name,
    commenterName: commenter.name,
    commenterUsername: commenter.username,
    commenterAvatar: commenter.avatar,
    comment: comment.content,
    postPreview: post.content,
    postUrl: `${FRONTEND_URL}/post/${post._id}`
  });
}

// ==========================================
// Status Check
// ==========================================

function getEmailStatus() {
  const providers = {
    brevo: !!BREVO_API_KEY,
    resend: !!RESEND_API_KEY,
    sendgrid: !!SENDGRID_API_KEY,
    smtp: !!(SMTP_HOST && SMTP_USER && SMTP_PASS)
  };

  return {
    enabled: EMAIL_PROVIDER !== 'console' || process.env.NODE_ENV === 'development',
    provider: EMAIL_PROVIDER,
    configured: providers[EMAIL_PROVIDER.toLowerCase()] || EMAIL_PROVIDER === 'console',
    availableProviders: Object.entries(providers)
      .filter(([_, configured]) => configured)
      .map(([name]) => name)
  };
}

// Log status on load
const status = getEmailStatus();
console.log(`📧 Email Service: ${status.configured ? '✅ Configured' : '⚠️ Not configured'} (${EMAIL_PROVIDER})`);

// ==========================================
// Exports
// ==========================================

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNewFollowerEmail,
  sendCommentEmail,
  getEmailStatus,
  templates
};
