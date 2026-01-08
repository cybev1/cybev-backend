// ============================================
// FILE: services/notification.service.js
// Advanced Notification Service
// VERSION: 1.0
// Digest emails, scheduling, batching
// ============================================

const mongoose = require('mongoose');

class NotificationService {
  constructor() {
    this.emailService = null;
    this.pushService = null;
    
    // Batch settings
    this.batchSize = 100;
    this.digestSchedules = {
      instant: 0,
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000
    };

    console.log('📬 Advanced Notification Service initialized');
  }

  // Initialize with dependencies
  init(emailService, pushService) {
    this.emailService = emailService;
    this.pushService = pushService;
  }

  // ==========================================
  // NOTIFICATION CREATION
  // ==========================================

  /**
   * Create notification with smart delivery
   */
  async createNotification(options) {
    const {
      userId,
      type,
      title,
      message,
      data = {},
      priority = 'normal', // 'low', 'normal', 'high', 'urgent'
      actionUrl,
      imageUrl,
      sendPush = true,
      sendEmail = false,
      emailSubject,
      emailTemplate,
      groupKey, // For grouping similar notifications
      expiresAt
    } = options;

    try {
      const Notification = mongoose.models.Notification || require('../models/notification.model');
      const User = mongoose.models.User || require('../models/user.model');

      // Get user preferences
      const user = await User.findById(userId).select('notificationPreferences email name pushTokens');
      if (!user) return null;

      const prefs = user.notificationPreferences || {};

      // Check if this notification type is enabled
      const typeEnabled = prefs[type] !== false;
      if (!typeEnabled && priority !== 'urgent') {
        return null; // User disabled this notification type
      }

      // Check quiet hours
      if (this.isQuietHours(prefs) && priority !== 'urgent') {
        // Store for later delivery
        return await this.scheduleNotification({
          ...options,
          scheduledFor: this.getQuietHoursEnd(prefs)
        });
      }

      // Create notification record
      const notification = new Notification({
        user: userId,
        type,
        title,
        message,
        data,
        priority,
        actionUrl,
        imageUrl,
        groupKey,
        expiresAt,
        status: 'pending'
      });

      await notification.save();

      // Determine delivery method based on preferences
      const deliveryFrequency = prefs.frequency || 'instant';

      if (deliveryFrequency === 'instant' || priority === 'urgent') {
        // Send immediately
        await this.deliverNotification(notification, user, { sendPush, sendEmail, emailSubject, emailTemplate });
      } else {
        // Queue for digest
        notification.status = 'queued';
        notification.digestSchedule = deliveryFrequency;
        await notification.save();
      }

      return notification;
    } catch (error) {
      console.error('Create notification error:', error);
      return null;
    }
  }

  /**
   * Deliver notification immediately
   */
  async deliverNotification(notification, user, options = {}) {
    const { sendPush = true, sendEmail = false, emailSubject, emailTemplate } = options;
    const results = { push: null, email: null };

    try {
      // Send push notification
      if (sendPush && user.pushTokens?.length > 0) {
        results.push = await this.sendPushNotification(user, notification);
      }

      // Send email if enabled and user prefers it
      if (sendEmail && user.email && user.notificationPreferences?.emailEnabled !== false) {
        results.email = await this.sendEmailNotification(user, notification, emailSubject, emailTemplate);
      }

      // Update notification status
      notification.status = 'delivered';
      notification.deliveredAt = new Date();
      notification.deliveryResults = results;
      await notification.save();

      // Emit via Socket.IO for real-time
      this.emitRealTimeNotification(user._id, notification);

      return results;
    } catch (error) {
      console.error('Deliver notification error:', error);
      notification.status = 'failed';
      notification.error = error.message;
      await notification.save();
      return null;
    }
  }

  /**
   * Send push notification
   */
  async sendPushNotification(user, notification) {
    if (!this.pushService) return null;

    try {
      const payload = {
        title: notification.title,
        body: notification.message,
        data: {
          type: notification.type,
          actionUrl: notification.actionUrl,
          notificationId: notification._id.toString(),
          ...notification.data
        },
        icon: notification.imageUrl || '/icons/notification.png',
        badge: '/icons/badge.png',
        tag: notification.groupKey || notification.type,
        requireInteraction: notification.priority === 'urgent'
      };

      // Send to all user's devices
      const results = await Promise.all(
        user.pushTokens.map(token => 
          this.pushService.send(token.token, payload).catch(err => ({ error: err.message }))
        )
      );

      return { sent: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length };
    } catch (error) {
      console.error('Push notification error:', error);
      return null;
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(user, notification, subject, template) {
    if (!this.emailService) return null;

    try {
      const emailSubject = subject || notification.title;
      const html = template ? 
        await this.renderEmailTemplate(template, { user, notification }) :
        this.generateDefaultEmailHtml(user, notification);

      return await this.emailService.sendEmail({
        to: user.email,
        subject: emailSubject,
        html
      });
    } catch (error) {
      console.error('Email notification error:', error);
      return null;
    }
  }

  /**
   * Emit real-time notification via Socket.IO
   */
  emitRealTimeNotification(userId, notification) {
    const io = global.io;
    if (io) {
      io.to(`user:${userId}`).emit('notification', {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        actionUrl: notification.actionUrl,
        imageUrl: notification.imageUrl,
        createdAt: notification.createdAt,
        priority: notification.priority
      });
    }
  }

  // ==========================================
  // DIGEST NOTIFICATIONS
  // ==========================================

  /**
   * Process and send digest notifications
   */
  async processDigests(frequency = 'daily') {
    const Notification = mongoose.models.Notification || require('../models/notification.model');
    const User = mongoose.models.User || require('../models/user.model');

    try {
      // Find users with pending digest notifications
      const pendingNotifications = await Notification.aggregate([
        {
          $match: {
            status: 'queued',
            digestSchedule: frequency
          }
        },
        {
          $group: {
            _id: '$user',
            notifications: { $push: '$$ROOT' },
            count: { $sum: 1 }
          }
        }
      ]);

      console.log(`📬 Processing ${frequency} digests for ${pendingNotifications.length} users`);

      for (const userDigest of pendingNotifications) {
        const user = await User.findById(userDigest._id)
          .select('email name notificationPreferences pushTokens');
        
        if (!user || !user.email) continue;

        // Send digest email
        await this.sendDigestEmail(user, userDigest.notifications, frequency);

        // Mark notifications as delivered
        await Notification.updateMany(
          { _id: { $in: userDigest.notifications.map(n => n._id) } },
          { 
            status: 'delivered',
            deliveredAt: new Date(),
            deliveryMethod: 'digest'
          }
        );
      }

      return { processed: pendingNotifications.length };
    } catch (error) {
      console.error('Process digests error:', error);
      return { error: error.message };
    }
  }

  /**
   * Send digest email
   */
  async sendDigestEmail(user, notifications, frequency) {
    if (!this.emailService || !user.email) return null;

    const frequencyLabels = {
      hourly: 'Hourly',
      daily: 'Daily',
      weekly: 'Weekly'
    };

    const subject = `Your ${frequencyLabels[frequency]} CYBEV Digest - ${notifications.length} notifications`;

    // Group notifications by type
    const grouped = notifications.reduce((acc, n) => {
      const type = n.type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(n);
      return acc;
    }, {});

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .header p { margin: 10px 0 0; opacity: 0.9; }
          .content { padding: 30px; }
          .section { margin-bottom: 25px; }
          .section-title { font-size: 14px; font-weight: 600; color: #7c3aed; text-transform: uppercase; margin-bottom: 10px; }
          .notification { padding: 15px; background: #f9fafb; border-radius: 8px; margin-bottom: 10px; }
          .notification-title { font-weight: 600; color: #1f2937; margin-bottom: 5px; }
          .notification-message { color: #6b7280; font-size: 14px; }
          .notification-time { color: #9ca3af; font-size: 12px; margin-top: 8px; }
          .footer { padding: 20px 30px; background: #f9fafb; text-align: center; }
          .footer a { color: #7c3aed; text-decoration: none; }
          .btn { display: inline-block; padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📬 Your ${frequencyLabels[frequency]} Digest</h1>
            <p>You have ${notifications.length} new notifications</p>
          </div>
          <div class="content">
            ${Object.entries(grouped).map(([type, items]) => `
              <div class="section">
                <div class="section-title">${this.getTypeLabel(type)} (${items.length})</div>
                ${items.slice(0, 5).map(n => `
                  <div class="notification">
                    <div class="notification-title">${n.title}</div>
                    <div class="notification-message">${n.message}</div>
                    <div class="notification-time">${new Date(n.createdAt).toLocaleString()}</div>
                  </div>
                `).join('')}
                ${items.length > 5 ? `<p style="color: #6b7280; font-size: 14px;">...and ${items.length - 5} more</p>` : ''}
              </div>
            `).join('')}
            <a href="${process.env.CLIENT_URL || 'https://cybev.io'}/notifications" class="btn">View All Notifications</a>
          </div>
          <div class="footer">
            <p>You're receiving this because you enabled ${frequency} digest notifications.</p>
            <p><a href="${process.env.CLIENT_URL || 'https://cybev.io'}/settings/notifications">Manage notification preferences</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.emailService.sendEmail({
      to: user.email,
      subject,
      html
    });
  }

  // ==========================================
  // SCHEDULED NOTIFICATIONS
  // ==========================================

  /**
   * Schedule a notification for later delivery
   */
  async scheduleNotification(options) {
    const ScheduledNotification = mongoose.models.ScheduledNotification || 
      this.getScheduledNotificationModel();

    const scheduled = new ScheduledNotification({
      ...options,
      status: 'scheduled'
    });

    await scheduled.save();
    return scheduled;
  }

  /**
   * Process scheduled notifications
   */
  async processScheduledNotifications() {
    const ScheduledNotification = mongoose.models.ScheduledNotification || 
      this.getScheduledNotificationModel();

    try {
      const now = new Date();
      const pending = await ScheduledNotification.find({
        scheduledFor: { $lte: now },
        status: 'scheduled'
      }).limit(this.batchSize);

      console.log(`⏰ Processing ${pending.length} scheduled notifications`);

      for (const scheduled of pending) {
        try {
          await this.createNotification({
            userId: scheduled.userId,
            type: scheduled.type,
            title: scheduled.title,
            message: scheduled.message,
            data: scheduled.data,
            priority: scheduled.priority,
            actionUrl: scheduled.actionUrl,
            sendPush: scheduled.sendPush,
            sendEmail: scheduled.sendEmail
          });

          scheduled.status = 'sent';
          scheduled.sentAt = new Date();
        } catch (error) {
          scheduled.status = 'failed';
          scheduled.error = error.message;
        }
        await scheduled.save();
      }

      return { processed: pending.length };
    } catch (error) {
      console.error('Process scheduled error:', error);
      return { error: error.message };
    }
  }

  // ==========================================
  // BULK NOTIFICATIONS
  // ==========================================

  /**
   * Send notification to multiple users
   */
  async sendBulkNotification(options) {
    const {
      userIds,
      userQuery, // Alternative: MongoDB query to find users
      type,
      title,
      message,
      data = {},
      priority = 'normal',
      actionUrl,
      sendPush = true,
      sendEmail = false,
      batchDelay = 100 // ms between batches
    } = options;

    const User = mongoose.models.User || require('../models/user.model');
    let users;

    if (userIds?.length) {
      users = await User.find({ _id: { $in: userIds } }).select('_id');
    } else if (userQuery) {
      users = await User.find(userQuery).select('_id');
    } else {
      throw new Error('Must provide userIds or userQuery');
    }

    console.log(`📢 Sending bulk notification to ${users.length} users`);

    const results = { sent: 0, failed: 0 };

    // Process in batches
    for (let i = 0; i < users.length; i += this.batchSize) {
      const batch = users.slice(i, i + this.batchSize);
      
      const promises = batch.map(user => 
        this.createNotification({
          userId: user._id,
          type,
          title,
          message,
          data,
          priority,
          actionUrl,
          sendPush,
          sendEmail
        }).catch(() => null)
      );

      const batchResults = await Promise.all(promises);
      results.sent += batchResults.filter(r => r).length;
      results.failed += batchResults.filter(r => !r).length;

      // Small delay between batches to avoid overwhelming the system
      if (i + this.batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    return results;
  }

  /**
   * Send announcement to all users
   */
  async sendAnnouncement(options) {
    return this.sendBulkNotification({
      ...options,
      userQuery: { 
        role: { $ne: 'banned' },
        'notificationPreferences.announcements': { $ne: false }
      },
      type: 'announcement',
      priority: 'high'
    });
  }

  // ==========================================
  // NOTIFICATION GROUPING
  // ==========================================

  /**
   * Group and collapse similar notifications
   */
  async collapseNotifications(userId, groupKey) {
    const Notification = mongoose.models.Notification || require('../models/notification.model');

    // Find recent similar notifications
    const recentCutoff = new Date(Date.now() - 60 * 60 * 1000); // Last hour
    
    const similar = await Notification.find({
      user: userId,
      groupKey,
      createdAt: { $gte: recentCutoff },
      collapsed: { $ne: true }
    }).sort({ createdAt: -1 });

    if (similar.length <= 1) return null;

    // Keep the most recent, collapse the rest
    const [latest, ...toCollapse] = similar;

    // Update latest with count
    latest.collapsedCount = similar.length;
    latest.message = this.getCollapsedMessage(latest.type, similar.length);
    await latest.save();

    // Mark others as collapsed
    await Notification.updateMany(
      { _id: { $in: toCollapse.map(n => n._id) } },
      { collapsed: true, collapsedInto: latest._id }
    );

    return latest;
  }

  /**
   * Get collapsed message text
   */
  getCollapsedMessage(type, count) {
    const messages = {
      'like': `${count} people liked your post`,
      'comment': `${count} new comments on your post`,
      'follow': `${count} new followers`,
      'mention': `You were mentioned ${count} times`,
      'message': `${count} new messages`
    };
    return messages[type] || `${count} new notifications`;
  }

  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Check if currently in quiet hours
   */
  isQuietHours(prefs) {
    if (!prefs.quietHoursEnabled) return false;
    
    const now = new Date();
    const currentHour = now.getHours();
    const start = prefs.quietHoursStart || 22; // Default 10 PM
    const end = prefs.quietHoursEnd || 8; // Default 8 AM

    if (start > end) {
      // Overnight quiet hours (e.g., 22:00 - 08:00)
      return currentHour >= start || currentHour < end;
    } else {
      // Same-day quiet hours
      return currentHour >= start && currentHour < end;
    }
  }

  /**
   * Get quiet hours end time
   */
  getQuietHoursEnd(prefs) {
    const end = prefs.quietHoursEnd || 8;
    const now = new Date();
    const result = new Date(now);
    result.setHours(end, 0, 0, 0);
    
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    
    return result;
  }

  /**
   * Get readable label for notification type
   */
  getTypeLabel(type) {
    const labels = {
      'like': '❤️ Likes',
      'comment': '💬 Comments',
      'follow': '👤 Followers',
      'mention': '📢 Mentions',
      'message': '✉️ Messages',
      'announcement': '📣 Announcements',
      'reward': '🎁 Rewards',
      'stream': '🎬 Live Streams',
      'event': '📅 Events',
      'group': '👥 Groups'
    };
    return labels[type] || '🔔 Notifications';
  }

  /**
   * Generate default email HTML
   */
  generateDefaultEmailHtml(user, notification) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .btn { display: inline-block; padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px; margin-top: 15px; }
          .footer { padding: 20px; background: #f9fafb; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 ${notification.title}</h1>
          </div>
          <div class="content">
            <p>Hi ${user.name || 'there'},</p>
            <p>${notification.message}</p>
            ${notification.actionUrl ? `<a href="${notification.actionUrl}" class="btn">View Now</a>` : ''}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} CYBEV. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get ScheduledNotification model (create if doesn't exist)
   */
  getScheduledNotificationModel() {
    if (mongoose.models.ScheduledNotification) {
      return mongoose.models.ScheduledNotification;
    }

    const schema = new mongoose.Schema({
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      type: String,
      title: String,
      message: String,
      data: mongoose.Schema.Types.Mixed,
      priority: { type: String, default: 'normal' },
      actionUrl: String,
      sendPush: { type: Boolean, default: true },
      sendEmail: { type: Boolean, default: false },
      scheduledFor: { type: Date, required: true },
      status: { type: String, enum: ['scheduled', 'sent', 'cancelled', 'failed'], default: 'scheduled' },
      sentAt: Date,
      error: String
    }, { timestamps: true });

    schema.index({ scheduledFor: 1, status: 1 });
    schema.index({ userId: 1 });

    return mongoose.model('ScheduledNotification', schema);
  }
}

module.exports = new NotificationService();
