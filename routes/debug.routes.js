// ============================================
// FILE: routes/debug.routes.js
// Debug Routes - Check model schemas
// VERSION: 1.0.0
// USE: Temporarily add to server.js to diagnose issues
// REMOVE AFTER DEBUGGING!
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid token' });
  }
};

// GET /api/debug/models - List all registered models and their schemas
router.get('/models', auth, async (req, res) => {
  try {
    const models = {};
    
    for (const [name, model] of Object.entries(mongoose.models)) {
      const schema = model.schema;
      const paths = {};
      
      schema.eachPath((pathname, schemaType) => {
        paths[pathname] = {
          type: schemaType.instance,
          ref: schemaType.options?.ref,
          required: schemaType.isRequired,
          default: schemaType.defaultValue
        };
      });
      
      models[name] = {
        collection: model.collection.name,
        paths: paths
      };
    }
    
    res.json({ ok: true, models });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/debug/follow-schema - Get Follow model schema specifically
router.get('/follow-schema', auth, async (req, res) => {
  try {
    const Follow = mongoose.models.Follow;
    
    if (!Follow) {
      return res.json({ ok: false, error: 'Follow model not found', registeredModels: Object.keys(mongoose.models) });
    }
    
    const paths = {};
    Follow.schema.eachPath((pathname, schemaType) => {
      paths[pathname] = {
        type: schemaType.instance,
        ref: schemaType.options?.ref,
        required: schemaType.isRequired
      };
    });
    
    // Get sample documents
    const samples = await Follow.find().limit(3).lean();
    
    res.json({ 
      ok: true, 
      model: 'Follow',
      collection: Follow.collection.name,
      paths,
      sampleCount: await Follow.countDocuments(),
      samples
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/debug/post-schema - Get Post model schema specifically
router.get('/post-schema', auth, async (req, res) => {
  try {
    const Post = mongoose.models.Post;
    
    if (!Post) {
      return res.json({ ok: false, error: 'Post model not found', registeredModels: Object.keys(mongoose.models) });
    }
    
    const paths = {};
    Post.schema.eachPath((pathname, schemaType) => {
      paths[pathname] = {
        type: schemaType.instance,
        ref: schemaType.options?.ref,
        required: schemaType.isRequired
      };
    });
    
    // Get sample documents
    const samples = await Post.find().limit(3).lean();
    
    res.json({ 
      ok: true, 
      model: 'Post',
      collection: Post.collection.name,
      paths,
      sampleCount: await Post.countDocuments(),
      samples
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/debug/my-stats - Get all stats for current user with raw queries
router.get('/my-stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const objectId = new mongoose.Types.ObjectId(userId);
    
    const results = {
      userId,
      objectId: objectId.toString()
    };
    
    // Check Post model
    const Post = mongoose.models.Post;
    if (Post) {
      results.posts = {
        byAuthor: await Post.countDocuments({ author: userId }),
        byAuthorObjectId: await Post.countDocuments({ author: objectId }),
        byUser: await Post.countDocuments({ user: userId }),
        byUserId: await Post.countDocuments({ userId: userId }),
        byCreator: await Post.countDocuments({ creator: userId }),
        byCreatedBy: await Post.countDocuments({ createdBy: userId }),
        total: await Post.countDocuments()
      };
      
      // Get a sample post to see field names
      const samplePost = await Post.findOne().lean();
      if (samplePost) {
        results.posts.sampleFields = Object.keys(samplePost);
      }
    } else {
      results.posts = { error: 'Post model not found' };
    }
    
    // Check Follow model
    const Follow = mongoose.models.Follow;
    if (Follow) {
      results.follows = {
        // Followers (people following me)
        followersFollowing: await Follow.countDocuments({ following: userId }),
        followersFollowingObjId: await Follow.countDocuments({ following: objectId }),
        followersFollowee: await Follow.countDocuments({ followee: userId }),
        followersTargetUser: await Follow.countDocuments({ targetUser: userId }),
        followersFollowedUser: await Follow.countDocuments({ followedUser: userId }),
        followersTo: await Follow.countDocuments({ to: userId }),
        
        // Following (people I follow)
        followingFollower: await Follow.countDocuments({ follower: userId }),
        followingFollowerObjId: await Follow.countDocuments({ follower: objectId }),
        followingUser: await Follow.countDocuments({ user: userId }),
        followingSourceUser: await Follow.countDocuments({ sourceUser: userId }),
        followingFrom: await Follow.countDocuments({ from: userId }),
        
        total: await Follow.countDocuments()
      };
      
      // Get a sample follow to see field names
      const sampleFollow = await Follow.findOne().lean();
      if (sampleFollow) {
        results.follows.sampleFields = Object.keys(sampleFollow);
        results.follows.sample = sampleFollow;
      }
    } else {
      results.follows = { error: 'Follow model not found' };
    }
    
    // Check Vlog model
    const Vlog = mongoose.models.Vlog;
    if (Vlog) {
      results.vlogs = {
        byAuthor: await Vlog.countDocuments({ author: userId }),
        byUser: await Vlog.countDocuments({ user: userId }),
        byUserId: await Vlog.countDocuments({ userId: userId }),
        total: await Vlog.countDocuments()
      };
    } else {
      results.vlogs = { error: 'Vlog model not found' };
    }
    
    // Check Reward model
    const Reward = mongoose.models.Reward;
    if (Reward) {
      const balance = await Reward.aggregate([
        { $match: { user: objectId } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      results.rewards = {
        balance: balance[0]?.total || 0,
        total: await Reward.countDocuments()
      };
    } else {
      results.rewards = { error: 'Reward model not found' };
    }
    
    res.json({ ok: true, ...results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  }
});

// GET /api/debug/collections - List all MongoDB collections
router.get('/collections', auth, async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    const collectionInfo = {};
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      collectionInfo[col.name] = { count };
    }
    
    res.json({ ok: true, collections: collectionInfo });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/debug/feed - Check feed/posts data
router.get('/feed', auth, async (req, res) => {
  try {
    const Post = mongoose.models.Post;
    if (!Post) {
      return res.json({ ok: false, error: 'Post model not found' });
    }
    
    const recentPosts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    res.json({ 
      ok: true,
      total: await Post.countDocuments(),
      recent: recentPosts
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
