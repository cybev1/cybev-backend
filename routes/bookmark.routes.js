const express = require('express');
const router = express.Router();
const Bookmark = require('../models/bookmark.model');
const Blog = require('../models/blog.model');
const { authenticateToken } = require('../middleware/auth');

// Get all bookmarks for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { collection, page = 1, limit = 20 } = req.query;
    
    const query = { user: req.user.id };
    if (collection) {
      query.collection = collection;
    }

    const skip = (page - 1) * limit;

    const bookmarks = await Bookmark.find(query)
      .populate({
        path: 'blog',
        populate: { path: 'author', select: 'name email' }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Bookmark.countDocuments(query);

    res.json({
      ok: true,
      bookmarks,
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

// Check if blog is bookmarked
router.get('/check/:blogId', authenticateToken, async (req, res) => {
  try {
    const bookmark = await Bookmark.findOne({
      user: req.user.id,
      blog: req.params.blogId
    });

    res.json({
      ok: true,
      bookmarked: !!bookmark
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Add bookmark
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { blogId, collection = 'default', note } = req.body;

    if (!blogId) {
      return res.status(400).json({ ok: false, error: 'Blog ID is required' });
    }

    // Check if blog exists
    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Check if already bookmarked
    const existing = await Bookmark.findOne({
      user: req.user.id,
      blog: blogId
    });

    if (existing) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Blog already bookmarked' 
      });
    }

    const bookmark = new Bookmark({
      user: req.user.id,
      blog: blogId,
      collection,
      note
    });

    await bookmark.save();
    await bookmark.populate('blog');

    res.status(201).json({ 
      ok: true, 
      bookmark,
      message: 'Blog bookmarked successfully' 
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Remove bookmark
router.delete('/:blogId', authenticateToken, async (req, res) => {
  try {
    const bookmark = await Bookmark.findOneAndDelete({
      user: req.user.id,
      blog: req.params.blogId
    });

    if (!bookmark) {
      return res.status(404).json({ ok: false, error: 'Bookmark not found' });
    }

    res.json({ 
      ok: true, 
      message: 'Bookmark removed successfully' 
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get bookmark collections
router.get('/collections/list', authenticateToken, async (req, res) => {
  try {
    const collections = await Bookmark.distinct('collection', { 
      user: req.user.id 
    });

    // Get count for each collection
    const collectionsWithCount = await Promise.all(
      collections.map(async (collection) => {
        const count = await Bookmark.countDocuments({
          user: req.user.id,
          collection
        });
        return { name: collection, count };
      })
    );

    res.json({
      ok: true,
      collections: collectionsWithCount
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
