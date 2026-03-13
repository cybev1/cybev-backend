// ============================================
// FILE: watchParty.routes.js
// PATH: /routes/watchParty.routes.js
// VERSION: v2.1.0
// CYBEV Watch Party v2.1 — Publish, Invite, Boost, Share
// FIXES: 403 on End/Publish (ObjectId comparison),
//        Missing authorName on feed publish,
//        Invite accepts userId + userIds
// UPDATED: 2026-03-13
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
let auth;
try { auth = require('../middleware/verifyToken'); } catch (e) {
  try { auth = require('../middleware/auth.middleware'); } catch (e2) {
    try { const m = require('../middleware/auth'); auth = m.authenticateToken || m; } catch (e3) {
      auth = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try { const jwt = require('jsonwebtoken'); req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024'); req.user.id = req.user.userId || req.user.id; next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
      };
    }
  }
}
const WatchParty = require('../models/watchParty.model');
const User = require('../models/user.model');
let Blog, Notification;
try { Blog = require('../models/blog.model'); } catch (e) {}
try { Notification = require('../models/notification.model'); } catch (e) {}
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://cybev.io';
console.log('🎬 Watch Party routes v2.0 loaded — publish, invite, boost, share');

// GET / — List
router.get('/', async (req, res) => {
  try {
    const { status = 'live', privacy, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (status === 'live') filter.status = 'live';
    else if (status === 'scheduled') filter.status = 'scheduled';
    else if (status === 'all') filter.status = { $in: ['live', 'scheduled'] };
    else filter.status = status;
    if (privacy) filter.privacy = privacy;
    else filter.privacy = { $in: ['public', 'followers'] };
    const [parties, total] = await Promise.all([
      WatchParty.find(filter).populate('host', 'username displayName avatar isVerified').select('-chatMessages -reactions').sort({ status: 1, startedAt: -1, scheduledAt: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      WatchParty.countDocuments(filter)
    ]);
    const enriched = parties.map(p => ({ ...p, activeViewers: (p.participants || []).filter(v => v.isActive).length + (p.boostedViewers || 0) + (p.syntheticEngagement?.totalViews || 0) }));
    res.json({ parties: enriched, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch' }); }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id).populate('host', 'username displayName avatar isVerified').populate('participants.user', 'username displayName avatar isVerified').lean();
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.chatMessages) party.chatMessages = party.chatMessages.slice(-100);
    party.activeViewers = (party.participants || []).filter(v => v.isActive).length + (party.boostedViewers || 0) + (party.syntheticEngagement?.totalViews || 0);
    res.json(party);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch' }); }
});

// POST / — Create
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, videoSource, privacy, maxParticipants, scheduledAt, coverImage, tags, publishToFeed } = req.body;
    if (!title || !videoSource || !videoSource.type) return res.status(400).json({ error: 'Title and video source required' });
    const user = await User.findById(req.user.id).select('username displayName avatar');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const party = new WatchParty({
      title, description: description || '', host: req.user.id, videoSource,
      privacy: privacy || 'public', maxParticipants: maxParticipants || 500,
      scheduledAt: scheduledAt || null, status: scheduledAt ? 'scheduled' : 'live', startedAt: scheduledAt ? null : new Date(),
      coverImage: coverImage || videoSource.thumbnail || '', tags: tags || [],
      participants: [{ user: req.user.id, username: user.displayName || user.username, avatar: user.avatar || '', role: 'host', isActive: true }]
    });
    await party.save();
    await party.populate('host', 'username displayName avatar isVerified');
    // Auto-publish to feed
    if (publishToFeed && Blog) {
      try {
        const feedPost = new Blog({
          title: `🎬 Watch Party: ${title}`, content: `<p>${description || title}</p><p><a href="${FRONTEND_URL}/watch-party/${party._id}">Join the Watch Party →</a></p>`,
          excerpt: description || `Join ${user.displayName || user.username}'s watch party!`,
          author: req.user.id, authorName: user.displayName || user.username || 'CYBEV User',
          category: 'entertainment', tags: ['watch-party', 'live', ...(tags || [])],
          featuredImage: coverImage || videoSource.thumbnail || '', status: 'published'
        });
        await feedPost.save();
        party.publishedToFeed = true; party.feedPostId = feedPost._id; await party.save();
      } catch (e) { console.log('⚠️ Feed publish failed:', e.message); }
    }
    res.status(201).json(party);
  } catch (err) { console.error('Create error:', err); res.status(500).json({ error: 'Failed to create' }); }
});

// POST /:id/join
router.post('/:id/join', auth, async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.status === 'ended') return res.status(400).json({ error: 'Ended' });
    const existing = party.participants.find(p => p.user?.toString() === req.user.id.toString());
    if (existing) { existing.isActive = true; existing.joinedAt = new Date(); }
    else {
      const user = await User.findById(req.user.id).select('username displayName avatar');
      party.participants.push({ user: req.user.id, username: user?.displayName || user?.username || 'User', avatar: user?.avatar || '', role: 'viewer', isActive: true });
    }
    party.totalViews += 1;
    const active = party.participants.filter(p => p.isActive).length + (party.boostedViewers || 0);
    if (active > party.peakViewers) party.peakViewers = active;
    await party.save();
    res.json({ message: 'Joined', playbackState: party.playbackState, activeViewers: active });
  } catch (err) { res.status(500).json({ error: 'Failed to join' }); }
});

// POST /:id/leave
router.post('/:id/leave', auth, async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });
    const p = party.participants.find(p => p.user?.toString() === req.user.id.toString());
    if (p) p.isActive = false;
    await party.save();
    res.json({ message: 'Left' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/end
router.post('/:id/end', auth, async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.host.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'Host only' });
    party.status = 'ended'; party.endedAt = new Date();
    party.participants.forEach(p => { p.isActive = false; });
    await party.save();
    res.json({ message: 'Ended', party });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/chat
router.post('/:id/chat', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text required' });
    const party = await WatchParty.findById(req.params.id);
    if (!party || party.status === 'ended') return res.status(404).json({ error: 'Not found' });
    const user = await User.findById(req.user.id).select('username displayName avatar');
    const msg = { user: req.user.id, username: user?.displayName || user?.username, avatar: user?.avatar || '', text: text.trim(), type: 'message' };
    party.chatMessages.push(msg);
    if (party.chatMessages.length > 500) party.chatMessages = party.chatMessages.slice(-500);
    await party.save();
    res.json(msg);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/react
router.post('/:id/react', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const ok = ['🔥','❤️','😂','👏','🎉','😮','💯','🙌','😍','💀','🤣','👀'];
    if (!ok.includes(emoji)) return res.status(400).json({ error: 'Invalid' });
    const party = await WatchParty.findById(req.params.id);
    if (!party || party.status === 'ended') return res.status(404).json({ error: 'Not found' });
    party.reactions.push({ user: req.user.id, emoji });
    if (party.reactions.length > 1000) party.reactions = party.reactions.slice(-1000);
    await party.save();
    res.json({ message: 'Added' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/publish — Publish to feed + groups
router.post('/:id/publish', auth, async (req, res) => {
  try {
    const { groups } = req.body;
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.host.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'Host only' });
    if (!party.publishedToFeed && Blog) {
      const user = await User.findById(req.user.id).select('username displayName');
      const fp = new Blog({
        title: `🎬 Watch Party: ${party.title}`,
        content: `<p>${party.description || party.title}</p><p><a href="${FRONTEND_URL}/watch-party/${party._id}">Join the Watch Party →</a></p>`,
        excerpt: party.description || `Join ${user?.displayName}'s watch party!`,
        author: req.user.id, authorName: user?.displayName || user?.username || 'CYBEV User',
        category: 'entertainment', tags: ['watch-party', 'live'],
        featuredImage: party.coverImage || '', status: 'published'
      });
      await fp.save();
      party.publishedToFeed = true; party.feedPostId = fp._id;
    }
    if (groups && Array.isArray(groups)) party.publishedToGroups = [...new Set([...(party.publishedToGroups || []), ...groups])];
    await party.save();
    res.json({ ok: true, message: 'Published!', feedPostId: party.feedPostId });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/invite — Invite users + send notifications
router.post('/:id/invite', auth, async (req, res) => {
  try {
    const { userIds, userId } = req.body;
    const ids = userIds?.length ? userIds : (userId ? [userId] : []);
    if (!ids.length) return res.status(400).json({ error: 'userIds or userId required' });
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });
    const inviter = await User.findById(req.user.id).select('username displayName');
    const name = inviter?.displayName || inviter?.username || 'Someone';
    const newInvites = ids.filter(uid => !party.invitedUsers.includes(uid));
    party.invitedUsers.push(...newInvites);
    await party.save();
    if (Notification && newInvites.length) {
      try {
        await Notification.insertMany(newInvites.map(uid => ({
          recipient: uid, sender: req.user.id, type: 'watch_party_invite',
          title: `${name} invited you to a Watch Party!`,
          message: `Join "${party.title}"`, link: `/watch-party/${party._id}`, read: false
        })));
      } catch (e) {}
    }
    res.json({ ok: true, invited: newInvites.length });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/share — Track share
router.post('/:id/share', auth, async (req, res) => {
  try {
    await WatchParty.findByIdAndUpdate(req.params.id, { $inc: { shareCount: 1 } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/boost — Admin: Add Special User engagement
router.post('/:id/boost', auth, async (req, res) => {
  try {
    const { viewers = 0, comments = [], reactions = [], viewCount = 0 } = req.body;
    const user = await User.findById(req.user.id).select('isAdmin role');
    if (!user?.isAdmin && user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (viewers > 0) party.boostedViewers = (party.boostedViewers || 0) + viewers;
    if (viewCount > 0) {
      if (!party.syntheticEngagement) party.syntheticEngagement = { totalComments: 0, totalReactions: 0, totalViews: 0 };
      party.syntheticEngagement.totalViews += viewCount;
    }
    if (comments.length > 0) {
      const sus = await User.find({ isSynthetic: true }).select('username displayName avatar').limit(comments.length).skip(Math.floor(Math.random() * 100));
      comments.forEach((text, i) => {
        const su = sus[i] || sus[0];
        if (su) party.chatMessages.push({ user: su._id, username: su.displayName || su.username, avatar: su.avatar || '', text, type: 'message', isSynthetic: true });
      });
      if (!party.syntheticEngagement) party.syntheticEngagement = { totalComments: 0, totalReactions: 0, totalViews: 0 };
      party.syntheticEngagement.totalComments += comments.length;
    }
    if (reactions.length > 0) {
      const sus = await User.find({ isSynthetic: true }).select('username displayName').limit(reactions.length).skip(Math.floor(Math.random() * 50));
      reactions.forEach((emoji, i) => {
        const su = sus[i] || sus[0];
        if (su) party.reactions.push({ user: su._id, username: su.displayName || su.username, emoji, isSynthetic: true });
      });
      if (!party.syntheticEngagement) party.syntheticEngagement = { totalComments: 0, totalReactions: 0, totalViews: 0 };
      party.syntheticEngagement.totalReactions += reactions.length;
    }
    if (party.chatMessages.length > 1000) party.chatMessages = party.chatMessages.slice(-1000);
    if (party.reactions.length > 2000) party.reactions = party.reactions.slice(-2000);
    await party.save();
    const total = party.participants.filter(p => p.isActive).length + (party.boostedViewers || 0) + (party.syntheticEngagement?.totalViews || 0);
    res.json({ ok: true, message: `Boosted! ${viewers} viewers, ${comments.length} comments, ${reactions.length} reactions`, totalViewers: total });
  } catch (err) { console.error('Boost error:', err); res.status(500).json({ error: 'Failed' }); }
});

// GET /user/my-parties
router.get('/user/my-parties', auth, async (req, res) => {
  try {
    const parties = await WatchParty.find({ host: req.user.id }).select('-chatMessages -reactions').sort({ createdAt: -1 }).limit(50).lean();
    res.json(parties);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
