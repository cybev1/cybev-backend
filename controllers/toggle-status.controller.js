
const User = require('../models/user.model');

exports.toggleUserStatus = async (req, res) => {
  try {
    const { email, isActive } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await User.findOneAndUpdate({ email }, { isActive }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.status(200).json({ message: 'User status updated.', user });
  } catch (err) {
    console.error('Status toggle error:', err);
    res.status(500).json({ error: 'Failed to update user status.' });
  }
};
