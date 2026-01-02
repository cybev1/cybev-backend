// ============================================
// FILE: routes/feed.routes.js
// CYBEV Feed Routes - Fixed Populate Issues
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models - Try to load them safely
let Blog, Post, User, SharedPost;

try {
  Blog = require('../models/blog.model');
} catch (e) {
  console.log('Blog model not found');
}

try {
  Post = require('../models/post.model');
} catch (e) {
  console.log('Post model not found');
}

try {
  User = require('../models/user.model');
} catch (e) {
  console.log('User model not found');
}

try {
  SharedPost = require('../models/sharedPost.model');
} catch (e) {
  console.log('SharedPost model not found');
}

// Auth middleware - try multiple paths
let verifyToken;
try {
  verifyToken = require('../middleware/verifyToken');
} catch (e) {
  try {
    verifyToken = require('../middleware/auth.middleware');
  } catch (e2) {
    try {
      verifyToken = require('../middleware/auth');
    } catch (e3) {
      // Fallback middleware
      verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024');
          req.user = decoded;
          next();
        } catch (err) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      };
    }
  }
}

// Helper: Safe populate
const safePopulate = async (query, populateOptions) => {
  try {
    return await query.populate(populateOptions);
  } catch (error) {
    // If populate fails, return without populate
    console.log('Populate warning:', error.message);
    return query;
  }
};

// ==========================================
// GET /api/feed - Main Feed
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { tab = 'latest', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let feed = [];
    
    // Try to fetch from Blog model first (primary content)
    if (Blog) {
      try {
        let query = Blog.find({ status: 'published' })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(); // Use lean for better performance
        
        // Try to populate author, but don't fail if it doesn't work
        try {
          const blogs = await Blog.find({ status: 'published' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('author', 'name username avatar profileImage profilePicture')
            .lean();
          
          feed = blogs.map(blog => ({
            ...blog,
            contentType: 'blog',
            author: blog.author || blog.authorId || { name: 'Anonymous' }
          }));
        } catch (populateError) {
          // Populate failed, fetch without it
          console.log('Blog populate failed, fetching without:', populateError.message);
          
          const blogs = await Blog.find({ status: 'published' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
          
          // Manually fetch authors
          const authorIds = [...new Set(blogs.map(b => b.author || b.authorId).filter(Boolean))];
          let authors = {};
          
          if (User && authorIds.length > 0) {
            try {
              const users = await User.find({ _id: { $in: authorIds } })
                .select('name username avatar profileImage profilePicture')
                .lean();
              
              users.forEach(u => {
                authors[u._id.toString()] = u;
              });
            } catch (e) {
              console.log('Failed to fetch authors:', e.message);
            }
          }
          
          feed = blogs.map(blog => {
            const authorId = (blog.author || blog.authorId)?.toString();
            return {
              ...blog,
              contentType: 'blog',
              author: authors[authorId] || { name: blog.authorName || 'Anonymous' }
            };
          });
        }
      } catch (blogError) {
        console.log('Blog fetch error:', blogError.message);
      }
    }
    
    // Also try Post model if feed is empty
    if (feed.length === 0 && Post) {
      try {
        // Check if Post model has author or user field
        const postSchema = Post.schema.paths;
        const authorField = postSchema.author ? 'author' : (postSchema.user ? 'user' : null);
        
        let posts;
        if (authorField) {
          try {
            posts = await Post.find({ status: { $ne: 'draft' } })
              .sort({ createdAt: -1 })
              .skip(skip)
              .limit(parseInt(limit))
              .populate(authorField, 'name username avatar profileImage profilePicture')
              .lean();
          } catch (e) {
            posts = await Post.find({ status: { $ne: 'draft' } })
              .sort({ createdAt: -1 })
              .skip(skip)
              .limit(parseInt(limit))
              .lean();
          }
        } else {
          posts = await Post.find({ status: { $ne: 'draft' } })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
        }
        
        feed = posts.map(post => ({
          ...post,
          contentType: 'post',
          author: post.author || post.user || { name: 'Anonymous' }
        }));
      } catch (postError) {
        console.log('Posts fetch error:', postError.message);
      }
    }
    
    // Also fetch shared posts (timeline shares)
    if (SharedPost) {
      try {
        const sharedPosts = await SharedPost.find({ isActive: true })
          .populate('user', 'name username avatar profileImage profilePicture')
          .populate({
            path: 'originalBlog',
            select: 'title content excerpt featuredImage images author createdAt readTime views shares tags',
            populate: { path: 'author', select: 'name username avatar profileImage profilePicture' }
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean();
        
        // Transform shared posts for feed display
        const transformedShares = sharedPosts.map(share => ({
          _id: share._id,
          contentType: 'shared',
          isSharedPost: true,
          sharedBy: share.user,
          shareComment: share.comment,
          shareVisibility: share.visibility,
          sharedAt: share.createdAt,
          reactions: share.reactions,
          commentsCount: share.commentsCount,
          // Original post data
          originalPost: share.originalBlog,
          title: share.originalBlog?.title,
          content: share.originalBlog?.content,
          excerpt: share.originalBlog?.excerpt,
          featuredImage: share.originalBlog?.featuredImage,
          images: share.originalBlog?.images,
          author: share.originalBlog?.author,
          originalAuthor: share.originalBlog?.author,
          createdAt: share.createdAt,
          originalCreatedAt: share.originalBlog?.createdAt,
          readTime: share.originalBlog?.readTime,
          views: share.originalBlog?.views,
          tags: share.originalBlog?.tags
        }));
        
        // Merge with existing feed
        feed = [...feed, ...transformedShares];
        
        console.log(`📤 Added ${transformedShares.length} shared posts to feed`);
      } catch (sharedError) {
        console.log('SharedPosts fetch error:', sharedError.message);
      }
    }
    
    // Sort by pinned first, then by date
    feed.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    res.json({
      ok: true,
      feed,
      items: feed,
      posts: feed,
      page: parseInt(page),
      hasMore: feed.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to load feed',
      feed: [],
      items: [],
      posts: []
    });
  }
});

// ==========================================
// GET /api/feed/trending - Trending Posts
// ==========================================
router.get('/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    let trending = [];
    
    if (Blog) {
      try {
        const blogs = await Blog.find({ status: 'published' })
          .sort({ views: -1, likesCount: -1, createdAt: -1 })
          .limit(parseInt(limit))
          .lean();
        
        // Fetch authors manually
        const authorIds = [...new Set(blogs.map(b => b.author || b.authorId).filter(Boolean))];
        let authors = {};
        
        if (User && authorIds.length > 0) {
          const users = await User.find({ _id: { $in: authorIds } })
            .select('name username avatar profileImage profilePicture')
            .lean();
          
          users.forEach(u => {
            authors[u._id.toString()] = u;
          });
        }
        
        trending = blogs.map(blog => {
          const authorId = (blog.author || blog.authorId)?.toString();
          return {
            ...blog,
            contentType: 'blog',
            author: authors[authorId] || { name: blog.authorName || 'Anonymous' }
          };
        });
      } catch (e) {
        console.log('Trending fetch error:', e.message);
      }
    }
    
    res.json({
      ok: true,
      trending,
      items: trending
    });
    
  } catch (error) {
    console.error('Trending error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load trending', trending: [] });
  }
});

// ==========================================
// GET /api/feed/following - Following Feed
// ==========================================
router.get('/following', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get user's following list
    let followingIds = [];
    
    if (User) {
      try {
        const user = await User.findById(userId).select('following').lean();
        followingIds = user?.following || [];
      } catch (e) {
        console.log('Failed to get following list:', e.message);
      }
    }
    
    let feed = [];
    
    if (Blog && followingIds.length > 0) {
      try {
        const blogs = await Blog.find({
          author: { $in: followingIds },
          status: 'published'
        })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean();
        
        // Fetch authors
        const authorIds = [...new Set(blogs.map(b => b.author || b.authorId).filter(Boolean))];
        let authors = {};
        
        if (User && authorIds.length > 0) {
          const users = await User.find({ _id: { $in: authorIds } })
            .select('name username avatar profileImage profilePicture')
            .lean();
          
          users.forEach(u => {
            authors[u._id.toString()] = u;
          });
        }
        
        feed = blogs.map(blog => {
          const authorId = (blog.author || blog.authorId)?.toString();
          return {
            ...blog,
            contentType: 'blog',
            author: authors[authorId] || { name: blog.authorName || 'Anonymous' }
          };
        });
      } catch (e) {
        console.log('Following feed error:', e.message);
      }
    }
    
    res.json({
      ok: true,
      feed,
      items: feed,
      page: parseInt(page),
      hasMore: feed.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error('Following feed error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load following feed', feed: [] });
  }
});

// ==========================================
// GET /api/feed/personalized - AI Personalized
// ==========================================
router.get('/personalized', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { limit = 20 } = req.query;
    
    // For now, return trending + some randomization
    let feed = [];
    
    if (Blog) {
      try {
        const blogs = await Blog.find({ status: 'published' })
          .sort({ views: -1, createdAt: -1 })
          .limit(parseInt(limit) * 2)
          .lean();
        
        // Shuffle and take limit
        const shuffled = blogs.sort(() => Math.random() - 0.5);
        
        // Fetch authors
        const authorIds = [...new Set(shuffled.map(b => b.author || b.authorId).filter(Boolean))];
        let authors = {};
        
        if (User && authorIds.length > 0) {
          const users = await User.find({ _id: { $in: authorIds } })
            .select('name username avatar profileImage profilePicture')
            .lean();
          
          users.forEach(u => {
            authors[u._id.toString()] = u;
          });
        }
        
        feed = shuffled.slice(0, parseInt(limit)).map(blog => {
          const authorId = (blog.author || blog.authorId)?.toString();
          return {
            ...blog,
            contentType: 'blog',
            author: authors[authorId] || { name: blog.authorName || 'Anonymous' }
          };
        });
      } catch (e) {
        console.log('Personalized feed error:', e.message);
      }
    }
    
    res.json({
      ok: true,
      feed,
      items: feed
    });
    
  } catch (error) {
    console.error('Personalized feed error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load personalized feed', feed: [] });
  }
});

module.exports = router;
