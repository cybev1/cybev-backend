// ============================================
// FILE: models/meet-boost.model.js
// PURPOSE: Event Boost top-ups for large meetings
// ============================================

const mongoose = require('mongoose');

const meetBoostSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Entitlements
  maxParticipants: { type: Number, default: 100 },   // e.g., 100/200/300
  minutesTotal: { type: Number, default: 120 },      // minutes of event time to consume
  minutesUsed: { type: Number, default: 0 },

  // Status
  status: { type: String, enum: ['pending', 'active', 'expired', 'consumed', 'cancelled'], default: 'pending', index: true },
  expiresAt: Date,

  // Payment refs (wire to your payments later)
  amount: Number,
  currency: { type: String, default: 'USD' },
  paymentRef: String,
  meta: Object
}, { timestamps: true });

meetBoostSchema.index({ user: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.MeetBoost || mongoose.model('MeetBoost', meetBoostSchema);
