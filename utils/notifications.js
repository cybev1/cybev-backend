// ============================================
// FILE: server/utils/notifications.js
// ============================================
const Notification = require('../models/notification.model');
const { emitNotification } = require('../socket');

async function createNotification({
  recipient,
  sender,
  type,
  targetModel,
  target,
  message
}) {
  try {
    if (recipient.toString() === sender.toString()) {
      return null;
    }

    const existingNotification = await Notification.findOne({
      recipient,
      sender,
      type,
      target,
      createdAt: { $gte: new Date(Date.now() - 60000) }
    });

    if (existingNotification) {
      return existingNotification;
    }

    const notification = new Notification({
      recipient,
      sender,
      type,
      targetModel,
      target,
      message
    });

    await notification.save();

    const populatedNotification = await Notification.findById(notification._id)
      .populate('sender', 'username name avatar');

    emitNotification(recipient, populatedNotification);

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

module.exports = { createNotification };
