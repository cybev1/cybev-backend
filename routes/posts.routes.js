const express = require('express');
const router = express.Router();
const Post = require('../models/post.model');
const User = require('../models/user.model');
const Follow = require('../models/follow.model');
const verifyToken = require('../middleware/verifyToken');

// Import existing controller if it exists
let postsController;
try {
  postsController = require('../controllers/posts.controller');
} catch (error) {
  console.log('No posts.controller found, using inline handlers');
}

// Handle OPTIONS for CORS
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// ========== EXISTING ROUTE - Keep for backward compatibility ==========
if (postsController && postsController.getMyPosts) {
  router.get('/my-posts', postsController.getMyPosts);
} else {
  // Fallback implementation
  router.get('/my-posts', verifyToken, async (req, res) => {
    try {
      const posts = await Post.find({ 
        authorId: req.user.id,
        isHidden: false 
      })
        .sort({ createdAt: -1 })
        .limit(50);

      res.json({
        success: true,
        posts
      });
    } catch (error) {
      console.error('Error fetching my posts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch posts'
      });
    }
  });
}

// ========== CREATE POST ==========
router.post('/', verifyToken, async (req, res) => {
  try {
    const { content, title, images, video, type, visibility, location } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    if (content.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Content must be less than 5000 characters'
      });
    }

    // Fetch full user data to get name
    const user = await User.findById(req.user.id).select('name username email');
    const authorName = user?.name || user?.username || user?.email?.split('@')[0] || 'Anonymous';

    console.log(`📝 Creating post for user: ${authorName} (${req.user.id})`);

    const post = await Post.create({
      authorId: req.user.id,
      authorName: authorName,
      title: title || undefined,
      content,
      images: images || [],
      video,
      type: type || 'text',
      visibility: visibility || 'public',
      location,
      tokensEarned: 10 // Base reward for creating post
    });

    console.log(`✅ Post created by ${authorName}: ${post._id}`);

    // Populate author data for response
    const populatedPost = await Post.findById(post._id).populate('authorId', 'name username avatar email');

    res.status(201).json({
      success: true,
      message: '🎉 Post created! You earned 10 tokens!',
      post: populatedPost,
      tokensEarned: 10
    });

  } catch (error) {
    console.error('❌ Create post error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create post'
    });
  }
});

// ========== GET FEED POSTS ==========
router.get('/feed', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, scope } = req.query;
    const skip = (page - 1) * limit;

    const query = { isHidden: false };
    if (type) query.type = type;

    // Phase 1: "Following" feed
    // /posts/feed?scope=following
    if (scope === 'following') {
      const following = await Follow.find({ follower: req.user.id }).select('following').lean();
      const followingIds = following.map(f => f.following);
      // include your own posts as well
      followingIds.push(req.user.id);
      query.authorId = { $in: followingIds };
    }

    const posts = await Post.find(query)
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('authorId', 'name username avatar email')
      .lean();

    // Ensure authorName is populated
    const postsWithAuthor = posts.map(post => ({
      ...post,
      authorName: post.authorName || post.authorId?.name || post.authorId?.username || 'Anonymous'
    }));

    const total = await Post.countDocuments(query);

    res.json({
      success: true,
      posts: postsWithAuthor,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Get feed error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch posts'
    });
  }
});

// ========== GET SINGLE POST ==========
router.get('/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('authorId', 'name username avatar email')
      .populate('comments.user', 'name username avatar');

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Increment views
    post.views += 1;
    await post.save();

    res.json({
      success: true,
      post
    });

  } catch (error) {
    console.error('❌ Get post error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch post'
    });
  }
});

// ========== GET USER'S POSTS ==========
router.get('/user/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const posts = await Post.find({ 
      authorId: req.params.userId,
      isHidden: false 
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('authorId', 'name username avatar email')
      .lean();

    const total = await Post.countDocuments({ 
      authorId: req.params.userId,
      isHidden: false 
    });

    res.json({
      success: true,
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Get user posts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user posts'
    });
  }
});

// ========== UPDATE POST ==========
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Check ownership
    if (post.authorId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to edit this post'
      });
    }

    const { content, title, images, video, visibility } = req.body;

    if (content) post.content = content;
    if (title !== undefined) post.title = title;
    if (images) post.images = images;
    if (video) post.video = video;
    if (visibility) post.visibility = visibility;

    await post.save();

    res.json({
      success: true,
      message: 'Post updated successfully',
      post: await post.populate('authorId', 'name username avatar email')
    });

  } catch (error) {
    console.error('❌ Update post error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update post'
    });
  }
});

// ========== DELETE POST ==========
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Check ownership (support multiple token/user shapes and multiple author fields)
    const userId = (req.user?.id || req.user?.userId || req.user?._id || req.user?.uid || '').toString();
    const ownerId = (
      post.authorId || post.author || post.user || post.userId || post.owner
    )?.toString();

    if (!userId || !ownerId || (ownerId !== userId && req.user?.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this post'
      });
    }

    // ✨ NEW: If this is a livestream post, also delete the livestream
    if (post.liveStreamId) {
      try {
        const LiveStream = require('../models/livestream.model');
        if (LiveStream) {
          await LiveStream.findByIdAndDelete(post.liveStreamId);
          console.log(`🗑️ Deleted livestream: ${post.liveStreamId}`);
        }
      } catch (e) {
        console.error('⚠️ Could not delete livestream:', e.message);
      }
    }

    await Post.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete post error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete post'
    });
  }
});

// ========== LIKE/UNLIKE POST ==========
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    const { reaction = 'love' } = req.body;
    const userId = req.user.id;

    // Check if already liked
    const likeIndex = post.likes.findIndex(
      like => like.user.toString() === userId
    );

    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
      await post.save();

      return res.json({
        success: true,
        message: 'Post unliked',
        liked: false,
        likeCount: post.likes.length
      });
    } else {
      // Like with reaction
      post.likes.push({
        user: userId,
        reaction,
        createdAt: new Date()
      });

      // Award tokens to post author
      post.tokensEarned += 1;
      
      await post.save();

      return res.json({
        success: true,
        message: 'Post liked!',
        liked: true,
        reaction,
        likeCount: post.likes.length
      });
    }

  } catch (error) {
    console.error('❌ Like post error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to like post'
    });
  }
});

// ========== ADD COMMENT ==========
router.post('/:id/comment', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required'
      });
    }

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Get user data for comment
    const user = await User.findById(req.user.id).select('name username');

    post.comments.push({
      user: req.user.id,
      userName: user?.name || user?.username || 'Anonymous',
      content,
      createdAt: new Date()
    });

    // Award tokens to post author
    post.tokensEarned += 2;

    await post.save();

    const populatedPost = await post.populate('comments.user', 'name username avatar');

    res.json({
      success: true,
      message: 'Comment added!',
      comments: populatedPost.comments,
      commentCount: populatedPost.comments.length
    });

  } catch (error) {
    console.error('❌ Add comment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment'
    });
  }
});

// ========== DELETE COMMENT ==========
router.delete('/:id/comment/:commentId', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }

    // Check if user owns the comment or the post
    if (comment.user.toString() !== req.user.id && 
        post.authorId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this comment'
      });
    }

    post.comments.pull(req.params.commentId);
    await post.save();

    res.json({
      success: true,
      message: 'Comment deleted'
    });

  } catch (error) {
    console.error('❌ Delete comment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete comment'
    });
  }
});

// ========== BOOKMARK/UNBOOKMARK POST ==========
router.post('/:id/bookmark', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    const userId = req.user.id;
    const bookmarkIndex = post.bookmarks.indexOf(userId);

    if (bookmarkIndex > -1) {
      // Remove bookmark
      post.bookmarks.splice(bookmarkIndex, 1);
      await post.save();

      return res.json({
        success: true,
        message: 'Bookmark removed',
        bookmarked: false
      });
    } else {
      // Add bookmark
      post.bookmarks.push(userId);
      await post.save();

      return res.json({
        success: true,
        message: 'Post bookmarked!',
        bookmarked: true
      });
    }

  } catch (error) {
    console.error('❌ Bookmark error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bookmark post'
    });
  }
});

// ========== GET TRENDING POSTS ==========
router.get('/trending/top', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const posts = await Post.getTrending(parseInt(limit));

    res.json({
      success: true,
      posts
    });

  } catch (error) {
    console.error('❌ Get trending error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending posts'
    });
  }
});

// ========== GET POSTS BY HASHTAG ==========
router.get('/hashtag/:tag', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const tag = req.params.tag.replace('#', '').toLowerCase();
    
    const posts = await Post.getByHashtag(tag, parseInt(limit));

    res.json({
      success: true,
      hashtag: tag,
      posts,
      count: posts.length
    });

  } catch (error) {
    console.error('❌ Get hashtag posts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hashtag posts'
    });
  }
});

module.exports = router;
