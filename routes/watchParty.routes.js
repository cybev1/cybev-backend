// ============================================
// FILE: watchParty.routes.js
// PATH: /routes/watchParty.routes.js
// CYBEV Watch Party REST API
// ============================================
const express = require('express');
const router = express.Router();
const WatchParty = require('../models/watchParty.model');
const User = require('../models/user.model');
const auth = require('../middleware/auth');

// ─── GET /api/watch-party — List watch parties ───
router.get('/', async (req, res) => {
  try {
    const { status = 'live', privacy, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (status === 'live') filter.status = 'live';
    else if (status === 'scheduled') filter.status = 'scheduled';
    else if (status === 'all') filter.status = { $in: ['live', 'scheduled'] };
    else filter.status = status;

    // Only show public parties to non-auth users
    if (privacy) filter.privacy = privacy;
    else filter.privacy = { $in: ['public', 'followers'] };

    const [parties, total] = await Promise.all([
      WatchParty.find(filter)
        .populate('host', 'username displayName avatar isVerified')
        .select('-chatMessages -reactions')
        .sort({ status: 1, startedAt: -1, scheduledAt: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      WatchParty.countDocuments(filter)
    ]);

    // Attach active viewer count
    const enriched = parties.map(p => ({
      ...p,
      activeViewers: (p.participants || []).filter(v => v.isActive).length
    }));

    res.json({ parties: enriched, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Watch Party list error:', err);
    res.status(500).json({ error: 'Failed to fetch watch parties' });
  }
});

// ─── GET /api/watch-party/:id — Get party details ───
router.get('/:id', async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id)
      .populate('host', 'username displayName avatar isVerified')
      .populate('participants.user', 'username displayName avatar isVerified')
      .lean();

    if (!party) return res.status(404).json({ error: 'Watch party not found' });

    // Limit chat messages to last 100
    if (party.chatMessages) {
      party.chatMessages = party.chatMessages.slice(-100);
    }

    party.activeViewers = (party.participants || []).filter(v => v.isActive).length;
    res.json(party);
  } catch (err) {
    console.error('Watch Party get error:', err);
    res.status(500).json({ error: 'Failed to fetch watch party' });
  }
});

// ─── POST /api/watch-party — Create a watch party ───
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, videoSource, privacy, maxParticipants, scheduledAt, coverImage, tags } = req.body;

    if (!title || !videoSource || !videoSource.type) {
      return res.status(400).json({ error: 'Title and video source are required' });
    }

    const user = await User.findById(req.user.id).select('username displayName avatar');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const party = new WatchParty({
      title,
      description: description || '',
      host: req.user.id,
      videoSource,
      privacy: privacy || 'public',
      maxParticipants: maxParticipants || 50,
      scheduledAt: scheduledAt || null,
      status: scheduledAt ? 'scheduled' : 'live',
      startedAt: scheduledAt ? null : new Date(),
      coverImage: coverImage || videoSource.thumbnail || '',
      tags: tags || [],
      participants: [{
        user: req.user.id,
        username: user.displayName || user.username,
        avatar: user.avatar || '',
        role: 'host',
        isActive: true
      }]
    });

    await party.save();
    await party.populate('host', 'username displayName avatar isVerified');

    res.status(201).json(party);
  } catch (err) {
    console.error('Watch Party create error:', err);
    res.status(500).json({ error: 'Failed to create watch party' });
  }
});

// ─── POST /api/watch-party/:id/join — Join a party ───
router.post('/:id/join', auth, async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Watch party not found' });
    if (party.status === 'ended') return res.status(400).json({ error: 'This watch party has ended' });

    const activeCount = party.participants.filter(p => p.isActive).length;
    if (activeCount >= party.maxParticipants) {
      return res.status(400).json({ error: 'Watch party is full' });
    }

    // Check if already a participant
    const existing = party.participants.find(p => p.user.toString() === req.user.id);
    if (existing) {
      existing.isActive = true;
      existing.joinedAt = new Date();
    } else {
      const user = await User.findById(req.user.id).select('username displayName avatar');
      party.participants.push({
        user: req.user.id,
        username: user.displayName || user.username,
        avatar: user.avatar || '',
        role: 'viewer',
        isActive: true
      });
    }

    party.totalViews += 1;
    const currentActive = party.participants.filter(p => p.isActive).length;
    if (currentActive > party.peakViewers) party.peakViewers = currentActive;

    await party.save();
    res.json({ message: 'Joined watch party', playbackState: party.playbackState });
  } catch (err) {
    console.error('Watch Party join error:', err);
    res.status(500).json({ error: 'Failed to join watch party' });
  }
});

// ─── POST /api/watch-party/:id/leave — Leave a party ───
router.post('/:id/leave', auth, async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Watch party not found' });

    const participant = party.participants.find(p => p.user.toString() === req.user.id);
    if (participant) {
      participant.isActive = false;
    }

    await party.save();
    res.json({ message: 'Left watch party' });
  } catch (err) {
    console.error('Watch Party leave error:', err);
    res.status(500).json({ error: 'Failed to leave watch party' });
  }
});

// ─── POST /api/watch-party/:id/end — End a party (host only) ───
router.post('/:id/end', auth, async (req, res) => {
  try {
    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Watch party not found' });
    if (party.host.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only the host can end the party' });
    }

    party.status = 'ended';
    party.endedAt = new Date();
    party.participants.forEach(p => { p.isActive = false; });

    await party.save();
    res.json({ message: 'Watch party ended', party });
  } catch (err) {
    console.error('Watch Party end error:', err);
    res.status(500).json({ error: 'Failed to end watch party' });
  }
});

// ─── POST /api/watch-party/:id/chat — Send chat message (REST fallback) ───
router.post('/:id/chat', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message text is required' });

    const party = await WatchParty.findById(req.params.id);
    if (!party) return res.status(404).json({ error: 'Watch party not found' });
    if (party.status === 'ended') return res.status(400).json({ error: 'Watch party has ended' });

    const user = await User.findById(req.user.id).select('username displayName avatar');

    const message = {
      user: req.user.id,
      username: user.displayName || user.username,
      avatar: user.avatar || '',
      text: text.trim(),
      type: 'message'
    };

    party.chatMessages.push(message);

    // Keep only last 500 messages in DB
    if (party.chatMessages.length > 500) {
      party.chatMessages = party.chatMessages.slice(-500);
    }

    await party.save();
    res.json(message);
  } catch (err) {
    console.error('Watch Party chat error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ─── POST /api/watch-party/:id/react — Send reaction ───
router.post('/:id/react', auth, async (req, res) => {
  try {
    const { emoji, timestamp } = req.body;
    const allowedEmojis = ['🔥', '❤️', '😂', '👏', '🎉', '😮', '💯', '🙌', '😍', '💀', '🤣', '👀'];
    if (!emoji || !allowedEmojis.includes(emoji)) {
      return res.status(400).json({ error: 'Invalid emoji' });
    }

    const party = await WatchParty.findById(req.params.id);
    if (!party || party.status === 'ended') {
      return res.status(404).json({ error: 'Watch party not found or ended' });
    }

    party.reactions.push({
      user: req.user.id,
      emoji,
      timestamp: timestamp || 0
    });

    // Keep only last 1000 reactions
    if (party.reactions.length > 1000) {
      party.reactions = party.reactions.slice(-1000);
    }

    await party.save();
    res.json({ message: 'Reaction added' });
  } catch (err) {
    console.error('Watch Party react error:', err);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// ─── GET /api/watch-party/user/my-parties — Get user's parties ───
router.get('/user/my-parties', auth, async (req, res) => {
  try {
    const parties = await WatchParty.find({ host: req.user.id })
      .select('-chatMessages -reactions')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(parties);
  } catch (err) {
    console.error('My parties error:', err);
    res.status(500).json({ error: 'Failed to fetch your parties' });
  }
});

module.exports = router;
