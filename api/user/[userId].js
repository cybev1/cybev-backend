// Backend API: Handle user profile and social engagement
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
      // Fetch user profile and social engagement metrics (GET method)
      const user = await db.collection('users').findOne({ _id: ObjectId(userId) });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const posts = await db.collection('posts').find({ userId }).toArray();
      const reactions = await db.collection('reactions').countDocuments({ userId });
      const shares = await db.collection('shares').countDocuments({ userId });
      const followers = await db.collection('followers').countDocuments({ userId });

      return res.status(200).json({
        success: true,
        user: {
          ...user,
          engagement: {
            posts: posts.length,
            reactions,
            shares,
            followers,
          },
        },
      });
    } else if (req.method === 'PATCH') {
      // Update user profile (PATCH method)
      const { bio, avatar } = req.body;
      if (!bio && !avatar) {
        return res.status(400).json({ success: false, message: 'At least one field (bio or avatar) is required' });
      }

      await db.collection('users').updateOne(
        { _id: ObjectId(userId) },
        { $set: { bio, avatar } }
      );

      return res.status(200).json({ success: true, message: 'Profile updated successfully' });
    }
  } catch (error) {
    console.error('Error handling user profile and social engagement:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
