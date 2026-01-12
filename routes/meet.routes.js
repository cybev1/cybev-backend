// ============================================
// FILE: routes/meet.routes.js
// Video Conferencing Routes (Jitsi FREE)
// VERSION: 1.0.0 - NEW FEATURE
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Simple auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Meeting Schema (inline)
const meetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  title: { type: String, default: 'Meeting' },
  description: String,
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  scheduledAt: Date,
  duration: { type: Number, default: 60 },
  status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'scheduled' },
  provider: { type: String, default: 'jitsi' },
  settings: {
    waitingRoom: { type: Boolean, default: false },
    muteOnEntry: { type: Boolean, default: true },
    allowRecording: { type: Boolean, default: false },
  }
}, { timestamps: true });

const Meeting = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);

// Generate unique room ID
const generateRoomId = () => {
  return crypto.randomBytes(4).toString('hex') + '-' + 
         crypto.randomBytes(2).toString('hex') + '-' + 
         crypto.randomBytes(2).toString('hex');
};

// Create instant meeting
router.post('/create', auth, async (req, res) => {
  try {
    const { title = 'Instant Meeting' } = req.body;
    
    const meeting = await Meeting.create({
      roomId: generateRoomId(),
      title,
      host: req.user.userId || req.user.id,
      status: 'active',
      provider: 'jitsi'
    });

    res.json({ 
      ok: true, 
      meeting,
      joinUrl: `https://meet.jit.si/cybev-${meeting.roomId}`
    });
  } catch (err) {
    console.error('Create meeting error:', err);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// Schedule meeting
router.post('/schedule', auth, async (req, res) => {
  try {
    const { title, description, scheduledAt, duration = 60 } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'Scheduled time is required' });
    }

    const meeting = await Meeting.create({
      roomId: generateRoomId(),
      title: title || 'Scheduled Meeting',
      description,
      host: req.user.userId || req.user.id,
      scheduledAt: new Date(scheduledAt),
      duration,
      status: 'scheduled',
      provider: 'jitsi'
    });

    res.json({ ok: true, meeting });
  } catch (err) {
    console.error('Schedule meeting error:', err);
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
});

// Get my meetings
router.get('/my-meetings', auth, async (req, res) => {
  try {
    const meetings = await Meeting.find({
      $or: [
        { host: req.user.userId || req.user.id },
        { participants: req.user.userId || req.user.id }
      ]
    }).sort({ createdAt: -1 }).limit(50);

    res.json({ meetings });
  } catch (err) {
    console.error('Get meetings error:', err);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// Get meeting by room ID
router.get('/:roomId', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId })
      .populate('host', 'username name avatar');

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ meeting });
  } catch (err) {
    console.error('Get meeting error:', err);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// Join meeting
router.post('/:roomId/join', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Add participant if not already in list
    const userId = req.user.userId || req.user.id;
    if (!meeting.participants.includes(userId)) {
      meeting.participants.push(userId);
      await meeting.save();
    }

    res.json({ 
      ok: true, 
      meeting,
      joinUrl: `https://meet.jit.si/cybev-${meeting.roomId}`
    });
  } catch (err) {
    console.error('Join meeting error:', err);
    res.status(500).json({ error: 'Failed to join meeting' });
  }
});

// End meeting
router.post('/:roomId/end', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const userId = req.user.userId || req.user.id;
    if (meeting.host.toString() !== userId) {
      return res.status(403).json({ error: 'Only host can end meeting' });
    }

    meeting.status = 'ended';
    await meeting.save();

    res.json({ ok: true, meeting });
  } catch (err) {
    console.error('End meeting error:', err);
    res.status(500).json({ error: 'Failed to end meeting' });
  }
});

module.exports = router;
