// ============================================
// FILE: routes/users.routes.js (ADD to existing)
// PURPOSE: User endpoints including suggested users
// ADD THESE ROUTES to your existing users.routes.js
// ============================================

// GET /api/users/me - Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('followers', '_id')
      .populate('following', '_id');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get post count
    const Post = require('../models/Post.model');
    const postsCount = await Post.countDocuments({ author: user._id });

    res.json({
      ok: true,
      user: {
        ...user.toObject(),
        postsCount,
        followersCount: user.followers?.length || 0,
        followingCount: user.following?.length || 0
      }
    });
  } catch (err) {
    console.error('Error fetching current user:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/users/suggested - Get suggested users to follow
router.get('/suggested', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const currentUserId = req.user?.id;

    // Get users the current user is already following
    let followingIds = [];
    if (currentUserId) {
      const currentUser = await User.findById(currentUserId).select('following');
      followingIds = currentUser?.following?.map(id => id.toString()) || [];
    }

    // Find users that:
    // 1. Are not the current user
    // 2. Are not already followed
    // 3. Have some followers (more likely to be interesting)
    const query = {
      _id: { $nin: [...followingIds, currentUserId].filter(Boolean) },
      isActive: { $ne: false }
    };

    const users = await User.find(query)
      .select('username name avatar bio isVerified followers')
      .sort({ 'followers.length': -1, createdAt: -1 })
      .limit(limit);

    const formattedUsers = users.map(user => ({
      _id: user._id,
      username: user.username,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      isVerified: user.isVerified || false,
      followers: user.followers?.length || 0
    }));

    res.json({ ok: true, users: formattedUsers });
  } catch (err) {
    console.error('Error fetching suggested users:', err);
    res.status(500).json({ ok: false, error: 'Server error', users: [] });
  }
});

// GET /api/users/:username - Get user by username
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password')
      .populate('followers', '_id username name avatar')
      .populate('following', '_id username name avatar');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Get post count
    const Post = require('../models/Post.model');
    const postsCount = await Post.countDocuments({ author: user._id });

    res.json({
      ok: true,
      user: {
        ...user.toObject(),
        postsCount,
        followersCount: user.followers?.length || 0,
        followingCount: user.following?.length || 0
      }
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
