// ============================================
// FILE: routes/upload.routes.js
// PURPOSE: File upload endpoints
// VERSION: 1.4.0 - FIXED: Video thumbnails now work
// FIXES:
//   - Returns thumbnailUrl (not thumbnail) for frontend compatibility
//   - Synchronous thumbnail generation (removed eager_async)
//   - Auto-generate thumbnail URL from Cloudinary video URL
// ============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');

// ==========================================
// CLOUDINARY CONFIGURATION
// ==========================================
if (process.env.CLOUDINARY_URL) {
  console.log('☁️ Cloudinary configured via CLOUDINARY_URL');
} else if (process.env.CLOUDINARY_API_KEY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('☁️ Cloudinary configured:', process.env.CLOUDINARY_CLOUD_NAME);
} else {
  console.log('⚠️ Cloudinary NOT configured - check env vars');
}

// Import auth middleware with robust fallback
let verifyToken;
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
    } catch (e3) {}
  }
}

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
  limits: { fileSize: 10 * 1024 * 1024 },
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
// Helper: Generate thumbnail URL from Cloudinary video URL
// ==========================================
const generateThumbnailUrl = (videoUrl, publicId) => {
  if (!videoUrl) return null;
  
  // If we have publicId, generate thumbnail URL directly
  if (publicId) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 
                      (process.env.CLOUDINARY_URL?.match(/@([^/]+)$/)?.[1]);
    if (cloudName) {
      // Generate thumbnail at 1 second mark
      return `https://res.cloudinary.com/${cloudName}/video/upload/so_1,w_400,h_400,c_fill/${publicId}.jpg`;
    }
  }
  
  // Fallback: Transform video URL to thumbnail URL
  // Cloudinary video URL format: https://res.cloudinary.com/{cloud}/video/upload/{version}/{path}.{ext}
  // Thumbnail URL format: https://res.cloudinary.com/{cloud}/video/upload/so_1,w_400,h_400,c_fill/{version}/{path}.jpg
  
  try {
    const url = new URL(videoUrl);
    const pathParts = url.pathname.split('/');
    
    // Find 'upload' index
    const uploadIndex = pathParts.indexOf('upload');
    if (uploadIndex === -1) return null;
    
    // Insert transformation after 'upload'
    pathParts.splice(uploadIndex + 1, 0, 'so_1,w_400,h_400,c_fill');
    
    // Change extension to jpg
    const lastPart = pathParts[pathParts.length - 1];
    pathParts[pathParts.length - 1] = lastPart.replace(/\.[^.]+$/, '.jpg');
    
    url.pathname = pathParts.join('/');
    return url.toString();
  } catch (e) {
    console.log('Could not generate thumbnail URL:', e.message);
    return null;
  }
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

    let resourceType = 'image';
    if (req.file.mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else if (req.file.mimetype === 'application/pdf') {
      resourceType = 'raw';
    }

    const options = {
      folder: `cybev/${folder}`,
      resource_type: resourceType,
      public_id: `${userId}-${Date.now()}`,
    };

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

    // Generate thumbnail URL for videos
    let thumbnailUrl = null;
    if (resourceType === 'video') {
      thumbnailUrl = generateThumbnailUrl(result.secure_url, result.public_id);
    }

    res.json({
      ok: true,
      success: true,
      url: result.secure_url,
      videoUrl: result.secure_url,
      thumbnailUrl: thumbnailUrl,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      size: result.bytes,
      duration: result.duration,
      resourceType: result.resource_type
    });
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Upload failed' });
  }
});

// ============================================
// UPLOAD IMAGE - POST /api/upload/image
// ============================================
router.post('/image', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const { folder = 'images', type = 'image' } = req.body;

    console.log(`📤 Image upload request from user ${userId}`);

    // Option 1: FormData with file
    if (req.file) {
      console.log(`📤 Processing FormData file: ${req.file.originalname}`);
      
      const options = {
        folder: `cybev/${folder}`,
        public_id: `${userId}-${Date.now()}`,
      };

      if (type === 'avatar' || type === 'profile') {
        options.transformation = [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }];
      } else if (type === 'cover') {
        options.transformation = [{ width: 1200, height: 400, crop: 'fill' }];
      }

      const result = await uploadToCloudinary(req.file.buffer, options);
      console.log(`✅ FormData upload successful: ${result.secure_url}`);

      return res.json({
        ok: true,
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height
      });
    }

    // Option 2: JSON body with base64 image
    const { image } = req.body;
    if (image) {
      console.log(`📤 Processing base64 image`);
      
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

      return res.json({
        ok: true,
        success: true,
        url: result.secure_url,
        publicId: result.public_id
      });
    }

    return res.status(400).json({ ok: false, success: false, error: 'No image provided' });

  } catch (err) {
    console.error('❌ Image upload error:', err);
    res.status(500).json({ ok: false, success: false, error: err.message || 'Upload failed' });
  }
});

// ==========================================
// UPLOAD AVATAR - POST /api/upload/avatar
// ==========================================
router.post('/avatar', verifyToken, upload.single('file'), async (req, res) => {
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
// FIXED: Fast upload with streaming for large files
// ==========================================
const videoUpload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
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
    
    // Check if it's a file upload or URL
    if (req.file) {
      const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
      console.log(`📤 Uploading video for user ${userId} (${fileSizeMB} MB)`);

      // Set longer timeout for large uploads
      req.setTimeout(300000); // 5 minutes
      res.setTimeout(300000);

      const options = {
        folder: 'cybev/videos',
        resource_type: 'video',
        public_id: `video-${userId}-${Date.now()}`,
        chunk_size: 6000000, // 6MB chunks for streaming
        timeout: 300000, // 5 minute timeout
      };

      let result;
      
      // For large files (> 50MB), use upload_large with chunking
      if (req.file.size > 50 * 1024 * 1024) {
        console.log(`📤 Large file detected, using chunked upload...`);
        result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { ...options, resource_type: 'video' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          
          // Write in chunks to avoid memory issues
          const chunkSize = 6 * 1024 * 1024; // 6MB chunks
          let offset = 0;
          
          const writeChunk = () => {
            const chunk = req.file.buffer.slice(offset, offset + chunkSize);
            if (chunk.length > 0) {
              stream.write(chunk);
              offset += chunkSize;
              setImmediate(writeChunk); // Non-blocking
            } else {
              stream.end();
            }
          };
          
          writeChunk();
        });
      } else {
        // For smaller files, use regular upload
        result = await uploadToCloudinary(req.file.buffer, options);
      }

      console.log(`✅ Video upload successful: ${result.secure_url}`);
      
      // Generate thumbnail URL directly (instant - no waiting)
      const thumbnailUrl = generateThumbnailUrl(result.secure_url, result.public_id);
      
      console.log(`📸 Generated thumbnail URL: ${thumbnailUrl}`);

      return res.json({
        ok: true,
        success: true,
        url: result.secure_url,
        videoUrl: result.secure_url,
        thumbnailUrl: thumbnailUrl,
        thumbnail: thumbnailUrl,
        publicId: result.public_id,
        duration: result.duration || 0,
        format: result.format,
        width: result.width,
        height: result.height,
        size: result.bytes
      });
    }
    
    // Video URL provided (external video)
    if (req.body.videoUrl) {
      console.log(`📤 Video URL provided: ${req.body.videoUrl}`);
      const thumbnailUrl = req.body.thumbnailUrl || generateThumbnailUrl(req.body.videoUrl, null);
      return res.json({
        ok: true,
        success: true,
        url: req.body.videoUrl,
        videoUrl: req.body.videoUrl,
        thumbnailUrl: thumbnailUrl,
        message: 'Video URL accepted'
      });
    }
    
    return res.status(400).json({ ok: false, error: 'No video provided' });
    
  } catch (err) {
    console.error('❌ Video upload error:', err.message);
    
    // Provide helpful error messages
    if (err.message?.includes('timeout')) {
      return res.status(408).json({ 
        ok: false, 
        success: false,
        error: 'Upload timed out. Please try a smaller video or check your connection.' 
      });
    }
    
    if (err.message?.includes('File too large')) {
      return res.status(413).json({ 
        ok: false, 
        success: false,
        error: 'Video too large. Maximum size is 500MB.' 
      });
    }
    
    res.status(500).json({ 
      ok: false, 
      success: false,
      error: err.message || 'Video upload failed' 
    });
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

console.log('📤 Upload routes v1.5.0 loaded - Fast video upload with chunking');

module.exports = router;
