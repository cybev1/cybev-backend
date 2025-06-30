const nodemailer = require('nodemailer');

const sendVerificationEmail = async (to, token) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const verificationLink = `https://app.cybev.io/verify?token=${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_USERNAME,
    to,
    subject: 'Verify your CYBEV account',
    html: `<p>Click <a href="${verificationLink}">here</a> to verify your account.</p>`,
  });
};

module.exports = sendVerificationEmail;