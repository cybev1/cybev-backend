// ============================================
// FILE: models/meeting.model.js
// PURPOSE: CYBEV Meet meetings (Jitsi orchestration)
// ============================================

const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true },
  title: { type: String, default: 'Meeting' },
  description: String,

  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  status: { type: String, enum: ['scheduled', 'waiting', 'active', 'ended'], default: 'waiting' },
  scheduledAt: Date,

  // Pool routing: small/pro/event (event is "boost")
  pool: { type: String, enum: ['small', 'pro', 'event'], default: 'small', index: true },

  // Limits captured at start time (so plan changes don't affect a running meeting)
  limits: {
    maxParticipants: { type: Number, default: 10 },
    perMeetingCapMin: { type: Number, default: 40 },
    monthlyCapMin: { type: Number, default: 300 },
    isEventBoost: { type: Boolean, default: false },
    eventBoostId: { type: mongoose.Schema.Types.ObjectId, ref: 'MeetBoost' }
  },

  // Usage tracking
  startedAt: Date,
  endedAt: Date,
  activeSeconds: { type: Number, default: 0 },
  lastHeartbeatAt: Date,

  // Soft delete
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

meetingSchema.index({ host: 1, createdAt: -1 });

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);
