// ============================================
// FILE: routes/user.routes.additions.js
// Additional User Routes for Profile Features
// ADD THESE TO YOUR EXISTING user.routes.js
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'), false);
    }
  }
});

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// GET /api/users/username/:username - Get user by username
router.get('/username/:username', async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    const { username } = req.params;

    const user = await User.findOne({ username })
      .select('-password -__v')
      .lean();

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get follow counts
    const Follow = mongoose.models.Follow;
    if (Follow) {
      const [followersCount, followingCount] = await Promise.all([
        Follow.countDocuments({ following: user._id, status: 'active' }),
        Follow.countDocuments({ follower: user._id, status: 'active' })
      ]);
      user.followersCount = followersCount;
      user.followingCount = followingCount;
    }

    res.json({ ok: true, user });
  } catch (error) {
    console.error('Get user by username error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/users/upload-cover - Upload cover image
router.post('/upload-cover', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No image provided' });
    }

    const User = mongoose.models.User || require('../models/user.model');

    // Upload to Cloudinary
    let coverUrl;
    
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'cybev/covers',
            transformation: [
              { width: 1500, height: 500, crop: 'fill', gravity: 'center' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      coverUrl = result.secure_url;
    } else {
      // Fallback: Store as base64 (not recommended for production)
      coverUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { coverImage: coverUrl },
      { new: true }
    ).select('-password');

    res.json({ 
      ok: true, 
      coverImage: coverUrl,
      user 
    });
  } catch (error) {
    console.error('Upload cover error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/users/upload-avatar - Upload avatar image
router.post('/upload-avatar', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No image provided' });
    }

    const User = mongoose.models.User || require('../models/user.model');

    let avatarUrl;
    
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'cybev/avatars',
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      avatarUrl = result.secure_url;
    } else {
      avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: avatarUrl },
      { new: true }
    ).select('-password');

    res.json({ 
      ok: true, 
      avatar: avatarUrl,
      user 
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/users/profile - Update profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const User = mongoose.models.User || require('../models/user.model');
    
    const allowedFields = ['name', 'bio', 'location', 'website', 'avatar', 'coverImage'];
    const updates = {};
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true }
    ).select('-password');

    res.json({ ok: true, user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;

/* ============================================
 * IMPORTANT: Add these to your User model schema:
 * 
 * coverImage: { type: String, default: '' },
 * followersCount: { type: Number, default: 0 },
 * followingCount: { type: Number, default: 0 },
 * 
 * ============================================ */
