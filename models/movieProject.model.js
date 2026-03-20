// ============================================
// FILE: movieProject.model.js
// PATH: /models/movieProject.model.js
// CYBEV AI Movie/Series Production System
// Supports: Movies, Series, Episodes, Characters
// ============================================
const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, default: 'main' }, // main, supporting, extra, narrator
  description: { type: String, default: '' },
  faceImageUrl: { type: String, default: '' }, // User-uploaded face photo
  voiceId: { type: String, default: 'nova' },  // TTS voice for this character
  referenceImages: [String], // Additional reference images
  referenceVideoUrl: { type: String, default: '' }, // Short video reference
}, { _id: true });

const sceneSchema = new mongoose.Schema({
  sceneNumber: { type: Number, required: true },
  duration: { type: Number, default: 5 },
  visual: { type: String, default: '' },
  camera: { type: String, default: '' },
  textOverlay: { type: String, default: '' },
  narration: { type: String, default: '' },
  dialogue: [{ character: String, line: String }], // Character dialogue
  characterIds: [mongoose.Schema.Types.ObjectId], // Which characters appear
  transition: { type: String, default: 'Cut' },
  mood: { type: String, default: '' },
  // Generated content
  taskId: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'generating', 'completed', 'failed'], default: 'draft' },
}, { _id: true });

const episodeSchema = new mongoose.Schema({
  episodeNumber: { type: Number, required: true },
  title: { type: String, required: true },
  synopsis: { type: String, default: '' },
  duration: { type: Number, default: 60 }, // target duration in seconds
  scenes: [sceneSchema],
  // Generation state
  status: { type: String, enum: ['draft', 'scripted', 'generating', 'rendered', 'merged', 'published'], default: 'draft' },
  mergedVideoUrl: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  thumbnails: [{ url: String, timestamp: Number }],
  voiceId: { type: String, default: 'onyx-narrator' },
  musicSuggestion: { type: String, default: '' },
  // Metadata
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: true });

const movieProjectSchema = new mongoose.Schema({
  // Owner
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Project info
  title: { type: String, required: true },
  type: { type: String, enum: ['movie', 'series', 'short'], default: 'short' },
  genre: { type: String, default: 'drama' }, // drama, comedy, action, documentary, horror, sci-fi, romance, thriller, animation, faith
  logline: { type: String, default: '' }, // One-line pitch
  synopsis: { type: String, default: '' }, // Full synopsis
  style: { type: String, default: 'Cinematic' },
  targetAudience: { type: String, default: '' },
  language: { type: String, default: 'en' },

  // Characters
  characters: [characterSchema],

  // For series
  seasons: { type: Number, default: 1 },
  currentSeason: { type: Number, default: 1 },

  // Episodes (for series) or Acts (for movies)
  episodes: [episodeSchema],

  // Branding
  logoUrl: { type: String, default: '' },
  introImageUrl: { type: String, default: '' },
  outroImageUrl: { type: String, default: '' },
  coverImageUrl: { type: String, default: '' },

  // Settings
  defaultVoiceId: { type: String, default: 'onyx-narrator' },
  autoCaptions: { type: Boolean, default: true },
  aspectRatio: { type: String, default: '16:9' },

  // Status
  status: { type: String, enum: ['draft', 'in-production', 'completed', 'published'], default: 'draft' },

  // Stats
  totalViews: { type: Number, default: 0 },
  totalEpisodes: { type: Number, default: 0 },
}, {
  timestamps: true
});

movieProjectSchema.index({ user: 1, status: 1 });
movieProjectSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('MovieProject', movieProjectSchema);
