// Backend API: Fetch AI stats for dashboard (Top Posts, User Activity)
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db();

    // Fetch top posts based on views and reactions
    const topPosts = await db.collection('posts').aggregate([
      {
        $project: {
          title: 1,
          views: 1,
          reactions: 1,
          earnings: 1
        }
      },
      {
        $sort: { views: -1 } // Sort by views (can be adjusted to earnings or reactions)
      },
      {
        $limit: 5
      }
    ]).toArray();

    // AI logic could go here to generate trends and recommendations
    const aiRecommendations = "Based on recent trends, we recommend focusing on engagement-driven posts.";

    return res.status(200).json({
      success: true,
      topPosts,
      aiRecommendations
    });
  } catch (error) {
    console.error('Error fetching AI stats:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
