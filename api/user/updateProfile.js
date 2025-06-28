import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { bio, profilePic } = req.body;

    if (!bio && !profilePic) {
      return res.status(400).json({ success: false, message: 'Profile data is required' });
    }

    try {
      const client = await clientPromise;
      const db = client.db();

      const result = await db.collection('users').updateOne(
        { username: req.user.username },
        { $set: { bio, profilePic } }
      );

      return res.status(200).json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}
