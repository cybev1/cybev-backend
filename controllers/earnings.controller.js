// controllers/earnings.controller.js
/**
 * Returns token earnings for the current user
 */
exports.getUserEarnings = async (req, res) => {
  try {
    const userId = req.user.id; // assume auth middleware sets req.user
    // TODO: Fetch from database
    const earnings = {
      totalEarnings: 42.5,
      perPost: [
        { postId: 'abc', amount: 10 },
        { postId: 'def', amount: 32.5 }
      ]
    };
    res.json(earnings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
