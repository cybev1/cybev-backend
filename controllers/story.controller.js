// controllers/story.controller.js
const clientPromise = require('../lib/mongodb');
const { ObjectId } = require('mongodb');

exports.getStories = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db();
    // Fetch latest stories (within 24h)
    const since = new Date(Date.now() - 24*60*60*1000);
    const stories = await db.collection('stories')
      .find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = stories.map(s => ({
      id: s._id,
      userId: s.userId,
      userName: s.userName,
      avatar: s.avatar,
      imageUrl: s.imageUrl,
      createdAt: s.createdAt
    }));
    res.json(formatted);
  } catch (err) {
    console.error('Stories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
