// ============================================
// FILE: routes/user.routes.js
// PATH: cybev-backend/routes/user.routes.js
// PURPOSE: User profile and account management
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Get User model (create if not exists)
let User;
try {
  User = mongoose.model('User');
} catch {
  const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: String,
    bio: String,
    website: String,
    location: String,
    isVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    tokenBalance: { type: Number, default: 0 },
    walletAddress: String,
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    subscriptionPrices: {
      basic: { type: Number, default: 5 },
      premium: { type: Number, default: 15 },
      vip: { type: Number, default: 50 }
    },
    lastActive: Date,
    role: { type: String, default: 'user' }
  }, { timestamps: true });

  User = mongoose.model('User', userSchema);
}

// GET /api/users/me - Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    res.json({ ok: true, user });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get user' });
  }
});

// GET /api/users/:username - Get user by username
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('-password -email');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, user });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get user' });
  }
});

// PUT /api/users/me - Update current user
router.put('/me', verifyToken, async (req, res) => {
  try {
    const { name, bio, website, location, avatar } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, bio, website, location, avatar },
      { new: true }
    ).select('-password');

    res.json({ ok: true, user });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update user' });
  }
});

// PUT /api/users/me/password - Change password
router.put('/me/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const bcrypt = require('bcryptjs');
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ ok: false, error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ ok: true, message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update password' });
  }
});

// GET /api/users/:userId/followers - Get user followers
router.get('/:userId/followers', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate('followers', 'name username avatar');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, followers: user.followers });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get followers' });
  }
});

// GET /api/users/:userId/following - Get who user follows
router.get('/:userId/following', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate('following', 'name username avatar');
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, following: user.following });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get following' });
  }
});

module.exports = router;
