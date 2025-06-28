
const User = require('../models/user.model');

exports.promoteUserRole = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required.' });
    }

    if (!['user', 'moderator', 'admin', 'super-admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role value.' });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { role },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.status(200).json({ message: 'User promoted successfully.', user });
  } catch (err) {
    console.error('Promotion error:', err);
    res.status(500).json({ error: 'Failed to promote user.' });
  }
};
