// Backend API: Fetch post analytics data (views, reactions, shares, earnings)
import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, message: 'Post ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    // Aggregate post analytics
    const result = await db.collection('posts').aggregate([
      {
        $match: { _id: ObjectId(id) }
      },
      {
        $lookup: {
          from: 'reactions',
          localField: '_id',
          foreignField: 'postId',
          as: 'reactions'
        }
      },
      {
        $lookup: {
          from: 'shares',
          localField: '_id',
          foreignField: 'postId',
          as: 'shares'
        }
      },
      {
        $project: {
          views: 1,
          earnings: 1,
          reactions: { $size: '$reactions' },
          shares: { $size: '$shares' }
        }
      }
    ]).toArray();

    if (result.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    return res.status(200).json({
      success: true,
      analytics: result[0]
    });
  } catch (error) {
    console.error('Error fetching post analytics:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
