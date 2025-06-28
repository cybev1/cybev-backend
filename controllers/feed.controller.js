// controllers/feed.controller.js
const clientPromise = require('../lib/mongodb');
const { ObjectId } = require('mongodb');

exports.getFeed = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db();
    // Fetch latest 50 posts
    const posts = await db.collection('posts')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const feed = posts.map(post => ({
      id: post._id,
      title: post.title,
      content: post.content,
      author: post.author,
      createdAt: post.createdAt,
      views: post.views || 0,
      shares: post.shares || 0,
      likes: post.likes || 0,
      commentsCount: (post.comments || []).length,
      earnings: post.earnings || 0,
    }));

    res.json(feed);
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
