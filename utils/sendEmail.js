const nodemailer = require('nodemailer');

/**
 * Send email using nodemailer
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    // Create transporter
    let transporter;

    if (process.env.EMAIL_SERVICE === 'gmail') {
      // Gmail configuration
      transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD // Use App Password, not regular password
        }
      });
    } else if (process.env.SMTP_HOST) {
      // Custom SMTP configuration
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    } else {
      // Development mode - log to console
      console.log('📧 Email would be sent (no email configured):');
      console.log('To:', to);
      console.log('Subject:', subject);
      console.log('HTML:', html.substring(0, 200) + '...');
      return { success: true, dev: true };
    }

    // Send email
    const info = await transporter.sendMail({
      from: `"CYBEV" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@cybev.io'}>`,
      to,
      subject,
      html
    });

    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Email sending failed:', error);
    
    // Don't throw error in development
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 Email content (dev mode):');
      console.log('To:', to);
      console.log('Subject:', subject);
      return { success: false, error: error.message };
    }
    
    throw error;
  }
};

module.exports = sendEmail;
