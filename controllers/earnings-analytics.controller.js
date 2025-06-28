
const Post = require('../models/post.model');

exports.getEarningsBreakdown = async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setDate(endDate.getDate() + 1);

    const breakdown = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
          earningsBySource: { $exists: true }
        }
      },
      { $replaceWith: "$earningsBySource" },
      {
        $group: {
          _id: null,
          adRevenue: { $sum: "$ad" },
          boosts: { $sum: "$boost" },
          tips: { $sum: "$tip" },
          nft: { $sum: "$nft" },
          staking: { $sum: "$stake" }
        }
      }
    ]);

    const result = breakdown[0] || {
      adRevenue: 0, boosts: 0, tips: 0, nft: 0, staking: 0
    };

    res.status(200).json(result);
  } catch (error) {
    console.error("Earnings Breakdown Error:", error);
    res.status(500).json({ error: "Failed to fetch earnings breakdown" });
  }
};
