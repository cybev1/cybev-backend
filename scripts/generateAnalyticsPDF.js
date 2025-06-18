
const fs = require('fs');
const path = require('path');
const pdf = require('html-pdf');

const generateAnalyticsPDF = (htmlContent, outputPath) => {
  const options = { format: 'A4', border: '10mm' };

  return new Promise((resolve, reject) => {
    pdf.create(htmlContent, options).toFile(outputPath, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

module.exports = generateAnalyticsPDF;
