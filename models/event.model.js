// ============================================
// FILE: models/event.model.js
// Community Events Model
// VERSION: 1.0
// ============================================

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  // Basic Info
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 5000
  },
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Media
  coverImage: String,
  images: [String],
  
  // Organizer
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  coHosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Group association (optional)
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  
  // Event Type
  type: {
    type: String,
    enum: ['in-person', 'online', 'hybrid'],
    default: 'online'
  },
  category: {
    type: String,
    enum: [
      'meetup', 'workshop', 'conference', 'webinar',
      'party', 'concert', 'sports', 'networking',
      'charity', 'religious', 'educational', 'other'
    ],
    default: 'meetup'
  },
  
  // Date & Time
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  isAllDay: {
    type: Boolean,
    default: false
  },
  
  // Location (for in-person/hybrid)
  location: {
    name: String,
    address: String,
    city: String,
    country: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  // Online Event Details
  onlineDetails: {
    platform: {
      type: String,
      enum: ['cybev-live', 'zoom', 'google-meet', 'teams', 'discord', 'custom', 'other']
    },
    link: String,
    meetingId: String,
    password: String,
    // Link to CYBEV live stream if using platform
    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveStream'
    }
  },
  
  // Attendance
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['going', 'interested', 'not-going'],
      default: 'going'
    },
    rsvpDate: {
      type: Date,
      default: Date.now
    },
    checkedIn: {
      type: Boolean,
      default: false
    },
    checkedInAt: Date
  }],
  
  // Capacity
  maxAttendees: {
    type: Number,
    default: 0 // 0 = unlimited
  },
  waitlist: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Ticketing (optional)
  isTicketed: {
    type: Boolean,
    default: false
  },
  tickets: [{
    name: String,
    description: String,
    price: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'NGN'
    },
    quantity: Number,
    sold: {
      type: Number,
      default: 0
    },
    available: Boolean
  }],
  
  // Visibility
  visibility: {
    type: String,
    enum: ['public', 'private', 'group-only'],
    default: 'public'
  },
  requiresApproval: {
    type: Boolean,
    default: false
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'published', 'cancelled', 'completed'],
    default: 'draft'
  },
  
  // Recurring events
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrence: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly', 'yearly']
    },
    interval: Number,
    endDate: Date,
    daysOfWeek: [Number], // 0-6 for Sunday-Saturday
    parentEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event'
    }
  },
  
  // Discussion
  allowComments: {
    type: Boolean,
    default: true
  },
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Stats
  stats: {
    views: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    saves: { type: Number, default: 0 }
  },
  
  // Tags
  tags: [String],
  
  // Reminders sent
  remindersSent: {
    oneDay: { type: Boolean, default: false },
    oneHour: { type: Boolean, default: false },
    starting: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Indexes
eventSchema.index({ organizer: 1 });
eventSchema.index({ group: 1 });
eventSchema.index({ startDate: 1 });
eventSchema.index({ status: 1, visibility: 1 });
eventSchema.index({ 'attendees.user': 1 });
eventSchema.index({ tags: 1 });
eventSchema.index({ 'location.city': 1, 'location.country': 1 });

// Virtual for attendee counts
eventSchema.virtual('goingCount').get(function() {
  return this.attendees?.filter(a => a.status === 'going').length || 0;
});

eventSchema.virtual('interestedCount').get(function() {
  return this.attendees?.filter(a => a.status === 'interested').length || 0;
});

eventSchema.virtual('isFull').get(function() {
  if (!this.maxAttendees || this.maxAttendees === 0) return false;
  return this.goingCount >= this.maxAttendees;
});

// Generate slug before save
eventSchema.pre('save', function(next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + 
      '-' + Date.now().toString(36);
  }
  next();
});

// Ensure end date is after start date
eventSchema.pre('save', function(next) {
  if (this.endDate && this.endDate < this.startDate) {
    this.endDate = this.startDate;
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);
