// controllers/notifications.controller.js
/**
 * Returns recent notifications for the user
 */
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id; // assume auth middleware sets req.user
    // TODO: Fetch from database
    const notifications = [
      { id: 1, type: 'like', message: 'Alice liked your post.', timestamp: Date.now() - 3600000 },
      { id: 2, type: 'comment', message: 'Bob commented: Nice!', timestamp: Date.now() - 1800000 }
    ];
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
