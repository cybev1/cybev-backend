// ============================================
// FILE: routes/blog.routes.js
// UPDATED: View throttling + Share fix
// ============================================

const express = require('express');
const router = express.Router();
const Blog = require('../models/blog.model');
const verifyToken = require('../middleware/verifyToken');
const requireEmailVerification = require('../middleware/requireEmailVerification');
const { createNotification } = require('../utils/notifications');

// ========================================
// VIEW TRACKING - Prevent duplicate views
// ========================================
const viewedBlogs = new Map(); // Store: "ip:blogId" -> timestamp
const VIEW_COOLDOWN = 30 * 60 * 1000; // 30 minutes between view counts from same IP

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of viewedBlogs.entries()) {
    if (now - timestamp > VIEW_COOLDOWN) {
      viewedBlogs.delete(key);
    }
  }
}, 60 * 60 * 1000);

// Get client IP
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.ip || 
         'unknown';
};

// Check if view should be counted
const shouldCountView = (req, blogId) => {
  const ip = getClientIP(req);
  const key = `${ip}:${blogId}`;
  const lastView = viewedBlogs.get(key);
  
  if (!lastView || (Date.now() - lastView > VIEW_COOLDOWN)) {
    viewedBlogs.set(key, Date.now());
    return true;
  }
  return false;
};

// ========================================
// IMPORTANT: Specific routes BEFORE :id routes!
// ========================================

// ========== PUBLIC ROUTES (No auth - Feed access) ==========

// GET /api/blogs/trending - Get trending blogs
router.get('/trending', async (req, res) => {
  try {
    console.log('🔥 Fetching trending blogs');
    
    const blogs = await Blog.aggregate([
      {
        $addFields: {
          likeCount: { $size: { $ifNull: ['$likes', []] } },
          recencyBonus: {
            $cond: {
              if: { $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
              then: 50,
              else: 0
            }
          }
        }
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $ifNull: ['$views', 0] },
              { $multiply: ['$likeCount', 3] },
              '$recencyBonus'
            ]
          }
        }
      },
      { $sort: { trendingScore: -1 } },
      { $limit: 10 }
    ]);

    await Blog.populate(blogs, { path: 'author', select: 'name username profilePicture' });
    
    console.log(`✅ Found ${blogs.length} trending blogs`);
    
    res.json({
      success: true,
      ok: true,
      blogs
    });
  } catch (error) {
    console.error('❌ Error fetching trending blogs:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to fetch trending blogs'
    });
  }
});

// GET /api/blogs/trending-tags - Get trending tags
router.get('/trending-tags', async (req, res) => {
  try {
    console.log('🏷️ Fetching trending tags');
    
    const tags = await Blog.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { tag: '$_id', count: 1, _id: 0 } }
    ]);
    
    console.log(`✅ Found ${tags.length} trending tags`);
    
    res.json({
      success: true,
      ok: true,
      tags
    });
  } catch (error) {
    console.error('❌ Error fetching trending tags:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to fetch trending tags'
    });
  }
});

// GET /api/blogs/search - Search blogs
router.get('/search', async (req, res) => {
  try {
    const { q, tag, category, author, sort = 'recent', limit = 20, skip = 0 } = req.query;
    
    console.log('🔍 Searching blogs:', { q, tag, category, author });
    
    const query = {};
    
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ];
    }
    
    if (tag) {
      query.tags = { $in: [tag] };
    }
    
    if (category) {
      query.category = category;
    }
    
    if (author) {
      query.author = author;
    }
    
    let sortOption = { createdAt: -1 };
    if (sort === 'popular') {
      sortOption = { views: -1 };
    } else if (sort === 'likes') {
      sortOption = { 'likes.length': -1 };
    } else if (sort === 'oldest') {
      sortOption = { createdAt: 1 };
    }
    
    const blogs = await Blog.find(query)
      .sort(sortOption)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('author', 'name username profilePicture');
    
    const total = await Blog.countDocuments(query);
    
    console.log(`✅ Found ${blogs.length} blogs matching search`);
    
    res.json({
      success: true,
      ok: true,
      blogs,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + blogs.length < total
      }
    });
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Search failed'
    });
  }
});

// GET /api/blogs - Get all blogs (PUBLIC - for feed)
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    console.log(`📚 Fetching blogs - limit: ${limit}, skip: ${skip}`);
    
    const blogs = await Blog.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name username profilePicture');
    
    const total = await Blog.countDocuments({});
    
    console.log(`✅ Found ${blogs.length} blogs (${total} total)`);
    
    res.json({
      success: true,
      data: {
        blogs,
        total,
        limit,
        skip
      }
    });
  } catch (error) {
    console.error('❌ Error fetching blogs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs'
    });
  }
});

// ========== PROTECTED ROUTES (User-specific) ==========

// GET /api/blogs/my-blogs - Get current user's blogs
router.get('/my-blogs', verifyToken, async (req, res) => {
  try {
    console.log('📚 Fetching my blogs for user:', req.user.id);
    
    const blogs = await Blog.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .populate('author', 'name username profilePicture');
    
    console.log(`✅ Found ${blogs.length} blogs for user`);
    
    res.json({
      success: true,
      blogs,
      count: blogs.length
    });
  } catch (error) {
    console.error('❌ Error fetching user blogs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs'
    });
  }
});

// GET /api/blogs/stats - Get user's blog statistics
router.get('/stats', verifyToken, async (req, res) => {
  try {
    console.log('📊 Fetching blog stats for user:', req.user.id);
    
    const blogs = await Blog.find({ author: req.user.id });
    
    const stats = {
      totalPosts: blogs.length,
      totalViews: blogs.reduce((sum, blog) => sum + (blog.views || 0), 0),
      totalLikes: blogs.reduce((sum, blog) => sum + (blog.likes?.length || 0), 0),
      totalComments: blogs.reduce((sum, blog) => sum + (blog.comments?.length || 0), 0),
      totalEarnings: blogs.reduce((sum, blog) => sum + (blog.earnings || 0), 0)
    };
    
    console.log('✅ Blog stats:', stats);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// ========== :id ROUTES (After specific routes) ==========

// GET /api/blogs/:id - Get single blog by ID (PUBLIC)
// ⚡ WITH VIEW THROTTLING - Only counts once per 30 min per IP
router.get('/:id', async (req, res) => {
  try {
    console.log('📖 Fetching blog:', req.params.id);
    
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name username profilePicture');
    
    if (!blog) {
      console.log('❌ Blog not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }
    
    // ⚡ THROTTLED VIEW COUNT - Only increment if not recently viewed by this IP
    if (shouldCountView(req, req.params.id)) {
      blog.views = (blog.views || 0) + 1;
      await blog.save();
      console.log(`👁️ View counted for blog: ${blog.title} (total: ${blog.views})`);
    } else {
      console.log(`👁️ View NOT counted (cooldown) for blog: ${blog.title}`);
    }
    
    console.log('✅ Blog found:', blog.title);
    
    res.json({
      success: true,
      blog
    });
  } catch (error) {
    console.error('❌ Get blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blog'
    });
  }
});

// POST /api/blogs - Create new blog
router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('📝 Creating blog for user:', req.user.id);
    
    // Get user's name for authorName field
    let authorName = req.body.authorName;
    if (!authorName) {
      try {
        const User = require('mongoose').model('User');
        const user = await User.findById(req.user.id).select('name username');
        authorName = user?.name || user?.username || 'Anonymous';
      } catch (e) {
        authorName = req.user.name || req.user.username || 'Anonymous';
      }
    }
    
    const blog = new Blog({
      ...req.body,
      author: req.user.id,
      authorName: authorName
    });
    
    await blog.save();
    
    // Try to populate, but don't fail if it doesn't work
    try {
      await blog.populate('author', 'name username profilePicture');
    } catch (e) {
      console.log('Populate warning:', e.message);
    }
    
    console.log('✅ Blog created:', blog._id);
    
    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      blog,
      data: blog,
      _id: blog._id
    });
  } catch (error) {
    console.error('❌ Error creating blog:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create blog',
      error: error.message
    });
  }
});

// PUT /api/blogs/:id - Update blog
router.put('/:id', verifyToken, async (req, res) => {
  try {
    console.log('✏️ Updating blog:', req.params.id, 'by user:', req.user.id);
    
    const blog = await Blog.findOne({
      _id: req.params.id,
      author: req.user.id
    });
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found or unauthorized'
      });
    }
    
    // Update allowed fields
    const allowedUpdates = ['title', 'content', 'category', 'tags', 'featuredImage', 'status'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        blog[field] = req.body[field];
      }
    });
    
    await blog.save();
    await blog.populate('author', 'name username profilePicture');
    
    console.log('✅ Blog updated:', blog.title);
    
    res.json({
      success: true,
      message: 'Blog updated successfully',
      blog
    });
  } catch (error) {
    console.error('❌ Error updating blog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update blog'
    });
  }
});

// DELETE /api/blogs/:id - Delete blog
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    console.log('🗑️ Deleting blog:', req.params.id, 'by user:', req.user.id);
    
    const blog = await Blog.findOneAndDelete({
      _id: req.params.id,
      author: req.user.id
    });
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found or unauthorized'
      });
    }
    
    console.log('✅ Blog deleted:', blog.title);
    
    res.json({
      success: true,
      message: 'Blog deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting blog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete blog'
    });
  }
});

// POST /api/blogs/:id/like - Toggle like
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        ok: false,
        message: 'Blog not found'
      });
    }
    
    const likes = blog.likes || [];
    const userIndex = likes.indexOf(req.user.id);
    let liked = false;
    
    if (userIndex > -1) {
      likes.splice(userIndex, 1);
      liked = false;
    } else {
      likes.push(req.user.id);
      liked = true;
    }
    
    blog.likes = likes;
    await blog.save();
    
    // Send notification when liked
    if (liked && blog.author && String(blog.author) !== String(req.user.id)) {
      try {
        await createNotification({
          recipient: blog.author,
          sender: req.user.id,
          type: 'like',
          message: `liked your post "${blog.title?.substring(0, 30) || 'your post'}"`,
          entityId: blog._id,
          entityModel: 'Blog'
        });
      } catch (notifyErr) {
        console.warn('Like notification failed:', notifyErr.message);
      }
    }
    
    res.json({
      success: true,
      ok: true,
      liked,
      likeCount: likes.length
    });
  } catch (error) {
    console.error('❌ Error toggling like:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to toggle like'
    });
  }
});

// POST /api/blogs/:id/share - Track share (PUBLIC)
router.post('/:id/share', async (req, res) => {
  try {
    const { platform } = req.body;
    
    console.log('📤 Tracking share for blog:', req.params.id, 'platform:', platform);
    
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ 
        ok: false, 
        success: false,
        error: 'Blog not found' 
      });
    }
    
    // Initialize shares object if needed
    if (!blog.shares) {
      blog.shares = { total: 0, platforms: {} };
    }
    
    // Increment total
    blog.shares.total = (blog.shares.total || 0) + 1;
    
    // Track by platform
    if (platform) {
      blog.shares.platforms = blog.shares.platforms || {};
      blog.shares.platforms[platform] = (blog.shares.platforms[platform] || 0) + 1;
    }
    
    await blog.save();
    
    console.log('✅ Share tracked:', blog.shares);
    
    res.json({
      ok: true,
      success: true,
      shares: blog.shares,
      message: 'Share tracked successfully'
    });
  } catch (error) {
    console.error('❌ Share tracking error:', error);
    res.status(500).json({ 
      ok: false, 
      success: false,
      error: 'Failed to track share' 
    });
  }
});

// POST /api/blogs/:id/view - Track view (PUBLIC)
router.post('/:id/view', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const blogId = req.params.id;
    
    // Check if this IP recently viewed this blog
    if (!shouldCountView(ip, blogId)) {
      return res.json({
        ok: true,
        success: true,
        counted: false,
        message: 'View already counted recently'
      });
    }
    
    const blog = await Blog.findById(blogId);
    
    if (!blog) {
      return res.status(404).json({ 
        ok: false, 
        success: false,
        error: 'Blog not found' 
      });
    }
    
    // Increment view count
    blog.views = (blog.views || 0) + 1;
    await blog.save();
    
    console.log(`👁️ View tracked for blog: ${blog.title} (total: ${blog.views})`);
    
    res.json({
      ok: true,
      success: true,
      counted: true,
      views: blog.views,
      message: 'View tracked successfully'
    });
  } catch (error) {
    console.error('❌ View tracking error:', error);
    res.status(500).json({ 
      ok: false, 
      success: false,
      error: 'Failed to track view' 
    });
  }
});

// GET /api/blogs/:id/share-data - Get share data for a blog
router.get('/:id/share-data', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).select('title content featuredImage author');
    
    if (!blog) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Blog not found' 
      });
    }
    
    // Generate share URLs
    const siteUrl = process.env.FRONTEND_URL || 'https://cybev.io';
    const blogUrl = `${siteUrl}/blog/${req.params.id}`;
    const encodedUrl = encodeURIComponent(blogUrl);
    const encodedTitle = encodeURIComponent(blog.title || 'Check out this blog');
    
    res.json({
      ok: true,
      success: true,
      data: {
        url: blogUrl,
        title: blog.title,
        shareLinks: {
          twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
          linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
          whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
          telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
          email: `mailto:?subject=${encodedTitle}&body=Check%20this%20out:%20${encodedUrl}`
        }
      }
    });
  } catch (error) {
    console.error('❌ Share data error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to get share data' 
    });
  }
});

// ==========================================
// PIN/UNPIN POST
// ==========================================

// POST /api/blogs/:id/pin - Toggle pin status
router.post('/:id/pin', verifyToken, async (req, res) => {
  try {
    console.log('📌 Toggling pin for blog:', req.params.id);
    
    const blog = await Blog.findOne({
      _id: req.params.id,
      author: req.user.id
    });
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        ok: false,
        message: 'Blog not found or unauthorized'
      });
    }
    
    // If pinning, unpin all other posts by this user first
    if (!blog.isPinned) {
      await Blog.updateMany(
        { author: req.user.id, isPinned: true },
        { isPinned: false, pinnedAt: null }
      );
    }
    
    // Toggle pin status
    blog.isPinned = !blog.isPinned;
    blog.pinnedAt = blog.isPinned ? new Date() : null;
    await blog.save();
    
    console.log(`✅ Blog ${blog.isPinned ? 'pinned' : 'unpinned'}:`, blog.title);
    
    res.json({
      success: true,
      ok: true,
      isPinned: blog.isPinned,
      message: blog.isPinned ? 'Post pinned to your profile' : 'Post unpinned'
    });
  } catch (error) {
    console.error('❌ Error toggling pin:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to toggle pin'
    });
  }
});

// GET /api/blogs/pinned/:userId - Get pinned post for a user
router.get('/pinned/:userId', async (req, res) => {
  try {
    const blog = await Blog.findOne({
      author: req.params.userId,
      isPinned: true
    }).populate('author', 'name username profilePicture');
    
    res.json({
      success: true,
      ok: true,
      blog: blog || null
    });
  } catch (error) {
    console.error('❌ Error fetching pinned post:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to fetch pinned post'
    });
  }
});

// ==========================================
// EMOJI REACTIONS
// ==========================================

const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry', 'fire', 'clap'];

// POST /api/blogs/:id/react - Add/remove emoji reaction (ACCUMULATES - users can have multiple reaction types)
router.post('/:id/react', verifyToken, async (req, res) => {
  try {
    const { type = 'like' } = req.body;
    
    if (!REACTION_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        ok: false,
        message: 'Invalid reaction type. Valid types: ' + REACTION_TYPES.join(', ')
      });
    }
    
    console.log(`😀 Toggling ${type} reaction on blog:`, req.params.id);
    
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        ok: false,
        message: 'Blog not found'
      });
    }
    
    // Initialize reactions object if needed
    if (!blog.reactions) {
      blog.reactions = {};
    }
    
    // Initialize this reaction type array if needed
    if (!blog.reactions[type]) {
      blog.reactions[type] = [];
    }
    
    const userId = req.user.id.toString();
    const hasThisReaction = blog.reactions[type].some(id => id.toString() === userId);
    
    if (hasThisReaction) {
      // Remove THIS specific reaction only (user can still have other reactions)
      blog.reactions[type] = blog.reactions[type].filter(id => id.toString() !== userId);
      
      // Also remove from likes array if removing 'like' reaction
      if (type === 'like' && blog.likes) {
        blog.likes = blog.likes.filter(id => id.toString() !== userId);
      }
    } else {
      // Add THIS reaction (doesn't remove other reactions - user can have multiple!)
      blog.reactions[type].push(req.user.id);
      
      // Also add to likes array if type is 'like' for backward compatibility
      if (type === 'like') {
        if (!blog.likes) blog.likes = [];
        if (!blog.likes.some(id => id.toString() === userId)) {
          blog.likes.push(req.user.id);
        }
      }
    }
    
    blog.markModified('reactions');
    await blog.save();
    
    // Send notification only when adding (not removing)
    if (!hasThisReaction && blog.author && String(blog.author) !== userId) {
      try {
        const reactionEmojis = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😠', fire: '🔥', clap: '👏' };
        await createNotification({
          recipient: blog.author,
          sender: req.user.id,
          type: 'reaction',
          message: `reacted ${reactionEmojis[type] || type} to your post`,
          entityId: blog._id,
          entityModel: 'Blog'
        });
      } catch (notifyErr) {
        console.warn('Reaction notification failed:', notifyErr.message);
      }
    }
    
    // Calculate total reactions (counting each unique user-reaction pair)
    const totalReactions = Object.values(blog.reactions).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    
    // Get user's current reactions on this post
    const userReactions = {};
    for (const [reactionType, users] of Object.entries(blog.reactions)) {
      userReactions[reactionType] = users.some(id => id.toString() === userId);
    }
    
    res.json({
      success: true,
      ok: true,
      reacted: !hasThisReaction,
      type,
      reactions: blog.reactions,
      userReactions, // All reactions this user has on this post
      totalReactions,
      likeCount: blog.likes?.length || 0
    });
  } catch (error) {
    console.error('❌ Error toggling reaction:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to toggle reaction'
    });
  }
});

// GET /api/blogs/:id/reactions - Get all reactions for a blog
router.get('/:id/reactions', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).select('reactions likes');
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        ok: false,
        message: 'Blog not found'
      });
    }
    
    const totalReactions = blog.reactions 
      ? Object.values(blog.reactions).reduce((sum, arr) => sum + (arr?.length || 0), 0)
      : 0;
    
    res.json({
      success: true,
      ok: true,
      reactions: blog.reactions || {},
      likeCount: blog.likes?.length || 0,
      totalReactions
    });
  } catch (error) {
    console.error('❌ Error fetching reactions:', error);
    res.status(500).json({
      success: false,
      ok: false,
      message: 'Failed to fetch reactions'
    });
  }
});

module.exports = router;
