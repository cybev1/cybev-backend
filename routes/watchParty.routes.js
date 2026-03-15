// ============================================
// FILE: watchParty.routes.js
// PATH: /routes/watchParty.routes.js
// VERSION: v2.3.0
// CYBEV Watch Party v2.3 — Guest Access (no login required)
// FIXES: Guest viewers, optional auth on join/chat/react,
//        Thumbnail in feed publish, toString on IDs
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

// Optional auth — sets req.user if token present, otherwise req.user = null (guest)
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { req.user = null; return next(); }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev_secret_key_2024' || 'cybev-secret-key');
    req.user = decoded;
    req.user.id = decoded.userId || decoded.id;
    // Try to load full user if verifyToken does DB lookup
    const User = require('../models/user.model');
    User.findById(req.user.id).select('-password').then(u => {
      if (u) { req.user.id = u._id; req.user.isAdmin = u.isAdmin; }
      next();
    }).catch(() => next());
  } catch {
    req.user = null;
    next();
  }
};
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
        const thumbnail = coverImage || videoSource.thumbnail || '';
        const wpLink = `${FRONTEND_URL}/watch-party/${party._id}`;
        const feedPost = new Blog({
          title: `🎬 Watch Party: ${title}`, content: `<p>${description || title}</p>${thumbnail ? `<img src="${thumbnail}" alt="${title}" style="width:100%;border-radius:8px;margin:8px 0" />` : ''}<p><a href="${wpLink}">Join the Watch Party →</a></p>`,
          excerpt: description || `Join ${user.displayName || user.username}'s watch party!`,
          author: req.user.id, authorName: user.displayName || user.username || 'CYBEV User',
          category: 'entertainment', tags: ['watch-party', 'live', ...(tags || [])],
          featuredImage: thumbnail, status: 'published'
        });
        await feedPost.save();
        party.publishedToFeed = true; party.feedPostId = feedPost._id; await party.save();
      } catch (e) { console.log('⚠️ Feed publish failed:', e.message); }
    }
    res.status(201).json(party);
  } catch (err) { console.error('Create error:', err); res.status(500).json({ error: 'Failed to create' }); }
});

// PUT /:id — Edit watch party (host only, works while live)
router.put('/:id', auth, async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.host.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'Host only' });

    const { title, description, videoSource, coverImage, privacy, maxParticipants, tags } = req.body;

    if (title !== undefined) party.title = title;
    if (description !== undefined) party.description = description;
    if (coverImage !== undefined) party.coverImage = coverImage;
    if (privacy !== undefined) party.privacy = privacy;
    if (maxParticipants !== undefined) party.maxParticipants = maxParticipants;
    if (tags !== undefined) party.tags = tags;

    // Allow changing video source mid-party (e.g. switch stream URL)
    if (videoSource) {
      if (videoSource.url) party.videoSource.url = videoSource.url;
      if (videoSource.type) party.videoSource.type = videoSource.type;
      if (videoSource.thumbnail) party.videoSource.thumbnail = videoSource.thumbnail;
      if (videoSource.muxPlaybackId) party.videoSource.muxPlaybackId = videoSource.muxPlaybackId;
    }

    await party.save();
    await party.populate('host', 'username displayName avatar isVerified');
    console.log(`✏️ Watch Party edited: ${party.title} by ${req.user.id}`);
    res.json({ ok: true, party });
  } catch (err) { console.error('Edit error:', err); res.status(500).json({ error: 'Failed to update' }); }
});

// POST /:id/join — supports both logged-in users and guests
router.post('/:id/join', optionalAuth, async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.status === 'ended') return res.status(400).json({ error: 'Ended' });

    if (req.user) {
      // Authenticated user
      const existing = party.participants.find(p => p.user?.toString() === req.user.id.toString());
      if (existing) { existing.isActive = true; existing.joinedAt = new Date(); }
      else {
        const user = await User.findById(req.user.id).select('username displayName avatar');
        party.participants.push({ user: req.user.id, username: user?.displayName || user?.username || 'User', avatar: user?.avatar || '', role: 'viewer', isActive: true });
      }
    }
    // Guests don't get added to participants array — they're tracked via socket/viewer count only

    party.totalViews += 1;
    const active = party.participants.filter(p => p.isActive).length + (party.boostedViewers || 0) + (party.syntheticEngagement?.totalViews || 0);
    if (active > party.peakViewers) party.peakViewers = active;
    await party.save();
    res.json({ message: 'Joined', playbackState: party.playbackState, activeViewers: active, isGuest: !req.user });
  } catch (err) { res.status(500).json({ error: 'Failed to join' }); }
});

// POST /:id/leave
router.post('/:id/leave', optionalAuth, async (req, res) => {
  try {
    if (!req.user) return res.json({ message: 'Left' }); // Guests just leave
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

    // Set 30-day auto-deletion date
    party.deleteAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Calculate duration
    const durationMs = party.endedAt - (party.startedAt || party.createdAt);
    const durationMin = Math.round(durationMs / 60000);
    const durationStr = durationMin >= 60 ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m` : `${durationMin}m`;

    // Auto-publish recap to feed if not already published
    if (!party.publishedToFeed && Blog) {
      try {
        const user = await User.findById(req.user.id).select('username displayName');
        const thumbnail = party.coverImage || party.videoSource?.thumbnail || '';
        const totalViewers = party.peakViewers || party.totalViews || 0;
        const wpLink = `${FRONTEND_URL}/watch-party/${party._id}`;

        const recap = new Blog({
          title: `🎬 Watch Party Recap: ${party.title}`,
          content: `<p><strong>${party.title}</strong> has ended!</p>` +
            `<p>📊 <strong>${totalViewers.toLocaleString()}</strong> peak viewers • ⏱️ Duration: <strong>${durationStr}</strong> • 💬 <strong>${(party.chatMessages || []).length}</strong> chat messages</p>` +
            (thumbnail ? `<img src="${thumbnail}" alt="${party.title}" style="width:100%;border-radius:8px;margin:12px 0" />` : '') +
            `<p>${party.description || ''}</p>` +
            `<p><a href="${wpLink}">View Watch Party →</a></p>`,
          excerpt: `${party.title} — ${totalViewers.toLocaleString()} viewers, ${durationStr}`,
          author: req.user.id, authorName: user?.displayName || user?.username || 'CYBEV User',
          category: 'entertainment', tags: ['watch-party', 'recap'],
          featuredImage: thumbnail, status: 'published'
        });
        await recap.save();
        party.publishedToFeed = true; party.feedPostId = recap._id;
        console.log(`📝 Auto-published recap for: ${party.title}`);
      } catch (e) { console.log('⚠️ Recap publish failed:', e.message); }
    }

    await party.save();
    res.json({ message: 'Ended', party, deleteAfter: party.deleteAfter });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/chat — guests can chat as "Guest"
router.post('/:id/chat', optionalAuth, async (req, res) => {
  try {
    const { text, guestName } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text required' });
    const party = await WatchParty.findById(req.params.id);
    if (!party || party.status === 'ended') return res.status(404).json({ error: 'Not found' });

    let msg;
    if (req.user) {
      const user = await User.findById(req.user.id).select('username displayName avatar');
      msg = { user: req.user.id, username: user?.displayName || user?.username, avatar: user?.avatar || '', text: text.trim(), type: 'message' };
    } else {
      msg = { username: guestName || 'Guest', text: text.trim(), type: 'message', isGuest: true };
    }
    party.chatMessages.push(msg);
    if (party.chatMessages.length > 500) party.chatMessages = party.chatMessages.slice(-500);
    await party.save();
    res.json(msg);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/react — guests can react
router.post('/:id/react', optionalAuth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const ok = ['🔥','❤️','😂','👏','🎉','😮','💯','🙌','😍','💀','🤣','👀'];
    if (!ok.includes(emoji)) return res.status(400).json({ error: 'Invalid' });
    const party = await WatchParty.findById(req.params.id);
    if (!party || party.status === 'ended') return res.status(404).json({ error: 'Not found' });
    party.reactions.push({ user: req.user?.id || null, emoji });
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
      const thumbnail = party.coverImage || party.videoSource?.thumbnail || '';
      const wpLink = `${FRONTEND_URL}/watch-party/${party._id}`;
      const fp = new Blog({
        title: `🎬 Watch Party: ${party.title}`,
        content: `<p>${party.description || party.title}</p>${thumbnail ? `<img src="${thumbnail}" alt="${party.title}" style="width:100%;border-radius:8px;margin:8px 0" />` : ''}<p><a href="${wpLink}">Join the Watch Party →</a></p>`,
        excerpt: party.description || `Join ${user?.displayName || user?.username}'s watch party!`,
        author: req.user.id, authorName: user?.displayName || user?.username || 'CYBEV User',
        category: 'entertainment', tags: ['watch-party', 'live'],
        featuredImage: thumbnail, status: 'published'
      });
      await fp.save();
      party.publishedToFeed = true; party.feedPostId = fp._id;
    }
    if (groups && Array.isArray(groups)) party.publishedToGroups = [...new Set([...(party.publishedToGroups || []), ...groups])];
    await party.save();
    res.json({ ok: true, message: 'Published!', feedPostId: party.feedPostId });
  } catch (err) { console.error('Publish error:', err); res.status(500).json({ error: 'Failed' }); }
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

// POST /:id/share — Track share (guests can share too)
router.post('/:id/share', optionalAuth, async (req, res) => {
  try {
    await WatchParty.findByIdAndUpdate(req.params.id, { $inc: { shareCount: 1 } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/boost — Admin: Smart boost with traffic simulation
let boostService;
try { boostService = require('../services/boostSimulation.service'); } catch (e) { console.log('⚠️ Boost simulation service not found, using raw boost'); }

router.post('/:id/boost', auth, async (req, res) => {
  try {
    const { viewers = 0, comments = [], reactions = [], viewCount = 0 } = req.body;
    const user = await User.findById(req.user.id).select('isAdmin role');
    if (!user?.isAdmin && user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Not found' });

    // ─── Use smart simulation if viewers > 0 ───
    if (viewers > 0 && boostService) {
      const config = await boostService.startSimulation(req.params.id, viewers);
      console.log(`🎯 Smart boost started: ${party.title} → peak ${config.peakTarget}, phase: ${config.phase}`);
    } else if (viewers > 0) {
      // Fallback: raw increment
      party.boostedViewers = (party.boostedViewers || 0) + viewers;
    }

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
    const bc = party.boostConfig || {};
    const simulated = bc.isActive ? (bc.currentSimulated || 0) : (party.boostedViewers || 0);
    const total = party.participants.filter(p => p.isActive).length + simulated + (party.syntheticEngagement?.totalViews || 0);
    res.json({
      ok: true,
      message: `Boosted! ${viewers} viewers, ${comments.length} comments, ${reactions.length} reactions`,
      totalViewers: total,
      simulation: bc.isActive ? { phase: bc.phase, peak: bc.peakTarget, current: bc.currentSimulated } : null
    });
  } catch (err) { console.error('Boost error:', err); res.status(500).json({ error: 'Failed' }); }
});

// POST /:id/boost/reduce — Admin: Reduce boost by percentage
router.post('/:id/boost/reduce', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('isAdmin role');
    if (!user?.isAdmin && user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { percent = 25 } = req.body;
    if (!boostService) return res.status(500).json({ error: 'Boost service not available' });
    const config = await boostService.reduceSimulation(req.params.id, percent);
    res.json({ ok: true, message: `Reduced by ${percent}%`, boost: config });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST /:id/boost/stop — Admin: Stop/remove all boost
router.post('/:id/boost/stop', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('isAdmin role');
    if (!user?.isAdmin && user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (!boostService) {
      // Fallback: just zero out
      await WatchParty.findByIdAndUpdate(req.params.id, { boostedViewers: 0, 'syntheticEngagement.totalViews': 0 });
      return res.json({ ok: true, message: 'Boost cleared' });
    }
    const result = await boostService.stopSimulation(req.params.id);
    res.json({ ok: true, message: 'Boost stopped', ...result });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// GET /:id/boost/status — Admin: Get current boost simulation status
router.get('/:id/boost/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('isAdmin role');
    if (!user?.isAdmin && user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (!boostService) {
      const party = await WatchParty.findById(req.params.id).select('boostConfig boostedViewers title status').lean();
      return res.json({ ok: true, ...party });
    }
    const status = await boostService.getSimulationStatus(req.params.id);
    res.json({ ok: true, ...status });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// GET /user/my-parties
router.get('/user/my-parties', auth, async (req, res) => {
  try {
    const parties = await WatchParty.find({ host: req.user.id }).select('-chatMessages -reactions').sort({ createdAt: -1 }).limit(50).lean();
    res.json(parties);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
