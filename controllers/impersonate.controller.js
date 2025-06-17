
const User = require('../models/user.model');

exports.impersonateUser = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const targetUser = await User.findOne({ email });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Store real admin info in session
    req.session.originalAdmin = req.user;
    req.session.user = {
      _id: targetUser._id,
      email: targetUser.email,
      role: targetUser.role,
    };

    res.status(200).json({ message: 'Now impersonating user', user: req.session.user });
  } catch (err) {
    console.error('Impersonation error:', err);
    res.status(500).json({ error: 'Failed to impersonate user' });
  }
};

exports.revertImpersonation = (req, res) => {
  if (!req.session.originalAdmin) {
    return res.status(400).json({ error: 'No impersonation session active' });
  }

  req.session.user = req.session.originalAdmin;
  delete req.session.originalAdmin;
  res.status(200).json({ message: 'Reverted to original admin session', user: req.session.user });
};
