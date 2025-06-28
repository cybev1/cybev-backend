// Backend API: Handle user management (view, ban, unban, assign role)
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
      // Fetch all users (GET method)
      const users = await db.collection('users').find({}).toArray();
      return res.status(200).json({ success: true, users });
    } else if (req.method === 'PATCH') {
      // Assign roles or ban/unban user (PATCH method)
      const { action, role } = req.body;
      if (!['ban', 'unban'].includes(action) && !role) {
        return res.status(400).json({ success: false, message: 'Invalid action or role' });
      }

      if (action === 'ban') {
        await db.collection('users').updateOne({ _id: ObjectId(userId) }, { $set: { banned: true } });
      } else if (action === 'unban') {
        await db.collection('users').updateOne({ _id: ObjectId(userId) }, { $set: { banned: false } });
      } else if (role) {
        await db.collection('users').updateOne({ _id: ObjectId(userId) }, { $set: { role } });
      }

      return res.status(200).json({ success: true, message: `User ${action || 'role updated'}` });
    }
  } catch (error) {
    console.error('Error handling user management:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
