
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const AuditLog = require('../models/audit-log.model');
const generateAuditPDF = require('../utils/generateAuditPDF');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.REPORT_EMAIL_USER,
    pass: process.env.REPORT_EMAIL_PASS,
  },
});

async function sendDailyAuditReport() {
  try {
    const logs = await AuditLog.find({
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
      .sort({ timestamp: -1 })
      .populate('performedBy', 'email')
      .populate('target', 'email');

    const html = `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 6px; font-size: 12px; }
            th { background: #f4f4f4; }
          </style>
        </head>
        <body>
          <h2>CYBEV Daily Audit Digest</h2>
          <p>Generated ${new Date().toLocaleString()}</p>
          <table>
            <tr><th>Action</th><th>By</th><th>Target</th><th>Details</th><th>Date</th></tr>
            ${logs.map(log => `
              <tr>
                <td>${log.action}</td>
                <td>${log.performedBy?.email || '-'}</td>
                <td>${log.target?.email || '-'}</td>
                <td>${JSON.stringify(log.metadata)}</td>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
              </tr>
            `).join('')}
          </table>
        </body>
      </html>
    `;

    const outputPath = path.join(__dirname, '../public/reports/daily-audit.pdf');
    await generateAuditPDF(html, outputPath);

    const mailOptions = {
      from: process.env.REPORT_EMAIL_USER,
      to: process.env.REPORT_EMAIL_RECIPIENTS,
      subject: '🧾 CYBEV Daily Audit Report',
      html: '<p>Attached is the PDF digest of admin actions in the last 24 hours.</p>',
      attachments: [
        {
          filename: 'CYBEV-Daily-Audit.pdf',
          path: outputPath,
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Daily audit report emailed to Super Admins!');
  } catch (err) {
    console.error('Audit Digest Error:', err);
  }
}

cron.schedule('0 8 * * *', sendDailyAuditReport); // Every day at 8 AM
