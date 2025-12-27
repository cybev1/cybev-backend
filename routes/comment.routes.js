const express = require('express');
const router = express.Router();
const Comment = require('../models/comment.model');
const { authenticateToken } = require('../middleware/auth');
const Blog = require('../models/blog.model');
const { createNotification } = require('../utils/notifications');

// Get comments for a blog
router.get('/blog/:blogId', async (req, res) => {
  try {
    const { blogId } = req.params;
    const { limit = 50, page = 1 } = req.query;

    const skip = (page - 1) * limit;

    // Get top-level comments (no parent)
    const comments = await Comment.find({ 
      blog: blogId, 
      parentComment: null,
      isDeleted: false 
    })
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const replies = await Comment.find({ 
          parentComment: comment._id,
          isDeleted: false 
        })
          .populate('author', 'name email')
          .sort({ createdAt: 1 })
          .limit(10);

        return {
          ...comment.toObject(),
          replies
        };
      })
    );

    const total = await Comment.countDocuments({ 
      blog: blogId, 
      parentComment: null,
      isDeleted: false 
    });

    res.json({
      ok: true,
      comments: commentsWithReplies,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Create a comment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { content, blogId, parentCommentId } = req.body;

    if (!content || !blogId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Content and blog ID are required' 
      });
    }

    const comment = new Comment({
      content,
      blog: blogId,
      author: req.user.id,
      authorName: req.user.name,
      parentComment: parentCommentId || null
    });

    await comment.save();
    await comment.populate('author', 'name email');

    // Notify blog author about new comment (skip self-notify)
    try {
      const blog = await Blog.findById(blogId).select('author title');
      if (blog?.author && String(blog.author) !== String(req.user.id)) {
        await createNotification({
          recipient: blog.author,
          sender: req.user.id,
          type: 'comment',
          message: `${req.user.name || 'Someone'} commented on "${blog.title || 'your post'}"`,
          referenceId: blogId,
          referenceType: 'blog'
        });
      }
    } catch (e) {
      // never fail comment creation because of notifications
      console.warn('[notify] comment notification failed:', e?.message || e);
    }

    res.status(201).json({ ok: true, comment });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Update a comment
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ ok: false, error: 'Comment not found' });
    }

    if (comment.author.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { content } = req.body;
    if (content) {
      comment.content = content;
      comment.isEdited = true;
    }

    await comment.save();
    res.json({ ok: true, comment });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Delete a comment (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ ok: false, error: 'Comment not found' });
    }

    if (comment.author.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    comment.isDeleted = true;
    comment.content = '[deleted]';
    await comment.save();

    res.json({ ok: true, message: 'Comment deleted successfully' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Like/Unlike a comment
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ ok: false, error: 'Comment not found' });
    }

    const userIndex = comment.likes.indexOf(req.user.id);
    let liked = false;

    if (userIndex > -1) {
      comment.likes.splice(userIndex, 1);
      liked = false;
    } else {
      comment.likes.push(req.user.id);
      liked = true;
    }

    await comment.save();

    // Notify comment author about like (skip self-notify)
    if (liked && comment.author && String(comment.author) !== String(req.user.id)) {
      try {
        await createNotification({
          recipient: comment.author,
          sender: req.user.id,
          type: 'comment_like',
          message: 'liked your comment',
          referenceId: comment._id,
          referenceType: 'comment'
        });
      } catch (_) {
        // notification is best-effort
      }
    }

    res.json({ 
      ok: true,
      liked, 
      likeCount: comment.likes.length 
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
