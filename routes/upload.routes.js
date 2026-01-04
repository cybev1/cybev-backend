// ============================================
// FILE: routes/upload.routes.js
// File Upload API - Images, Videos, Documents
// ============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Auth middleware
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try { verifyToken = require('../middleware/auth.middleware'); } catch (e2) {
    try { verifyToken = require('../middleware/auth'); } catch (e3) {
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
          const jwt = require('jsonwebtoken');
          req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          next();
        } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}

// Configure multer for memory storage (for cloud upload)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
      'application/pdf'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Cloudinary setup (if available)
let cloudinary;
try {
  cloudinary = require('cloudinary').v2;
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('☁️ Cloudinary configured');
  }
} catch (e) {
  console.log('⚠️ Cloudinary not available');
}

// ==========================================
// Helper: Upload to Cloudinary
// ==========================================
async function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: options.resource_type || 'auto',
        folder: options.folder || 'cybev',
        ...options
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

// ==========================================
// POST /api/upload/image - Upload image
// ==========================================
router.post('/image', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    console.log(`📷 Image upload: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)}KB)`);

    let url;
    
    if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME) {
      // Upload to Cloudinary
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'cybev/images',
        resource_type: 'image'
      });
      url = result.secure_url;
    } else {
      // Fallback: Return base64 data URL (not recommended for production)
      const base64 = req.file.buffer.toString('base64');
      url = `data:${req.file.mimetype};base64,${base64}`;
    }

    res.json({
      success: true,
      url,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
  }
});

// ==========================================
// POST /api/upload/video - Upload video
// ==========================================
router.post('/video', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    console.log(`🎬 Video upload: ${req.file.originalname} (${(req.file.size / (1024 * 1024)).toFixed(1)}MB)`);

    let url, thumbnailUrl;
    
    if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME) {
      // Upload to Cloudinary
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'cybev/videos',
        resource_type: 'video',
        eager: [{ format: 'jpg', transformation: [{ width: 400, height: 400, crop: 'fill' }] }]
      });
      
      url = result.secure_url;
      thumbnailUrl = result.eager?.[0]?.secure_url || result.secure_url.replace(/\.[^.]+$/, '.jpg');
      
      console.log(`✅ Video uploaded: ${url}`);
    } else {
      // No cloud storage - return error with helpful message
      return res.status(503).json({
        success: false,
        error: 'Video storage not configured. Please set up Cloudinary.',
        hint: 'Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to environment'
      });
    }

    res.json({
      success: true,
      url,
      videoUrl: url,
      thumbnailUrl,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

  } catch (error) {
    console.error('Video upload error:', error);
    res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
  }
});

// ==========================================
// POST /api/upload/profile - Upload profile picture
// ==========================================
router.post('/profile', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    console.log(`👤 Profile upload for user: ${req.user.id}`);

    let url;
    
    if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'cybev/profiles',
        resource_type: 'image',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
      });
      url = result.secure_url;
      console.log(`☁️ Profile uploaded to Cloudinary: ${url}`);
    } else {
      const base64 = req.file.buffer.toString('base64');
      url = `data:${req.file.mimetype};base64,${base64}`;
    }

    // Update user's profile picture in database
    let updatedUser = null;
    try {
      let User;
      try { User = require('../models/user.model'); } catch (e) { User = mongoose.model('User'); }
      
      updatedUser = await User.findByIdAndUpdate(
        req.user.id, 
        { 
          $set: { 
            profilePicture: url,
            avatar: url  // Also update avatar field for compatibility
          }
        },
        { new: true }
      ).select('-password -refreshToken');
      
      if (updatedUser) {
        console.log(`✅ Profile picture saved to database for user ${req.user.id}`);
      } else {
        console.log(`⚠️ User not found: ${req.user.id}`);
      }
    } catch (e) {
      console.error('Could not update user profile in DB:', e.message);
    }

    res.json({
      success: true,
      url,
      user: updatedUser,
      message: 'Profile picture uploaded successfully'
    });

  } catch (error) {
    console.error('Profile upload error:', error);
    res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
  }
});

// ==========================================
// POST /api/upload/cover - Upload cover image
// ==========================================
router.post('/cover', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    console.log(`🖼️ Cover upload for user: ${req.user.id}`);

    let url;
    
    if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'cybev/covers',
        resource_type: 'image',
        transformation: [{ width: 1200, height: 400, crop: 'fill' }]
      });
      url = result.secure_url;
      console.log(`☁️ Cover uploaded to Cloudinary: ${url}`);
    } else {
      const base64 = req.file.buffer.toString('base64');
      url = `data:${req.file.mimetype};base64,${base64}`;
    }

    // Update user's cover image in database
    let updatedUser = null;
    try {
      let User;
      try { User = require('../models/user.model'); } catch (e) { User = mongoose.model('User'); }
      
      updatedUser = await User.findByIdAndUpdate(
        req.user.id, 
        { $set: { coverImage: url } },
        { new: true }
      ).select('-password -refreshToken');
      
      if (updatedUser) {
        console.log(`✅ Cover image saved to database for user ${req.user.id}`);
      }
    } catch (e) {
      console.error('Could not update user cover in DB:', e.message);
    }

    res.json({
      success: true,
      url,
      user: updatedUser,
      message: 'Cover image uploaded successfully'
    });

  } catch (error) {
    console.error('Cover upload error:', error);
    res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
  }
});

// ==========================================
// POST /api/upload/document - Upload document
// ==========================================
router.post('/document', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    console.log(`📄 Document upload: ${req.file.originalname}`);

    let url;
    
    if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'cybev/documents',
        resource_type: 'raw'
      });
      url = result.secure_url;
    } else {
      return res.status(503).json({
        success: false,
        error: 'Document storage not configured'
      });
    }

    res.json({
      success: true,
      url,
      filename: req.file.originalname,
      size: req.file.size
    });

  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
  }
});

// ==========================================
// POST /api/upload/multiple - Upload multiple files
// ==========================================
router.post('/multiple', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    console.log(`📦 Multiple upload: ${req.files.length} files`);

    const results = [];
    
    for (const file of req.files) {
      let url;
      
      if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME) {
        const resourceType = file.mimetype.startsWith('video/') ? 'video' : 
                           file.mimetype.startsWith('image/') ? 'image' : 'raw';
        const result = await uploadToCloudinary(file.buffer, {
          folder: 'cybev/uploads',
          resource_type: resourceType
        });
        url = result.secure_url;
      } else {
        const base64 = file.buffer.toString('base64');
        url = `data:${file.mimetype};base64,${base64}`;
      }
      
      results.push({
        url,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      });
    }

    res.json({
      success: true,
      files: results,
      count: results.length
    });

  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
  }
});

// Error handler for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File too large. Max size is 100MB.' });
    }
  }
  next(error);
});

console.log('✅ Upload routes loaded');

module.exports = router;
