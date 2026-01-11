// ============================================
// FILE: meet.routes.js
// PATH: cybev-backend/routes/meet.routes.js
// PURPOSE: Video Conferencing - Jitsi (free) + Daily.co (paid)
// VERSION: 1.0.0
// GITHUB: https://github.com/cybev1/cybev-backend
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key'); } catch {}
  }
  next();
};

// Video Providers Config - Jitsi is FREE, Daily.co optional
const PROVIDERS = {
  jitsi: { domain: process.env.JITSI_DOMAIN || 'meet.jit.si', free: true },
  daily: { apiKey: process.env.DAILY_API_KEY, domain: 'cybev.daily.co', free: false }
};

const getProvider = () => PROVIDERS.daily.apiKey ? 'daily' : 'jitsi';

// Meeting Schema
const meetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  roomUrl: String,
  title: { type: String, default: 'Meeting' },
  description: String,
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['instant', 'scheduled'], default: 'instant' },
  provider: { type: String, enum: ['jitsi', 'daily'], default: 'jitsi' },
  schedule: { startTime: Date, endTime: Date, timezone: String },
  settings: {
    waitingRoom: Boolean,
    password: String,
    maxParticipants: { type: Number, default: 100 },
    muteOnEntry: Boolean,
    videoOnEntry: { type: Boolean, default: true }
  },
  participants: [{
    user: mongoose.Schema.Types.ObjectId,
    name: String,
    email: String,
    role: { type: String, default: 'participant' },
    joinedAt: Date,
    leftAt: Date
  }],
  status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled' },
  startedAt: Date,
  endedAt: Date,
  duration: Number,
  createdAt: { type: Date, default: Date.now }
});

const Meeting = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);

// Daily.co API helper
async function dailyRequest(endpoint, method = 'GET', body = null) {
  if (!PROVIDERS.daily.apiKey) return null;
  try {
    const res = await fetch(`https://api.daily.co/v1${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PROVIDERS.daily.apiKey}` },
      body: body ? JSON.stringify(body) : null
    });
    return res.json();
  } catch { return null; }
}

// GET /api/meet/providers
router.get('/providers', (req, res) => {
  res.json({
    ok: true,
    providers: [
      { id: 'jitsi', name: 'Jitsi Meet', available: true, free: true },
      { id: 'daily', name: 'Daily.co', available: !!PROVIDERS.daily.apiKey, free: false }
    ],
    active: getProvider()
  });
});

// GET /api/meet/my
router.get('/my', auth, async (req, res) => {
  try {
    const now = new Date();
    const upcoming = await Meeting.find({
      $or: [{ host: req.user.id }, { 'participants.user': req.user.id }],
      status: { $in: ['scheduled', 'live'] }
    }).sort({ 'schedule.startTime': 1 }).limit(10).populate('host', 'name username avatar');

    const recent = await Meeting.find({
      $or: [{ host: req.user.id }, { 'participants.user': req.user.id }],
      status: 'ended'
    }).sort({ endedAt: -1 }).limit(10).populate('host', 'name username avatar');

    res.json({ ok: true, upcoming, recent });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/instant
router.post('/instant', auth, async (req, res) => {
  try {
    const provider = getProvider();
    const roomId = `cybev-${crypto.randomBytes(6).toString('hex')}`;
    let roomUrl = `https://${PROVIDERS.jitsi.domain}/${roomId}`;

    if (provider === 'daily' && PROVIDERS.daily.apiKey) {
      const daily = await dailyRequest('/rooms', 'POST', {
        name: roomId,
        privacy: 'public',
        properties: { max_participants: 100, enable_chat: true, enable_screenshare: true }
      });
      if (daily?.url) roomUrl = daily.url;
    }

    const User = mongoose.models.User;
    const user = await User?.findById(req.user.id).select('name username');

    const meeting = new Meeting({
      roomId, roomUrl,
      title: `${user?.name || 'User'}'s Meeting`,
      host: req.user.id,
      type: 'instant',
      provider,
      status: 'live',
      startedAt: new Date(),
      participants: [{ user: req.user.id, name: user?.name, role: 'host', joinedAt: new Date() }]
    });
    await meeting.save();

    res.json({ ok: true, roomId, roomUrl, provider, meeting });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/schedule
router.post('/schedule', auth, async (req, res) => {
  try {
    const { title, description, startTime, endTime, timezone, participants, settings } = req.body;
    if (!startTime) return res.status(400).json({ ok: false, error: 'Start time required' });

    const provider = getProvider();
    const roomId = `cybev-${crypto.randomBytes(6).toString('hex')}`;
    let roomUrl = `https://${PROVIDERS.jitsi.domain}/${roomId}`;

    if (provider === 'daily' && PROVIDERS.daily.apiKey) {
      const daily = await dailyRequest('/rooms', 'POST', {
        name: roomId,
        privacy: 'public',
        properties: { nbf: Math.floor(new Date(startTime).getTime() / 1000) - 600 }
      });
      if (daily?.url) roomUrl = daily.url;
    }

    const meeting = new Meeting({
      roomId, roomUrl, title: title || 'Scheduled Meeting', description,
      host: req.user.id, type: 'scheduled', provider,
      schedule: { startTime: new Date(startTime), endTime: endTime ? new Date(endTime) : null, timezone },
      settings, status: 'scheduled',
      participants: (participants || []).map(p => ({ name: p.name, email: p.email, role: 'participant' }))
    });
    await meeting.save();

    res.json({ ok: true, meeting, roomId, roomUrl, joinUrl: `${process.env.FRONTEND_URL || 'https://cybev.io'}/meet/${roomId}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/join/:roomId
router.post('/join/:roomId', optionalAuth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });

    let userName = req.body.name || 'Guest';
    if (req.user) {
      const User = mongoose.models.User;
      const user = await User?.findById(req.user.id).select('name username');
      if (user) userName = user.name || user.username;
    }

    const participantData = { name: userName, role: meeting.host?.toString() === req.user?.id ? 'host' : 'participant', joinedAt: new Date() };
    if (req.user) participantData.user = req.user.id;

    const existingIdx = meeting.participants.findIndex(p => req.user && p.user?.toString() === req.user.id);
    if (existingIdx >= 0) {
      meeting.participants[existingIdx].joinedAt = new Date();
      meeting.participants[existingIdx].leftAt = null;
    } else {
      meeting.participants.push(participantData);
    }

    if (meeting.status === 'scheduled') {
      meeting.status = 'live';
      meeting.startedAt = meeting.startedAt || new Date();
    }
    await meeting.save();

    const providerConfig = meeting.provider === 'jitsi' 
      ? { domain: PROVIDERS.jitsi.domain, roomName: meeting.roomId, userInfo: { displayName: userName } }
      : {};

    res.json({ ok: true, meeting: { _id: meeting._id, roomId: meeting.roomId, title: meeting.title, provider: meeting.provider, settings: meeting.settings },
      roomUrl: meeting.roomUrl, provider: meeting.provider, providerConfig, userName });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/meet/:roomId
router.get('/:roomId', optionalAuth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId }).populate('host', 'name username avatar');
    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });
    res.json({ ok: true, meeting });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/:roomId/leave
router.post('/:roomId/leave', optionalAuth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });

    if (req.user) {
      const p = meeting.participants.find(p => p.user?.toString() === req.user.id);
      if (p) p.leftAt = new Date();
    }

    const active = meeting.participants.filter(p => p.joinedAt && !p.leftAt);
    if (active.length === 0) {
      meeting.status = 'ended';
      meeting.endedAt = new Date();
      if (meeting.startedAt) meeting.duration = Math.floor((meeting.endedAt - meeting.startedAt) / 1000);
    }
    await meeting.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/:roomId/end
router.post('/:roomId/end', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });
    if (meeting.host.toString() !== req.user.id) return res.status(403).json({ ok: false, error: 'Only host can end' });

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    if (meeting.startedAt) meeting.duration = Math.floor((meeting.endedAt - meeting.startedAt) / 1000);
    meeting.participants.forEach(p => { if (!p.leftAt) p.leftAt = new Date(); });
    await meeting.save();

    if (meeting.provider === 'daily' && PROVIDERS.daily.apiKey) await dailyRequest(`/rooms/${meeting.roomId}`, 'DELETE');
    res.json({ ok: true, meeting });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/meet/:roomId
router.delete('/:roomId', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });
    if (meeting.host.toString() !== req.user.id) return res.status(403).json({ ok: false, error: 'Not authorized' });
    meeting.status = 'cancelled';
    await meeting.save();
    res.json({ ok: true, message: 'Meeting cancelled' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
