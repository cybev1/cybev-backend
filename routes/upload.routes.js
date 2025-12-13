const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const verifyToken = require('../middleware/verifyToken');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max per file
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// ========== UPLOAD SINGLE IMAGE ==========
router.post('/image', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    console.log(`📸 Uploading image: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)}KB)`);

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'cybev-posts',
          resource_type: 'auto',
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' }, // Max dimensions
            { quality: 'auto' }, // Auto quality
            { fetch_format: 'auto' } // Auto format (WebP if supported)
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(req.file.buffer);
    });

    console.log(`✅ Image uploaded: ${result.secure_url}`);

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height
    });

  } catch (error) {
    console.error('❌ Image upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload image'
    });
  }
});

// ========== UPLOAD MULTIPLE IMAGES ==========
router.post('/images', verifyToken, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files provided'
      });
    }

    console.log(`📸 Uploading ${req.files.length} images`);

    // Upload all images to Cloudinary in parallel
    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'cybev-posts',
            resource_type: 'auto',
            transformation: [
              { width: 1200, height: 1200, crop: 'limit' },
              { quality: 'auto' },
              { fetch_format: 'auto' }
            ]
          },
          (error, result) => {
            if (error) {
              console.error(`❌ Failed to upload ${file.originalname}:`, error);
              reject(error);
            } else {
              console.log(`✅ Uploaded: ${file.originalname}`);
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
                alt: file.originalname.replace(/\.[^/.]+$/, ''), // Remove extension
                width: result.width,
                height: result.height
              });
            }
          }
        );

        uploadStream.end(file.buffer);
      });
    });

    const uploadedImages = await Promise.all(uploadPromises);

    console.log(`✅ Successfully uploaded ${uploadedImages.length} images`);

    res.json({
      success: true,
      images: uploadedImages,
      count: uploadedImages.length
    });

  } catch (error) {
    console.error('❌ Batch upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload images'
    });
  }
});

// ========== DELETE IMAGE ==========
router.delete('/image/:publicId', verifyToken, async (req, res) => {
  try {
    const publicId = req.params.publicId;

    console.log(`🗑️ Deleting image: ${publicId}`);

    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result === 'ok') {
      console.log(`✅ Image deleted: ${publicId}`);
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } else {
      throw new Error('Failed to delete image from Cloudinary');
    }

  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete image'
    });
  }
});

module.exports = router;
