
const Post = require('../models/post.model');

exports.getTopEarners = async (req, res) => {
  try {
    const leaderboard = await Post.aggregate([
      {
        $group: {
          _id: '$author',
          totalEarnings: { $sum: '$earnings' },
          totalViews: { $sum: '$views' },
          totalReactions: { $sum: '$reactions' }
        }
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: 10 },
      {
        $project: {
          username: '$_id',
          earnings: '$totalEarnings',
          views: '$totalViews',
          reactions: '$totalReactions',
          _id: 0
        }
      }
    ]);

    res.status(200).json({ leaderboard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
