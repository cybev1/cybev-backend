// Backend API: Fetch and update user profile
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'GET') {
      // Fetch user profile data (GET method)
      const user = await db.collection('users').findOne({ _id: ObjectId(id) });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.status(200).json({ success: true, user });
    } else if (req.method === 'PUT') {
      // Update user profile (PUT method)
      const { username, bio, profilePicture } = req.body;

      if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
      }

      await db.collection('users').updateOne(
        { _id: ObjectId(id) },
        { $set: { username, bio, profilePicture } }
      );

      return res.status(200).json({ success: true, message: 'Profile updated' });
    }
  } catch (error) {
    console.error('Error fetching or updating user profile:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
