// ============================================
// FILE: models/meet-account.model.js
// PURPOSE: Meet tier + monthly usage per user
// ============================================

const mongoose = require('mongoose');

const meetAccountSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  tier: { type: String, enum: ['free', 'pro'], default: 'free', index: true },

  monthKey: { type: String, required: true, index: true },
  minutesUsed: { type: Number, default: 0 }, // meeting-minutes (host/room minutes)

  // Optional: for admin overrides / promos
  monthlyCapOverrideMin: Number,
  maxParticipantsOverride: Number,
  perMeetingCapOverrideMin: Number
}, { timestamps: true });

module.exports = mongoose.models.MeetAccount || mongoose.model('MeetAccount', meetAccountSchema);
