// ============================================
// FILE: routes/seo.routes.js
// SEO Routes for Social Previews & Meta Tags
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const SITE_URL = process.env.SITE_URL || 'https://cybev.io';
const SITE_NAME = 'CYBEV';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

// Generate Open Graph meta tags for a blog post
router.get('/blog/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const Blog = mongoose.models.Blog;

    if (!Blog) {
      return res.json(getDefaultMeta());
    }

    const blog = await Blog.findById(id)
      .populate('author', 'name username avatar')
      .lean();

    if (!blog) {
      return res.json(getDefaultMeta());
    }

    const meta = {
      title: blog.title,
      description: blog.excerpt || blog.content?.substring(0, 160)?.replace(/<[^>]*>/g, '') || '',
      image: blog.featuredImage || DEFAULT_IMAGE,
      url: `${SITE_URL}/blog/${id}`,
      type: 'article',
      author: blog.author?.name || 'CYBEV User',
      publishedTime: blog.createdAt,
      modifiedTime: blog.updatedAt,
      tags: blog.tags || [],
      siteName: SITE_NAME
    };

    res.json({ ok: true, meta });
  } catch (error) {
    console.error('SEO blog error:', error);
    res.json(getDefaultMeta());
  }
});

// Generate meta for user profile
router.get('/profile/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const User = mongoose.models.User;

    if (!User) {
      return res.json(getDefaultMeta());
    }

    const user = await User.findOne({ username })
      .select('name username bio avatar followers following')
      .lean();

    if (!user) {
      return res.json(getDefaultMeta());
    }

    const meta = {
      title: `${user.name || user.username} (@${user.username})`,
      description: user.bio || `Follow ${user.name || user.username} on CYBEV`,
      image: user.avatar || DEFAULT_IMAGE,
      url: `${SITE_URL}/profile/${username}`,
      type: 'profile',
      author: user.name || user.username,
      siteName: SITE_NAME
    };

    res.json({ ok: true, meta });
  } catch (error) {
    console.error('SEO profile error:', error);
    res.json(getDefaultMeta());
  }
});

// Generate meta for live stream
router.get('/live/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const LiveStream = mongoose.models.LiveStream;

    if (!LiveStream) {
      return res.json(getDefaultMeta());
    }

    const stream = await LiveStream.findById(id)
      .populate('host', 'name username avatar')
      .lean();

    if (!stream) {
      return res.json(getDefaultMeta());
    }

    const isLive = stream.status === 'live';

    const meta = {
      title: `${isLive ? '🔴 LIVE: ' : ''}${stream.title}`,
      description: stream.description || `${isLive ? 'Watch live' : 'Stream'} by ${stream.host?.name || 'Creator'} on CYBEV`,
      image: stream.thumbnail || stream.host?.avatar || DEFAULT_IMAGE,
      url: `${SITE_URL}/live/${id}`,
      type: 'video.other',
      author: stream.host?.name || 'CYBEV Creator',
      siteName: SITE_NAME,
      isLive
    };

    res.json({ ok: true, meta });
  } catch (error) {
    console.error('SEO live error:', error);
    res.json(getDefaultMeta());
  }
});

// Generate meta for post
router.get('/post/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const Post = mongoose.models.Post;

    if (!Post) {
      return res.json(getDefaultMeta());
    }

    const post = await Post.findById(id)
      .populate('author', 'name username avatar')
      .lean();

    if (!post) {
      return res.json(getDefaultMeta());
    }

    const meta = {
      title: `Post by ${post.author?.name || 'User'}`,
      description: post.content?.substring(0, 160) || '',
      image: post.images?.[0] || post.author?.avatar || DEFAULT_IMAGE,
      url: `${SITE_URL}/post/${id}`,
      type: 'article',
      author: post.author?.name || 'CYBEV User',
      publishedTime: post.createdAt,
      siteName: SITE_NAME
    };

    res.json({ ok: true, meta });
  } catch (error) {
    console.error('SEO post error:', error);
    res.json(getDefaultMeta());
  }
});

// Generate meta for NFT
router.get('/nft/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const NFT = mongoose.models.NFT;

    if (!NFT) {
      return res.json(getDefaultMeta());
    }

    const nft = await NFT.findById(id)
      .populate('creator', 'name username avatar')
      .lean();

    if (!nft) {
      return res.json(getDefaultMeta());
    }

    const meta = {
      title: nft.name || 'NFT',
      description: nft.description || `NFT by ${nft.creator?.name || 'Creator'} on CYBEV`,
      image: nft.image || DEFAULT_IMAGE,
      url: `${SITE_URL}/nft/${id}`,
      type: 'product',
      author: nft.creator?.name || 'CYBEV Creator',
      siteName: SITE_NAME,
      price: nft.price
    };

    res.json({ ok: true, meta });
  } catch (error) {
    console.error('SEO nft error:', error);
    res.json(getDefaultMeta());
  }
});

// Sitemap data endpoint
router.get('/sitemap-data', async (req, res) => {
  try {
    const Blog = mongoose.models.Blog;
    const User = mongoose.models.User;

    const data = {
      blogs: [],
      profiles: []
    };

    if (Blog) {
      data.blogs = await Blog.find({ status: 'published' })
        .select('_id title updatedAt featuredImage')
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
    }

    if (User) {
      data.profiles = await User.find()
        .select('username updatedAt')
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
    }

    res.json({ ok: true, data });
  } catch (error) {
    console.error('Sitemap data error:', error);
    res.json({ ok: true, data: { blogs: [], profiles: [] } });
  }
});

// Default meta tags
function getDefaultMeta() {
  return {
    ok: true,
    meta: {
      title: SITE_NAME,
      description: 'CYBEV - The Web3 Social Blogging Platform. Create, share, and monetize your content.',
      image: DEFAULT_IMAGE,
      url: SITE_URL,
      type: 'website',
      siteName: SITE_NAME
    }
  };
}

module.exports = router;
