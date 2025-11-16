// ============================================
// FILE: utils/notifications.safe.js  
// Safe wrapper for notifications utility
// ============================================

// This prevents the broken notification.model.js from crashing the server

let Notification;
let createNotification;
let sendNotification;

try {
  // Try to load the real notification model
  Notification = require('../models/notification.model');
  
  // Real notification functions
  createNotification = async (userId, type, message, data = {}) => {
    try {
      const notification = new Notification({
        user: userId,
        type,
        message,
        data,
        read: false
      });
      await notification.save();
      return notification;
    } catch (error) {
      console.log('⚠️ Could not create notification:', error.message);
      return null;
    }
  };
  
  sendNotification = async (userId, type, message) => {
    return await createNotification(userId, type, message);
  };
  
  console.log('✅ Notifications utility loaded');
  
} catch (error) {
  console.log('⚠️ Notification model has syntax error - using mock functions');
  console.log('   Error:', error.message);
  console.log('   Notifications will be logged but not saved');
  
  // Mock functions that don't crash
  createNotification = async (userId, type, message, data = {}) => {
    console.log(`📧 [MOCK] Notification: ${type} - ${message} for user ${userId}`);
    return { userId, type, message, data, read: false, _id: 'mock-' + Date.now() };
  };
  
  sendNotification = async (userId, type, message) => {
    return await createNotification(userId, type, message);
  };
}

module.exports = {
  createNotification,
  sendNotification,
  Notification
};
