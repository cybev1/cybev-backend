const { ObjectId } = require('mongodb');
const clientPromise = require('../lib/mongodb');

// Existing getPostAnalytics
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
      minted: post.minted || (post.txHash ? true : false),
      earnings: post.earnings || 0
    });
  } catch (err) {
    console.error('Post analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// New getPostsSummary
exports.getPostsSummary = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db();
    const posts = await db.collection('posts').find({}).toArray();

    let totalViews = 0, totalShares = 0, totalEarnings = 0, totalBoosts = 0, totalMints = 0;
    const dateMap = {};

    posts.forEach(post => {
      const history = post.history || [];
      history.forEach(item => {
        totalViews += item.views || 0;
        totalShares += item.shares || 0;
        totalEarnings += item.earnings || 0;
        totalBoosts += item.boosts || 0;
        totalMints += item.mints || 0;

        if (!dateMap[item.date]) {
          dateMap[item.date] = { views: 0, shares: 0, earnings: 0, boosts: 0, mints: 0 };
        }
        dateMap[item.date].views += item.views || 0;
        dateMap[item.date].shares += item.shares || 0;
        dateMap[item.date].earnings += item.earnings || 0;
        dateMap[item.date].boosts += item.boosts || 0;
        dateMap[item.date].mints += item.mints || 0;
      });
    });

    const history = Object.keys(dateMap).sort().map(date => ({
      date,
      ...dateMap[date]
    }));

    res.json({ totalViews, totalShares, totalEarnings, totalBoosts, totalMints, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
