// Backend API: Fetch user activity (posts, reactions, comments)
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
      // Fetch user posts, reactions, and comments (GET method)
      const posts = await db.collection('posts').find({ userId }).toArray();
      const reactions = await db.collection('reactions').find({ userId }).toArray();
      const comments = await db.collection('comments').find({ userId }).toArray();

      return res.status(200).json({ success: true, posts, reactions, comments });
    }
  } catch (error) {
    console.error('Error fetching user activity:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
