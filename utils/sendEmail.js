// ============================================
// FILE: utils/sendEmail.js
// Email Wrapper - Graceful Fallback
// VERSION: 2.0
// ============================================

// Try to load the email service, but don't crash if it fails
let emailService = null;

try {
  emailService = require('./email.service');
  console.log('✅ Email service loaded');
} catch (error) {
  console.warn('⚠️ Email service not available:', error.message);
  console.warn('   Emails will be logged to console instead');
}

/**
 * Send an email - gracefully handles missing email service
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @returns {Promise<Object>} - Result object
 */
async function sendEmail({ to, subject, html, text }) {
  // If email service is available, use it
  if (emailService) {
    try {
      // Use the raw send if template doesn't match
      const result = await emailService.sendEmail(to, 'custom', { subject, html, text });
      return result;
    } catch (error) {
      console.error('❌ Email send error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Fallback: Log to console
  console.log('📧 [EMAIL - Console Fallback]');
  console.log(`   To: ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Content: ${(text || html)?.substring(0, 200)}...`);
  
  return { 
    success: true, 
    provider: 'console', 
    messageId: `console-${Date.now()}`,
    note: 'Email logged to console (email service not configured)'
  };
}

/**
 * Send verification email
 */
async function sendVerificationEmail(user, token) {
  if (emailService?.sendVerificationEmail) {
    return emailService.sendVerificationEmail(user, token);
  }

  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cybev.io';
  const verificationUrl = `${FRONTEND_URL}/auth/verify-email?token=${token}`;
  
  console.log('📧 [VERIFICATION EMAIL - Console]');
  console.log(`   To: ${user.email}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   Verification URL: ${verificationUrl}`);
  
  return { success: true, provider: 'console', verificationUrl };
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(user, token) {
  if (emailService?.sendPasswordResetEmail) {
    return emailService.sendPasswordResetEmail(user, token);
  }

  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cybev.io';
  const resetUrl = `${FRONTEND_URL}/auth/reset-password?token=${token}`;
  
  console.log('📧 [PASSWORD RESET EMAIL - Console]');
  console.log(`   To: ${user.email}`);
  console.log(`   Reset URL: ${resetUrl}`);
  
  return { success: true, provider: 'console', resetUrl };
}

/**
 * Send welcome email
 */
async function sendWelcomeEmail(user) {
  if (emailService?.sendWelcomeEmail) {
    return emailService.sendWelcomeEmail(user);
  }

  console.log('📧 [WELCOME EMAIL - Console]');
  console.log(`   To: ${user.email}`);
  console.log(`   Name: ${user.name}`);
  
  return { success: true, provider: 'console' };
}

/**
 * Send new follower notification email
 */
async function sendNewFollowerEmail(user, follower) {
  if (emailService?.sendNewFollowerEmail) {
    return emailService.sendNewFollowerEmail(user, follower);
  }

  console.log('📧 [NEW FOLLOWER EMAIL - Console]');
  console.log(`   To: ${user.email}`);
  console.log(`   Follower: ${follower.name} (@${follower.username})`);
  
  return { success: true, provider: 'console' };
}

/**
 * Send comment notification email
 */
async function sendCommentEmail(postOwner, commenter, post, comment) {
  if (emailService?.sendCommentEmail) {
    return emailService.sendCommentEmail(postOwner, commenter, post, comment);
  }

  console.log('📧 [COMMENT EMAIL - Console]');
  console.log(`   To: ${postOwner.email}`);
  console.log(`   Commenter: ${commenter.name}`);
  console.log(`   Comment: ${comment.content?.substring(0, 100)}`);
  
  return { success: true, provider: 'console' };
}

/**
 * Get email service status
 */
function getEmailStatus() {
  if (emailService?.getEmailStatus) {
    return emailService.getEmailStatus();
  }
  
  return {
    enabled: false,
    provider: 'console',
    configured: false,
    availableProviders: []
  };
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNewFollowerEmail,
  sendCommentEmail,
  getEmailStatus
};
