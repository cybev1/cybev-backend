// ============================================
// FILE: cron/social-publisher-processor.js
// PATH: cybev-backend/cron/social-publisher-processor.js
// PURPOSE: Process scheduled social media posts
// VERSION: 1.0.0
// Runs every 5 minutes, publishes due posts
// ============================================

let isRunning = false;
let intervalId = null;

async function processQueue() {
  if (isRunning) return;
  isRunning = true;

  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return;

    // Import from the routes file (models are defined there)
    const { PublishQueue, ConnectedPlatform, publishPost } = require('../routes/socialPublisher.routes');
    if (!PublishQueue) return;

    const now = new Date();

    // Find posts that are due for publishing
    const duePosts = await PublishQueue.find({
      status: 'scheduled',
      scheduledFor: { $lte: now }
    }).limit(20); // Process max 20 at a time

    if (duePosts.length === 0) return;

    console.log(`📤 Social Publisher: Processing ${duePosts.length} due posts...`);

    for (const post of duePosts) {
      try {
        post.status = 'publishing';
        await post.save();

        await publishPost(post);
        console.log(`  ✅ Post ${post._id} → ${post.status}`);
      } catch (err) {
        console.error(`  ❌ Post ${post._id} failed:`, err.message);
        post.status = 'failed';
        post.platforms.forEach(p => {
          if (p.status === 'pending') {
            p.status = 'failed';
            p.error = err.message;
          }
        });
        await post.save();
      }
    }

    console.log(`📤 Social Publisher: Batch complete`);
  } catch (err) {
    console.error('Social publisher processor error:', err.message);
  } finally {
    isRunning = false;
  }
}

module.exports = {
  start() {
    console.log('📤 Social Publisher Processor started (every 5 min)');
    // Run once on startup after delay
    setTimeout(processQueue, 30000);
    // Then every 5 minutes
    intervalId = setInterval(processQueue, 5 * 60 * 1000);
  },
  stop() {
    if (intervalId) clearInterval(intervalId);
  },
  processQueue // Export for manual trigger
};
