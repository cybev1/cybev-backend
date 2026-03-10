// ============================================
// FILE: routes/admin-fake-users.routes.js
// Admin Fake User Generation & Engagement Simulation
// VERSION: 1.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

console.log('🤖 Admin Fake Users Routes v1.0 loaded');

// Auth middleware
let verifyToken;
try { verifyToken = require('../middleware/verifyToken'); } catch {
  try { verifyToken = require('../middleware/auth'); } catch {
    verifyToken = (req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token' });
      try {
        req.user = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
        next();
      } catch { return res.status(401).json({ error: 'Invalid token' }); }
    };
  }
}

// Admin check middleware
const requireAdmin = async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id || req.user._id);
    if (!user || (user.role !== 'admin' && !user.isAdmin)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminUser = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Auth check failed' });
  }
};

// Import generator
let FakeUserGenerator;
try {
  ({ FakeUserGenerator } = require('../services/fake-user-generator.service'));
  console.log('✅ FakeUserGenerator loaded');
} catch (e) {
  console.log('⚠️ FakeUserGenerator not available:', e.message);
}

// ==========================================
// GET /api/admin/fake-users/stats
// Dashboard statistics
// ==========================================
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    
    const [totalSynthetic, totalReal, recentSynthetic, countryBreakdown] = await Promise.all([
      User.countDocuments({ isSynthetic: true }),
      User.countDocuments({ $or: [{ isSynthetic: false }, { isSynthetic: { $exists: false } }] }),
      User.countDocuments({ 
        isSynthetic: true, 
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
      }),
      User.aggregate([
        { $match: { isSynthetic: true } },
        { $group: { _id: '$locationData.providedCountry', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
    ]);

    // Get engagement stats
    let totalPosts = 0, totalComments = 0, totalLikes = 0;
    try {
      const Post = mongoose.model('Post');
      const syntheticUserIds = await User.find({ isSynthetic: true }).select('_id').lean();
      const ids = syntheticUserIds.map(u => u._id);
      totalPosts = await Post.countDocuments({ $or: [{ author: { $in: ids } }, { authorId: { $in: ids } }] });
    } catch {}

    res.json({
      ok: true,
      stats: {
        totalSynthetic,
        totalReal,
        recentSynthetic,
        ratio: totalReal > 0 ? (totalSynthetic / totalReal).toFixed(1) : '∞',
        countryBreakdown: countryBreakdown.map(c => ({ country: c._id || 'Unknown', count: c.count })),
        engagement: { totalPosts, totalComments, totalLikes },
      }
    });
  } catch (error) {
    console.error('❌ Stats error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /api/admin/fake-users/generate
// Generate batch of fake users
// ==========================================
router.post('/generate', verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!FakeUserGenerator) {
      return res.status(500).json({ error: 'FakeUserGenerator service not loaded' });
    }

    const { 
      count = 100, 
      country = null,  // null = random weighted distribution
      daysBack = 365,  // How far back to stagger createdAt dates
    } = req.body;

    const maxCount = 5000; // Safety limit per request
    const actualCount = Math.min(count, maxCount);

    console.log(`🤖 Generating ${actualCount} fake users...`);
    const startTime = Date.now();

    const generator = new FakeUserGenerator();
    const batchId = `batch_${Date.now()}`;
    const userData = [];

    for (let i = 0; i < actualCount; i++) {
      userData.push(generator.generateUser({ 
        country: country || undefined,
        daysBack,
        batchId,
      }));
    }

    // Bulk insert (much faster than individual saves)
    const User = mongoose.model('User');
    
    // Insert in chunks of 500 to avoid memory issues
    let inserted = 0;
    let errors = 0;
    const chunkSize = 500;
    
    for (let i = 0; i < userData.length; i += chunkSize) {
      const chunk = userData.slice(i, i + chunkSize);
      try {
        const result = await User.insertMany(chunk, { 
          ordered: false, // Continue on duplicate key errors
          rawResult: true 
        });
        inserted += result.insertedCount || chunk.length;
      } catch (bulkError) {
        // Handle duplicate key errors gracefully
        if (bulkError.insertedDocs) {
          inserted += bulkError.insertedDocs.length;
        }
        errors += chunk.length - (bulkError.insertedDocs?.length || 0);
        console.log(`⚠️ Chunk had ${errors} duplicate/error entries`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Generated ${inserted} users in ${elapsed}s (${errors} errors)`);

    res.json({
      ok: true,
      generated: inserted,
      errors,
      batchId,
      elapsed: `${elapsed}s`,
      rate: `${Math.round(inserted / parseFloat(elapsed))}/s`,
    });

  } catch (error) {
    console.error('❌ Generate error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET /api/admin/fake-users/list
// List fake users with pagination
// ==========================================
router.get('/list', verifyToken, requireAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;
    const country = req.query.country;
    const search = req.query.search;

    const filter = { isSynthetic: true };
    if (country) filter['locationData.providedCountry'] = country;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name email username avatar location bio personalInfo.gender followerCount createdAt syntheticMeta')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      ok: true,
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// DELETE /api/admin/fake-users/batch/:batchId
// Delete a batch of fake users
// ==========================================
router.delete('/batch/:batchId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const result = await User.deleteMany({ 
      isSynthetic: true, 
      'syntheticMeta.batchId': req.params.batchId 
    });
    
    res.json({
      ok: true,
      deleted: result.deletedCount,
      batchId: req.params.batchId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// DELETE /api/admin/fake-users/all
// Delete ALL fake users (careful!)
// ==========================================
router.delete('/all', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_SYNTHETIC') {
      return res.status(400).json({ error: 'Must confirm with DELETE_ALL_SYNTHETIC' });
    }

    const User = mongoose.model('User');
    const result = await User.deleteMany({ isSynthetic: true });
    
    console.log(`🗑️ Deleted ${result.deletedCount} synthetic users`);
    res.json({
      ok: true,
      deleted: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /api/admin/fake-users/simulate-engagement
// Make synthetic users engage with content
// ==========================================
router.post('/simulate-engagement', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      targetType = 'posts',  // posts, blogs, vlogs, livestreams
      action = 'like',       // like, comment, follow, view, share
      count = 50,            // number of engagements
      targetId = null,       // specific content ID (null = random)
    } = req.body;

    const User = mongoose.model('User');
    const maxCount = Math.min(count, 500);

    // Get random synthetic users
    const syntheticUsers = await User.aggregate([
      { $match: { isSynthetic: true, status: 'active' } },
      { $sample: { size: maxCount } },
      { $project: { _id: 1, name: 1, username: 1 } }
    ]);

    if (syntheticUsers.length === 0) {
      return res.status(400).json({ error: 'No synthetic users available. Generate some first.' });
    }

    let engaged = 0;
    let errors = 0;

    // ---- LIKE ACTION ----
    if (action === 'like') {
      const Post = mongoose.model('Post');
      let targets;
      
      if (targetId) {
        targets = [await Post.findById(targetId)].filter(Boolean);
      } else {
        targets = await Post.find({ status: 'active', isDeleted: { $ne: true } })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();
      }

      if (targets.length === 0) {
        return res.status(400).json({ error: 'No posts found to like' });
      }

      for (const user of syntheticUsers) {
        try {
          const post = targets[Math.floor(Math.random() * targets.length)];
          const reactions = ['like', 'love', 'haha', 'wow'];
          const reaction = reactions[Math.floor(Math.random() * reactions.length)];
          
          await Post.findOneAndUpdate(
            { _id: post._id, 'likes.user': { $ne: user._id } },
            { 
              $push: { likes: { user: user._id, reaction, createdAt: new Date() } },
              $inc: { likeCount: 1 }
            }
          );
          engaged++;
        } catch { errors++; }
      }
    }

    // ---- COMMENT ACTION ----
    if (action === 'comment') {
      const Post = mongoose.model('Post');
      const COMMENTS = [
        'Amazing content! 🔥', 'Love this! ❤️', 'So inspiring!', 'Great post!',
        'This is exactly what I needed to hear today', 'Keep it up! 💪',
        'Wow, this is incredible!', 'Thank you for sharing this!', 'Blessed! 🙏',
        'This spoke to me deeply', 'Amen! 🙌', 'So powerful!', 'Absolutely beautiful!',
        'I needed this today, thank you!', 'Sharing this with my friends!',
        'God is good! 🙏', 'This is gold! 💛', 'More of this please!',
        'What a blessing!', 'So true! Well said!', 'This is fire! 🔥🔥',
        'Love the energy!', 'Incredible work!', 'You are so talented!',
        'This made my day! 😊', 'Keep creating amazing content!',
      ];

      let targets;
      if (targetId) {
        targets = [await Post.findById(targetId)].filter(Boolean);
      } else {
        targets = await Post.find({ status: 'active', isDeleted: { $ne: true } })
          .sort({ createdAt: -1 }).limit(20).lean();
      }

      for (const user of syntheticUsers) {
        try {
          const post = targets[Math.floor(Math.random() * targets.length)];
          const comment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
          
          await Post.findByIdAndUpdate(post._id, {
            $push: { comments: { user: user._id, userName: user.name, content: comment, createdAt: new Date() } },
            $inc: { commentCount: 1 }
          });
          engaged++;
        } catch { errors++; }
      }
    }

    // ---- FOLLOW ACTION ----
    if (action === 'follow') {
      const Follow = mongoose.models.Follow;
      const realUsers = await User.find({ 
        $or: [{ isSynthetic: false }, { isSynthetic: { $exists: false } }],
        status: 'active' 
      }).select('_id').limit(50).lean();

      if (Follow && realUsers.length > 0) {
        for (const synUser of syntheticUsers) {
          try {
            const targetUser = realUsers[Math.floor(Math.random() * realUsers.length)];
            
            const exists = await Follow.findOne({ follower: synUser._id, following: targetUser._id });
            if (!exists) {
              await Follow.create({ follower: synUser._id, following: targetUser._id });
              await User.findByIdAndUpdate(targetUser._id, { $inc: { followerCount: 1, followersCount: 1 } });
              await User.findByIdAndUpdate(synUser._id, { $inc: { followingCount: 1 } });
              engaged++;
            }
          } catch { errors++; }
        }
      } else {
        return res.status(400).json({ error: 'Follow model not available or no real users found' });
      }
    }

    // ---- VIEW ACTION ----
    if (action === 'view') {
      const Post = mongoose.model('Post');
      let targets;
      if (targetId) {
        targets = [await Post.findById(targetId)].filter(Boolean);
      } else {
        targets = await Post.find({ status: 'active', isDeleted: { $ne: true } })
          .sort({ createdAt: -1 }).limit(20).lean();
      }

      for (const user of syntheticUsers) {
        try {
          const post = targets[Math.floor(Math.random() * targets.length)];
          await Post.findByIdAndUpdate(post._id, { $inc: { viewCount: 1 } });
          engaged++;
        } catch { errors++; }
      }
    }

    console.log(`🤖 Engagement simulation: ${engaged} ${action}s on ${targetType} (${errors} errors)`);

    res.json({
      ok: true,
      action,
      targetType,
      engaged,
      errors,
      usersInvolved: syntheticUsers.length,
    });

  } catch (error) {
    console.error('❌ Engagement simulation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /api/admin/fake-users/simulate-stream-viewers
// Add synthetic viewers to a livestream
// ==========================================
router.post('/simulate-stream-viewers', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { streamId, viewerCount = 50 } = req.body;
    if (!streamId) return res.status(400).json({ error: 'streamId required' });

    const User = mongoose.model('User');
    const LiveStream = mongoose.model('LiveStream');

    const syntheticUsers = await User.aggregate([
      { $match: { isSynthetic: true, status: 'active' } },
      { $sample: { size: Math.min(viewerCount, 1000) } },
      { $project: { _id: 1 } }
    ]);

    const userIds = syntheticUsers.map(u => u._id);

    const result = await LiveStream.findByIdAndUpdate(streamId, {
      $addToSet: { viewers: { $each: userIds } },
      $inc: { totalViews: userIds.length },
      $max: { peakViewers: viewerCount },
    }, { new: true });

    if (!result) return res.status(404).json({ error: 'Stream not found' });

    res.json({
      ok: true,
      streamId,
      addedViewers: userIds.length,
      totalViewers: result.viewers?.length || 0,
      peakViewers: result.peakViewers,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET /api/admin/fake-users/countries
// List available countries for generation
// ==========================================
router.get('/countries', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { COUNTRIES } = require('../services/fake-user-generator.service');
    const countries = Object.entries(COUNTRIES).map(([name, data]) => ({
      name,
      cities: data.cities.length,
      names: data.firstNames.length * data.lastNames.length,
      weight: data.weight || 1,
    }));
    res.json({ ok: true, countries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
