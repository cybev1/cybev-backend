
const Post = require('../models/post.model');

exports.getGeoAnalytics = async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setDate(endDate.getDate() + 1);

    const geoData = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
          location: { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            country: "$location.country",
            city: "$location.city"
          },
          views: { $sum: "$views" },
          posts: { $sum: 1 },
          earnings: { $sum: "$earnings" }
        }
      },
      {
        $project: {
          country: "$_id.country",
          city: "$_id.city",
          views: 1,
          posts: 1,
          earnings: 1,
          _id: 0
        }
      },
      { $sort: { views: -1 } }
    ]);

    res.status(200).json({ data: geoData });
  } catch (error) {
    console.error("Geo Analytics Error:", error);
    res.status(500).json({ error: "Failed to fetch geographic analytics" });
  }
};
