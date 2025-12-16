const SibApiV3Sdk = require('@sendinblue/client');

/**
 * Send email using Brevo (Sendinblue) API
 * Uses HTTPS (port 443) instead of SMTP - works on Railway!
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    // Check if API key is configured
    if (!process.env.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY not configured in environment variables');
    }

    console.log('📤 Sending email via Brevo API (HTTPS)...');
    console.log('📧 To:', to);
    console.log('📋 Subject:', subject);

    // Initialize Brevo API client
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    
    // Set API key
    apiInstance.setApiKey(
      SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    // Create email object
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    
    // Set sender
    sendSmtpEmail.sender = {
      name: 'CYBEV',
      email: process.env.BREVO_SENDER_EMAIL || 'info@cybev.io'
    };
    
    // Set recipient
    sendSmtpEmail.to = [{ email: to }];
    
    // Set subject and content
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;

    // Send email via API
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Email sent successfully via Brevo API');
    console.log('📬 Message ID:', result.messageId);
    
    return {
      success: true,
      provider: 'Brevo-API',
      messageId: result.messageId
    };

  } catch (error) {
    console.error('❌ Brevo API error:', error.message);
    
    // Log more details if available
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response body:', error.response.body);
    }

    // In development, don't throw - just log
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 Email content (dev mode):');
      console.log('To:', to);
      console.log('Subject:', subject);
      console.log('HTML preview:', html.substring(0, 200) + '...');
      return {
        success: false,
        error: error.message,
        dev: true
      };
    }
    
    throw error;
  }
};

module.exports = sendEmail;
