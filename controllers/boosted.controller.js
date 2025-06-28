const clientPromise = require('../lib/mongodb');

exports.getBoostedPosts = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db();
    const posts = await db
      .collection('posts')
      .find({ boosted: true })
      .sort({ boostCount: -1 })
      .limit(50)
      .toArray();

    res.status(200).json({ posts });
  } catch (err) {
    console.error("Error fetching boosted posts:", err);
    res.status(500).json({ error: "Server error" });
  }
};