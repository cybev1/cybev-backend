====================================================
  

====================================================
  const mongoose = require('mongoose');
const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String },
  emoji: { type: String, required: true },
  isSynthetic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const chatMessageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, required: true },
  avatar: { type: String, default: '' },
  text: { type: String, required: true, maxlength: 500 },
  type: { type: String, enum: ['message', 'system', 'reaction', 'pinned'], default: 'message' },
  isSynthetic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, required: true },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['host', 'co-host', 'viewer'], default: 'viewer' },
  joinedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  isSynthetic: { type: Boolean, default: false }
});
const watchPartySchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, maxlength: 1000, default: '' },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  videoSource: {
    type: { type: String, enum: ['vlog', 'url', 'mux', 'youtube', 'hls'], required: true },
    vlogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vlog' },
    url: { type: String },
    muxPlaybackId: { type: String },
    title: { type: String },
    thumbnail: { type: String },
    duration: { type: Number, default: 0 },
    provider: { type: String }
  },
  playbackState: {
    isPlaying: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0 },
    playbackRate: { type: Number, default: 1 },
    lastUpdated: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  privacy: { type: String, enum: ['public', 'private', 'followers'], default: 'public' },
  maxParticipants: { type: Number, default: 500 },
  scheduledAt: { type: Date }, startedAt: { type: Date }, endedAt: { type: Date },
  participants: [participantSchema],
  chatMessages: [chatMessageSchema],
  reactions: [reactionSchema],
  invitedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  publishedToFeed: { type: Boolean, default: false },
  feedPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
  publishedToGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
  shareCount: { type: Number, default: 0 },
  boostedViewers: { type: Number, default: 0 },
  // ─── Boost Simulation Engine ───
  boostConfig: {
    isActive: { type: Boolean, default: false },
    peakTarget: { type: Number, default: 0 },       // target peak viewers
    currentSimulated: { type: Number, default: 0 },   // current fluctuating count
    minFloor: { type: Number, default: 0 },           // never drop below this (% of peak)
    phase: { type: String, enum: ['climbing', 'peak', 'dipping', 'recovering', 'stopped'], default: 'stopped' },
    phaseStartedAt: { type: Date },
    lastTickAt: { type: Date },
    totalBoostedEver: { type: Number, default: 0 },   // cumulative total ever boosted
  },
  syntheticEngagement: {
    totalComments: { type: Number, default: 0 },
    totalReactions: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 }
  },
  totalViews: { type: Number, default: 0 },
  peakViewers: { type: Number, default: 0 },
  coverImage: { type: String, default: '' },
  tags: [{ type: String }],
  // Auto-deletion after 30 days (set when party ends)
  deleteAfter: { type: Date, default: null, index: true },
  downloadUrl: { type: String, default: '' },
  deletionWarned: { type: Boolean, default: false },
}, { timestamps: true });
watchPartySchema.index({ host: 1, status: 1 });
watchPartySchema.index({ status: 1, createdAt: -1 });
watchPartySchema.index({ privacy: 1, status: 1 });
watchPartySchema.virtual('activeViewers').get(function() {
  const real = this.participants.filter(p => p.isActive).length;
  // Use simulated count if boost is active, otherwise raw boostedViewers
  const boosted = this.boostConfig?.isActive
    ? (this.boostConfig.currentSimulated || 0)
    : (this.boostedViewers || 0);
  const synthetic = this.syntheticEngagement?.totalViews || 0;
  return real + boosted + synthetic;
});
watchPartySchema.set('toJSON', { virtuals: true });
watchPartySchema.set('toObject', { virtuals: true });
module.exports = mongoose.model('WatchParty', watchPartySchema);
