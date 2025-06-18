
const clientPromise = require('../lib/mongodb');

exports.boostPost = async (req, res) => {
  try {
    const { postId, userId } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'Post ID is required' });
    }

    const client = await clientPromise;
    const db = client.db();

    const result = await db.collection('posts').updateOne(
      { _id: new require('mongodb').ObjectId(postId) },
      {
        $set: { boosted: true },
        $inc: { boostCount: 1 },
        $push: { boostLogs: { userId, date: new Date() } }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Post not found or already boosted' });
    }

    res.status(200).json({ success: true, boosted: true });
  } catch (err) {
    console.error('Boost Post Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
