
const path = require('path');
const fs = require('fs');
const generateAnalyticsPDF = require('../scripts/generateAnalyticsPDF');
const generateInsightSummary = require('../utils/generateInsightSummary');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.REPORT_EMAIL_USER,
    pass: process.env.REPORT_EMAIL_PASS,
  },
});

exports.triggerWeeklyReport = async (req, res) => {
  try {
    const { start, end } = req.query;

    const data = {
      users: 134,
      posts: 347,
      views: 9214,
      earnings: 2260,
      topCity: 'Accra',
      topCityViews: 1944,
      topDevice: 'iPhone',
      topDeviceCount: 2710,
      topEarningSource: 'Boosts',
      topEarningAmount: 1080,
    };

    const insight = await generateInsightSummary(data);

    const htmlPDF = `
      <html><body>
        <h2>CYBEV Weekly Analytics (Manual)</h2>
        <p><strong>Period:</strong> ${start} to ${end}</p>
        <p style="margin: 20px 0; font-style: italic;">${insight}</p>
        <table border="1" cellspacing="0" cellpadding="8">
          <tr><th>Metric</th><th>Value</th></tr>
          <tr><td>New Users</td><td>${data.users}</td></tr>
          <tr><td>Posts</td><td>${data.posts}</td></tr>
          <tr><td>Views</td><td>${data.views}</td></tr>
          <tr><td>Earnings</td><td>$${data.earnings}</td></tr>
        </table>
      </body></html>
    `;

    const outputPath = path.join(__dirname, '../public/reports/manual-report.pdf');
    await generateAnalyticsPDF(htmlPDF, outputPath);

    await transporter.sendMail({
      from: process.env.REPORT_EMAIL_USER,
      to: process.env.REPORT_EMAIL_RECIPIENTS || 'admin@cybev.io',
      subject: '📈 CYBEV Manual Report Triggered',
      html: `<p>This is a manually triggered AI-powered analytics report for the period ${start} to ${end}.</p><p>${insight}</p>`,
      attachments: [
        {
          filename: 'CYBEV-Manual-Report.pdf',
          path: outputPath,
        },
      ],
    });

    res.status(200).json({ message: '✅ Manual report sent successfully', file: outputPath });
  } catch (err) {
    console.error('Manual Report Error:', err);
    res.status(500).json({ error: 'Failed to send manual report' });
  }
};
