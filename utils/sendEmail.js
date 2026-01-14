// ============================================
// FILE: utils/sendEmail.js
// Email Wrapper - Graceful Fallback
// VERSION: 3.0 - Fixed exports
// ============================================

let emailService = null;

try {
  emailService = require('./email.service');
  console.log('✅ Email service loaded');
} catch (error) {
  console.warn('⚠️ Email service not available:', error.message);
}

/**
 * Send an email
 */
async function sendEmail({ to, subject, html, text }) {
  if (emailService && emailService.sendEmail) {
    try {
      return await emailService.sendEmail(to, 'custom', { subject, html, text });
    } catch (error) {
      console.error('❌ Email send error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Fallback: Log to console
  console.log('📧 [Console Fallback] To:', to, '| Subject:', subject);
  return { success: true, provider: 'console', messageId: `console-${Date.now()}` };
}

/**
 * Send verification email
 */
async function sendVerificationEmail(user, token) {
  if (emailService?.sendVerificationEmail) {
    return emailService.sendVerificationEmail(user, token);
  }
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cybev.io';
  console.log('📧 [Console] Verification URL:', `${FRONTEND_URL}/auth/verify-email?token=${token}`);
  return { success: true, provider: 'console' };
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(user, token) {
  if (emailService?.sendPasswordResetEmail) {
    return emailService.sendPasswordResetEmail(user, token);
  }
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cybev.io';
  console.log('📧 [Console] Reset URL:', `${FRONTEND_URL}/auth/reset-password?token=${token}`);
  return { success: true, provider: 'console' };
}

/**
 * Send welcome email
 */
async function sendWelcomeEmail(user) {
  if (emailService?.sendWelcomeEmail) {
    return emailService.sendWelcomeEmail(user);
  }
  console.log('📧 [Console] Welcome email to:', user.email);
  return { success: true, provider: 'console' };
}

/**
 * Send new follower notification email
 */
async function sendNewFollowerEmail(user, follower) {
  if (emailService?.sendNewFollowerEmail) {
    return emailService.sendNewFollowerEmail(user, follower);
  }
  console.log('📧 [Console] New follower email to:', user.email);
  return { success: true, provider: 'console' };
}

/**
 * Send comment notification email
 */
async function sendCommentEmail(postOwner, commenter, post, comment) {
  if (emailService?.sendCommentEmail) {
    return emailService.sendCommentEmail(postOwner, commenter, post, comment);
  }
  console.log('📧 [Console] Comment email to:', postOwner.email);
  return { success: true, provider: 'console' };
}

/**
 * Get email service status
 */
function getEmailStatus() {
  if (emailService?.getEmailStatus) {
    return emailService.getEmailStatus();
  }
  return { enabled: false, provider: 'console', configured: false };
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
