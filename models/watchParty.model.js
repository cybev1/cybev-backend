// ============================================
// FILE: watchParty.model.js
// PATH: /models/watchParty.model.js
// CYBEV Watch Party Model
// ============================================
const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true }, // 🔥❤️😂👏🎉😮💯🙌
  timestamp: { type: Number, default: 0 }, // video timestamp when reaction was sent
  createdAt: { type: Date, default: Date.now }
});

const chatMessageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  avatar: { type: String, default: '' },
  text: { type: String, required: true, maxlength: 500 },
  type: { type: String, enum: ['message', 'system', 'reaction'], default: 'message' },
  createdAt: { type: Date, default: Date.now }
});

const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['host', 'co-host', 'viewer'], default: 'viewer' },
  joinedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const watchPartySchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, maxlength: 1000, default: '' },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Video source — supports vlogs, external URLs, or Mux streams
  videoSource: {
    type: { type: String, enum: ['vlog', 'url', 'mux', 'youtube'], required: true },
    vlogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vlog' },
    url: { type: String },
    muxPlaybackId: { type: String },
    title: { type: String },
    thumbnail: { type: String },
    duration: { type: Number, default: 0 } // seconds
  },

  // Playback state (synced via Socket.io)
  playbackState: {
    isPlaying: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0 }, // seconds
    playbackRate: { type: Number, default: 1 },
    lastUpdated: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  // Party settings
  status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  privacy: { type: String, enum: ['public', 'private', 'followers'], default: 'public' },
  maxParticipants: { type: Number, default: 50 },
  scheduledAt: { type: Date },
  startedAt: { type: Date },
  endedAt: { type: Date },

  // Participants & interactions
  participants: [participantSchema],
  chatMessages: [chatMessageSchema],
  reactions: [reactionSchema],
  invitedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Stats
  totalViews: { type: Number, default: 0 },
  peakViewers: { type: Number, default: 0 },

  // Cover image for party card
  coverImage: { type: String, default: '' },
  tags: [{ type: String }],

}, { timestamps: true });

// Indexes
watchPartySchema.index({ host: 1, status: 1 });
watchPartySchema.index({ status: 1, scheduledAt: -1 });
watchPartySchema.index({ status: 1, createdAt: -1 });
watchPartySchema.index({ 'participants.user': 1 });
watchPartySchema.index({ privacy: 1, status: 1 });

// Virtual: active participant count
watchPartySchema.virtual('activeViewers').get(function () {
  return this.participants.filter(p => p.isActive).length;
});

watchPartySchema.set('toJSON', { virtuals: true });
watchPartySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('WatchParty', watchPartySchema);
