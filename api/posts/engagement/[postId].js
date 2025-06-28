// Backend API: Fetch post engagement metrics (shares, likes, comments)
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { postId } = req.query;

  if (!postId) {
    return res.status(400).json({ success: false, message: 'Post ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'GET') {
      // Fetch post metrics (shares, likes, comments)
      const post = await db.collection('posts').findOne({ _id: ObjectId(postId) });

      if (!post) {
        return res.status(404).json({ success: false, message: 'Post not found' });
      }

      const shares = await db.collection('shares').countDocuments({ postId });
      const reactions = await db.collection('reactions').countDocuments({ postId });
      const comments = await db.collection('comments').countDocuments({ postId });

      return res.status(200).json({
        success: true,
        engagement: { shares, reactions, comments },
      });
    }
  } catch (error) {
    console.error('Error fetching post engagement:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
