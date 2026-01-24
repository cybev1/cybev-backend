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
  // Mode: "church" follows Christ Embassy structure; "organization" enables generic org hierarchy
  structureMode: { type: String, enum: ['church', 'organization'], default: 'church', index: true },
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

  // Cell Ministry (Capacity & Growth)
  cellSettings: {
    maxCapacity: { type: Number, default: 15 },
    splitThreshold: { type: Number, default: 15 },
    allowAutoSplitSuggestion: { type: Boolean, default: true }
  },

  // Cell tools integration
  linkedGroupId: { type: Schema.Types.ObjectId, ref: 'Group' },
  // Meet feature uses the "Meeting" model in routes/meet.routes.js
  linkedMeetRoomId: { type: Schema.Types.ObjectId, ref: 'Meeting' },
  
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
    enableStreaming: { type: Boolean, default: true },
    // If enabled, new souls added to this org are auto-enrolled into an active batch (if configured)
    autoEnrollNewSoulsToFoundation: { type: Boolean, default: true }
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
// Updated: Supports March 2025 Manual structure
// ==========================================
const FoundationModuleSchema = new Schema({
  // Basic Info
  title: { type: String, required: true },
  subtitle: String,
  description: String,
  moduleNumber: { type: Number, required: true, unique: true },
  
  // UI/Display
  icon: { type: String, default: 'BookOpen' },
  color: { type: String, default: '#8B5CF6' },
  totalLessons: { type: Number, default: 0 },
  
  // Lessons (direct array - March 2025 structure)
  lessons: [{
    lessonNumber: Number,
    title: String,
    content: String,
    scriptureReferences: [String],
    keyPoints: [String],
    memoryVerse: String,
    duration: String,
    videoUrl: String,
    audioUrl: String,
    resources: [{
      title: String,
      type: { type: String, enum: ['pdf', 'video', 'audio', 'link'] },
      url: String
    }]
  }],
  
  // Legacy content structure (backward compatibility)
  content: {
    introduction: String,
    lessons: [{
      title: String,
      content: String,
      videoUrl: String,
      audioUrl: String,
      duration: Number,
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
  
  // Assignment
  assignment: {
    title: String,
    description: String,
    type: { type: String, enum: ['written', 'practical', 'reflection'] },
    dueInDays: Number
  },
  
  // Metadata
  duration: String, // "2-3 hours" or legacy Number for days
  isRequired: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ==========================================
// FOUNDATION SCHOOL ENROLLMENT SCHEMA
// Track individual progress through Foundation School
// ==========================================
const FoundationEnrollmentSchema = new Schema({
  // ===============================
  // NOTE: This schema supports BOTH:
  // 1) Legacy enrollment flow (church.routes.js)
  // 2) March 2025 manual flow (foundation-school.routes.js)
  // ===============================

  // Legacy identifiers (Soul tracker based)
  soul: { type: Schema.Types.ObjectId, ref: 'Soul' },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  church: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  mentor: { type: Schema.Types.ObjectId, ref: 'User' },
  currentModule: { type: Number, default: 1 },
  moduleProgress: [{
    moduleNumber: Number,
    startedAt: Date,
    completedAt: Date,
    lessonsCompleted: [Number],
    quizScore: Number,
    quizAttempts: { type: Number, default: 0 },
    passed: Boolean,
    notes: String
  }],
  attendance: [{
    date: Date,
    moduleNumber: Number,
    present: Boolean,
    notes: String,
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  }],

  // March 2025 manual identifiers (User based)
  student: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', index: true },
  batch: { type: Schema.Types.ObjectId, ref: 'FSBatch', index: true },

  // Unified dates & status
  enrolledAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['enrolled', 'in_progress', 'active', 'completed', 'graduated', 'dropped', 'withdrawn'],
    default: 'enrolled'
  },
  completedAt: Date,
  graduatedAt: Date,

  // Certificate (issued by teacher/principal)
  certificateUrl: String,
  certificateNumber: String,
  certificateIssuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  certificateIssuedAt: Date,

  // Progress (manual flow)
  progress: {
    currentModule: { type: Number, default: 1 },
    completedModules: [{ type: Number }],
    completedLessons: [{ type: String }], // `${moduleNumber}-${lessonId}`
    totalModules: { type: Number, default: 0 },
    quizScores: [{
      moduleNumber: Number,
      score: Number,
      passed: Boolean,
      attemptDate: { type: Date, default: Date.now }
    }],
    assignments: [{
      moduleNumber: Number,
      assignmentId: String,
      submissionId: { type: Schema.Types.ObjectId, ref: 'FSAssignmentSubmission' },
      status: { type: String, enum: ['submitted', 'graded', 'resubmit'], default: 'submitted' },
      grade: Number,
      submittedAt: Date
    }]
  },

  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

FoundationEnrollmentSchema.index({ student: 1, batch: 1 }, { unique: false });
FoundationEnrollmentSchema.index({ church: 1, status: 1 });
FoundationEnrollmentSchema.index({ organization: 1, status: 1 });

// ==========================================
// FOUNDATION SCHOOL BATCH (Semester/Session)
// Quarterly admissions, graduation dates, teachers
// ==========================================
const FSBatchSchema = new Schema({
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', required: true, index: true },
  batchNumber: { type: Number, required: true },
  name: { type: String, default: '' },
  sessionYear: { type: Number, default: () => new Date().getFullYear(), index: true },
  quarter: { type: Number, enum: [1, 2, 3, 4], index: true },

  registrationOpenDate: Date,
  registrationCloseDate: Date,
  startDate: { type: Date, required: true },
  endDate: Date,
  graduationDate: Date,

  principal: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  teachers: [{ type: Schema.Types.ObjectId, ref: 'User' }],

  status: {
    type: String,
    enum: ['draft', 'registration_open', 'in_progress', 'completed', 'graduated', 'archived'],
    default: 'registration_open',
    index: true
  },

  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

FSBatchSchema.index({ organization: 1, batchNumber: 1 }, { unique: true });

// ==========================================
// FOUNDATION SCHOOL ASSIGNMENT SUBMISSIONS
// ==========================================
const FSAssignmentSubmissionSchema = new Schema({
  enrollment: { type: Schema.Types.ObjectId, ref: 'FoundationEnrollment', required: true, index: true },
  moduleNumber: { type: Number, required: true, index: true },
  assignmentId: { type: String, required: true },
  student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  content: { type: String, default: '' },
  attachments: [{
    title: String,
    url: String,
    type: { type: String, enum: ['pdf', 'image', 'video', 'audio', 'link'], default: 'link' }
  }],
  submittedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['submitted', 'graded', 'resubmit'], default: 'submitted', index: true },
  grade: Number,
  feedback: String,
  gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  gradedAt: Date,
  resubmissionAllowed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

FSAssignmentSubmissionSchema.index({ student: 1, status: 1 });

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
  FSBatch: mongoose.model('FSBatch', FSBatchSchema),
  FSAssignmentSubmission: mongoose.model('FSAssignmentSubmission', FSAssignmentSubmissionSchema),
  ChurchEvent: mongoose.model('ChurchEvent', ChurchEventSchema),
  AttendanceRecord: mongoose.model('AttendanceRecord', AttendanceRecordSchema)
};
