import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db();

    const user = await db.collection('users').findOne({ username: req.user.username });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
