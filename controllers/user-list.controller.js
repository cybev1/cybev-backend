
const User = require('../models/user.model');

exports.listAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select('email username role createdAt');
    res.status(200).json({ users });
  } catch (err) {
    console.error('User list error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
};
