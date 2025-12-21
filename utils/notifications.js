// ============================================
// FILE: utils/notifications.js
// Safe wrapper for notifications utility
// ============================================

// This module is intentionally defensive: notifications should never crash the API.

let Notification;

/**
 * Create a notification.
 *
 * Supported call styles:
 * 1) createNotification({ recipient, sender, type, message, targetModel?, target? })
 * 2) createNotification(recipientId, type, message, extra?)
 */
let createNotification;
let sendNotification;

try {
  Notification = require('../models/notification.model');

  createNotification = async (arg1, type, message, extra = {}) => {
    try {
      const payload =
        arg1 && typeof arg1 === 'object'
          ? { ...arg1 }
          : {
              recipient: arg1,
              type,
              message,
              ...extra
            };

      // Back-compat: if callers pass { user: <id> } use it as recipient.
      if (!payload.recipient && payload.user) payload.recipient = payload.user;

      if (!payload.recipient || !payload.type || !payload.message) {
        console.log('⚠️ Notification not created (missing fields):', {
          hasRecipient: !!payload.recipient,
          hasType: !!payload.type,
          hasMessage: !!payload.message
        });
        return null;
      }

      const notification = new Notification({
        recipient: payload.recipient,
        sender: payload.sender,
        type: payload.type,
        message: payload.message,
        targetModel: payload.targetModel,
        target: payload.target,
        read: false
      });

      await notification.save();
      return notification;
    } catch (error) {
      console.log('⚠️ Could not create notification:', error.message);
      return null;
    }
  };

  sendNotification = async (...args) => createNotification(...args);

  console.log('✅ Notifications utility loaded');
} catch (error) {
  console.log('⚠️ Notification model failed to load - using mock functions');
  console.log('   Error:', error.message);
  console.log('   Notifications will be logged but not saved');

  createNotification = async (arg1, type, message, extra = {}) => {
    const payload =
      arg1 && typeof arg1 === 'object'
        ? { ...arg1 }
        : {
            recipient: arg1,
            type,
            message,
            ...extra
          };

    const recipient = payload.recipient || payload.user;
    console.log(
      `📧 [MOCK] Notification: ${payload.type || type} - ${payload.message || message} for user ${recipient}`
    );
    return { ...payload, recipient, read: false, _id: 'mock-' + Date.now() };
  };

  sendNotification = async (...args) => createNotification(...args);
}

module.exports = { createNotification, sendNotification, Notification };
