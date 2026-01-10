// ============================================
// FILE: models/church.model.js
// Online Church Management System
// VERSION: 1.0.0
// Hierarchy: Zone → Church → Fellowship → Cell → Bible Study
// ============================================

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ==========================================
// CHURCH ORGANIZATION SCHEMA
// Unified schema for all levels: zone, church, fellowship, cell, biblestudy
// ==========================================
const ChurchOrgSchema = new Schema({
  // Basic Info
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  type: { 
    type: String, 
    required: true, 
    enum: ['zone', 'church', 'fellowship', 'cell', 'biblestudy'],
    index: true
  },
  description: { type: String, default: '' },
  motto: { type: String, default: '' },
  
  // Hierarchy Links
  parent: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', default: null, index: true },
  zone: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', default: null }, // Quick reference to zone
  church: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', default: null }, // Quick reference to church
  
  // Leadership
  leader: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // Pastor/Leader
  assistantLeaders: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: Schema.Types.ObjectId, ref: 'User' }], // Can manage this org
  
  // Members
  members: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['member', 'worker', 'leader', 'pastor', 'admin'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'transferred'], default: 'active' }
  }],
  memberCount: { type: Number, default: 0 },
  
  // Contact & Location
  contact: {
    email: String,
    phone: String,
    whatsapp: String,
    address: String,
    city: String,
    state: String,
    country: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  // Meeting Schedule
  meetingSchedule: [{
    day: { type: String, enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] },
    time: String, // "10:00 AM"
    title: String, // "Sunday Service", "Midweek Service"
    type: { type: String, enum: ['service', 'prayer', 'biblestudy', 'meeting', 'special'] },
    isOnline: { type: Boolean, default: false },
    streamUrl: String
  }],
  
  // Branding
  logo: String,
  coverImage: String,
  bannerImage: String,
  colorTheme: { type: String, default: 'purple' },
  
  // Website (linked CYBEV site)
  siteId: { type: Schema.Types.ObjectId, ref: 'Site' },
  subdomain: String, // Quick reference
  
  // Social Links
  socialLinks: {
    facebook: String,
    instagram: String,
    twitter: String,
    youtube: String,
    tiktok: String,
    website: String
  },
  
  // Stats
  stats: {
    totalSouls: { type: Number, default: 0 },
    totalMembers: { type: Number, default: 0 },
    totalWorkers: { type: Number, default: 0 },
    avgAttendance: { type: Number, default: 0 },
    foundationSchoolGraduates: { type: Number, default: 0 }
  },
  
  // Settings
  settings: {
    isPublic: { type: Boolean, default: true },
    allowJoinRequests: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: true },
    enableSoulTracker: { type: Boolean, default: true },
    enableFoundationSchool: { type: Boolean, default: true },
    enableStreaming: { type: Boolean, default: true }
  },
  
  // Metadata
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
ChurchOrgSchema.index({ type: 1, parent: 1 });
ChurchOrgSchema.index({ zone: 1, type: 1 });
ChurchOrgSchema.index({ slug: 1, type: 1 }, { unique: true });
ChurchOrgSchema.index({ 'members.user': 1 });

// ==========================================
// SOUL TRACKER SCHEMA
// Track new converts and follow-up
// ==========================================
const SoulSchema = new Schema({
  // Basic Info
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true },
  phone: { type: String, required: true },
  email: String,
  address: String,
  city: String,
  
  // Demographics
  gender: { type: String, enum: ['male', 'female', 'other'] },
  ageGroup: { type: String, enum: ['child', 'teen', 'young_adult', 'adult', 'senior'] },
  maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed'] },
  occupation: String,
  
  // Salvation Info
  salvationDate: { type: Date, default: Date.now },
  salvationType: { 
    type: String, 
    enum: ['first_time', 'rededication', 'transfer', 'water_baptism'],
    default: 'first_time'
  },
  howTheyHeard: { type: String, enum: ['service', 'crusade', 'online', 'friend', 'outreach', 'social_media', 'other'] },
  referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  witnessedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Organization Assignment
  zone: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  church: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  fellowship: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  cell: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' }, // Follow-up person
  
  // Status Tracking
  status: {
    type: String,
    enum: ['new', 'contacted', 'followup', 'attending', 'member', 'foundation_school', 'graduated', 'inactive', 'lost'],
    default: 'new'
  },
  
  // Follow-up History
  followUps: [{
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['call', 'visit', 'message', 'service_attendance', 'cell_attendance'] },
    notes: String,
    outcome: { type: String, enum: ['successful', 'no_answer', 'scheduled', 'declined', 'wrong_number'] },
    followedUpBy: { type: Schema.Types.ObjectId, ref: 'User' },
    nextFollowUpDate: Date
  }],
  
  // Foundation School Progress
  foundationSchool: {
    enrolled: { type: Boolean, default: false },
    enrolledAt: Date,
    currentModule: { type: Number, default: 0 },
    completedModules: [Number],
    graduated: { type: Boolean, default: false },
    graduatedAt: Date,
    certificate: String
  },
  
  // Linked User Account (if they create CYBEV account)
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Notes
  notes: String,
  prayerRequests: [String],
  
  // Metadata
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
SoulSchema.index({ church: 1, status: 1 });
SoulSchema.index({ cell: 1, status: 1 });
SoulSchema.index({ assignedTo: 1, status: 1 });
SoulSchema.index({ phone: 1 });
SoulSchema.index({ salvationDate: -1 });

// ==========================================
// FOUNDATION SCHOOL MODULE SCHEMA
// Course structure for new believers
// ==========================================
const FoundationModuleSchema = new Schema({
  // Basic Info
  title: { type: String, required: true },
  description: String,
  moduleNumber: { type: Number, required: true },
  
  // Content
  content: {
    introduction: String,
    lessons: [{
      title: String,
      content: String,
      videoUrl: String,
      audioUrl: String,
      duration: Number, // minutes
      resources: [{
        title: String,
        type: { type: String, enum: ['pdf', 'video', 'audio', 'link'] },
        url: String
      }]
    }],
    scriptures: [String],
    memoryVerse: String
  },
  
  // Quiz
  quiz: [{
    question: String,
    options: [String],
    correctAnswer: Number,
    explanation: String
  }],
  passingScore: { type: Number, default: 70 },
  
  // Metadata
  duration: { type: Number, default: 7 }, // days to complete
  isRequired: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// ==========================================
// FOUNDATION SCHOOL ENROLLMENT SCHEMA
// Track individual progress through Foundation School
// ==========================================
const FoundationEnrollmentSchema = new Schema({
  // Student
  soul: { type: Schema.Types.ObjectId, ref: 'Soul' },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Organization
  church: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', required: true },
  mentor: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Progress
  enrolledAt: { type: Date, default: Date.now },
  currentModule: { type: Number, default: 1 },
  
  moduleProgress: [{
    moduleNumber: Number,
    startedAt: Date,
    completedAt: Date,
    lessonsCompleted: [Number],
    quizScore: Number,
    quizAttempts: Number,
    passed: Boolean,
    notes: String
  }],
  
  // Attendance (for in-person classes)
  attendance: [{
    date: Date,
    moduleNumber: Number,
    present: Boolean,
    notes: String
  }],
  
  // Completion
  status: {
    type: String,
    enum: ['enrolled', 'in_progress', 'completed', 'graduated', 'dropped'],
    default: 'enrolled'
  },
  completedAt: Date,
  graduatedAt: Date,
  certificateUrl: String,
  certificateNumber: String,
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ==========================================
// CHURCH EVENT SCHEMA
// Services, programs, special events
// ==========================================
const ChurchEventSchema = new Schema({
  // Basic Info
  title: { type: String, required: true },
  description: String,
  type: {
    type: String,
    enum: ['service', 'prayer', 'biblestudy', 'outreach', 'conference', 'seminar', 'meeting', 'special', 'crusade'],
    default: 'service'
  },
  
  // Organization
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', required: true },
  
  // Schedule
  startDate: { type: Date, required: true },
  endDate: Date,
  isRecurring: { type: Boolean, default: false },
  recurrence: {
    frequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly'] },
    daysOfWeek: [Number], // 0-6 for Sunday-Saturday
    endDate: Date
  },
  
  // Location
  isOnline: { type: Boolean, default: false },
  location: {
    name: String,
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  streamUrl: String,
  
  // Attendance
  expectedAttendance: Number,
  actualAttendance: Number,
  attendees: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    checkedInAt: Date,
    type: { type: String, enum: ['member', 'visitor', 'first_timer'] }
  }],
  
  // Media
  coverImage: String,
  bannerImage: String,
  
  // Live Stream Integration
  liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream' },
  isLive: { type: Boolean, default: false },
  
  // Settings
  isPublic: { type: Boolean, default: true },
  requireRegistration: { type: Boolean, default: false },
  
  // Metadata
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
ChurchEventSchema.index({ organization: 1, startDate: -1 });
ChurchEventSchema.index({ startDate: 1, isPublic: 1 });

// ==========================================
// ATTENDANCE RECORD SCHEMA
// Track service/event attendance
// ==========================================
const AttendanceRecordSchema = new Schema({
  // Organization & Event
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', required: true },
  event: { type: Schema.Types.ObjectId, ref: 'ChurchEvent' },
  
  // Date
  date: { type: Date, required: true },
  serviceType: { type: String, enum: ['sunday', 'midweek', 'prayer', 'biblestudy', 'special'] },
  
  // Counts
  totalAttendance: { type: Number, default: 0 },
  members: { type: Number, default: 0 },
  visitors: { type: Number, default: 0 },
  firstTimers: { type: Number, default: 0 },
  children: { type: Number, default: 0 },
  online: { type: Number, default: 0 },
  
  // Individual Attendance (optional detailed tracking)
  attendees: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    soul: { type: Schema.Types.ObjectId, ref: 'Soul' },
    type: { type: String, enum: ['member', 'visitor', 'first_timer', 'child'] },
    checkedInAt: Date,
    checkedInBy: { type: Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Souls Won
  soulsWon: { type: Number, default: 0 },
  newSouls: [{ type: Schema.Types.ObjectId, ref: 'Soul' }],
  
  // Notes
  notes: String,
  highlights: String,
  
  // Metadata
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Indexes
AttendanceRecordSchema.index({ organization: 1, date: -1 });

// ==========================================
// EXPORT MODELS
// ==========================================
module.exports = {
  ChurchOrg: mongoose.model('ChurchOrg', ChurchOrgSchema),
  Soul: mongoose.model('Soul', SoulSchema),
  FoundationModule: mongoose.model('FoundationModule', FoundationModuleSchema),
  FoundationEnrollment: mongoose.model('FoundationEnrollment', FoundationEnrollmentSchema),
  ChurchEvent: mongoose.model('ChurchEvent', ChurchEventSchema),
  AttendanceRecord: mongoose.model('AttendanceRecord', AttendanceRecordSchema)
};
