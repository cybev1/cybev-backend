// ============================================
// FILE: models/user.model.js
// User Model with OAuth Provider Support
// VERSION: 5.1 - Added coverImage for profile covers
// ============================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      // Password not required if using OAuth
      return !this.oauthProvider;
    },
    minlength: 6
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  
  // ==========================================
  // NEW: Cover Image for Profile
  // ==========================================
  coverImage: {
    type: String,
    default: ''
  },
  
  // ==========================================
  // NEW: Location for Profile
  // ==========================================
  location: {
    type: String,
    default: ''
  },
  
  // ==========================================
  // ENHANCED: Detailed Location Data
  // ==========================================
  locationData: {
    // User-provided location (from registration form)
    providedCountry: { type: String, default: '' },
    providedCity: { type: String, default: '' },
    providedLocation: { type: String, default: '' }, // Combined for display
    
    // Device-detected location (from IP geolocation)
    detectedCountry: { type: String, default: '' },
    detectedCity: { type: String, default: '' },
    detectedRegion: { type: String, default: '' },
    detectedIP: { type: String, default: '' },
    detectedTimezone: { type: String, default: '' },
    detectedAt: { type: Date },
    
    // Location verification status
    locationType: {
      type: String,
      enum: ['verified', 'lived_place', 'unverified', 'mismatch'],
      default: 'unverified'
    },
    // True if user-provided location matches detected location
    locationMatches: { type: Boolean, default: null },
    
    // Coordinates (optional, if available)
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  
  // ==========================================
  // NEW: Website for Profile
  // ==========================================
  website: {
    type: String,
    default: ''
  },
  
  // ==========================================
  // OAuth Provider Fields
  // ==========================================
  oauthProvider: {
    type: String,
    enum: ['google', 'facebook', 'apple', 'twitter', null],
    default: null
  },
  oauthId: {
    type: String,
    sparse: true,
    index: true
  },
  // Store provider-specific data
  oauthProfile: {
    google: {
      id: String,
      email: String,
      name: String,
      picture: String,
      accessToken: String,
      refreshToken: String
    },
    facebook: {
      id: String,
      email: String,
      name: String,
      picture: String,
      accessToken: String
    },
    apple: {
      id: String,
      email: String,
      name: String,
      accessToken: String,
      refreshToken: String
    },
    twitter: {
      id: String,
      username: String,
      name: String,
      picture: String,
      accessToken: String,
      accessSecret: String
    }
  },
  // Track which providers are linked
  linkedProviders: [{
    type: String,
    enum: ['google', 'facebook', 'apple', 'twitter', 'email']
  }],
  
  // ==========================================
  // Domain & Profile
  // ==========================================
  customDomain: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  domainVerified: {
    type: Boolean,
    default: false
  },
  
  // ==========================================
  // Social Stats (UPDATED - standardized names)
  // ==========================================
  followerCount: {
    type: Number,
    default: 0
  },
  followingCount: {
    type: Number,
    default: 0
  },
  // Also support alternative naming
  followersCount: {
    type: Number,
    default: 0
  },
  
  // ==========================================
  // Onboarding
  // ==========================================
  hasCompletedOnboarding: {
    type: Boolean,
    default: false
  },
  onboardingData: {
    fullName: String,
    role: String,
    goals: [String],
    experience: String,
    completedAt: Date
  },
  
  // ==========================================
  // Social Links
  // ==========================================
  socialLinks: {
    twitter: String,
    linkedin: String,
    github: String,
    website: String,
    instagram: String,
    youtube: String,
    tiktok: String
  },
  
  // ==========================================
  // User Preferences
  // ==========================================
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    newsletterSubscription: {
      type: Boolean,
      default: false
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system', 'auto'],
      default: 'system'
    },
    language: {
      type: String,
      default: 'en'
    },
    notifications: {
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      follows: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      tips: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false }
    }
  },
  
  // ==========================================
  // Verification & Status
  // ==========================================
  isVerified: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['user', 'creator', 'moderator', 'admin'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  
  // ==========================================
  // Ban Management (for Admin)
  // ==========================================
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: {
    type: String,
    default: null
  },
  banExpires: {
    type: Date,
    default: null
  },
  bannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  bannedAt: {
    type: Date,
    default: null
  },
  
  // ==========================================
  // Email Verification
  // ==========================================
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: undefined
  },
  emailVerificationExpires: {
    type: Date,
    default: undefined
  },
  
  // ==========================================
  // Password Reset
  // ==========================================
  resetPasswordToken: {
    type: String,
    default: undefined
  },
  resetPasswordExpires: {
    type: Date,
    default: undefined
  },
  
  // ==========================================
  // Login & Security
  // ==========================================
  lastLogin: {
    type: Date
  },
  loginHistory: [{
    ip: String,
    userAgent: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    location: String,
    provider: String
  }],
  trustedIPs: [{
    ip: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastKnownIP: {
    type: String,
    default: ''
  },
  suspiciousLoginAttempts: {
    type: Number,
    default: 0
  },
  
  // ==========================================
  // Two-Factor Auth (Future)
  // ==========================================
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String
  },
  backupCodes: [{
    code: String,
    used: { type: Boolean, default: false }
  }]
  
}, {
  timestamps: true
});

// ==========================================
// Pre-save Hooks
// ==========================================

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Auto-generate username from email if not provided
userSchema.pre('save', async function(next) {
  if (!this.username && this.email) {
    const baseUsername = this.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    let username = baseUsername;
    let counter = 1;
    
    while (await mongoose.model('User').findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }
    
    this.username = username;
  }
  next();
});

// Initialize linkedProviders based on how user signed up
userSchema.pre('save', function(next) {
  if (this.isNew) {
    if (!this.linkedProviders) {
      this.linkedProviders = [];
    }
    
    if (this.oauthProvider && !this.linkedProviders.includes(this.oauthProvider)) {
      this.linkedProviders.push(this.oauthProvider);
    }
    
    if (this.password && !this.linkedProviders.includes('email')) {
      this.linkedProviders.push('email');
    }
  }
  next();
});

// Sync followerCount and followersCount
userSchema.pre('save', function(next) {
  if (this.isModified('followerCount')) {
    this.followersCount = this.followerCount;
  }
  if (this.isModified('followersCount')) {
    this.followerCount = this.followersCount;
  }
  next();
});

// ==========================================
// Instance Methods
// ==========================================

userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.emailVerificationToken;
  delete obj.twoFactorSecret;
  delete obj.backupCodes;
  if (obj.oauthProfile) {
    Object.keys(obj.oauthProfile).forEach(provider => {
      if (obj.oauthProfile[provider]) {
        delete obj.oauthProfile[provider].accessToken;
        delete obj.oauthProfile[provider].refreshToken;
        delete obj.oauthProfile[provider].accessSecret;
      }
    });
  }
  return obj;
};

userSchema.methods.canUsePassword = function() {
  return !!this.password && this.linkedProviders.includes('email');
};

userSchema.methods.linkProvider = function(provider, profileData) {
  if (!this.oauthProfile) {
    this.oauthProfile = {};
  }
  this.oauthProfile[provider] = profileData;
  
  if (!this.linkedProviders.includes(provider)) {
    this.linkedProviders.push(provider);
  }
};

userSchema.methods.unlinkProvider = function(provider) {
  if (this.oauthProfile && this.oauthProfile[provider]) {
    this.oauthProfile[provider] = undefined;
  }
  
  this.linkedProviders = this.linkedProviders.filter(p => p !== provider);
  
  if (this.oauthProvider === provider) {
    this.oauthProvider = null;
    this.oauthId = null;
  }
};

// ==========================================
// Virtual Fields
// ==========================================

userSchema.virtual('profileUrl').get(function() {
  if (this.customDomain && this.domainVerified) {
    return `https://${this.customDomain}`;
  }
  return `${process.env.APP_URL || 'https://cybev.io'}/@${this.username}`;
});

userSchema.virtual('hasPassword').get(function() {
  return !!this.password;
});

// ==========================================
// Indexes
// ==========================================
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ customDomain: 1 });
userSchema.index({ oauthProvider: 1, oauthId: 1 });
userSchema.index({ 'oauthProfile.google.id': 1 });
userSchema.index({ 'oauthProfile.facebook.id': 1 });
userSchema.index({ 'oauthProfile.apple.id': 1 });

module.exports = mongoose.model('User', userSchema);
