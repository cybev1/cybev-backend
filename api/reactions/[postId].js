// Backend API: Handle post reactions (add, fetch)
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { postId } = req.query;

  if (!postId) {
    return res.status(400).json({ success: false, message: 'Post ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'POST') {
      // Add reaction logic (POST method)
      const { userId, emoji } = req.body;
      if (!emoji || !userId) {
        return res.status(400).json({ success: false, message: 'Emoji and user ID are required' });
      }

      // Store the reaction
      await db.collection('reactions').insertOne({
        postId,
        userId,
        emoji,
        timestamp: new Date(),
      });

      return res.status(200).json({ success: true, message: 'Reaction added' });
    } else if (req.method === 'GET') {
      // Fetch reactions for the post (GET method)
      const reactions = await db.collection('reactions').aggregate([
        { $match: { postId } },
        { $group: { _id: '$emoji', count: { $sum: 1 } } },
      ]).toArray();

      return res.status(200).json({ success: true, reactions });
    }
  } catch (error) {
    console.error('Error handling reactions:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
