const clientPromise = require('../../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

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

async function checkDailyLimit(userId, action) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLikes = await db.collection('earnings').countDocuments({
      userId: new ObjectId(userId),
      reason: action,
      timestamp: { $gte: today }
    });

    return todayLikes < 50; // Daily limit of 50 likes
  } catch (error) {
    console.error('Daily limit check failed:', error);
    return true; // Allow on error
  }
}

export default async function handler(req, res) {
  try {
    const { id } = req.query; // Post ID
    
    if (!id) {
      return res.status(400).json({ error: 'Post ID is required' });
    }

    // Extract user ID from token
    let userId = null;
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.userId;
      } catch (error) {
        console.log('Token verification failed');
      }
    }

    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'POST') {
      // Like a post
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required to like posts' });
      }

      // Check if post exists
      const post = await db.collection('posts').findOne({ _id: new ObjectId(id) });
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // Check if user already liked this post
      const existingLike = await db.collection('post_likes').findOne({
        postId: new ObjectId(id),
        userId: new ObjectId(userId)
      });

      if (existingLike) {
        return res.status(400).json({ 
          error: 'Already liked this post',
          liked: true
        });
      }

      // Check daily limit
      const canLike = await checkDailyLimit(userId, 'post_like');
      if (!canLike) {
        return res.status(429).json({ 
          error: 'Daily like limit reached (50 likes per day)',
          limit: 50
        });
      }

      // Add like record
      await db.collection('post_likes').insertOne({
        postId: new ObjectId(id),
        userId: new ObjectId(userId),
        createdAt: new Date()
      });

      // Update post like count
      const result = await db.collection('posts').updateOne(
        { _id: new ObjectId(id) },
        { $inc: { likes: 1 } }
      );

      // Award tokens for liking
      await awardTokens(userId, 1, 'post_like', {
        postId: new ObjectId(id),
        postAuthor: post.authorId
      });

      // Get updated like count
      const updatedPost = await db.collection('posts').findOne(
        { _id: new ObjectId(id) },
        { projection: { likes: 1 } }
      );

      res.json({
        success: true,
        liked: true,
        likes: updatedPost.likes || 1,
        tokensEarned: 1,
        message: 'Post liked successfully! +1 CYBV token earned'
      });

    } else if (req.method === 'DELETE') {
      // Unlike a post
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user liked this post
      const existingLike = await db.collection('post_likes').findOne({
        postId: new ObjectId(id),
        userId: new ObjectId(userId)
      });

      if (!existingLike) {
        return res.status(400).json({ 
          error: 'Post not liked yet',
          liked: false
        });
      }

      // Remove like record
      await db.collection('post_likes').deleteOne({
        postId: new ObjectId(id),
        userId: new ObjectId(userId)
      });

      // Update post like count
      await db.collection('posts').updateOne(
        { _id: new ObjectId(id) },
        { $inc: { likes: -1 } }
      );

      // Get updated like count
      const updatedPost = await db.collection('posts').findOne(
        { _id: new ObjectId(id) },
        { projection: { likes: 1 } }
      );

      res.json({
        success: true,
        liked: false,
        likes: Math.max(0, updatedPost.likes || 0),
        message: 'Post unliked successfully'
      });

    } else if (req.method === 'GET') {
      // Get like status and count
      let liked = false;
      
      if (userId) {
        const existingLike = await db.collection('post_likes').findOne({
          postId: new ObjectId(id),
          userId: new ObjectId(userId)
        });
        liked = !!existingLike;
      }

      // Get total likes for the post
      const post = await db.collection('posts').findOne(
        { _id: new ObjectId(id) },
        { projection: { likes: 1 } }
      );

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // Get recent likers (for UI display)
      const recentLikes = await db.collection('post_likes').aggregate([
        { $match: { postId: new ObjectId(id) } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            'user.username': 1,
            'user.name': 1,
            'user.avatar': 1,
            createdAt: 1
          }
        }
      ]).toArray();

      const recentLikers = recentLikes.map(like => ({
        username: like.user[0]?.username || like.user[0]?.name || 'Anonymous',
        avatar: like.user[0]?.avatar || '/default-avatar.png',
        timestamp: like.createdAt
      }));

      res.json({
        success: true,
        liked,
        likes: post.likes || 0,
        recentLikers
      });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Post like error:', error);
    res.status(500).json({ 
      error: 'Failed to process like action',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
