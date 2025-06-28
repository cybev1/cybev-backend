// Backend API: Fetch leaderboard data based on earnings or engagement
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db();

    // Fetch the leaderboard data, sorted by earnings (or engagement)
    const leaderboard = await db.collection('users').aggregate([
      {
        $lookup: {
          from: 'earnings',
          localField: '_id',
          foreignField: 'userId',
          as: 'earningsData'
        }
      },
      {
        $project: {
          username: 1,
          totalEarnings: { $sum: '$earningsData.amount' },
          engagement: { $sum: '$earningsData.views' }, // Assuming views for engagement example
        }
      },
      {
        $sort: { totalEarnings: -1 } // Sort by earnings, can modify for engagement
      },
      {
        $limit: 10
      }
    ]).toArray();

    return res.status(200).json({
      success: true,
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
