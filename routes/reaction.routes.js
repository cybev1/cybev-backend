// ============================================
// FILE: routes/reaction.routes.js
// PATH: cybev-backend/routes/reaction.routes.js
// PURPOSE: Handle all engagement features (likes, reactions, views)
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Available reaction types
const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry', 'fire', 'clap', 'think'];

// ==========================================
// POST REACTIONS
// ==========================================

// POST /api/reactions/post/:postId - Toggle reaction on a post
router.post('/post/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { type = 'like' } = req.body;
    const userId = req.user.id;

    if (!REACTION_TYPES.includes(type)) {
      return res.status(400).json({ ok: false, error: 'Invalid reaction type' });
    }

    // Try Blog model first, then Post model
    let Model = mongoose.model('Blog');
    let item = await Model.findById(postId);
    
    if (!item) {
      Model = mongoose.model('Post');
      item = await Model.findById(postId);
    }

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    // Initialize reactions if not exists
    if (!item.reactions) {
      item.reactions = {};
    }
    if (!item.reactions[type]) {
      item.reactions[type] = [];
    }

    // Also maintain legacy likes array for compatibility
    if (!item.likes) {
      item.likes = [];
    }

    const userIdStr = userId.toString();
    const hasReacted = item.reactions[type].some(id => id.toString() === userIdStr);
    const hasLiked = item.likes.some(id => id.toString() === userIdStr);

    if (hasReacted) {
      // Remove reaction
      item.reactions[type] = item.reactions[type].filter(id => id.toString() !== userIdStr);
      if (type === 'like') {
        item.likes = item.likes.filter(id => id.toString() !== userIdStr);
      }
    } else {
      // Add reaction
      item.reactions[type].push(userId);
      if (type === 'like' && !hasLiked) {
        item.likes.push(userId);
      }
    }

    // Mark reactions as modified (important for Mongoose)
    item.markModified('reactions');
    await item.save();

    // Create notification for post author
    if (!hasReacted && item.author && item.author.toString() !== userIdStr) {
      try {
        const Notification = mongoose.model('Notification');
        await Notification.create({
          recipient: item.author,
          sender: userId,
          type: 'reaction',
          message: `reacted ${type} to your post`,
          relatedPost: postId
        });
      } catch (notifError) {
        console.log('Notification creation failed:', notifError.message);
      }
    }

    res.json({
      ok: true,
      reacted: !hasReacted,
      type,
      reactions: item.reactions,
      likesCount: item.likes.length,
      totalReactions: Object.values(item.reactions).reduce((sum, arr) => sum + arr.length, 0)
    });
  } catch (error) {
    console.error('Reaction error:', error);
    res.status(500).json({ ok: false, error: 'Failed to toggle reaction' });
  }
});

// GET /api/reactions/post/:postId - Get reactions for a post
router.get('/post/:postId', async (req, res) => {
  try {
    const { postId } = req.params;

    let Model = mongoose.model('Blog');
    let item = await Model.findById(postId).select('reactions likes');
    
    if (!item) {
      Model = mongoose.model('Post');
      item = await Model.findById(postId).select('reactions likes');
    }

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    res.json({
      ok: true,
      reactions: item.reactions || {},
      likesCount: (item.likes || []).length,
      totalReactions: item.reactions ? Object.values(item.reactions).reduce((sum, arr) => sum + arr.length, 0) : 0
    });
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get reactions' });
  }
});

// ==========================================
// VIEWS TRACKING
// ==========================================

// POST /api/reactions/view/:postId - Track view
router.post('/view/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.body.userId || req.ip; // Use IP if no user

    let Model = mongoose.model('Blog');
    let item = await Model.findById(postId);
    
    if (!item) {
      Model = mongoose.model('Post');
      item = await Model.findById(postId);
    }

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    // Initialize views tracking
    if (!item.views) item.views = 0;
    if (!item.viewedBy) item.viewedBy = [];

    // Check if already viewed (simple deduplication)
    const viewerIdStr = userId?.toString() || req.ip;
    const hasViewed = item.viewedBy.includes(viewerIdStr);

    if (!hasViewed) {
      item.views += 1;
      item.viewedBy.push(viewerIdStr);
      
      // Keep viewedBy array manageable (last 1000 viewers)
      if (item.viewedBy.length > 1000) {
        item.viewedBy = item.viewedBy.slice(-1000);
      }
      
      item.markModified('viewedBy');
      await item.save();
    }

    res.json({
      ok: true,
      views: item.views,
      isNewView: !hasViewed
    });
  } catch (error) {
    console.error('View tracking error:', error);
    res.status(500).json({ ok: false, error: 'Failed to track view' });
  }
});

// ==========================================
// SHARE TRACKING
// ==========================================

// POST /api/reactions/share/:postId - Track share
router.post('/share/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { platform = 'copy' } = req.body; // copy, twitter, facebook, etc.
    const userId = req.user.id;

    let Model = mongoose.model('Blog');
    let item = await Model.findById(postId);
    
    if (!item) {
      Model = mongoose.model('Post');
      item = await Model.findById(postId);
    }

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    // Initialize share count
    if (!item.shareCount) item.shareCount = 0;
    if (!item.shares) item.shares = [];

    item.shareCount += 1;
    item.shares.push({
      user: userId,
      platform,
      sharedAt: new Date()
    });

    // Keep shares array manageable
    if (item.shares.length > 1000) {
      item.shares = item.shares.slice(-1000);
    }

    item.markModified('shares');
    await item.save();

    // Notify post author
    if (item.author && item.author.toString() !== userId.toString()) {
      try {
        const Notification = mongoose.model('Notification');
        await Notification.create({
          recipient: item.author,
          sender: userId,
          type: 'share',
          message: `shared your post`,
          relatedPost: postId
        });
      } catch (notifError) {
        console.log('Notification creation failed:', notifError.message);
      }
    }

    res.json({
      ok: true,
      shareCount: item.shareCount,
      platform
    });
  } catch (error) {
    console.error('Share tracking error:', error);
    res.status(500).json({ ok: false, error: 'Failed to track share' });
  }
});

// ==========================================
// CHECK USER REACTIONS
// ==========================================

// GET /api/reactions/user/:postId - Check user's reactions on a post
router.get('/user/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    let Model = mongoose.model('Blog');
    let item = await Model.findById(postId).select('reactions likes');
    
    if (!item) {
      Model = mongoose.model('Post');
      item = await Model.findById(postId).select('reactions likes');
    }

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const userIdStr = userId.toString();
    const userReactions = {};

    // Check each reaction type
    if (item.reactions) {
      for (const [type, users] of Object.entries(item.reactions)) {
        userReactions[type] = users.some(id => id.toString() === userIdStr);
      }
    }

    // Legacy like check
    const hasLiked = (item.likes || []).some(id => id.toString() === userIdStr);

    res.json({
      ok: true,
      userReactions,
      hasLiked
    });
  } catch (error) {
    console.error('Check user reactions error:', error);
    res.status(500).json({ ok: false, error: 'Failed to check reactions' });
  }
});

// ==========================================
// BULK GET REACTIONS (for feed optimization)
// ==========================================

// POST /api/reactions/bulk - Get reactions for multiple posts
router.post('/bulk', verifyToken, async (req, res) => {
  try {
    const { postIds } = req.body;
    const userId = req.user.id;

    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'postIds array required' });
    }

    // Limit to 50 posts at a time
    const limitedIds = postIds.slice(0, 50);

    const Blog = mongoose.model('Blog');
    const Post = mongoose.model('Post');

    const [blogs, posts] = await Promise.all([
      Blog.find({ _id: { $in: limitedIds } }).select('_id reactions likes views shareCount'),
      Post.find({ _id: { $in: limitedIds } }).select('_id reactions likes views shareCount')
    ]);

    const allItems = [...blogs, ...posts];
    const result = {};

    for (const item of allItems) {
      const userIdStr = userId.toString();
      const userReactions = {};

      if (item.reactions) {
        for (const [type, users] of Object.entries(item.reactions)) {
          userReactions[type] = users.some(id => id.toString() === userIdStr);
        }
      }

      result[item._id.toString()] = {
        reactions: item.reactions || {},
        likesCount: (item.likes || []).length,
        views: item.views || 0,
        shareCount: item.shareCount || 0,
        userReactions,
        hasLiked: (item.likes || []).some(id => id.toString() === userIdStr)
      };
    }

    res.json({ ok: true, data: result });
  } catch (error) {
    console.error('Bulk reactions error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get bulk reactions' });
  }
});

module.exports = router;
