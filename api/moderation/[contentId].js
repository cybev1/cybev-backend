// Backend API: Handle content moderation (report, approve, reject)
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { contentId } = req.query;

  if (!contentId) {
    return res.status(400).json({ success: false, message: 'Content ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'POST') {
      // Report content logic (POST method)
      const { userId, reason } = req.body;
      if (!userId || !reason) {
        return res.status(400).json({ success: false, message: 'User ID and reason are required' });
      }

      // Store the report
      await db.collection('reports').insertOne({
        contentId,
        userId,
        reason,
        status: 'pending',
        timestamp: new Date(),
      });

      return res.status(200).json({ success: true, message: 'Content reported' });
    } else if (req.method === 'GET') {
      // Fetch reported content (GET method)
      const report = await db.collection('reports').findOne({ contentId });

      if (!report) {
        return res.status(404).json({ success: false, message: 'Content report not found' });
      }

      return res.status(200).json({ success: true, report });
    } else if (req.method === 'PATCH') {
      // Approve or reject content (PATCH method)
      const { action } = req.body;
      if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid action' });
      }

      // Update the report status
      await db.collection('reports').updateOne(
        { contentId },
        { $set: { status: action } }
      );

      return res.status(200).json({ success: true, message: `Content ${action}d` });
    }
  } catch (error) {
    console.error('Error handling content moderation:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
