const clientPromise = require('../lib/mongodb');

exports.getMyPosts = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db();
    const userId = req.user.id; // from auth middleware
    const posts = await db
      .collection('posts')
      .find({ author: userId })
      .project({ _id: 1, title: 1 })
      .toArray();

    res.json(posts.map(p => ({ id: p._id, title: p.title })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
