// ============================================
// FILE: routes/upload.routes.js
// PURPOSE: File upload endpoints
// VERSION: 1.2.1 - Fixed auth middleware import
// ============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');

// Import auth middleware with robust fallback
let verifyToken;

// Try different import paths
try {
  const authModule = require('../middleware/auth');
  verifyToken = authModule.verifyToken || authModule.default || authModule;
} catch (e1) {
  try {
    const authModule = require('../middleware/auth.middleware');
    verifyToken = authModule.verifyToken || authModule.default || authModule;
  } catch (e2) {
    try {
      verifyToken = require('../middleware/verifyToken');
    } catch (e3) {
      // All imports failed
    }
  }
}

// If still not a function, use inline middleware
if (typeof verifyToken !== 'function') {
  console.log('📤 Upload routes: Using inline auth middleware');
  verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ ok: false, error: 'No token provided' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ ok: false, error: 'Invalid token' });
    }
  };
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
};

// ==========================================
// MAIN UPLOAD ENDPOINT - POST /api/upload
// ==========================================
router.post('/', verifyToken, upload.single('file'), async (req, res) => {
  try {
    console.log('📤 Upload request received');
    
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const { folder = 'uploads', type = 'image' } = req.body;

    console.log(`📤 Uploading file: ${req.file.originalname} (${req.file.size} bytes) for user ${userId}`);

    // Determine resource type
    let resourceType = 'image';
    if (req.file.mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else if (req.file.mimetype === 'application/pdf') {
      resourceType = 'raw';
    }

    // Upload options
    const options = {
      folder: `cybev/${folder}`,
      resource_type: resourceType,
      public_id: `${userId}-${Date.now()}`,
    };

    // Add transformations for images
    if (resourceType === 'image') {
      if (type === 'avatar' || type === 'profile') {
        options.transformation = [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }];
      } else if (type === 'cover') {
        options.transformation = [{ width: 1200, height: 400, crop: 'fill' }];
      } else if (type === 'thumbnail') {
        options.transformation = [{ width: 300, height: 300, crop: 'fill' }];
      }
    }

    const result = await uploadToCloudinary(req.file.buffer, options);

    console.log(`✅ Upload successful: ${result.secure_url}`);

    res.json({
      ok: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      size: result.bytes,
      resourceType: result.resource_type
    });
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Upload failed' });
  }
});

// ==========================================
// UPLOAD IMAGE (base64) - POST /api/upload/image
// ==========================================
router.post('/image', verifyToken, async (req, res) => {
  try {
    const { image, folder = 'images', type = 'image' } = req.body;
    const userId = req.user?.id || req.user?._id || req.user?.userId;

    if (!image) {
      return res.status(400).json({ ok: false, error: 'No image provided' });
    }

    console.log(`📤 Uploading base64 image for user ${userId}`);

    const options = {
      folder: `cybev/${folder}`,
      public_id: `${userId}-${Date.now()}`,
    };

    if (type === 'avatar' || type === 'profile') {
      options.transformation = [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }];
    } else if (type === 'cover') {
      options.transformation = [{ width: 1200, height: 400, crop: 'fill' }];
    }

    const result = await cloudinary.uploader.upload(image, options);

    console.log(`✅ Base64 upload successful: ${result.secure_url}`);

    res.json({
      ok: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (err) {
    console.error('❌ Base64 upload error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Upload failed' });
  }
});

// ==========================================
// UPLOAD AVATAR - POST /api/upload/avatar
// ==========================================
router.post('/avatar', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    
    let imageData;
    
    // Check if it's a file upload or base64
    if (req.file) {
      imageData = req.file.buffer;
    } else if (req.body.image) {
      imageData = req.body.image;
    } else {
      return res.status(400).json({ ok: false, error: 'No image provided' });
    }

    console.log(`📤 Uploading avatar for user ${userId}`);

    const options = {
      folder: 'cybev/avatars',
      public_id: `avatar-${userId}`,
      overwrite: true,
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
    };

    let result;
    if (Buffer.isBuffer(imageData)) {
      result = await uploadToCloudinary(imageData, options);
    } else {
      result = await cloudinary.uploader.upload(imageData, options);
    }

    console.log(`✅ Avatar upload successful: ${result.secure_url}`);

    // Update user's profile picture in database
    try {
      const User = require('../models/user.model');
      await User.findByIdAndUpdate(userId, { 
        profilePicture: result.secure_url,
        avatar: result.secure_url 
      });
      console.log(`✅ User profile picture updated`);
    } catch (dbErr) {
      console.log('⚠️ Could not update user profile:', dbErr.message);
    }

    res.json({
      ok: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (err) {
    console.error('❌ Avatar upload error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Avatar upload failed' });
  }
});

// ==========================================
// UPLOAD COVER - POST /api/upload/cover
// ==========================================
router.post('/cover', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    
    let imageData;
    
    if (req.file) {
      imageData = req.file.buffer;
    } else if (req.body.image) {
      imageData = req.body.image;
    } else {
      return res.status(400).json({ ok: false, error: 'No image provided' });
    }

    console.log(`📤 Uploading cover for user ${userId}`);

    const options = {
      folder: 'cybev/covers',
      public_id: `cover-${userId}`,
      overwrite: true,
      transformation: [{ width: 1500, height: 500, crop: 'fill' }]
    };

    let result;
    if (Buffer.isBuffer(imageData)) {
      result = await uploadToCloudinary(imageData, options);
    } else {
      result = await cloudinary.uploader.upload(imageData, options);
    }

    console.log(`✅ Cover upload successful: ${result.secure_url}`);

    // Update user's cover image in database
    try {
      const User = require('../models/user.model');
      await User.findByIdAndUpdate(userId, { coverImage: result.secure_url });
      console.log(`✅ User cover image updated`);
    } catch (dbErr) {
      console.log('⚠️ Could not update user cover:', dbErr.message);
    }

    res.json({
      ok: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (err) {
    console.error('❌ Cover upload error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Cover upload failed' });
  }
});

// ==========================================
// UPLOAD VIDEO - POST /api/upload/video
// ==========================================
const videoUpload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for videos
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files allowed'), false);
    }
  }
});

router.post('/video', verifyToken, videoUpload.single('file'), async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    
    let videoData;
    
    // Check if it's a file upload or URL
    if (req.file) {
      videoData = req.file.buffer;
    } else if (req.body.videoUrl) {
      // Video URL provided
      console.log(`📤 Video URL provided: ${req.body.videoUrl}`);
      return res.json({
        ok: true,
        url: req.body.videoUrl,
        message: 'Video URL accepted'
      });
    } else {
      return res.status(400).json({ ok: false, error: 'No video provided' });
    }

    console.log(`📤 Uploading video for user ${userId} (${req.file?.size} bytes)`);

    const options = {
      folder: 'cybev/videos',
      resource_type: 'video',
      public_id: `video-${userId}-${Date.now()}`,
      chunk_size: 6000000, // 6MB chunks
    };

    // Add thumbnail generation
    options.eager = [
      { width: 300, height: 300, crop: 'fill', format: 'jpg' },
      { width: 640, height: 360, crop: 'fill', format: 'jpg' }
    ];
    options.eager_async = true;

    const result = await uploadToCloudinary(videoData, options);

    console.log(`✅ Video upload successful: ${result.secure_url}`);

    res.json({
      ok: true,
      url: result.secure_url,
      publicId: result.public_id,
      duration: result.duration,
      format: result.format,
      width: result.width,
      height: result.height,
      size: result.bytes,
      thumbnail: result.eager?.[0]?.secure_url || null
    });
  } catch (err) {
    console.error('❌ Video upload error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Video upload failed' });
  }
});

// ==========================================
// DELETE FILE - DELETE /api/upload/:publicId
// ==========================================
router.delete('/:publicId', verifyToken, async (req, res) => {
  try {
    const { publicId } = req.params;
    
    console.log(`🗑️ Deleting file: ${publicId}`);
    
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      console.log(`✅ File deleted: ${publicId}`);
      res.json({ ok: true, message: 'File deleted' });
    } else {
      res.status(404).json({ ok: false, error: 'File not found' });
    }
  } catch (err) {
    console.error('❌ Delete error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('📤 Upload routes v1.2.1 loaded');

module.exports = router;
