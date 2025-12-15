// utils/emailService.js - DUAL PROVIDER WITH FALLBACK
const nodemailer = require('nodemailer');

// Create Brevo transporter
const createBrevoTransporter = () => {
  const config = {
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_USER || process.env.SMTP_USER,
      pass: process.env.BREVO_PASSWORD || process.env.SMTP_PASSWORD
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  };

  if (!config.auth.user || !config.auth.pass) {
    return null;
  }

  console.log('📧 Brevo SMTP configured:', config.auth.user);
  return nodemailer.createTransport(config);
};

// Create Gmail transporter
const createGmailTransporter = () => {
  const config = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASSWORD
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  };

  if (!config.auth.user || !config.auth.pass) {
    return null;
  }

  console.log('📧 Gmail SMTP configured:', config.auth.user);
  return nodemailer.createTransport(config);
};

// Smart send with fallback
const sendEmailWithFallback = async (mailOptions) => {
  const brevoTransporter = createBrevoTransporter();
  const gmailTransporter = createGmailTransporter();

  // Try Brevo first (primary)
  if (brevoTransporter) {
    try {
      console.log('📤 Trying Brevo SMTP...');
      const info = await brevoTransporter.sendMail(mailOptions);
      console.log('✅ Email sent via Brevo:', info.messageId);
      return { success: true, provider: 'Brevo', messageId: info.messageId };
    } catch (brevoError) {
      console.warn('⚠️ Brevo failed:', brevoError.message);
      
      // Fallback to Gmail
      if (gmailTransporter) {
        try {
          console.log('📤 Falling back to Gmail SMTP...');
          const info = await gmailTransporter.sendMail({
            ...mailOptions,
            from: `CYBEV <${process.env.GMAIL_USER}>` // Use Gmail address
          });
          console.log('✅ Email sent via Gmail (fallback):', info.messageId);
          return { success: true, provider: 'Gmail', messageId: info.messageId };
        } catch (gmailError) {
          console.error('❌ Gmail also failed:', gmailError.message);
          throw new Error(`Both email providers failed. Brevo: ${brevoError.message}, Gmail: ${gmailError.message}`);
        }
      } else {
        throw brevoError;
      }
    }
  }

  // If Brevo not configured, try Gmail only
  if (gmailTransporter) {
    try {
      console.log('📤 Sending via Gmail (Brevo not configured)...');
      const info = await gmailTransporter.sendMail({
        ...mailOptions,
        from: `CYBEV <${process.env.GMAIL_USER}>`
      });
      console.log('✅ Email sent via Gmail:', info.messageId);
      return { success: true, provider: 'Gmail', messageId: info.messageId };
    } catch (gmailError) {
      console.error('❌ Gmail failed:', gmailError.message);
      throw gmailError;
    }
  }

  throw new Error('No email provider configured');
};

// Get from address based on provider
const getFromAddress = (provider = 'Brevo') => {
  if (provider === 'Gmail') {
    return `CYBEV <${process.env.GMAIL_USER}>`;
  }
  // For Brevo, use the configured email
  return `CYBEV <${process.env.BREVO_USER || 'noreply@cybev.io'}>`;
};

// Send verification email
const sendVerificationEmail = async (email, verificationToken) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cybev.io';
    const verificationUrl = `${frontendUrl}/auth/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: getFromAddress('Brevo'), // Will be overridden if Gmail is used
      to: email,
      subject: 'Verify Your Email - CYBEV',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">Welcome to CYBEV!</h2>
          <p>Thanks for signing up! Please verify your email address to get started.</p>
          <a href="${verificationUrl}" 
             style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Verify Email
          </a>
          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br>
            <a href="${verificationUrl}">${verificationUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px;">
            This link will expire in 24 hours.
          </p>
        </div>
      `
    };

    console.log('📤 Sending verification email to:', email);
    const result = await sendEmailWithFallback(mailOptions);
    console.log(`✅ Verification email sent via ${result.provider}`);
    
    return result;
  } catch (error) {
    console.error('❌ Failed to send verification email:', error.message);
    throw error;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cybev.io';
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: getFromAddress('Brevo'),
      to: email,
      subject: 'Reset Your Password - CYBEV',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">Password Reset Request</h2>
          <p>You requested to reset your password. Click the button below to set a new password.</p>
          <a href="${resetUrl}" 
             style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px;">
            This link will expire in 1 hour. If you didn't request this, please ignore this email.
          </p>
        </div>
      `
    };

    console.log('📤 Sending reset email to:', email);
    const result = await sendEmailWithFallback(mailOptions);
    console.log(`✅ Reset email sent via ${result.provider}`);
    
    return { ...result, resetUrl };
  } catch (error) {
    console.error('❌ Failed to send reset email:', error.message);
    throw error;
  }
};

// Send security alert email
const sendSecurityAlert = async (email, ipAddress, location) => {
  try {
    const mailOptions = {
      from: getFromAddress('Brevo'),
      to: email,
      subject: 'New Login Alert - CYBEV',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">New Login Detected</h2>
          <p>We detected a new login to your CYBEV account.</p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>IP Address:</strong> ${ipAddress}</p>
            <p style="margin: 5px 0;"><strong>Location:</strong> ${location || 'Unknown'}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            If this wasn't you, please change your password immediately.
          </p>
        </div>
      `
    };

    console.log('📤 Sending security alert to:', email);
    const result = await sendEmailWithFallback(mailOptions);
    console.log(`✅ Security alert sent via ${result.provider}`);
    
    return result;
  } catch (error) {
    console.error('⚠️ Failed to send security alert:', error.message);
    // Don't throw - security alerts are not critical
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSecurityAlert
};
