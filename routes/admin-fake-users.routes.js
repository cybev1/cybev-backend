// ============================================
// FILE: routes/admin-fake-users.routes.js
// Admin Fake User Generation & Engagement V2.0
// NEW: Auto-follow admin accounts on generation
// NEW: Manage "must-follow" accounts list
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

console.log('🤖 Admin Fake Users Routes v2.0 loaded');

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

let FakeUserGenerator;
try {
  ({ FakeUserGenerator } = require('../services/fake-user-generator.service'));
  console.log('✅ FakeUserGenerator V2.0 loaded');
} catch (e) {
  console.log('⚠️ FakeUserGenerator not available:', e.message);
}

// ==========================================
// AUTO-FOLLOW SYSTEM
// Uses a simple config in DB or env
// Default: everyone follows @prince
// ==========================================

// Get must-follow accounts (cached)
let _mustFollowCache = null;
let _mustFollowCacheTime = 0;

async function getMustFollowAccounts() {
  // Cache for 5 minutes
  if (_mustFollowCache && Date.now() - _mustFollowCacheTime < 300000) {
    return _mustFollowCache;
  }
  
  try {
    const User = mongoose.model('User');
    
    // Find users marked as must-follow (admins can add via API)
    // Default: all admin users + specifically @prince
    const mustFollow = await User.find({
      $or: [
        { username: 'prince' },
        { _mustFollow: true },
        { role: 'admin', isAdmin: true },
      ],
      status: 'active',
    }).select('_id username name').lean();
    
    _mustFollowCache = mustFollow;
    _mustFollowCacheTime = Date.now();
    return mustFollow;
  } catch (err) {
    console.error('Error getting must-follow accounts:', err.message);
    return [];
  }
}

// Make a user follow the must-follow accounts
async function autoFollowAdmins(userId) {
  try {
    const mustFollow = await getMustFollowAccounts();
    if (mustFollow.length === 0) return 0;
    
    const User = mongoose.model('User');
    let Follow;
    try { Follow = mongoose.model('Follow'); } catch {
      try { Follow = require('../models/follow.model'); } catch { return 0; }
    }
    
    let followed = 0;
    for (const admin of mustFollow) {
      if (admin._id.toString() === userId.toString()) continue; // Don't follow self
      
      try {
        const exists = await Follow.findOne({ follower: userId, following: admin._id });
        if (!exists) {
          await Follow.create({
            follower: userId,
            following: admin._id,
            createdAt: new Date(),
          });
          await User.findByIdAndUpdate(admin._id, { 
            $inc: { followerCount: 1, followersCount: 1 } 
          });
          await User.findByIdAndUpdate(userId, { 
            $inc: { followingCount: 1 } 
          });
          followed++;
        }
      } catch (err) {
        // Duplicate key or other error, skip
      }
    }
    return followed;
  } catch (err) {
    console.error('Auto-follow error:', err.message);
    return 0;
  }
}

// Export for use in auth.routes.js
router.autoFollowAdmins = autoFollowAdmins;
router.getMustFollowAccounts = getMustFollowAccounts;

// ==========================================
// GET /stats
// ==========================================
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const [totalSynthetic, totalReal, recentSynthetic, countryBreakdown, ethnicBreakdown] = await Promise.all([
      User.countDocuments({ isSynthetic: true }),
      User.countDocuments({ $or: [{ isSynthetic: false }, { isSynthetic: { $exists: false } }] }),
      User.countDocuments({ isSynthetic: true, createdAt: { $gte: new Date(Date.now() - 86400000) } }),
      User.aggregate([
        { $match: { isSynthetic: true } },
        { $group: { _id: '$locationData.providedCountry', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 30 }
      ]),
      User.aggregate([
        { $match: { isSynthetic: true } },
        { $group: { _id: '$syntheticMeta.ethnicGroup', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 20 }
      ]),
    ]);

    const diasporaCount = await User.countDocuments({ isSynthetic: true, 'syntheticMeta.isDiaspora': true });
    const mustFollow = await getMustFollowAccounts();

    res.json({
      ok: true,
      stats: {
        totalSynthetic, totalReal,
        recentSynthetic,
        ratio: totalReal > 0 ? (totalSynthetic / totalReal).toFixed(1) : '∞',
        diasporaCount,
        countryBreakdown: countryBreakdown.map(c => ({ country: c._id || 'Unknown', count: c.count })),
        ethnicBreakdown: ethnicBreakdown.map(e => ({ ethnic: e._id || 'Unknown', count: e.count })),
        mustFollowAccounts: mustFollow.map(u => ({ id: u._id, username: u.username, name: u.name })),
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /generate
// ==========================================
router.post('/generate', verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!FakeUserGenerator) return res.status(500).json({ error: 'Generator not loaded' });

    const { count = 100, country = null, daysBack = 365 } = req.body;
    const actualCount = Math.min(count, 5000);

    console.log(`🤖 Generating ${actualCount} fake users (V2 with ethnic matching)...`);
    const startTime = Date.now();

    const generator = new FakeUserGenerator();
    const batchId = `batch_${Date.now()}`;
    const userData = generator.generateBatch(actualCount, { country: country || undefined, daysBack, batchId });

    const User = mongoose.model('User');
    let inserted = 0, errors = 0;
    const chunkSize = 500;
    const insertedIds = [];

    for (let i = 0; i < userData.length; i += chunkSize) {
      const chunk = userData.slice(i, i + chunkSize);
      try {
        const result = await User.insertMany(chunk, { ordered: false, rawResult: true });
        inserted += result.insertedCount || chunk.length;
        if (result.ops) insertedIds.push(...result.ops.map(o => o._id));
        else if (result.insertedIds) insertedIds.push(...Object.values(result.insertedIds));
      } catch (bulkError) {
        if (bulkError.insertedDocs) {
          inserted += bulkError.insertedDocs.length;
          insertedIds.push(...bulkError.insertedDocs.map(d => d._id));
        }
        errors += chunk.length - (bulkError.insertedDocs?.length || 0);
      }
    }

    // Auto-follow admin accounts for ALL generated users
    let autoFollowed = 0;
    const mustFollow = await getMustFollowAccounts();
    if (mustFollow.length > 0 && insertedIds.length > 0) {
      console.log(`👥 Auto-following ${mustFollow.length} admin accounts for ${insertedIds.length} users...`);
      // Batch auto-follow (faster than individual)
      let Follow;
      try { Follow = mongoose.model('Follow'); } catch {
        try { Follow = require('../models/follow.model'); } catch {}
      }
      
      if (Follow) {
        const followDocs = [];
        for (const userId of insertedIds) {
          for (const admin of mustFollow) {
            if (admin._id.toString() !== userId.toString()) {
              followDocs.push({ follower: userId, following: admin._id, createdAt: new Date() });
            }
          }
        }
        
        if (followDocs.length > 0) {
          try {
            const fResult = await Follow.insertMany(followDocs, { ordered: false });
            autoFollowed = fResult.length || followDocs.length;
            
            // Update follower counts for admin accounts
            for (const admin of mustFollow) {
              const count = followDocs.filter(f => f.following.toString() === admin._id.toString()).length;
              if (count > 0) {
                await User.findByIdAndUpdate(admin._id, { 
                  $inc: { followerCount: count, followersCount: count } 
                });
              }
            }
            
            // Update following counts for generated users
            await User.updateMany(
              { _id: { $in: insertedIds } },
              { $inc: { followingCount: mustFollow.length } }
            );
          } catch (fErr) {
            console.log('⚠️ Some auto-follows failed (duplicates):', fErr.message?.substring(0, 100));
            autoFollowed = followDocs.length; // approximate
          }
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Generated ${inserted} users, auto-followed ${autoFollowed} in ${elapsed}s`);

    res.json({
      ok: true, generated: inserted, errors, batchId,
      autoFollowed, mustFollowAccounts: mustFollow.length,
      elapsed: `${elapsed}s`,
      rate: `${Math.round(inserted / parseFloat(elapsed))}/s`,
    });
  } catch (error) {
    console.error('❌ Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET /list
// ==========================================
router.get('/list', verifyToken, requireAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;
    const filter = { isSynthetic: true };
    if (req.query.country) filter['locationData.providedCountry'] = req.query.country;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { username: { $regex: req.query.search, $options: 'i' } },
      ];
    }
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name email username avatar location bio personalInfo.gender personalInfo.phone followerCount followingCount createdAt syntheticMeta')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ ok: true, users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// DELETE /batch/:batchId
// ==========================================
router.delete('/batch/:batchId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const result = await User.deleteMany({ isSynthetic: true, 'syntheticMeta.batchId': req.params.batchId });
    res.json({ ok: true, deleted: result.deletedCount, batchId: req.params.batchId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// DELETE /all
// ==========================================
router.delete('/all', verifyToken, requireAdmin, async (req, res) => {
  try {
    if (req.body.confirm !== 'DELETE_ALL_SYNTHETIC') {
      return res.status(400).json({ error: 'Must confirm with DELETE_ALL_SYNTHETIC' });
    }
    const User = mongoose.model('User');
    const result = await User.deleteMany({ isSynthetic: true });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /simulate-engagement
// ==========================================
router.post('/simulate-engagement', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { action = 'like', targetType = 'posts', count = 50, targetId = null } = req.body;
    const User = mongoose.model('User');
    const maxCount = Math.min(count, 500);
    const syntheticUsers = await User.aggregate([
      { $match: { isSynthetic: true, status: 'active' } },
      { $sample: { size: maxCount } },
      { $project: { _id: 1, name: 1, username: 1 } }
    ]);
    if (syntheticUsers.length === 0) return res.status(400).json({ error: 'No synthetic users. Generate first.' });

    let engaged = 0, errors = 0;

    if (action === 'like') {
      const Post = mongoose.model('Post');
      let targets = targetId ? [await Post.findById(targetId)].filter(Boolean) :
        await Post.find({ status: 'active', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(20).lean();
      if (!targets.length) return res.status(400).json({ error: 'No posts found' });
      const reactions = ['like','love','haha','wow'];
      for (const u of syntheticUsers) {
        try {
          const p = this._pick ? this._pick(targets) : targets[Math.floor(Math.random() * targets.length)];
          await Post.findOneAndUpdate(
            { _id: p._id, 'likes.user': { $ne: u._id } },
            { $push: { likes: { user: u._id, reaction: reactions[Math.floor(Math.random() * reactions.length)], createdAt: new Date() } }, $inc: { likeCount: 1 } }
          );
          engaged++;
        } catch { errors++; }
      }
    }

    if (action === 'comment') {
      const Post = mongoose.model('Post');
      const COMMENTS = [
        'Amazing content! 🔥','Love this! ❤️','So inspiring!','Great post!','This is exactly what I needed today',
        'Keep it up! 💪','Wow, incredible!','Thank you for sharing!','Blessed! 🙏','This spoke to me deeply',
        'Amen! 🙌','So powerful!','Absolutely beautiful!','Sharing with friends!','God is good! 🙏',
        'This is gold! 💛','More please!','What a blessing!','So true!','This is fire! 🔥🔥',
        'Love the energy!','Incredible work!','You are so talented!','Made my day! 😊','Keep creating!',
        'Following you now!','This is amazing content','Very insightful post','Well said 👏','Totally agree with this',
      ];
      let targets = targetId ? [await Post.findById(targetId)].filter(Boolean) :
        await Post.find({ status: 'active', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(20).lean();
      for (const u of syntheticUsers) {
        try {
          const p = targets[Math.floor(Math.random() * targets.length)];
          await Post.findByIdAndUpdate(p._id, {
            $push: { comments: { user: u._id, userName: u.name, content: COMMENTS[Math.floor(Math.random() * COMMENTS.length)], createdAt: new Date() } },
            $inc: { commentCount: 1 }
          });
          engaged++;
        } catch { errors++; }
      }
    }

    if (action === 'follow') {
      let Follow;
      try { Follow = mongoose.model('Follow'); } catch {
        try { Follow = require('../models/follow.model'); } catch { return res.status(400).json({ error: 'Follow model unavailable' }); }
      }
      const realUsers = await User.find({ $or: [{ isSynthetic: false }, { isSynthetic: { $exists: false } }], status: 'active' }).select('_id').limit(50).lean();
      if (!realUsers.length) return res.status(400).json({ error: 'No real users found' });
      for (const su of syntheticUsers) {
        try {
          const tu = realUsers[Math.floor(Math.random() * realUsers.length)];
          const exists = await Follow.findOne({ follower: su._id, following: tu._id });
          if (!exists) {
            await Follow.create({ follower: su._id, following: tu._id });
            await User.findByIdAndUpdate(tu._id, { $inc: { followerCount: 1, followersCount: 1 } });
            await User.findByIdAndUpdate(su._id, { $inc: { followingCount: 1 } });
            engaged++;
          }
        } catch { errors++; }
      }
    }

    if (action === 'view') {
      const Post = mongoose.model('Post');
      let targets = targetId ? [await Post.findById(targetId)].filter(Boolean) :
        await Post.find({ status: 'active', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(20).lean();
      for (const u of syntheticUsers) {
        try {
          const p = targets[Math.floor(Math.random() * targets.length)];
          await Post.findByIdAndUpdate(p._id, { $inc: { viewCount: 1 } });
          engaged++;
        } catch { errors++; }
      }
    }

    res.json({ ok: true, action, engaged, errors, usersInvolved: syntheticUsers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /simulate-stream-viewers
// ==========================================
router.post('/simulate-stream-viewers', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { streamId, viewerCount = 50 } = req.body;
    if (!streamId) return res.status(400).json({ error: 'streamId required' });
    const User = mongoose.model('User');
    const LiveStream = mongoose.model('LiveStream');
    const synUsers = await User.aggregate([
      { $match: { isSynthetic: true, status: 'active' } },
      { $sample: { size: Math.min(viewerCount, 1000) } },
      { $project: { _id: 1 } }
    ]);
    const ids = synUsers.map(u => u._id);
    const result = await LiveStream.findByIdAndUpdate(streamId, {
      $addToSet: { viewers: { $each: ids } },
      $inc: { totalViews: ids.length },
      $max: { peakViewers: viewerCount },
    }, { new: true });
    if (!result) return res.status(404).json({ error: 'Stream not found' });
    res.json({ ok: true, streamId, addedViewers: ids.length, totalViewers: result.viewers?.length || 0, peakViewers: result.peakViewers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET /countries
// ==========================================
router.get('/countries', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { COUNTRIES } = require('../services/fake-user-generator.service');
    const countries = Object.entries(COUNTRIES).map(([name, data]) => ({
      name,
      weight: data.weight || 1,
      ethnicGroups: data.ethnicGroups.map(e => e.name),
      cities: data.ethnicGroups.reduce((sum, e) => sum + e.regions.reduce((s, r) => s + r.cities.length, 0), 0),
      names: data.ethnicGroups.reduce((sum, e) => sum + e.firstNames.length * e.lastNames.length, 0),
    }));
    res.json({ ok: true, countries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /must-follow/add
// Add a username to must-follow list
// ==========================================
router.post('/must-follow/add', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const User = mongoose.model('User');
    const user = await User.findOneAndUpdate(
      { username: username.toLowerCase().replace('@', '') },
      { $set: { _mustFollow: true } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: `User @${username} not found` });
    _mustFollowCache = null; // Bust cache
    res.json({ ok: true, user: { id: user._id, username: user.username, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /must-follow/remove
// ==========================================
router.post('/must-follow/remove', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { username } = req.body;
    const User = mongoose.model('User');
    await User.findOneAndUpdate(
      { username: username.toLowerCase().replace('@', '') },
      { $unset: { _mustFollow: 1 } }
    );
    _mustFollowCache = null;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET /must-follow
// ==========================================
router.get('/must-follow', verifyToken, requireAdmin, async (req, res) => {
  try {
    const accounts = await getMustFollowAccounts();
    res.json({ ok: true, accounts: accounts.map(u => ({ id: u._id, username: u.username, name: u.name })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
