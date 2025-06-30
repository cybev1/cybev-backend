const nodemailer = require('nodemailer');

const sendVerificationEmail = async (email, token) => {
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: email,
    subject: 'Verify Your Email',
    html: `<p>Click <a href="${process.env.BASE_URL}/verify-email?token=${token}">here</a> to verify your email.</p>`
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendVerificationEmail;
