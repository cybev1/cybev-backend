const express = require('express');
const router = express.Router();

const Notification = require('../models/notification.model');
const { authenticateToken } = require('../middleware/auth');

// GET /api/notifications?read=false&page=1&limit=20
router.get('/', authenticateToken, async (req, res) => {
  try {
    const recipient = req.user.id;
    const { read, page = 1, limit = 20 } = req.query;

    const filter = { recipient };
    if (read === 'true') filter.read = true;
    if (read === 'false') filter.read = false;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('sender', 'name email')
        .lean(),
      Notification.countDocuments(filter),
    ]);

    res.json({
      notifications: items,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const recipient = req.user.id;
    const count = await Notification.countDocuments({ recipient, read: false });
    res.json({ count });
  } catch (err) {
    console.error('GET /api/notifications/unread-count error:', err);
    res.status(500).json({ message: 'Failed to fetch unread count' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const recipient = req.user.id;
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ notification });
  } catch (err) {
    console.error('PATCH /api/notifications/:id/read error:', err);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// POST /api/notifications/mark-all-read
router.post('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const recipient = req.user.id;
    await Notification.updateMany({ recipient, read: false }, { $set: { read: true } });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('POST /api/notifications/mark-all-read error:', err);
    res.status(500).json({ message: 'Failed to mark all as read' });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const recipient = req.user.id;
    const deleted = await Notification.findOneAndDelete({ _id: req.params.id, recipient });
    if (!deleted) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('DELETE /api/notifications/:id error:', err);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

module.exports = router;
