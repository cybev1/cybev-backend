// Backend API: Handle post commenting and interaction system using 'slug' as the dynamic parameter
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ success: false, message: 'Post slug is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'GET') {
      // Fetch comments for a post (GET method)
      const comments = await db.collection('comments').find({ slug }).toArray();
      return res.status(200).json({ success: true, comments });
    } else if (req.method === 'POST') {
      // Add a comment to a post (POST method)
      const { userId, text } = req.body;
      if (!userId || !text) {
        return res.status(400).json({ success: false, message: 'User ID and text are required' });
      }

      await db.collection('comments').insertOne({
        slug,
        userId,
        text,
        createdAt: new Date(),
        likes: 0,
      });

      return res.status(200).json({ success: true, message: 'Comment added successfully' });
    } else if (req.method === 'PATCH') {
      // Like a comment (PATCH method)
      const { commentId } = req.body;
      if (!commentId) {
        return res.status(400).json({ success: false, message: 'Comment ID is required' });
      }

      await db.collection('comments').updateOne(
        { _id: ObjectId(commentId) },
        { $inc: { likes: 1 } }
      );

      return res.status(200).json({ success: true, message: 'Comment liked' });
    } else if (req.method === 'DELETE') {
      // Delete a comment (DELETE method)
      const { commentId } = req.body;
      if (!commentId) {
        return res.status(400).json({ success: false, message: 'Comment ID is required' });
      }

      await db.collection('comments').deleteOne({ _id: ObjectId(commentId) });

      return res.status(200).json({ success: true, message: 'Comment deleted' });
    }
  } catch (error) {
    console.error('Error handling post commenting and interaction:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
