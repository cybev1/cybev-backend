// ONLY SHOWING THE CHANGES - Replace lines 97, 238, and 454 in your auth.controller.js

// Line 97 - VERIFICATION URL (in register function)
// ❌ OLD:
// const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/verify-email?token=${verificationToken}`;

// ✅ NEW:
const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/verify-email?token=${verificationToken}`;


// Line 238 - VERIFICATION URL (in resendVerification function)  
// ❌ OLD:
// const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/verify-email?token=${verificationToken}`;

// ✅ NEW:
const verificationUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/verify-email?token=${verificationToken}`;


// Line 454 - RESET PASSWORD URL (in forgotPassword function)
// ❌ OLD:
// const resetUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/reset-password?token=${resetToken}`;

// ✅ NEW:
const resetUrl = `${process.env.FRONTEND_URL || 'https://cybev.io'}/auth/reset-password?token=${resetToken}`;
