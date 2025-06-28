// Backend API: Start/Stop Livestream and fetch live data
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'POST') {
    // Start livestream logic (post method)
    try {
      const client = await clientPromise;
      const db = client.db();

      // Create or update the livestream status
      await db.collection('livestreams').updateOne(
        { userId: id }, 
        { $set: { status: 'live', startTime: new Date() } },
        { upsert: true } // Insert if the document doesn't exist
      );

      return res.status(200).json({ success: true, message: 'Livestream started' });
    } catch (error) {
      console.error('Error starting livestream:', error);
      return res.status(500).json({ success: false, message: 'Failed to start livestream' });
    }
  } else if (req.method === 'GET') {
    // Fetch livestream status (GET method)
    try {
      const client = await clientPromise;
      const db = client.db();

      // Get active livestream
      const livestream = await db.collection('livestreams').findOne({ status: 'live' });

      if (livestream) {
        return res.status(200).json({ success: true, livestream });
      }

      return res.status(404).json({ success: false, message: 'No active livestreams' });
    } catch (error) {
      console.error('Error fetching livestream data:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch livestream data' });
    }
  } else if (req.method === 'DELETE') {
    // Stop livestream logic (delete method)
    try {
      const client = await clientPromise;
      const db = client.db();

      await db.collection('livestreams').updateOne(
        { userId: id },
        { $set: { status: 'offline', endTime: new Date() } }
      );

      return res.status(200).json({ success: true, message: 'Livestream stopped' });
    } catch (error) {
      console.error('Error stopping livestream:', error);
      return res.status(500).json({ success: false, message: 'Failed to stop livestream' });
    }
  }
}
