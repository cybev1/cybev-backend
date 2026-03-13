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
  syntheticEngagement: {
    totalComments: { type: Number, default: 0 },
    totalReactions: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 }
  },
  totalViews: { type: Number, default: 0 },
  peakViewers: { type: Number, default: 0 },
  coverImage: { type: String, default: '' },
  tags: [{ type: String }]
}, { timestamps: true });
watchPartySchema.index({ host: 1, status: 1 });
watchPartySchema.index({ status: 1, createdAt: -1 });
watchPartySchema.index({ privacy: 1, status: 1 });
watchPartySchema.virtual('activeViewers').get(function() {
  return this.participants.filter(p => p.isActive).length + (this.boostedViewers || 0) + (this.syntheticEngagement?.totalViews || 0);
});
watchPartySchema.set('toJSON', { virtuals: true });
watchPartySchema.set('toObject', { virtuals: true });
module.exports = mongoose.model('WatchParty', watchPartySchema);
