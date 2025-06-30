import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export async function sendVerificationEmail(to, token) {
  const verificationLink = `${process.env.NEXT_PUBLIC_BASE_URL}/verify?token=${token}`;

  const mailOptions = {
    from: `"CYBEV Support" <${process.env.EMAIL_USERNAME}>`,
    to,
    subject: 'Verify Your Email',
    html: `<p>Please verify your email by clicking <a href="${verificationLink}">here</a>.</p>`,
  };

  return transporter.sendMail(mailOptions);
}