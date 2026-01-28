
module.exports = function checkRole(requiredRole) {
  return (req, res, next) => {
    const user = req.user; // assume populated from auth middleware
    if (!user || !user.role || user.role !== requiredRole) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
};
