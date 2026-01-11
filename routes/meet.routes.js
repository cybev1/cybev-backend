// ============================================
// FILE: routes/meet.routes.js
// PURPOSE: CYBEV Meet - Video Conferencing API
// Integrates with Daily.co for video infrastructure
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// Optional auth - allows guests
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    } catch {}
  }
  next();
};

// Daily.co API helper
const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = 'https://api.daily.co/v1';

async function dailyRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DAILY_API_KEY}`
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(`${DAILY_API_URL}${endpoint}`, options);
  return res.json();
}

// Meeting Schema
const meetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  roomUrl: { type: String },
  title: { type: String, default: 'Quick Meeting' },
  description: { type: String },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['instant', 'scheduled', 'recurring'], default: 'instant' },
  schedule: {
    startTime: Date,
    endTime: Date,
    timezone: { type: String, default: 'UTC' },
    recurrence: String
  },
  settings: {
    waitingRoom: { type: Boolean, default: false },
    requirePassword: { type: Boolean, default: false },
    password: String,
    allowRecording: { type: Boolean, default: true },
    maxParticipants: { type: Number, default: 100 },
    muteOnEntry: { type: Boolean, default: false },
    videoOnEntry: { type: Boolean, default: true }
  },
  participants: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    email: String,
    role: { type: String, enum: ['host', 'co-host', 'participant'], default: 'participant' },
    joinedAt: Date,
    leftAt: Date
  }],
  recording: {
    enabled: { type: Boolean, default: false },
    url: String,
    duration: Number
  },
  chat: [{
    sender: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled' },
  startedAt: Date,
  endedAt: Date,
  duration: Number, // in seconds
  createdAt: { type: Date, default: Date.now }
});

const Meeting = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);

// ==========================================
// ROUTES
// ==========================================

// GET /api/meet/my - Get user's meetings
router.get('/my', auth, async (req, res) => {
  try {
    const now = new Date();
    
    // Upcoming meetings
    const upcoming = await Meeting.find({
      $or: [
        { host: req.user.id },
        { 'participants.user': req.user.id },
        { 'participants.email': req.user.email }
      ],
      status: { $in: ['scheduled', 'live'] },
      $or: [
        { 'schedule.startTime': { $gte: now } },
        { type: 'instant', status: 'live' }
      ]
    })
    .sort({ 'schedule.startTime': 1 })
    .limit(10)
    .populate('host', 'name username avatar');

    // Recent/past meetings
    const recent = await Meeting.find({
      $or: [
        { host: req.user.id },
        { 'participants.user': req.user.id }
      ],
      status: 'ended'
    })
    .sort({ endedAt: -1 })
    .limit(10)
    .populate('host', 'name username avatar');

    res.json({ ok: true, upcoming, recent });
  } catch (err) {
    console.error('Get meetings error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/instant - Start instant meeting
router.post('/instant', auth, async (req, res) => {
  try {
    const roomId = `cybev-${crypto.randomBytes(4).toString('hex')}`;
    
    let roomUrl = `https://cybev.daily.co/${roomId}`;
    
    // Create room on Daily.co if API key is configured
    if (DAILY_API_KEY) {
      const dailyRoom = await dailyRequest('/rooms', 'POST', {
        name: roomId,
        privacy: 'public',
        properties: {
          max_participants: 100,
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: 'cloud',
          start_video_off: false,
          start_audio_off: false,
          exp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
        }
      });
      
      if (dailyRoom.url) {
        roomUrl = dailyRoom.url;
      }
    }

    // Get user info
    const User = mongoose.models.User;
    const user = await User.findById(req.user.id).select('name username');

    const meeting = new Meeting({
      roomId,
      roomUrl,
      title: `${user?.name || 'User'}'s Meeting`,
      host: req.user.id,
      type: 'instant',
      status: 'live',
      startedAt: new Date(),
      participants: [{
        user: req.user.id,
        name: user?.name,
        role: 'host',
        joinedAt: new Date()
      }]
    });

    await meeting.save();

    res.json({ 
      ok: true, 
      roomId,
      roomUrl,
      meeting 
    });
  } catch (err) {
    console.error('Start instant meeting error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/schedule - Schedule a meeting
router.post('/schedule', auth, async (req, res) => {
  try {
    const { 
      title, 
      description, 
      startTime, 
      endTime, 
      timezone,
      participants,
      settings 
    } = req.body;

    if (!startTime) {
      return res.status(400).json({ ok: false, error: 'Start time is required' });
    }

    const roomId = `cybev-${crypto.randomBytes(4).toString('hex')}`;
    let roomUrl = `https://cybev.daily.co/${roomId}`;

    // Create room on Daily.co
    if (DAILY_API_KEY) {
      const startTimestamp = Math.floor(new Date(startTime).getTime() / 1000);
      const dailyRoom = await dailyRequest('/rooms', 'POST', {
        name: roomId,
        privacy: 'public',
        properties: {
          max_participants: settings?.maxParticipants || 100,
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: 'cloud',
          nbf: startTimestamp - 600, // Allow joining 10 min early
          exp: startTimestamp + 7200 // Room expires 2 hours after start
        }
      });
      
      if (dailyRoom.url) {
        roomUrl = dailyRoom.url;
      }
    }

    const meeting = new Meeting({
      roomId,
      roomUrl,
      title: title || 'Scheduled Meeting',
      description,
      host: req.user.id,
      type: 'scheduled',
      schedule: {
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        timezone: timezone || 'UTC'
      },
      settings: {
        waitingRoom: settings?.waitingRoom || false,
        requirePassword: settings?.requirePassword || false,
        password: settings?.password,
        maxParticipants: settings?.maxParticipants || 100,
        muteOnEntry: settings?.muteOnEntry || false,
        videoOnEntry: settings?.videoOnEntry !== false
      },
      participants: (participants || []).map(p => ({
        name: p.name,
        email: p.email,
        role: 'participant'
      })),
      status: 'scheduled'
    });

    await meeting.save();

    // TODO: Send email invites to participants

    res.json({ 
      ok: true, 
      meeting,
      roomId,
      joinUrl: `${process.env.FRONTEND_URL || 'https://cybev.io'}/meet/${roomId}`
    });
  } catch (err) {
    console.error('Schedule meeting error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/join/:roomId - Join a meeting
router.post('/join/:roomId', optionalAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, email } = req.body;

    const meeting = await Meeting.findOne({ roomId });
    
    if (!meeting) {
      return res.status(404).json({ ok: false, error: 'Meeting not found' });
    }

    // Check if meeting is cancelled
    if (meeting.status === 'cancelled') {
      return res.status(400).json({ ok: false, error: 'This meeting has been cancelled' });
    }

    // Get user info if authenticated
    let userName = name || 'Guest';
    let userEmail = email;
    
    if (req.user) {
      const User = mongoose.models.User;
      const user = await User.findById(req.user.id).select('name email username');
      if (user) {
        userName = user.name || user.username;
        userEmail = user.email;
      }
    }

    // Add participant to meeting
    const participantData = {
      name: userName,
      email: userEmail,
      role: meeting.host?.toString() === req.user?.id ? 'host' : 'participant',
      joinedAt: new Date()
    };

    if (req.user) {
      participantData.user = req.user.id;
    }

    // Check if participant already exists
    const existingParticipant = meeting.participants.find(p => 
      (req.user && p.user?.toString() === req.user.id) ||
      (userEmail && p.email === userEmail)
    );

    if (!existingParticipant) {
      meeting.participants.push(participantData);
    } else {
      existingParticipant.joinedAt = new Date();
      existingParticipant.leftAt = null;
    }

    // Update meeting status if not already live
    if (meeting.status === 'scheduled') {
      meeting.status = 'live';
      meeting.startedAt = meeting.startedAt || new Date();
    }

    await meeting.save();

    // Generate meeting token if using Daily.co
    let meetingToken = null;
    if (DAILY_API_KEY) {
      const tokenResponse = await dailyRequest('/meeting-tokens', 'POST', {
        properties: {
          room_name: roomId,
          user_name: userName,
          is_owner: meeting.host?.toString() === req.user?.id,
          enable_recording: meeting.settings.allowRecording ? 'cloud' : false
        }
      });
      meetingToken = tokenResponse.token;
    }

    res.json({
      ok: true,
      meeting: {
        _id: meeting._id,
        roomId: meeting.roomId,
        title: meeting.title,
        host: meeting.host,
        settings: meeting.settings
      },
      roomUrl: meeting.roomUrl,
      token: meetingToken,
      userName
    });
  } catch (err) {
    console.error('Join meeting error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/leave/:roomId - Leave a meeting
router.post('/leave/:roomId', optionalAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) {
      return res.status(404).json({ ok: false, error: 'Meeting not found' });
    }

    // Update participant leave time
    if (req.user) {
      const participant = meeting.participants.find(p => 
        p.user?.toString() === req.user.id
      );
      if (participant) {
        participant.leftAt = new Date();
      }
    }

    // Check if all participants have left
    const activeParticipants = meeting.participants.filter(p => 
      p.joinedAt && !p.leftAt
    );

    if (activeParticipants.length === 0) {
      meeting.status = 'ended';
      meeting.endedAt = new Date();
      if (meeting.startedAt) {
        meeting.duration = Math.floor((meeting.endedAt - meeting.startedAt) / 1000);
      }
    }

    await meeting.save();

    res.json({ ok: true });
  } catch (err) {
    console.error('Leave meeting error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/meet/:roomId - Get meeting info
router.get('/:roomId', optionalAuth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId })
      .populate('host', 'name username avatar')
      .populate('participants.user', 'name username avatar');

    if (!meeting) {
      return res.status(404).json({ ok: false, error: 'Meeting not found' });
    }

    res.json({ ok: true, meeting });
  } catch (err) {
    console.error('Get meeting error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/meet/:roomId - Update meeting
router.put('/:roomId', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    
    if (!meeting) {
      return res.status(404).json({ ok: false, error: 'Meeting not found' });
    }

    if (meeting.host.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { title, description, schedule, settings, participants } = req.body;

    if (title) meeting.title = title;
    if (description !== undefined) meeting.description = description;
    if (schedule) {
      if (schedule.startTime) meeting.schedule.startTime = new Date(schedule.startTime);
      if (schedule.endTime) meeting.schedule.endTime = new Date(schedule.endTime);
      if (schedule.timezone) meeting.schedule.timezone = schedule.timezone;
    }
    if (settings) {
      Object.assign(meeting.settings, settings);
    }
    if (participants) {
      // Add new participants
      participants.forEach(p => {
        const exists = meeting.participants.find(mp => mp.email === p.email);
        if (!exists) {
          meeting.participants.push({
            name: p.name,
            email: p.email,
            role: p.role || 'participant'
          });
        }
      });
    }

    await meeting.save();

    res.json({ ok: true, meeting });
  } catch (err) {
    console.error('Update meeting error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/meet/:roomId - Cancel/delete meeting
router.delete('/:roomId', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    
    if (!meeting) {
      return res.status(404).json({ ok: false, error: 'Meeting not found' });
    }

    if (meeting.host.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    if (meeting.status === 'live') {
      // End the meeting
      meeting.status = 'ended';
      meeting.endedAt = new Date();
      await meeting.save();

      // Delete room from Daily.co
      if (DAILY_API_KEY) {
        await dailyRequest(`/rooms/${meeting.roomId}`, 'DELETE');
      }
    } else {
      // Cancel scheduled meeting
      meeting.status = 'cancelled';
      await meeting.save();
    }

    res.json({ ok: true, message: 'Meeting cancelled' });
  } catch (err) {
    console.error('Delete meeting error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/meet/:roomId/end - End a meeting (host only)
router.post('/:roomId/end', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    
    if (!meeting) {
      return res.status(404).json({ ok: false, error: 'Meeting not found' });
    }

    if (meeting.host.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Only host can end the meeting' });
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    if (meeting.startedAt) {
      meeting.duration = Math.floor((meeting.endedAt - meeting.startedAt) / 1000);
    }

    // Mark all participants as left
    meeting.participants.forEach(p => {
      if (!p.leftAt) {
        p.leftAt = new Date();
      }
    });

    await meeting.save();

    // Delete room from Daily.co
    if (DAILY_API_KEY) {
      await dailyRequest(`/rooms/${meeting.roomId}`, 'DELETE');
    }

    res.json({ ok: true, meeting });
  } catch (err) {
    console.error('End meeting error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/meet/:roomId/recording - Get recording URL
router.get('/:roomId/recording', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    
    if (!meeting) {
      return res.status(404).json({ ok: false, error: 'Meeting not found' });
    }

    // Check if user was a participant
    const wasParticipant = meeting.participants.some(p => 
      p.user?.toString() === req.user.id
    ) || meeting.host.toString() === req.user.id;

    if (!wasParticipant) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    if (!meeting.recording?.url) {
      return res.status(404).json({ ok: false, error: 'No recording available' });
    }

    res.json({ ok: true, recording: meeting.recording });
  } catch (err) {
    console.error('Get recording error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Webhook for Daily.co events (recording ready, etc.)
router.post('/webhook/daily', async (req, res) => {
  try {
    const { event, payload } = req.body;

    switch (event) {
      case 'recording.ready-to-download':
        const meeting = await Meeting.findOne({ roomId: payload.room_name });
        if (meeting) {
          meeting.recording = {
            enabled: true,
            url: payload.download_link,
            duration: payload.duration
          };
          await meeting.save();
        }
        break;

      case 'meeting.ended':
        const endedMeeting = await Meeting.findOne({ roomId: payload.room });
        if (endedMeeting && endedMeeting.status === 'live') {
          endedMeeting.status = 'ended';
          endedMeeting.endedAt = new Date();
          await endedMeeting.save();
        }
        break;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Daily webhook error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
