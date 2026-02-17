// ============================================
// FILE: church.model.js
// PATH: cybev-backend-main/models/church.model.js
// VERSION: 3.0.0 - Ministry Selection + CE Zones Support
// UPDATED: 2026-02-17
// CHANGES:
//   - Added ministry field (christ_embassy / others)
//   - Added ceZone object for CE zone references
//   - Added customMinistry for other ministries
//   - Enhanced Soul tracker with ceZone support
// ============================================

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ==========================================
// MEMBER TITLES ENUM
// ==========================================
const MEMBER_TITLES = [
  'GO', 'General Overseer', 'Bishop', 'Archbishop', 'Rev', 'Reverend',
  'Pastor', 'Evangelist', 'Prophet', 'Apostle', 'Deacon', 'Deaconess',
  'Elder', 'Minister', 'Dr', 'Prof', 'Engr', 'Barr', 'Chief',
  'Mr', 'Mrs', 'Miss', 'Ms', 'Bro', 'Sis', 'Brother', 'Sister'
];

// ==========================================
// CHURCH MEMBER SUB-SCHEMA (Enhanced)
// ==========================================
const ChurchMemberSchema = new Schema({
  // Link to platform user (optional - can be non-platform members)
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Basic Info (for non-platform members)
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  whatsapp: { type: String, trim: true },
  
  // Title & Role
  title: { 
    type: String, 
    enum: [...MEMBER_TITLES, 'custom'],
    default: 'Bro'
  },
  customTitle: String, // If title is 'custom'
  role: { 
    type: String, 
    enum: ['member', 'worker', 'leader', 'assistant_leader', 'cell_leader', 'fellowship_leader', 'pastor', 'associate_pastor', 'admin'],
    default: 'member'
  },
  department: String, // e.g., "Choir", "Ushering", "Protocol", "Media"
  
  // Spiritual Status
  isSaved: { type: Boolean, default: true },
  salvationDate: Date,
  baptismDate: Date,
  baptismType: { type: String, enum: ['water', 'holy_spirit', 'both', 'none'], default: 'none' },
  
  // Foundation School
  foundationSchool: {
    enrolled: { type: Boolean, default: false },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'FoundationEnrollment' },
    status: { type: String, enum: ['not_enrolled', 'enrolled', 'in_progress', 'completed', 'graduated'], default: 'not_enrolled' },
    graduationDate: Date,
    batchNumber: String
  },
  
  // Personal Details
  dateOfBirth: Date,
  gender: { type: String, enum: ['male', 'female'] },
  maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed'] },
  weddingAnniversary: Date,
  
  // Address
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  
  // Professional Info
  profession: String,
  employer: String,
  skills: [String],
  
  // Local Church Assignment (for zone/group level)
  localChurch: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  cell: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  fellowship: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  
  // Social Media
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String,
    tiktok: String,
    youtube: String
  },
  
  // Emergency Contact
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  
  // Membership Details
  membershipId: String, // Custom ID assigned by church
  joinedAt: { type: Date, default: Date.now },
  joinedHow: { type: String, enum: ['new_convert', 'transfer', 'water_baptism', 'invitation', 'walked_in', 'online'] },
  previousChurch: String,
  status: { type: String, enum: ['active', 'inactive', 'transferred', 'deceased'], default: 'active' },
  
  // Notes & Tags
  notes: String,
  tags: [String], // e.g., ["choir", "first_timer", "volunteer"]
  
  // Photos
  profilePhoto: String,
  
  // Metadata
  addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: true });

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
  
  // ===== NEW: Ministry Selection (v3.0.0) =====
  ministry: { 
    type: String, 
    enum: ['christ_embassy', 'others'], 
    default: 'christ_embassy',
    index: true
  },
  customMinistry: { type: String, trim: true }, // For 'others' ministry
  
  // Christ Embassy Zone Reference (from CE zones data)
  ceZone: {
    id: { type: String },        // Zone ID from ce-zones.data.js (e.g., '28-0')
    name: { type: String },       // Zone name (e.g., 'Accra Ghana Zone')
    category: { type: String }    // Category: 'zone', 'blw', 'ministry', 'ism', 'department'
  },
  // ===== END NEW FIELDS =====
  
  structureMode: { type: String, enum: ['church', 'organization'], default: 'church', index: true },
  description: { type: String, default: '' },
  motto: { type: String, default: '' },
  
  // Hierarchy Links
  parent: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', default: null, index: true },
  zone: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', default: null },
  church: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', default: null },
  
  // Leadership
  leader: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  leaderName: { type: String, trim: true },      // Actual leader's full name (may differ from CYBEV account)
  leaderTitle: { type: String, trim: true },     // Pastor, Deacon, Elder, Brother, Sister, etc.
  assistantLeaders: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  
  // Members (Enhanced)
  members: [ChurchMemberSchema],
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
    time: String,
    title: String,
    type: { type: String, enum: ['service', 'prayer', 'biblestudy', 'meeting', 'special'] },
    isOnline: { type: Boolean, default: false },
    streamUrl: String
  }],

  // Cell Ministry Settings
  cellSettings: {
    maxCapacity: { type: Number, default: 15 },
    splitThreshold: { type: Number, default: 15 },
    allowAutoSplitSuggestion: { type: Boolean, default: true }
  },

  // Linked features
  linkedGroupId: { type: Schema.Types.ObjectId, ref: 'Group' },
  linkedMeetRoomId: { type: Schema.Types.ObjectId, ref: 'Meeting' },
  
  // Branding
  logo: String,
  coverImage: String,
  bannerImage: String,
  colorTheme: { type: String, default: 'purple' },
  
  // Website
  siteId: { type: Schema.Types.ObjectId, ref: 'Site' },
  subdomain: String,
  
  // Social Links
  socialLinks: {
    facebook: String,
    instagram: String,
    twitter: String,
    youtube: String,
    tiktok: String,
    website: String
  },
  
  // Stats (auto-calculated)
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
ChurchOrgSchema.index({ 'members.email': 1 });
ChurchOrgSchema.index({ 'members.phone': 1 });
ChurchOrgSchema.index({ ministry: 1 });
ChurchOrgSchema.index({ 'ceZone.id': 1 });

// Pre-save: Update memberCount
ChurchOrgSchema.pre('save', function(next) {
  if (this.members) {
    this.memberCount = this.members.filter(m => m.status === 'active').length;
  }
  this.updatedAt = new Date();
  next();
});

// ==========================================
// SOUL TRACKER SCHEMA (Enhanced)
// Track new converts and follow-up
// ==========================================
const SoulSchema = new Schema({
  // Basic Info
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true },
  phone: { type: String },
  email: String,
  whatsapp: String,
  
  // Address
  address: String,
  city: String,
  state: String,
  country: String,
  
  // Demographics
  gender: { type: String, enum: ['male', 'female', 'other'] },
  ageGroup: { type: String, enum: ['child', 'teen', 'young_adult', 'adult', 'senior'] },
  dateOfBirth: Date,
  maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed'] },
  profession: String,
  
  // Salvation Info
  salvationDate: { type: Date, default: Date.now },
  salvationType: { 
    type: String, 
    enum: ['first_time', 'rededication', 'transfer', 'water_baptism'],
    default: 'first_time'
  },
  howTheyHeard: { type: String, enum: ['service', 'crusade', 'online', 'friend', 'outreach', 'social_media', 'tv', 'radio', 'rhapsody', 'healing_school', 'teevo', 'other'] },
  howTheyHeardDetails: String,
  referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  witnessedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  prayerRequest: String,
  prayerRequests: [{
    request: String,
    date: { type: Date, default: Date.now },
    answered: { type: Boolean, default: false }
  }],
  
  // ===== NEW: CE Zone Reference (v3.0.0) =====
  ceZone: {
    id: { type: String },
    name: { type: String },
    category: { type: String }
  },
  // ===== END NEW FIELD =====
  
  // Organization Assignment
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', index: true },
  zone: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  church: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  fellowship: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  cell: { type: Schema.Types.ObjectId, ref: 'ChurchOrg' },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  
  // Status Tracking
  status: {
    type: String,
    enum: ['new', 'contacted', 'followup', 'attending', 'member', 'foundation_school', 'graduated', 'inactive', 'lost'],
    default: 'new',
    index: true
  },
  
  // Follow-up Pipeline Stage
  pipelineStage: {
    type: String,
    enum: [
      'new_convert',      // Just saved
      'first_contact',    // Initial call/message made
      'first_visit',      // Visited church/cell
      'regular_attendee', // Attending regularly
      'enrolled_fs',      // Enrolled in Foundation School
      'graduated_fs',     // Graduated Foundation School
      'full_member',      // Full church member
      'active_worker'     // Serving in ministry
    ],
    default: 'new_convert'
  },
  
  // Follow-up History
  followUps: [{
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['call', 'visit', 'message', 'whatsapp', 'email', 'service_attendance', 'cell_attendance'] },
    notes: String,
    outcome: { type: String, enum: ['successful', 'no_answer', 'scheduled', 'declined', 'wrong_number', 'busy', 'not_interested'] },
    followedUpBy: { type: Schema.Types.ObjectId, ref: 'User' },
    nextFollowUpDate: Date,
    duration: Number // Call duration in minutes
  }],
  
  nextFollowUpDate: Date,
  lastContactDate: Date,
  totalFollowUps: { type: Number, default: 0 },
  
  // Foundation School Progress
  foundationSchool: {
    enrolled: { type: Boolean, default: false },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'FoundationEnrollment' },
    batchId: { type: Schema.Types.ObjectId },
    status: { type: String, enum: ['not_enrolled', 'enrolled', 'in_progress', 'completed', 'graduated'], default: 'not_enrolled' },
    enrollmentDate: Date,
    graduationDate: Date,
    certificateNumber: String
  },
  
  // Converted to member?
  convertedToMember: { type: Boolean, default: false },
  memberRecord: { type: Schema.Types.ObjectId }, // Reference to member in ChurchOrg.members
  conversionDate: Date,
  
  // Social Media
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String
  },
  
  // Tags & Notes
  tags: [String],
  notes: String,
  internalNotes: String, // Only visible to leaders
  
  // Photos
  photo: String,
  
  // Metadata
  addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  source: { type: String, enum: ['manual', 'form', 'crusade', 'online', 'import'], default: 'manual' },
  sourceDetails: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
SoulSchema.index({ organization: 1, status: 1 });
SoulSchema.index({ assignedTo: 1, status: 1 });
SoulSchema.index({ phone: 1 });
SoulSchema.index({ createdAt: -1 });
SoulSchema.index({ nextFollowUpDate: 1 });
SoulSchema.index({ 'ceZone.id': 1 });

// Pre-save: Update counters
SoulSchema.pre('save', function(next) {
  if (this.followUps) {
    this.totalFollowUps = this.followUps.length;
    if (this.followUps.length > 0) {
      this.lastContactDate = this.followUps[this.followUps.length - 1].date;
    }
  }
  this.updatedAt = new Date();
  next();
});

// ==========================================
// ATTENDANCE RECORD SCHEMA
// ==========================================
const AttendanceRecordSchema = new Schema({
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', required: true, index: true },
  
  // Event Details
  date: { type: Date, required: true, index: true },
  eventType: { 
    type: String, 
    enum: ['sunday_service', 'midweek_service', 'cell_meeting', 'prayer_meeting', 'special_program', 'bible_study', 'outreach'],
    required: true
  },
  eventTitle: String,
  
  // Counts
  totalAttendance: { type: Number, default: 0 },
  maleCount: { type: Number, default: 0 },
  femaleCount: { type: Number, default: 0 },
  childrenCount: { type: Number, default: 0 },
  firstTimers: { type: Number, default: 0 },
  newConverts: { type: Number, default: 0 },
  testimonies: { type: Number, default: 0 },
  
  // Detailed Attendees (optional)
  attendees: [{
    member: { type: Schema.Types.ObjectId },
    name: String,
    type: { type: String, enum: ['member', 'first_timer', 'visitor', 'new_convert'] }
  }],
  
  // First Timers Details
  firstTimersList: [{
    name: String,
    phone: String,
    email: String,
    invitedBy: String,
    convertedToSoul: { type: Boolean, default: false },
    soulId: { type: Schema.Types.ObjectId, ref: 'Soul' }
  }],
  
  // Offering
  offering: {
    total: { type: Number, default: 0 },
    tithes: { type: Number, default: 0 },
    partnership: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    currency: { type: String, default: 'NGN' }
  },
  
  // Notes
  notes: String,
  highlights: String,
  challenges: String,
  prayerPoints: [String],
  
  // Media
  photos: [String],
  
  // Metadata
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['draft', 'submitted', 'approved'], default: 'draft' },
  submittedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AttendanceRecordSchema.index({ organization: 1, date: -1 });
AttendanceRecordSchema.index({ organization: 1, eventType: 1 });

// ==========================================
// CELL REPORT SCHEMA
// Weekly cell/fellowship reports
// ==========================================
const CellReportSchema = new Schema({
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', required: true, index: true },
  
  // Report Period
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  reportMonth: String, // "2026-01"
  reportWeek: Number, // Week number in month (1-5)
  
  // Meeting Details
  meetingHeld: { type: Boolean, default: true },
  meetingDate: Date,
  meetingVenue: String,
  meetingDuration: Number, // minutes
  topic: String,
  
  // Attendance
  attendance: {
    total: { type: Number, default: 0 },
    members: { type: Number, default: 0 },
    visitors: { type: Number, default: 0 },
    firstTimers: { type: Number, default: 0 },
    children: { type: Number, default: 0 }
  },
  
  // Soul Winning
  soulWinning: {
    soulsWon: { type: Number, default: 0 },
    soulsFollowedUp: { type: Number, default: 0 },
    soulDetails: [{
      name: String,
      phone: String,
      linkedSoulId: { type: Schema.Types.ObjectId, ref: 'Soul' }
    }]
  },
  
  // Outreach Activities
  outreach: {
    conducted: { type: Boolean, default: false },
    type: { type: String, enum: ['door_to_door', 'street', 'market', 'campus', 'online', 'other'] },
    location: String,
    peopleReached: { type: Number, default: 0 },
    materialsDistributed: { type: Number, default: 0 }
  },
  
  // Offering
  offering: {
    cellOffering: { type: Number, default: 0 },
    partnership: { type: Number, default: 0 },
    currency: { type: String, default: 'NGN' }
  },
  
  // Prayer & Testimonies
  prayerPoints: [String],
  testimonies: [{
    summary: String,
    category: { type: String, enum: ['healing', 'provision', 'salvation', 'breakthrough', 'other'] }
  }],
  
  // Challenges & Needs
  challenges: String,
  assistanceNeeded: String,
  
  // Notes
  leaderNotes: String,
  highlights: String,
  
  // Photos
  photos: [String],
  
  // Status
  status: { type: String, enum: ['draft', 'submitted', 'reviewed', 'approved'], default: 'draft' },
  submittedAt: Date,
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNotes: String,
  
  // Metadata
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

CellReportSchema.index({ organization: 1, weekStartDate: -1 });
CellReportSchema.index({ organization: 1, status: 1 });

// ==========================================
// FOUNDATION MODULE SCHEMA
// ==========================================
const FoundationModuleSchema = new Schema({
  moduleNumber: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  description: { type: String, default: '' },
  icon: { type: String, default: 'BookOpen' },
  color: { type: String, default: 'purple' },
  
  // Lessons stored directly in the module
  lessons: [{
    lessonNumber: { type: Number, required: true },
    title: { type: String, required: true },
    subtitle: String,
    content: { type: String, required: true }, // Rich text / Markdown
    scriptureReferences: [String],
    keyPoints: [String],
    practicalApplication: String,
    prayerPoints: [String],
    memoryVerse: {
      text: String,
      reference: String
    },
    questions: [{
      question: String,
      type: { type: String, enum: ['multiple_choice', 'true_false', 'short_answer'], default: 'multiple_choice' },
      options: [String],
      correctAnswer: Schema.Types.Mixed,
      explanation: String,
      points: { type: Number, default: 10 }
    }],
    estimatedMinutes: { type: Number, default: 30 },
    order: { type: Number, default: 0 }
  }],
  totalLessons: { type: Number, default: 0 },
  
  // Quiz for entire module
  quiz: {
    questions: [{
      question: String,
      type: { type: String, enum: ['multiple_choice', 'true_false', 'short_answer'], default: 'multiple_choice' },
      options: [String],
      correctAnswer: Schema.Types.Mixed,
      explanation: String,
      points: { type: Number, default: 10 }
    }],
    passingScore: { type: Number, default: 70 },
    timeLimit: { type: Number, default: 30 } // minutes
  },
  
  // Assignment
  assignment: {
    title: String,
    instructions: String,
    dueAfterDays: { type: Number, default: 7 }
  },
  
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ==========================================
// FOUNDATION ENROLLMENT SCHEMA
// ==========================================
const FoundationEnrollmentSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', index: true },
  
  // Batch Info
  batch: {
    number: String,
    name: String,
    startDate: Date,
    graduationDate: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['enrolled', 'active', 'paused', 'completed', 'graduated', 'dropped'],
    default: 'enrolled'
  },
  
  // Progress
  progress: {
    currentModule: { type: Number, default: 1 },
    currentLesson: { type: Number, default: 1 },
    completedModules: [Number],
    completedLessons: [{
      moduleNumber: Number,
      lessonNumber: Number,
      completedAt: Date
    }],
    quizScores: [{
      moduleNumber: Number,
      score: Number,
      totalQuestions: Number,
      passed: Boolean,
      attemptedAt: Date,
      answers: Schema.Types.Mixed
    }],
    assignments: [{
      moduleNumber: Number,
      submittedAt: Date,
      content: String,
      grade: Number,
      feedback: String,
      gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      gradedAt: Date
    }],
    overallProgress: { type: Number, default: 0 }, // 0-100
    averageQuizScore: { type: Number, default: 0 }
  },
  
  // Certificate
  certificateNumber: String,
  certificateIssuedAt: Date,
  certificateIssuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Metadata
  enrolledAt: { type: Date, default: Date.now },
  completedAt: Date,
  graduatedAt: Date,
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

FoundationEnrollmentSchema.index({ student: 1, status: 1 });
FoundationEnrollmentSchema.index({ organization: 1, status: 1 });

// ==========================================
// CHURCH EVENT SCHEMA
// ==========================================
const ChurchEventSchema = new Schema({
  organization: { type: Schema.Types.ObjectId, ref: 'ChurchOrg', required: true, index: true },
  
  title: { type: String, required: true },
  description: String,
  type: { 
    type: String, 
    enum: ['service', 'conference', 'retreat', 'outreach', 'training', 'celebration', 'prayer', 'other'],
    default: 'service'
  },
  
  // Schedule
  startDate: { type: Date, required: true },
  endDate: Date,
  startTime: String,
  endTime: String,
  isAllDay: { type: Boolean, default: false },
  isRecurring: { type: Boolean, default: false },
  recurrence: {
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
    interval: { type: Number, default: 1 },
    endDate: Date
  },
  
  // Location
  venue: String,
  address: String,
  isOnline: { type: Boolean, default: false },
  streamUrl: String,
  meetingLink: String,
  
  // Media
  bannerImage: String,
  photos: [String],
  
  // Registration
  requiresRegistration: { type: Boolean, default: false },
  maxAttendees: Number,
  registrationDeadline: Date,
  registrations: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: String,
    email: String,
    phone: String,
    registeredAt: { type: Date, default: Date.now },
    attended: { type: Boolean, default: false }
  }],
  
  // Visibility
  isPublic: { type: Boolean, default: true },
  visibleTo: { type: String, enum: ['all', 'members', 'leaders'], default: 'all' },
  
  // Metadata
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ChurchEventSchema.index({ organization: 1, startDate: 1 });
ChurchEventSchema.index({ startDate: 1, isPublic: 1 });

// ==========================================
// EXPORTS
// ==========================================
const ChurchOrg = mongoose.model('ChurchOrg', ChurchOrgSchema);
const Soul = mongoose.model('Soul', SoulSchema);
const AttendanceRecord = mongoose.model('AttendanceRecord', AttendanceRecordSchema);
const CellReport = mongoose.model('CellReport', CellReportSchema);
const FoundationModule = mongoose.model('FoundationModule', FoundationModuleSchema);
const FoundationEnrollment = mongoose.model('FoundationEnrollment', FoundationEnrollmentSchema);
const ChurchEvent = mongoose.model('ChurchEvent', ChurchEventSchema);

module.exports = {
  ChurchOrg,
  Soul,
  AttendanceRecord,
  CellReport,
  FoundationModule,
  FoundationEnrollment,
  ChurchEvent,
  MEMBER_TITLES
};
