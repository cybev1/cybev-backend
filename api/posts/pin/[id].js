// Backend API: Pin or unpin a post, fetch pinned posts
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
      // Pin post logic (POST method)
      await db.collection('posts').updateOne(
        { _id: ObjectId(id) },
        { $set: { pinned: true } }
      );
      return res.status(200).json({ success: true, message: 'Post pinned' });
    } else if (req.method === 'DELETE') {
      // Unpin post logic (DELETE method)
      await db.collection('posts').updateOne(
        { _id: ObjectId(id) },
        { $set: { pinned: false } }
      );
      return res.status(200).json({ success: true, message: 'Post unpinned' });
    } else if (req.method === 'GET') {
      // Fetch pinned posts (GET method)
      const pinnedPosts = await db.collection('posts').find({ pinned: true }).toArray();
      return res.status(200).json({ success: true, pinnedPosts });
    }
  } catch (error) {
    console.error('Error pinning/unpinning post:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
