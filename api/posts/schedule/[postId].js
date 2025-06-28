// Backend API: Handle post scheduling and automation
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
      // Schedule a post (POST method)
      const { scheduledTime } = req.body;
      if (!scheduledTime) {
        return res.status(400).json({ success: false, message: 'Scheduled time is required' });
      }

      // Update post with scheduled time
      await db.collection('posts').updateOne(
        { _id: ObjectId(postId) },
        { $set: { scheduledTime, scheduled: true } }
      );

      // Logic to schedule the post for automation (e.g., using cron jobs or task schedulers)
      return res.status(200).json({ success: true, message: 'Post scheduled successfully' });
    } else if (req.method === 'GET') {
      // Fetch scheduled posts (GET method)
      const posts = await db.collection('posts').find({ scheduled: true }).toArray();
      return res.status(200).json({ success: true, posts });
    }
  } catch (error) {
    console.error('Error handling post scheduling and automation:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
