// ============================================
// FILE: cron/domainRenewalReminders.js
// Domain Renewal Email Reminders - v6.4
// Sends alerts at 30, 7, 1 days before expiry
// ============================================

const mongoose = require('mongoose');

const getDomainModel = () => mongoose.models.Domain || require('../models/domain.model');
const getUserModel = () => mongoose.models.User || require('../models/user.model');

let emailService;
try { emailService = require('../utils/email.service'); } catch { emailService = require('../utils/sendEmail'); }

// Send reminder email
const sendReminderEmail = async (user, domain, daysRemaining, reminderType) => {
  const urgencyColor = daysRemaining <= 1 ? '#dc2626' : daysRemaining <= 7 ? '#f59e0b' : '#7c3aed';
  const subject = daysRemaining <= 0 
    ? `🚨 URGENT: ${domain.domain} has EXPIRED!`
    : daysRemaining <= 1 
      ? `⚠️ URGENT: ${domain.domain} expires TOMORROW!`
      : daysRemaining <= 7
        ? `⏰ ${domain.domain} expires in ${daysRemaining} days`
        : `📅 Reminder: ${domain.domain} expires in ${daysRemaining} days`;

  const expiryDate = new Date(domain.expiresAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const renewUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/settings/domains/${domain._id}/renew`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f3f4f6;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#7c3aed,#6366f1);padding:30px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:28px;">CYBEV</h1>
    <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;">Domain Renewal Reminder</p>
  </div>
  
  <div style="background:${daysRemaining <= 1 ? '#fef2f2' : daysRemaining <= 7 ? '#fffbeb' : '#f5f3ff'};border-left:4px solid ${urgencyColor};padding:20px;">
    <p style="color:${urgencyColor};font-weight:bold;margin:0;font-size:18px;">
      ${daysRemaining <= 0 ? '🚨 Your domain has expired!' : daysRemaining <= 1 ? '⚠️ Expires tomorrow!' : daysRemaining <= 7 ? '⏰ Expires soon!' : '📅 Renewal reminder'}
    </p>
  </div>
  
  <div style="background:white;padding:30px;border-radius:0 0 16px 16px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
    <p style="color:#374151;">Hi ${user.name || 'there'},</p>
    <p style="color:#374151;">Your domain <strong>${domain.domain}</strong> ${daysRemaining <= 0 ? 'has expired' : `expires on <strong>${expiryDate}</strong> (${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} from now)`}.</p>
    
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:25px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">Domain</td><td style="padding:8px 0;color:#111827;font-weight:600;text-align:right;">${domain.domain}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Expiry Date</td><td style="padding:8px 0;color:${urgencyColor};font-weight:600;text-align:right;">${expiryDate}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Days Remaining</td><td style="padding:8px 0;color:${urgencyColor};font-weight:600;text-align:right;">${daysRemaining <= 0 ? 'EXPIRED' : daysRemaining + ' days'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Renewal Price</td><td style="padding:8px 0;color:#111827;font-weight:600;text-align:right;">$${domain.pricing?.renewal || '14.99'}/year</td></tr>
        ${domain.autoRenew ? `<tr><td style="padding:8px 0;color:#6b7280;">Auto-Renew</td><td style="padding:8px 0;color:#10b981;font-weight:600;text-align:right;">✅ Enabled</td></tr>` : ''}
      </table>
    </div>
    
    ${!domain.autoRenew || daysRemaining <= 7 ? `
    <div style="text-align:center;margin:30px 0;">
      <a href="${renewUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6366f1);color:white;text-decoration:none;padding:16px 40px;border-radius:12px;font-weight:600;">Renew Now →</a>
    </div>
    ` : ''}
    
    ${domain.autoRenew 
      ? `<p style="color:#6b7280;font-size:14px;background:#f0fdf4;padding:15px;border-radius:8px;">✅ <strong>Auto-renewal enabled</strong>. We'll renew automatically if you have a payment method on file.</p>`
      : `<p style="color:#dc2626;font-size:14px;background:#fef2f2;padding:15px;border-radius:8px;">⚠️ <strong>Auto-renewal disabled</strong>. Please renew manually to keep your domain.</p>`
    }
    
    <p style="color:#374151;margin-top:25px;">If your domain expires:</p>
    <ul style="color:#6b7280;font-size:14px;">
      <li>Your website will be inaccessible</li>
      <li>Email on this domain will stop working</li>
      <li>You may lose the domain to someone else</li>
    </ul>
    
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
    <p style="color:#9ca3af;font-size:12px;text-align:center;">
      This reminder is from CYBEV for domain ${domain.domain}.<br>
      <a href="${process.env.FRONTEND_URL}/settings/notifications" style="color:#7c3aed;">Manage preferences</a>
    </p>
  </div>
</div>
</body>
</html>`;

  try {
    const sendFn = emailService.sendEmail || emailService;
    await sendFn({ to: user.email, subject, html });
    console.log(`✅ Sent ${reminderType} reminder for ${domain.domain} to ${user.email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send reminder for ${domain.domain}:`, error.message);
    return false;
  }
};

// Run renewal reminder check
const runRenewalReminders = async () => {
  console.log('🔄 Starting domain renewal reminder check...');
  
  try {
    const Domain = getDomainModel();
    const User = getUserModel();
    const now = new Date();

    const reminders = [
      { days: 30, field: 'thirtyDays' },
      { days: 7, field: 'sevenDays' },
      { days: 1, field: 'oneDayBefore' },
      { days: 0, field: 'expired' }
    ];

    let sent = 0;

    for (const reminder of reminders) {
      const threshold = new Date(now.getTime() + reminder.days * 24 * 60 * 60 * 1000);
      const lowerBound = new Date(now.getTime() + (reminder.days - 1) * 24 * 60 * 60 * 1000);

      const query = { status: 'active', [`remindersSent.${reminder.field}`]: false };

      if (reminder.days === 0) {
        query.expiresAt = { $lt: now };
      } else {
        query.expiresAt = { $lte: threshold, $gt: lowerBound };
      }

      const domains = await Domain.find(query);

      for (const domain of domains) {
        const user = await User.findById(domain.owner);
        if (!user?.email) continue;

        const daysRemaining = Math.ceil((new Date(domain.expiresAt) - now) / (1000 * 60 * 60 * 24));
        const success = await sendReminderEmail(user, domain, daysRemaining, reminder.field);

        if (success) {
          await domain.markReminderSent(reminder.field);
          sent++;
        }
      }
    }

    console.log(`✅ Renewal reminder check complete. Sent ${sent} emails.`);
    return sent;
  } catch (error) {
    console.error('❌ Renewal reminder error:', error);
    throw error;
  }
};

// Mark expired domains
const markExpiredDomains = async () => {
  try {
    const Domain = getDomainModel();
    const result = await Domain.updateMany(
      { status: 'active', expiresAt: { $lt: new Date() } },
      { $set: { status: 'expired' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`⚠️ Marked ${result.modifiedCount} domains as expired`);
    }
    return result.modifiedCount;
  } catch (error) {
    console.error('Mark expired error:', error);
    return 0;
  }
};

module.exports = { runRenewalReminders, markExpiredDomains, sendReminderEmail };

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('Connected to MongoDB');
    await markExpiredDomains();
    await runRenewalReminders();
    process.exit(0);
  }).catch(err => { console.error('MongoDB error:', err); process.exit(1); });
}
