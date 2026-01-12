/**
 * Meet Routes - Video Conferencing
 * CYBEV Studio v2.0
 * GitHub: https://github.com/cybev1/cybev-backend/routes/meet.routes.js
 * 
 * Providers:
 * - Jitsi Meet (FREE, default) - No API key needed, unlimited
 * - Daily.co (Premium) - API key required, more features
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

// ============================================
// PROVIDER CONFIGURATION
// ============================================
const PROVIDERS = {
  jitsi: {
    name: 'Jitsi Meet',
    domain: 'meet.jit.si',
    free: true,
    maxParticipants: 75,
    maxDuration: null, // Unlimited
    features: ['screen-share', 'chat', 'recording', 'breakout-rooms']
  },
  daily: {
    name: 'Daily.co',
    domain: process.env.DAILY_DOMAIN || 'cybev.daily.co',
    apiKey: process.env.DAILY_API_KEY,
    free: false,
    maxParticipants: 100,
    maxDuration: 60, // Minutes on free tier
    features: ['screen-share', 'chat', 'recording', 'transcription', 'waiting-room']
  }
};

// ============================================
// MEETING SCHEMA
// ============================================
const meetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: String,
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: ['jitsi', 'daily'], default: 'jitsi' },
  type: { type: String, enum: ['instant', 'scheduled'], default: 'instant' },
  scheduledAt: Date,
  duration: { type: Number, default: 60 }, // Minutes
  participants: [{
    odId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    joinedAt: Date,
    leftAt: Date
  }],
  settings: {
    waitingRoom: { type: Boolean, default: false },
    muteOnEntry: { type: Boolean, default: true },
    allowScreenShare: { type: Boolean, default: true },
    allowChat: { type: Boolean, default: true },
    allowRecording: { type: Boolean, default: false },
    password: String
  },
  status: { type: String, enum: ['pending', 'active', 'ended'], default: 'pending' },
  startedAt: Date,
  endedAt: Date,
  dailyRoomUrl: String, // For Daily.co rooms
  createdAt: { type: Date, default: Date.now }
});

const Meeting = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);

// ============================================
// HELPER FUNCTIONS
// ============================================
function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 3; i++) {
    if (i > 0) result += '-';
    for (let j = 0; j < 4; j++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result; // Format: xxxx-xxxx-xxxx
}

async function createDailyRoom(title, settings = {}) {
  if (!PROVIDERS.daily.apiKey) {
    throw new Error('Daily.co API key not configured');
  }

  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PROVIDERS.daily.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: generateRoomId().replace(/-/g, ''),
      properties: {
        enable_screenshare: settings.allowScreenShare !== false,
        enable_chat: settings.allowChat !== false,
        enable_knocking: settings.waitingRoom || false,
        start_audio_off: settings.muteOnEntry || false
      }
    })
  });

  if (!response.ok) {
    throw new Error('Failed to create Daily.co room');
  }

  return response.json();
}

// ============================================
// ROUTES
// ============================================

// Get available providers
router.get('/providers', (req, res) => {
  const providers = Object.entries(PROVIDERS).map(([key, value]) => ({
    id: key,
    name: value.name,
    free: value.free,
    maxParticipants: value.maxParticipants,
    features: value.features,
    available: key === 'jitsi' || !!value.apiKey
  }));
  
  res.json({ providers });
});

// Get user's meetings
router.get('/my', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    
    const meetings = await Meeting.find({
      $or: [
        { hostId: userId },
        { 'participants.userId': userId }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('hostId', 'name email avatar');

    res.json({ meetings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create instant meeting
router.post('/instant', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { title, provider = 'jitsi', settings = {} } = req.body;

    const roomId = generateRoomId();
    let dailyRoomUrl = null;

    // Create Daily.co room if selected
    if (provider === 'daily' && PROVIDERS.daily.apiKey) {
      try {
        const dailyRoom = await createDailyRoom(title, settings);
        dailyRoomUrl = dailyRoom.url;
      } catch (error) {
        // Fallback to Jitsi if Daily.co fails
        console.error('Daily.co error, falling back to Jitsi:', error.message);
      }
    }

    const meeting = new Meeting({
      roomId,
      title: title || 'Instant Meeting',
      hostId: userId,
      provider: dailyRoomUrl ? 'daily' : 'jitsi',
      type: 'instant',
      settings,
      status: 'active',
      startedAt: new Date(),
      dailyRoomUrl
    });

    await meeting.save();

    // Generate meeting URL
    const meetingUrl = dailyRoomUrl || `https://${PROVIDERS.jitsi.domain}/${roomId}`;

    res.json({
      meeting,
      roomId,
      meetingUrl,
      joinUrl: `/meet/${roomId}`,
      provider: meeting.provider
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule a meeting
router.post('/schedule', async (req, res) => {
  try {
    const userId = req.user?._id || req.headers['x-user-id'];
    const { 
      title, 
      description, 
      scheduledAt, 
      duration = 60,
      provider = 'jitsi',
      settings = {},
      invitees = []
    } = req.body;

    const roomId = generateRoomId();

    const meeting = new Meeting({
      roomId,
      title,
      description,
      hostId: userId,
      provider,
      type: 'scheduled',
      scheduledAt: new Date(scheduledAt),
      duration,
      settings,
      participants: invitees.map(email => ({ email }))
    });

    await meeting.save();

    // TODO: Send email invitations to invitees

    res.json({
      meeting,
      roomId,
      joinUrl: `/meet/${roomId}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join a meeting
router.post('/join/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id || req.headers['x-user-id'];

    const meeting = await Meeting.findOne({ roomId });
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Add participant
    meeting.participants.push({
      odId: odlean,
      joinedAt: new Date()
    });

    if (meeting.status === 'pending') {
      meeting.status = 'active';
      meeting.startedAt = new Date();
    }

    await meeting.save();

    // Generate meeting URL based on provider
    let meetingUrl;
    if (meeting.provider === 'daily' && meeting.dailyRoomUrl) {
      meetingUrl = meeting.dailyRoomUrl;
    } else {
      meetingUrl = `https://${PROVIDERS.jitsi.domain}/${roomId}`;
    }

    res.json({
      meeting,
      meetingUrl,
      provider: meeting.provider
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get meeting details
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const meeting = await Meeting.findOne({ roomId })
      .populate('hostId', 'name email avatar')
      .populate('participants.userId', 'name email avatar');

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Generate meeting URL
    let meetingUrl;
    if (meeting.provider === 'daily' && meeting.dailyRoomUrl) {
      meetingUrl = meeting.dailyRoomUrl;
    } else {
      meetingUrl = `https://${PROVIDERS.jitsi.domain}/${roomId}`;
    }

    res.json({ meeting, meetingUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Leave meeting
router.post('/:roomId/leave', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id || req.headers['x-user-id'];

    const meeting = await Meeting.findOne({ roomId });
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Update participant's leftAt time
    const participant = meeting.participants.find(
      p => p.userId?.toString() === userId?.toString()
    );
    
    if (participant) {
      participant.leftAt = new Date();
      await meeting.save();
    }

    res.json({ message: 'Left meeting successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// End meeting (host only)
router.post('/:roomId/end', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id || req.headers['x-user-id'];

    const meeting = await Meeting.findOne({ roomId });
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    if (meeting.hostId.toString() !== userId?.toString()) {
      return res.status(403).json({ error: 'Only host can end the meeting' });
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await meeting.save();

    // Notify all participants via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(roomId).emit('meeting-ended', { roomId });
    }

    res.json({ message: 'Meeting ended', meeting });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete meeting
router.delete('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id || req.headers['x-user-id'];

    const meeting = await Meeting.findOne({ roomId });
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    if (meeting.hostId.toString() !== userId?.toString()) {
      return res.status(403).json({ error: 'Only host can delete the meeting' });
    }

    await Meeting.deleteOne({ roomId });

    res.json({ message: 'Meeting deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
