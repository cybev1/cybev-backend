
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const generateAnalyticsPDF = async (textContent, outputPath) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();

  const lines = textContent.split('\n');
  let y = height - 50;

  for (const line of lines) {
    page.drawText(line, {
      x: 50,
      y,
      size: 12,
      font,
      color: rgb(0, 0, 0)
    });
    y -= 20;
    if (y < 40) break;
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
};

module.exports = generateAnalyticsPDF;
