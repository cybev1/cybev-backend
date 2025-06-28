
const Engagement = require('../models/engagement.model'); // or wherever device data is stored

exports.getDeviceAnalytics = async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setDate(endDate.getDate() + 1);

    const deviceData = await Engagement.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
          deviceInfo: { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            browser: "$deviceInfo.browser",
            platform: "$deviceInfo.platform"
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          browser: "$_id.browser",
          platform: "$_id.platform",
          count: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({ data: deviceData });
  } catch (error) {
    console.error("Device Analytics Error:", error);
    res.status(500).json({ error: "Failed to fetch device analytics" });
  }
};
