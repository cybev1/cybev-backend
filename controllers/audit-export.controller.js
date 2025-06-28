
const path = require('path');
const generateAuditPDF = require('../utils/generateAuditPDF');
const AuditLog = require('../models/audit-log.model');

exports.exportAuditLogsAsPDF = async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(100)
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
          <h2>CYBEV Admin Audit Report</h2>
          <p>Exported ${new Date().toLocaleString()}</p>
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

    const outputPath = path.join(__dirname, '../public/reports/audit-logs.pdf');
    await generateAuditPDF(html, outputPath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.pdf');
    res.sendFile(outputPath);
  } catch (err) {
    console.error('Audit PDF export error:', err);
    res.status(500).json({ error: 'Failed to generate audit report' });
  }
};
