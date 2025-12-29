// ============================================
// FILE: routes/post.routes.js
// PATH: cybev-backend/routes/post.routes.js
// PURPOSE: Social posts (short-form content)
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Get/Create Post model
let Post;
try {
  Post = mongoose.model('Post');
} catch {
  const postSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, maxlength: 5000 },
    images: [String],
    video: String,
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
    shares: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    isHidden: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false }
  }, { timestamps: true });

  postSchema.index({ author: 1, createdAt: -1 });
  postSchema.index({ createdAt: -1 });
  
  Post = mongoose.model('Post', postSchema);
}

// POST /api/posts - Create a post
router.post('/', verifyToken, async (req, res) => {
  try {
    const { content, images, video } = req.body;

    if (!content && (!images || images.length === 0) && !video) {
      return res.status(400).json({ ok: false, error: 'Content required' });
    }

    const post = await Post.create({
      author: req.user.id,
      content,
      images: images || [],
      video
    });

    const populatedPost = await Post.findById(post._id)
      .populate('author', 'name username avatar');

    res.status(201).json({ ok: true, post: populatedPost });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ ok: false, error: 'Failed to create post' });
  }
});

// GET /api/posts - Get posts (paginated)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, userId } = req.query;
    const query = { isHidden: { $ne: true } };
    
    if (userId) query.author = userId;

    const posts = await Post.find(query)
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);

    res.json({
      ok: true,
      posts,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get posts' });
  }
});

// GET /api/posts/:postId - Get single post
router.get('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findByIdAndUpdate(
      postId,
      { $inc: { views: 1 } },
      { new: true }
    ).populate('author', 'name username avatar');

    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    res.json({ ok: true, post });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get post' });
  }
});

// PUT /api/posts/:postId - Update post
router.put('/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, images } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    post.content = content || post.content;
    if (images) post.images = images;
    await post.save();

    res.json({ ok: true, post });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to update post' });
  }
});

// DELETE /api/posts/:postId - Delete post
router.delete('/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    await Post.findByIdAndDelete(postId);
    res.json({ ok: true, message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to delete post' });
  }
});

// POST /api/posts/:postId/like - Like/unlike post
router.post('/:postId/like', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ ok: false, error: 'Post not found' });
    }

    const likeIndex = post.likes.indexOf(userId);
    if (likeIndex > -1) {
      post.likes.splice(likeIndex, 1);
    } else {
      post.likes.push(userId);
    }

    await post.save();
    res.json({ ok: true, liked: likeIndex === -1, likesCount: post.likes.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to like post' });
  }
});

// GET /api/posts/user/:userId - Get user's posts
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const posts = await Post.find({ author: userId, isHidden: { $ne: true } })
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ ok: true, posts });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get posts' });
  }
});

module.exports = router;
