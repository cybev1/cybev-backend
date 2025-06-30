import nodemailer from 'nodemailer';

export default async function sendVerificationEmail(email, token) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: email,
    subject: 'Verify your email - CYBEV',
    html: `<p>Click the link below to verify your email:</p>
           <a href="${process.env.NEXT_PUBLIC_BASE_URL}/verify?token=${token}">Verify Email</a>`,
  };

  await transporter.sendMail(mailOptions);
}