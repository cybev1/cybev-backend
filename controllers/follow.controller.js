
exports.getFollowing = async (req, res) => {
  try {
    // Dummy logic (replace with real logic)
    return res.json({ following: [] });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch following list' });
  }
};
