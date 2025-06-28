// Backend API: Handle post boosting and sponsored ads
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { postId } = req.query;

  if (!postId) {
    return res.status(400).json({ success: false, message: 'Post ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'POST') {
      // Boost a post (POST method)
      const { boostAmount } = req.body;
      if (!boostAmount) {
        return res.status(400).json({ success: false, message: 'Boost amount is required' });
      }

      // Update post to mark it as boosted
      await db.collection('posts').updateOne(
        { _id: ObjectId(postId) },
        { $set: { boosted: true, boostAmount, boostedAt: new Date() } }
      );

      return res.status(200).json({ success: true, message: 'Post boosted successfully' });
    } else if (req.method === 'GET') {
      // Fetch boosted post analytics (GET method)
      const post = await db.collection('posts').findOne({ _id: ObjectId(postId) });

      if (!post || !post.boosted) {
        return res.status(404).json({ success: false, message: 'Post not found or not boosted' });
      }

      const reactions = await db.collection('reactions').countDocuments({ postId });
      const shares = await db.collection('shares').countDocuments({ postId });
      const comments = await db.collection('comments').countDocuments({ postId });

      return res.status(200).json({
        success: true,
        analytics: { shares, reactions, comments, boostAmount: post.boostAmount },
      });
    }
  } catch (error) {
    console.error('Error handling post boosting and sponsored ads:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
