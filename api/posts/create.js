const clientPromise = require('../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

export const config = {
  api: {
    bodyParser: false,
  },
};

async function uploadFile(file) {
  try {
    // In a real application, you would upload to a cloud storage service
    // For now, we'll simulate file upload
    const fileName = `${Date.now()}-${file.originalFilename}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, fileName);
    
    // Copy file to upload directory
    const rawData = fs.readFileSync(file.filepath);
    fs.writeFileSync(filePath, rawData);
    
    return `/uploads/${fileName}`;
  } catch (error) {
    console.error('File upload error:', error);
    return null;
  }
}

async function awardTokens(userId, amount, reason, metadata = {}) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    await db.collection('earnings').insertOne({
      userId: new ObjectId(userId),
      amount: parseFloat(amount),
      reason,
      metadata,
      timestamp: new Date(),
      status: 'completed'
    });

    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { tokenBalance: parseFloat(amount) } },
      { upsert: true }
    );

    return true;
  } catch (error) {
    console.error('Token award failed:', error);
    return false;
  }
}

async function moderateContent(content) {
  // Simple content moderation - in production, use AI moderation services
  const bannedWords = ['spam', 'scam', 'hack', 'illegal'];
  const lowercaseContent = content.toLowerCase();
  
  for (const word of bannedWords) {
    if (lowercaseContent.includes(word)) {
      return {
        approved: false,
        reason: `Content contains prohibited word: ${word}`
      };
    }
  }
  
  return { approved: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    let userId = null;
    let username = 'anonymous';
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.userId;
        username = decoded.username || decoded.name || 'user';
      } catch (error) {
        console.log('Token verification failed');
      }
    }

    // Parse form data
    const form = new formidable.IncomingForm({
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(400).json({ error: 'Form parsing failed' });
      }

      const content = Array.isArray(fields.content) ? fields.content[0] : fields.content;
      const hashtags = Array.isArray(fields.hashtags) ? fields.hashtags[0] : fields.hashtags;
      const isScheduled = Array.isArray(fields.scheduled) ? fields.scheduled[0] === 'true' : fields.scheduled === 'true';
      const scheduledTime = Array.isArray(fields.scheduledTime) ? fields.scheduledTime[0] : fields.scheduledTime;

      // Validation
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Post content is required' });
      }

      if (content.length > 500) {
        return res.status(400).json({ error: 'Post content must be under 500 characters' });
      }

      // Content moderation
      const moderation = await moderateContent(content);
      if (!moderation.approved) {
        return res.status(400).json({ 
          error: 'Content not approved',
          reason: moderation.reason
        });
      }

      // Handle media upload
      let mediaUrl = null;
      if (files.media) {
        const file = Array.isArray(files.media) ? files.media[0] : files.media;
        mediaUrl = await uploadFile(file);
      }

      // Extract hashtags
      const extractedHashtags = content.match(/#\w+/g) || [];
      const additionalHashtags = hashtags ? hashtags.split(',').map(tag => tag.trim()) : [];
      const allHashtags = [...extractedHashtags, ...additionalHashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`)];

      const client = await clientPromise;
      const db = client.db();

      // Create post object
      const post = {
        authorId: userId ? new ObjectId(userId) : null,
        content: content.trim(),
        media: mediaUrl,
        hashtags: allHashtags,
        likes: 0,
        comments: [],
        shares: 0,
        views: 0,
        boosted: false,
        boostCount: 0,
        status: isScheduled ? 'scheduled' : 'published',
        scheduledTime: isScheduled && scheduledTime ? new Date(scheduledTime) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        }
      };

      // Insert post
      const result = await db.collection('posts').insertOne(post);

      // Award tokens for post creation
      if (userId) {
        await awardTokens(userId, 5, 'post_create', {
          postId: result.insertedId,
          contentLength: content.length,
          hasMedia: !!mediaUrl,
          hashtagCount: allHashtags.length
        });

        // Log user activity
        await db.collection('user_activities').insertOne({
          userId: new ObjectId(userId),
          action: 'post_created',
          details: {
            postId: result.insertedId,
            contentLength: content.length,
            hasMedia: !!mediaUrl
          },
          timestamp: new Date()
        });
      }

      // Response
      res.status(201).json({
        success: true,
        postId: result.insertedId,
        message: isScheduled ? 'Post scheduled successfully' : 'Post created successfully',
        tokensEarned: userId ? 5 : 0,
        post: {
          id: result.insertedId,
          content,
          media: mediaUrl,
          hashtags: allHashtags,
          status: post.status,
          scheduledTime: post.scheduledTime,
          createdAt: post.createdAt
        }
      });
    });

  } catch (error) {
    console.error('Post creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create post',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
