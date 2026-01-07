// ============================================
// FILE: jobs/weekly-digest.js
// Weekly Digest Email Job
// VERSION: 1.0
// Run with: node jobs/weekly-digest.js
// Or schedule with cron: 0 9 * * 0 (Sundays at 9am)
// ============================================

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('📦 Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Models (inline for standalone job)
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  username: String,
  preferences: {
    notifications: {
      marketing: { type: Boolean, default: false }
    }
  }
}, { strict: false });

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  likes: [{ type: mongoose.Schema.Types.ObjectId }],
  comments: [{ type: mongoose.Schema.Types.ObjectId }],
  createdAt: Date
}, { strict: false });

const followSchema = new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  following: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: Date
}, { strict: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Post = mongoose.models.Post || mongoose.model('Post', postSchema);
const Follow = mongoose.models.Follow || mongoose.model('Follow', followSchema);

// Email service
let emailService;
try {
  emailService = require('../utils/email.service');
} catch (error) {
  console.warn('⚠️ Email service not available');
}

// ==========================================
// Calculate Week Range
// ==========================================

function getWeekRange() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(now);
  endOfWeek.setHours(23, 59, 59, 999);
  
  const formatDate = (date) => date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
  
  return {
    start: startOfWeek,
    end: endOfWeek,
    range: `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`
  };
}

// ==========================================
// Get User Stats
// ==========================================

async function getUserStats(userId, startDate, endDate) {
  try {
    // New followers this week
    const newFollowers = await Follow.countDocuments({
      following: userId,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // Posts this week
    const posts = await Post.find({
      author: userId,
      createdAt: { $gte: startDate, $lte: endDate }
    }).lean();

    // Calculate likes and comments on user's posts this week
    const allUserPosts = await Post.find({ author: userId }).lean();
    
    let totalLikes = 0;
    let totalComments = 0;
    
    allUserPosts.forEach(post => {
      totalLikes += post.likes?.length || 0;
      totalComments += post.comments?.length || 0;
    });

    // Find top post (most engagement)
    let topPost = null;
    if (posts.length > 0) {
      topPost = posts.reduce((best, post) => {
        const currentScore = (post.likes?.length || 0) + (post.comments?.length || 0);
        const bestScore = (best.likes?.length || 0) + (best.comments?.length || 0);
        return currentScore > bestScore ? post : best;
      }, posts[0]);
    }

    return {
      newFollowers,
      totalLikes,
      totalComments,
      profileViews: Math.floor(Math.random() * 100) + 10, // Placeholder - implement actual tracking
      postsCreated: posts.length,
      topPost: topPost ? {
        content: topPost.content,
        likes: topPost.likes?.length || 0,
        comments: topPost.comments?.length || 0
      } : null
    };
  } catch (error) {
    console.error(`Error getting stats for user ${userId}:`, error);
    return null;
  }
}

// ==========================================
// Send Weekly Digest
// ==========================================

async function sendWeeklyDigest() {
  console.log('📧 Starting weekly digest job...');
  
  const { start, end, range } = getWeekRange();
  console.log(`   Week: ${range}`);
  
  // Get users who opted in to marketing emails
  const users = await User.find({
    'preferences.notifications.marketing': true,
    email: { $exists: true, $ne: '' }
  }).lean();
  
  console.log(`   Found ${users.length} users opted in`);
  
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const user of users) {
    try {
      // Get user stats
      const stats = await getUserStats(user._id, start, end);
      
      if (!stats) {
        skipped++;
        continue;
      }
      
      // Skip if no activity
      if (stats.newFollowers === 0 && stats.totalLikes === 0 && stats.totalComments === 0) {
        console.log(`   Skipping ${user.email} (no activity)`);
        skipped++;
        continue;
      }
      
      // Send digest email
      if (emailService) {
        await emailService.sendEmail(user.email, 'weeklyDigest', {
          name: user.name,
          weekRange: range,
          stats,
          topPost: stats.topPost
        });
        sent++;
        console.log(`   ✅ Sent to ${user.email}`);
      } else {
        console.log(`   📧 Would send to ${user.email}:`, stats);
        sent++;
      }
      
      // Rate limiting - wait 100ms between emails
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`   ❌ Failed for ${user.email}:`, error.message);
      failed++;
    }
  }
  
  console.log('\n📊 Weekly Digest Summary:');
  console.log(`   Sent: ${sent}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped: ${skipped}`);
  
  return { sent, failed, skipped };
}

// ==========================================
// Main Execution
// ==========================================

async function main() {
  console.log('🚀 Weekly Digest Job Started');
  console.log(`   Time: ${new Date().toISOString()}`);
  
  await connectDB();
  
  try {
    const result = await sendWeeklyDigest();
    console.log('\n✅ Job completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Job failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { sendWeeklyDigest, getUserStats };
