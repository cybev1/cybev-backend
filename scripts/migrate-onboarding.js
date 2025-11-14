// ============================================
// FILE: scripts/migrate-onboarding.js
// ============================================
// Run this ONCE to add onboarding fields to existing users
// Usage: node scripts/migrate-onboarding.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');

async function migrateOnboarding() {
  try {
    console.log('🚀 Starting onboarding migration...');
    console.log('📦 Connecting to MongoDB...');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find all users without hasCompletedOnboarding field
    const usersWithoutField = await User.find({
      hasCompletedOnboarding: { $exists: false }
    });
    
    console.log(`📊 Found ${usersWithoutField.length} users without onboarding field`);
    
    if (usersWithoutField.length === 0) {
      console.log('✅ All users already have onboarding field!');
      await mongoose.disconnect();
      return;
    }
    
    // Update all existing users to hasCompletedOnboarding: true
    // (They're already using the platform, so we assume they're set up)
    const result = await User.updateMany(
      { hasCompletedOnboarding: { $exists: false } },
      { 
        $set: { 
          hasCompletedOnboarding: true,
          'onboardingData.completedAt': new Date()
        } 
      }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} users`);
    console.log(`📝 Set hasCompletedOnboarding: true for existing users`);
    
    // Verify the update
    const verifyCount = await User.countDocuments({
      hasCompletedOnboarding: true
    });
    
    console.log(`🔍 Verification: ${verifyCount} users now have onboarding completed`);
    
    console.log('🎉 Migration completed successfully!');
    
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

// Run the migration
migrateOnboarding();
