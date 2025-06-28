// Backend API: Fetch post analytics and monetization details
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
      // Fetch post performance data (views, reactions, shares, earnings)
      const post = await db.collection('posts').findOne({ _id: ObjectId(postId) });

      if (!post) {
        return res.status(404).json({ success: false, message: 'Post not found' });
      }

      const views = post.views || 0;
      const reactions = await db.collection('reactions').countDocuments({ postId });
      const shares = await db.collection('shares').countDocuments({ postId });
      const earnings = views * 0.01; // Assuming $0.01 per view for earnings calculation

      return res.status(200).json({
        success: true,
        analytics: { views, reactions, shares, earnings },
      });
    }
  } catch (error) {
    console.error('Error fetching post analytics:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
