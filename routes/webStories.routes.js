// ============================================
// FILE: routes/webStories.routes.js
// PATH: cybev-backend/routes/webStories.routes.js
// PURPOSE: Auto-generate AMP Web Stories from blog posts
// Google Discover prioritizes Web Stories heavily
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ==========================================
// GET /api/web-stories/:blogId - Serve AMP Web Story for a blog post
// ==========================================
router.get('/:blogId', async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const blog = await Blog.findOne({
      _id: req.params.blogId,
      status: 'published',
      isDeleted: { $ne: true }
    }).populate('author', 'name username avatar displayName');

    if (!blog) return res.status(404).send('Story not found');

    const title = blog.seo?.metaTitle || blog.title || 'CYBEV Story';
    const description = blog.seo?.metaDescription || blog.excerpt || '';
    const authorName = blog.author?.displayName || blog.author?.name || blog.author?.username || 'CYBEV';
    const authorAvatar = blog.author?.avatar || 'https://cybev.io/logo.png';
    const coverImage = blog.coverImage || blog.featuredImage || blog.thumbnail || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1200';
    const url = `https://cybev.io/blog/${blog._id}`;
    const storyUrl = `https://api.cybev.io/api/web-stories/${blog._id}`;
    const publishedDate = blog.createdAt ? new Date(blog.createdAt).toISOString() : new Date().toISOString();

    // Extract content sections for story pages
    const content = (blog.content || '').replace(/<[^>]*>/g, ''); // Strip HTML
    const sections = content.split(/\n{2,}/).filter(s => s.trim().length > 30).slice(0, 8); // Max 8 pages

    // Extract images from blog content
    const imgRegex = /https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp)[^\s"'<>]*/gi;
    const contentImages = (blog.content || '').match(imgRegex) || [];
    const allImages = [coverImage, ...contentImages].filter(Boolean);

    // Build story pages
    const storyPages = [];

    // Cover page
    storyPages.push(`
      <amp-story-page id="cover">
        <amp-story-grid-layer template="fill">
          <amp-img src="${coverImage}" width="720" height="1280" layout="fill" alt="${title}"></amp-img>
        </amp-story-grid-layer>
        <amp-story-grid-layer template="vertical" class="bottom">
          <div class="cover-overlay">
            <h1 class="cover-title">${escapeHtml(title)}</h1>
            <div class="cover-author">
              <amp-img src="${authorAvatar}" width="36" height="36" layout="fixed" class="author-avatar"></amp-img>
              <span>${escapeHtml(authorName)}</span>
            </div>
          </div>
        </amp-story-grid-layer>
      </amp-story-page>`);

    // Content pages (max 7 more)
    sections.forEach((section, i) => {
      const text = section.trim().substring(0, 200);
      const bgImage = allImages[(i + 1) % allImages.length] || coverImage;
      const pageId = `page-${i + 1}`;

      storyPages.push(`
      <amp-story-page id="${pageId}">
        <amp-story-grid-layer template="fill">
          <amp-img src="${bgImage}" width="720" height="1280" layout="fill" alt=""></amp-img>
        </amp-story-grid-layer>
        <amp-story-grid-layer template="vertical" class="content-layer">
          <div class="text-block">
            <p>${escapeHtml(text)}</p>
          </div>
        </amp-story-grid-layer>
      </amp-story-page>`);
    });

    // CTA page
    storyPages.push(`
      <amp-story-page id="cta">
        <amp-story-grid-layer template="fill">
          <amp-img src="${coverImage}" width="720" height="1280" layout="fill" alt=""></amp-img>
        </amp-story-grid-layer>
        <amp-story-grid-layer template="vertical" class="content-layer">
          <div class="cta-block">
            <h2>Read the Full Article</h2>
            <p>${escapeHtml(description.substring(0, 120))}</p>
          </div>
        </amp-story-grid-layer>
        <amp-story-page-outlink layout="nodisplay">
          <a href="${url}">Read on CYBEV</a>
        </amp-story-page-outlink>
      </amp-story-page>`);

    // Build full AMP HTML
    const ampHtml = `<!doctype html>
<html amp lang="en">
<head>
  <meta charset="utf-8">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
  <title>${escapeHtml(title)} | CYBEV Story</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${storyUrl}">
  <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
  <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;animation:none}</style></noscript>
  <style amp-custom>
    amp-story { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .bottom { justify-content: flex-end; padding: 0 24px 60px; }
    .cover-overlay { background: linear-gradient(transparent, rgba(0,0,0,0.8)); padding: 40px 24px 30px; margin: 0 -24px -60px; }
    .cover-title { color: #fff; font-size: 28px; font-weight: 800; line-height: 1.2; margin: 0 0 16px; text-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    .cover-author { display: flex; align-items: center; gap: 10px; color: #fff; font-size: 14px; font-weight: 500; }
    .author-avatar { border-radius: 50%; overflow: hidden; }
    .content-layer { justify-content: flex-end; padding: 0 20px 80px; }
    .text-block { background: rgba(0,0,0,0.75); border-radius: 16px; padding: 24px; backdrop-filter: blur(10px); }
    .text-block p { color: #fff; font-size: 18px; line-height: 1.6; margin: 0; }
    .cta-block { background: rgba(124,58,237,0.9); border-radius: 16px; padding: 32px; text-align: center; }
    .cta-block h2 { color: #fff; font-size: 26px; margin: 0 0 12px; }
    .cta-block p { color: rgba(255,255,255,0.9); font-size: 16px; margin: 0; line-height: 1.5; }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${storyUrl}" },
    "headline": "${escapeJson(title)}",
    "image": "${coverImage}",
    "datePublished": "${publishedDate}",
    "dateModified": "${blog.updatedAt ? new Date(blog.updatedAt).toISOString() : publishedDate}",
    "author": { "@type": "Person", "name": "${escapeJson(authorName)}" },
    "publisher": {
      "@type": "Organization",
      "name": "CYBEV",
      "logo": { "@type": "ImageObject", "url": "https://cybev.io/logo.png" }
    }
  }
  </script>
</head>
<body>
  <amp-story
    standalone
    title="${escapeHtml(title)}"
    publisher="CYBEV"
    publisher-logo-src="https://cybev.io/logo.png"
    poster-portrait-src="${coverImage}"
  >
    ${storyPages.join('\n')}
  </amp-story>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(ampHtml);
  } catch (err) {
    console.error('Web Story error:', err);
    res.status(500).send('Error generating story');
  }
});

// ==========================================
// GET /api/web-stories - List available stories
// ==========================================
router.get('/', async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const blogs = await Blog.find({
      status: 'published',
      isDeleted: { $ne: true },
      $or: [
        { coverImage: { $exists: true, $ne: '' } },
        { featuredImage: { $exists: true, $ne: '' } },
        { thumbnail: { $exists: true, $ne: '' } }
      ]
    })
    .select('title slug coverImage featuredImage thumbnail seo category createdAt author')
    .populate('author', 'name username avatar displayName')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

    const stories = blogs.map(blog => ({
      id: blog._id,
      title: blog.seo?.metaTitle || blog.title,
      image: blog.coverImage || blog.featuredImage || blog.thumbnail,
      author: blog.author?.displayName || blog.author?.name || 'CYBEV',
      category: blog.category,
      storyUrl: `https://api.cybev.io/api/web-stories/${blog._id}`,
      blogUrl: `https://cybev.io/blog/${blog._id}`,
      createdAt: blog.createdAt
    }));

    res.json({ ok: true, stories, page, total: stories.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// GET /api/web-stories/sitemap.xml - Web Stories sitemap
// ==========================================
router.get('/sitemap.xml', async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const blogs = await Blog.find({
      status: 'published',
      isDeleted: { $ne: true },
      $or: [
        { coverImage: { $exists: true, $ne: '' } },
        { featuredImage: { $exists: true, $ne: '' } }
      ]
    }).select('_id updatedAt createdAt').sort({ createdAt: -1 }).limit(500).lean();

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const blog of blogs) {
      const lastmod = (blog.updatedAt || blog.createdAt || new Date()).toISOString().split('T')[0];
      xml += `  <url>\n    <loc>https://api.cybev.io/api/web-stories/${blog._id}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n`;
    }
    xml += '</urlset>';

    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJson(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

module.exports = router;
