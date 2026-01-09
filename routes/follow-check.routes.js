// ============================================
// FILE: routes/follow-check.routes.js
// Follow Check Routes - Adds /check/:userId endpoint
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware (optional for check)
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    } catch (error) {
      // Token invalid, continue without user
    }
  }
  next();
};

// Get Follow model
const getFollow = () => {
  return mongoose.models.Follow || require('../models/follow.model');
};

// ==========================================
// GET /api/follow/check/:userId - Check if following a user
// ==========================================
router.get('/check/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    // If not logged in, not following
    if (!req.user) {
      return res.json({ 
        ok: true, 
        isFollowing: false,
        isFollowedBy: false,
        isMutual: false
      });
    }

    // Can't follow yourself
    if (req.user.id === userId) {
      return res.json({ 
        ok: true, 
        isFollowing: false,
        isFollowedBy: false,
        isMutual: false,
        isSelf: true
      });
    }

    const Follow = getFollow();

    // Check if current user follows target
    const following = await Follow.findOne({
      follower: req.user.id,
      following: userId,
      status: 'active'
    });

    // Check if target follows current user
    const followedBy = await Follow.findOne({
      follower: userId,
      following: req.user.id,
      status: 'active'
    });

    res.json({
      ok: true,
      isFollowing: !!following,
      isFollowedBy: !!followedBy,
      isMutual: !!following && !!followedBy
    });

  } catch (error) {
    console.error('Follow check error:', error);
    res.json({ 
      ok: true, 
      isFollowing: false,
      isFollowedBy: false,
      isMutual: false
    });
  }
});

module.exports = router;
