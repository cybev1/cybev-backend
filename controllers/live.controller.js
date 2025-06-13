// controllers/live.controller.js
/**
 * Returns current live streams (e.g., admin or user live sessions)
 */
exports.getLiveStreams = async (req, res) => {
  try {
    // TODO: Replace with real database query
    const liveStreams = [
      { id: 'admin', title: 'Admin Live Show', isLive: true, viewers: 120 },
      // ... other streams
    ];
    res.json(liveStreams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
