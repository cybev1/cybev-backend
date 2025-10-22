```javascript
const Notification = require('../models/notification.model');

async function createNotification({
  recipient,
  sender,
  type,
  targetModel,
  target,
  message
}) {
  try {
    // Don't notify if sender is the same as recipient
    if (recipient.toString() === sender.toString()) {
      return null;
    }

    // Check if similar notification already exists (to prevent spam)
    const existingNotification = await Notification.findOne({
      recipient,
      sender,
      type,
      target,
      createdAt: { $gte: new Date(Date.now() - 60000) } // Last minute
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
    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

module.exports = { createNotification };
```

---
