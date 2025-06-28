// Backend API: Admin actions on posts (approve, reject, delete)
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, message: 'Post ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'POST') {
      // Approve or reject post logic (POST method)
      const { action } = req.body;
      if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid action' });
      }

      // Update the post status
      await db.collection('posts').updateOne(
        { _id: ObjectId(id) },
        { $set: { status: action } }
      );

      return res.status(200).json({ success: true, message: `Post ${action}d` });
    } else if (req.method === 'DELETE') {
      // Delete post logic (DELETE method)
      await db.collection('posts').deleteOne({ _id: ObjectId(id) });
      return res.status(200).json({ success: true, message: 'Post deleted' });
    } else if (req.method === 'GET') {
      // Fetch posts (GET method)
      const posts = await db.collection('posts').find({}).toArray();
      return res.status(200).json({ success: true, posts });
    }
  } catch (error) {
    console.error('Error handling admin post actions:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
