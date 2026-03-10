// ============================================
// FILE: scripts/patch-user-model.js
// Run once to add isSynthetic field to existing users
// Usage: node scripts/patch-user-model.js
// ============================================

const mongoose = require('mongoose');
require('dotenv').config();

async function patch() {
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ No MONGODB_URI found in env');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  // Add isSynthetic: false to all existing users that don't have it
  const result = await db.collection('users').updateMany(
    { isSynthetic: { $exists: false } },
    { $set: { isSynthetic: false, syntheticMeta: null } }
  );

  console.log(`✅ Patched ${result.modifiedCount} users with isSynthetic: false`);

  // Create index for fast filtering
  await db.collection('users').createIndex({ isSynthetic: 1 });
  console.log('✅ Created index on isSynthetic');

  await mongoose.disconnect();
  console.log('Done!');
}

patch().catch(console.error);
