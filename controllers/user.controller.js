const User = require('../models/User');

const getUserInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { name, referral } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, referral },
      { new: true }
    ).select('-password');
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getUserInfo, updateUserProfile };