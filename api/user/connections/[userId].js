// Backend API: Handle user follow/unfollow actions and fetch followers/following
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'POST') {
      const { action, targetUserId } = req.body;
      if (!targetUserId || !['follow', 'unfollow'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid action or target user' });
      }

      if (action === 'follow') {
        // Add to following list
        await db.collection('users').updateOne(
          { _id: ObjectId(userId) },
          { $addToSet: { following: targetUserId } }
        );

        // Add to followers list of the target user
        await db.collection('users').updateOne(
          { _id: ObjectId(targetUserId) },
          { $addToSet: { followers: userId } }
        );
      } else if (action === 'unfollow') {
        // Remove from following list
        await db.collection('users').updateOne(
          { _id: ObjectId(userId) },
          { $pull: { following: targetUserId } }
        );

        // Remove from followers list of the target user
        await db.collection('users').updateOne(
          { _id: ObjectId(targetUserId) },
          { $pull: { followers: userId } }
        );
      }

      return res.status(200).json({ success: true, message: `${action}ed successfully` });
    } else if (req.method === 'GET') {
      // Fetch followers and following (GET method)
      const user = await db.collection('users').findOne({ _id: ObjectId(userId) });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        followers: user.followers,
        following: user.following,
      });
    }
  } catch (error) {
    console.error('Error handling user connections:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
