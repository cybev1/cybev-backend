// Backend API: Handle Reels (upload, view, reactions)
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, message: 'Reel ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'POST') {
      // Upload a new Reel (POST method)
      const { userId, videoUrl, caption } = req.body;

      if (!videoUrl || !caption) {
        return res.status(400).json({ success: false, message: 'Video URL and caption are required' });
      }

      await db.collection('reels').insertOne({
        userId,
        videoUrl,
        caption,
        views: 0,
        reactions: [],
        comments: [],
        timestamp: new Date(),
      });

      return res.status(200).json({ success: true, message: 'Reel uploaded' });
    } else if (req.method === 'GET') {
      // Fetch reel details (GET method)
      const reel = await db.collection('reels').findOne({ _id: ObjectId(id) });

      if (!reel) {
        return res.status(404).json({ success: false, message: 'Reel not found' });
      }

      return res.status(200).json({ success: true, reel });
    }
  } catch (error) {
    console.error('Error handling reel operations:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
