// ============================================
// FILE: routes/content-hub.routes.js
// Unified Content Controller (Blog, Post, LiveStream, Vlog)
// Soft-delete + restore + trash listing
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// ---------------------------
// Auth
// ---------------------------
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

const getUserId = (req) => req.user?.id || req.user?.userId || req.user?._id;

// ---------------------------
// Model helpers (safe)
// ---------------------------
const safeRequire = (p) => {
  try { return require(p); } catch (e) { return null; }
};

const Blog = safeRequire('../models/blog.model');
const Post = safeRequire('../models/post.model');
const Vlog = safeRequire('../models/vlog.model');
const LiveStream = safeRequire('../models/livestream.model');

const isAdmin = (req) => req.user?.role === 'admin';

const softDeleteDoc = async (doc, userId) => {
  doc.isDeleted = true;
  doc.deletedAt = new Date();
  doc.deletedBy = userId || null;
  await doc.save();
};

const restoreDoc = async (doc) => {
  doc.isDeleted = false;
  doc.deletedAt = null;
  doc.deletedBy = null;
  await doc.save();
};

// Resolve ID to (type, doc) with fallbacks used in CYBEV feed
const resolveContent = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const oid = new mongoose.Types.ObjectId(id);

  // 1) Blog by _id
  if (Blog) {
    const blog = await Blog.findById(oid);
    if (blog) return { type: 'blog', doc: blog };
    // Blog by linkage
    const blog2 = await Blog.findOne({ $or: [{ liveStreamId: id }, { feedPostId: id }, { liveStreamId: oid }, { feedPostId: oid }] });
    if (blog2) return { type: 'blog', doc: blog2 };
  }

  // 2) LiveStream by _id
  if (LiveStream) {
    const stream = await LiveStream.findById(oid);
    if (stream) return { type: 'live', doc: stream };
  }

  // 3) Post by _id
  if (Post) {
    const post = await Post.findById(oid);
    if (post) return { type: 'post', doc: post };
  }

  // 4) Vlog by _id
  if (Vlog) {
    const vlog = await Vlog.findById(oid);
    if (vlog) return { type: 'vlog', doc: vlog };
  }

  return null;
};

// ---------------------------
// GET /api/content-hub/:id
// ---------------------------
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const resolved = await resolveContent(req.params.id);
    if (!resolved) return res.status(404).json({ ok: false, error: 'Content not found' });
    return res.json({ ok: true, type: resolved.type, item: resolved.doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------
// DELETE /api/content-hub/:id  (soft delete)
// ---------------------------
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const resolved = await resolveContent(req.params.id);
    if (!resolved) return res.status(404).json({ ok: false, error: 'Content not found' });

    const doc = resolved.doc;
    // ownership checks per type
    const ownerCandidates = [
      doc.author, doc.authorId, doc.user, doc.userId, doc.host, doc.streamer
    ].filter(Boolean).map(x => x.toString());

    const isOwner = userId && ownerCandidates.includes(userId.toString());
    if (!isOwner && !isAdmin(req)) return res.status(403).json({ ok: false, error: 'Not authorized' });

    // If deleting a livestream: also soft-delete linked blogs (published stream posts)
    if (resolved.type === 'live' && Blog) {
      await Blog.updateMany(
        { $or: [{ liveStreamId: doc._id.toString() }, { liveStreamId: doc._id }] },
        { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId || null } }
      );
    }

    await softDeleteDoc(doc, userId);
    return res.json({ ok: true, type: resolved.type, id: doc._id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------
// POST /api/content-hub/:id/restore
// ---------------------------
router.post('/:id/restore', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const resolved = await resolveContent(req.params.id);
    if (!resolved) return res.status(404).json({ ok: false, error: 'Content not found' });

    const doc = resolved.doc;
    const ownerCandidates = [
      doc.author, doc.authorId, doc.user, doc.userId, doc.host, doc.streamer
    ].filter(Boolean).map(x => x.toString());
    const isOwner = userId && ownerCandidates.includes(userId.toString());
    if (!isOwner && !isAdmin(req)) return res.status(403).json({ ok: false, error: 'Not authorized' });

    await restoreDoc(doc);
    // restore linked blogs if livestream
    if (resolved.type === 'live' && Blog) {
      await Blog.updateMany(
        { $or: [{ liveStreamId: doc._id.toString() }, { liveStreamId: doc._id }] },
        { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }
      );
    }

    return res.json({ ok: true, type: resolved.type, id: doc._id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------
// GET /api/content-hub/trash (current user's deleted items)
// ---------------------------
router.get('/trash/list', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

    const results = { blogs: [], posts: [], vlogs: [], live: [] };

    if (Blog) results.blogs = await Blog.find({ deletedBy: userId, isDeleted: true }).sort({ deletedAt: -1 }).limit(limit).lean();
    if (Post) results.posts = await Post.find({ deletedBy: userId, isDeleted: true }).sort({ deletedAt: -1 }).limit(limit).lean();
    if (Vlog) results.vlogs = await Vlog.find({ deletedBy: userId, isDeleted: true }).sort({ deletedAt: -1 }).limit(limit).lean();
    if (LiveStream) results.live = await LiveStream.find({ deletedBy: userId, isDeleted: true }).sort({ deletedAt: -1 }).limit(limit).lean();

    return res.json({ ok: true, trash: results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
