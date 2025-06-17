
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function generateAuditPDF(htmlContent, outputPath) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true
  });

  await browser.close();
  return outputPath;
}

module.exports = generateAuditPDF;
