
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const generateAnalyticsPDF = require('../scripts/generateAnalyticsPDF');
const generateInsightSummary = require('../utils/generateInsightSummary');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.REPORT_EMAIL_USER,
    pass: process.env.REPORT_EMAIL_PASS,
  },
});

function getDateRangeForLastWeek() {
  const today = new Date();
  const end = new Date(today.setDate(today.getDate() - 1));
  const start = new Date(today.setDate(today.getDate() - 6));
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

async function sendWeeklyReport() {
  const { start, end } = getDateRangeForLastWeek();

  // Dummy static analytics (replace with real Mongo fetches)
  const data = {
    users: 125,
    posts: 308,
    views: 8421,
    earnings: 1920,
    topCity: 'Lagos',
    topCityViews: 2150,
    topDevice: 'Android',
    topDeviceCount: 3491,
    topEarningSource: 'NFT Sales',
    topEarningAmount: 870,
  };

  const insight = await generateInsightSummary(data);

  const htmlEmail = `
    <html><body>
      <h1>CYBEV Weekly Report</h1>
      <p><strong>Period:</strong> ${start} to ${end}</p>
      <p>${insight}</p>
    </body></html>
  `;

  const htmlPDF = `
    <html><body>
      <h2>CYBEV Weekly Analytics</h2>
      <p>From ${start} to ${end}</p>
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

  const outputPath = path.join(__dirname, '../public/reports/weekly-report.pdf');
  await generateAnalyticsPDF(htmlPDF, outputPath);

  const mailOptions = {
    from: process.env.REPORT_EMAIL_USER,
    to: process.env.REPORT_EMAIL_RECIPIENTS || 'admin@cybev.io',
    subject: '📈 CYBEV Weekly Analytics Report',
    html: htmlEmail,
    attachments: [
      {
        filename: 'CYBEV-Weekly-Report.pdf',
        path: outputPath,
      },
    ],
  };

  await transporter.sendMail(mailOptions);
  console.log('✅ Weekly AI-powered report sent to admins!');
}

cron.schedule('0 9 * * 0', sendWeeklyReport); // every Sunday at 9am
