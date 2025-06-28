// Backend API: Handle user notifications and activity feed
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
      // Fetch user notifications and activity feed (GET method)
      const notifications = await db.collection('notifications').find({ userId }).toArray();
      const activities = await db.collection('activity_feed').find({ userId }).toArray();

      return res.status(200).json({
        success: true,
        notifications,
        activities,
      });
    } else if (req.method === 'POST') {
      // Create a new notification for a user (POST method)
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, message: 'Notification message is required' });
      }

      // Create the notification
      await db.collection('notifications').insertOne({
        userId,
        message,
        timestamp: new Date(),
      });

      return res.status(200).json({ success: true, message: 'Notification created successfully' });
    }
  } catch (error) {
    console.error('Error handling notifications and activity feed:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
