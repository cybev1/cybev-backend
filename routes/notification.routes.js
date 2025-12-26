const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const Notification = require('../models/notification.model');

/**
 * Notifications API
 *
 * Base path mounted in server.js: /api/notifications
 */

// GET /api/notifications?limit=50&unreadOnly=false
router.get('/', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const unreadOnly = String(req.query.unreadOnly || 'false') === 'true';

    const query = { recipient: req.user.id };
    if (unreadOnly) query.isRead = false;

    const notifications = await Notification.find(query)
      .populate('sender', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ ok: true, notifications });
  } catch (err) {
    console.error('notifications:list error', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { isRead: true },
      { new: true }
    );
    if (!n) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, notification: n });
  } catch (err) {
    console.error('notifications:readOne error', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true }
    );
    res.json({ ok: true, modifiedCount: result.modifiedCount ?? result.nModified ?? 0 });
  } catch (err) {
    console.error('notifications:readAll error', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user.id });
    if (!deleted) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('notifications:delete error', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
