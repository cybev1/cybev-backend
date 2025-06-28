// Backend API: Fetch user analytics (views, earnings, reactions)
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'GET') {
      // Fetch content performance data for the user
      const posts = await db.collection('posts').find({ userId }).toArray();

      const views = posts.reduce((total, post) => total + post.views, 0);
      const reactions = posts.reduce((total, post) => total + post.reactions, 0);
      const earnings = posts.reduce((total, post) => total + post.earnings, 0);

      return res.status(200).json({
        success: true,
        analytics: { views, reactions, earnings },
      });
    }
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
