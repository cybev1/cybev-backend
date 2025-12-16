module.exports = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email address first',
      requiresVerification: true,
      email: req.user.email
    });
  }
  next();
};
