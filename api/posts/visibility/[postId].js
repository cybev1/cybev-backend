// Backend API: Handle post visibility and recommendations
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { postId } = req.query;

  if (!postId) {
    return res.status(400).json({ success: false, message: 'Post ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'GET') {
      // Fetch recommended posts (GET method)
      const posts = await db.collection('posts')
        .find({ visibility: 'public' })
        .sort({ views: -1 }) // Recommend popular posts first
        .limit(5)
        .toArray();

      return res.status(200).json({ success: true, recommendations: posts });
    } else if (req.method === 'PATCH') {
      // Update post visibility (PATCH method)
      const { visibility } = req.body;  // 'public' or 'private'
      if (!visibility || !['public', 'private'].includes(visibility)) {
        return res.status(400).json({ success: false, message: 'Invalid visibility status' });
      }

      await db.collection('posts').updateOne(
        { _id: ObjectId(postId) },
        { $set: { visibility } }
      );

      return res.status(200).json({ success: true, message: 'Post visibility updated' });
    }
  } catch (error) {
    console.error('Error handling post visibility and recommendations:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
