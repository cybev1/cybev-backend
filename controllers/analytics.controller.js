const { ObjectId } = require('mongodb');
const clientPromise = require('../lib/mongodb');

exports.getPostAnalytics = async (req, res) => {
  const { postId } = req.params;
  if (!postId) return res.status(400).json({ error: 'Missing postId' });

  try {
    const client = await clientPromise;
    const db = client.db();

    const post = await db.collection('posts').findOne({ _id: new ObjectId(postId) });

    if (!post) return res.status(404).json({ error: 'Post not found' });

    res.status(200).json({
      title: post.title || 'Untitled',
      author: post.author || 'Anonymous',
      createdAt: post.createdAt || null,
      views: post.views || 0,
      shares: post.shares || 0,
      boostCount: post.boostCount || 0,
      minted: post.minted || post.txHash ? true : false,
      earnings: post.earnings || 0
    });
  } catch (err) {
    console.error('Post analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};