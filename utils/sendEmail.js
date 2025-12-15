const nodemailer = require('nodemailer');

/**
 * Send email with dual provider support (Brevo primary, Gmail fallback)
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    // Try Brevo first
    if (process.env.BREVO_USER && process.env.BREVO_PASSWORD) {
      try {
        console.log('📤 Attempting to send via Brevo SMTP...');
        
        const brevoTransporter = nodemailer.createTransport({
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.BREVO_USER,
            pass: process.env.BREVO_PASSWORD
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000
        });

        const info = await brevoTransporter.sendMail({
          from: `CYBEV <${process.env.BREVO_USER}>`,
          to,
          subject,
          html
        });

        console.log('✅ Email sent via Brevo:', info.messageId);
        return { success: true, provider: 'Brevo', messageId: info.messageId };
        
      } catch (brevoError) {
        console.warn('⚠️ Brevo SMTP failed:', brevoError.message);
        
        // Try Gmail fallback
        if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
          console.log('📤 Falling back to Gmail SMTP...');
          
          try {
            const gmailTransporter = nodemailer.createTransport({
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
            });

            const info = await gmailTransporter.sendMail({
              from: `CYBEV <${process.env.GMAIL_USER}>`,
              to,
              subject,
              html
            });

            console.log('✅ Email sent via Gmail (fallback):', info.messageId);
            return { success: true, provider: 'Gmail', messageId: info.messageId };
            
          } catch (gmailError) {
            console.error('❌ Gmail SMTP also failed:', gmailError.message);
            throw new Error(`Both email providers failed. Brevo: ${brevoError.message}, Gmail: ${gmailError.message}`);
          }
        } else {
          // No Gmail fallback configured
          throw brevoError;
        }
      }
    }

    // If Brevo not configured, try Gmail only
    if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
      console.log('📤 Sending via Gmail (Brevo not configured)...');
      
      const gmailTransporter = nodemailer.createTransport({
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
      });

      const info = await gmailTransporter.sendMail({
        from: `CYBEV <${process.env.GMAIL_USER}>`,
        to,
        subject,
        html
      });

      console.log('✅ Email sent via Gmail:', info.messageId);
      return { success: true, provider: 'Gmail', messageId: info.messageId };
    }

    // No email provider configured - development mode
    console.log('📧 No email provider configured. Email content:');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('HTML:', html.substring(0, 200) + '...');
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('No email provider configured');
    }
    
    return { success: true, dev: true };

  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    
    // In development, don't throw
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
