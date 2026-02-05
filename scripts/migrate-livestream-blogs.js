// ============================================
// MIGRATION: Fix Old Livestream Blogs
// Set liveStreamId field on blogs that are missing it
// ============================================

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const LiveStream = require('./models/livestream.model');
const Blog = require('./models/blog.model');

async function migrateOldLiveBlogs() {
  try {
    console.log('🔄 Starting migration: Fix old livestream blogs...\n');
    
    // Connect to MongoDB
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    
    console.log('✅ Connected to MongoDB\n');
    
    // Step 1: Find all livestreams with feedPostId
    console.log('📊 Step 1: Finding all livestreams with feedPostId...');
    const streams = await LiveStream.find(
      { feedPostId: { $exists: true, $ne: null } },
      { _id: 1, feedPostId: 1 }
    );
    
    console.log(`Found ${streams.length} livestreams with feedPostId\n`);
    
    if (streams.length === 0) {
      console.log('✅ No livestreams to process. Migration complete!');
      process.exit(0);
    }
    
    // Step 2: Update blogs to have liveStreamId
    console.log('📝 Step 2: Updating blogs with liveStreamId...');
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const stream of streams) {
      try {
        const blog = await Blog.findById(stream.feedPostId);
        
        if (!blog) {
          console.log(`⚠️ Blog ${stream.feedPostId} not found for stream ${stream._id}`);
          skipped++;
          continue;
        }
        
        // Check if already has liveStreamId
        if (blog.liveStreamId && blog.liveStreamId.toString() === stream._id.toString()) {
          skipped++;
          continue;
        }
        
        // Update the blog
        blog.liveStreamId = stream._id;
        blog.contentType = blog.contentType || 'live';
        blog.type = blog.type || 'live';
        
        await blog.save();
        updated++;
        
        if (updated % 10 === 0) {
          console.log(`  ✅ Updated ${updated} blogs...`);
        }
      } catch (e) {
        console.error(`❌ Error updating blog ${stream.feedPostId}:`, e.message);
        errors++;
      }
    }
    
    console.log(`\n📊 Migration Results:`);
    console.log(`  ✅ Updated: ${updated}`);
    console.log(`  ⏭️  Skipped: ${skipped}`);
    console.log(`  ❌ Errors: ${errors}`);
    
    if (updated > 0) {
      console.log(`\n✨ Successfully migrated ${updated} livestream blogs!`);
    }
    
    console.log('\n🎉 Migration complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateOldLiveBlogs();
