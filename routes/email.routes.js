// ============================================
// FILE: routes/email.routes.js
// CYBEV Email API - Gmail-like Email System
// VERSION: 1.0.0 - Full Inbox Support
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Import models
const { EmailAddress, SenderDomain, EmailMessage, EmailThread, EmailLabel, EmailContact } = require('../models/email.model');
const sesService = require('../services/ses.service');

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// EMAIL ADDRESS MANAGEMENT
// ==========================================

// Get user's email addresses
router.get('/addresses', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const addresses = await EmailAddress.find({ user: userId, isActive: true })
      .populate('senderDomain', 'domain status')
      .sort({ isPrimary: -1, createdAt: -1 });
    
    res.json({ addresses });
  } catch (err) {
    console.error('Get addresses error:', err);
    res.status(500).json({ error: 'Failed to fetch email addresses' });
  }
});

// Create CYBEV email address (auto on signup or manual)
router.post('/addresses/cybev', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { username, displayName } = req.body;
    
    // Check if user already has a CYBEV email
    const existing = await EmailAddress.findOne({ user: userId, type: 'cybev' });
    if (existing) {
      return res.status(400).json({ error: 'You already have a CYBEV email address', email: existing.email });
    }
    
    // Validate username
    const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (sanitizedUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    const email = sesService.generateCybevEmail(sanitizedUsername);
    
    // Check if email is taken
    const taken = await EmailAddress.findOne({ email });
    if (taken) {
      return res.status(400).json({ error: 'This email address is already taken' });
    }
    
    const emailAddress = await EmailAddress.create({
      user: userId,
      email,
      domain: sesService.CYBEV_DOMAIN,
      localPart: sanitizedUsername,
      type: 'cybev',
      isPrimary: true,
      displayName: displayName || sanitizedUsername
    });
    
    res.json({ ok: true, emailAddress });
  } catch (err) {
    console.error('Create CYBEV email error:', err);
    res.status(500).json({ error: 'Failed to create email address' });
  }
});

// Create custom domain email address
router.post('/addresses/custom', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { localPart, domainId, displayName } = req.body;
    
    // Verify domain ownership and status
    const domain = await SenderDomain.findOne({ _id: domainId, user: userId, status: 'verified' });
    if (!domain) {
      return res.status(400).json({ error: 'Domain not found or not verified' });
    }
    
    const email = `${localPart.toLowerCase()}@${domain.domain}`;
    
    // Check if email exists
    const existing = await EmailAddress.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'This email address already exists' });
    }
    
    const emailAddress = await EmailAddress.create({
      user: userId,
      email,
      domain: domain.domain,
      localPart: localPart.toLowerCase(),
      type: 'custom',
      senderDomain: domain._id,
      displayName
    });
    
    res.json({ ok: true, emailAddress });
  } catch (err) {
    console.error('Create custom email error:', err);
    res.status(500).json({ error: 'Failed to create email address' });
  }
});

// Update email address settings
router.put('/addresses/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { displayName, signature, isPrimary } = req.body;
    
    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (signature !== undefined) update.signature = signature;
    
    // If setting as primary, unset other primaries first
    if (isPrimary) {
      await EmailAddress.updateMany({ user: userId }, { isPrimary: false });
      update.isPrimary = true;
    }
    
    const emailAddress = await EmailAddress.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      update,
      { new: true }
    );
    
    if (!emailAddress) {
      return res.status(404).json({ error: 'Email address not found' });
    }
    
    res.json({ ok: true, emailAddress });
  } catch (err) {
    console.error('Update email address error:', err);
    res.status(500).json({ error: 'Failed to update email address' });
  }
});

// Delete email address
router.delete('/addresses/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const emailAddress = await EmailAddress.findOne({ _id: req.params.id, user: userId });
    if (!emailAddress) {
      return res.status(404).json({ error: 'Email address not found' });
    }
    
    // Can't delete primary address
    if (emailAddress.isPrimary) {
      return res.status(400).json({ error: 'Cannot delete primary email address' });
    }
    
    // Soft delete by marking inactive
    emailAddress.isActive = false;
    await emailAddress.save();
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete email address error:', err);
    res.status(500).json({ error: 'Failed to delete email address' });
  }
});

// ==========================================
// INBOX / MESSAGES
// ==========================================

// Get messages (inbox, sent, drafts, etc.)
router.get('/messages', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { 
      folder = 'inbox', 
      page = 1, 
      limit = 50, 
      search,
      label,
      isRead,
      isStarred
    } = req.query;
    
    const query = { user: userId, folder, deletedAt: null };
    
    if (label) query.labels = label;
    if (isRead !== undefined) query.isRead = isRead === 'true';
    if (isStarred !== undefined) query.isStarred = isStarred === 'true';
    
    // Full-text search
    if (search) {
      query.$text = { $search: search };
    }
    
    const [messages, total, unreadCount] = await Promise.all([
      EmailMessage.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .select('-bodyHtml -bodyText -headers'), // Exclude large fields for listing
      EmailMessage.countDocuments(query),
      EmailMessage.countDocuments({ user: userId, folder, isRead: false, deletedAt: null })
    ]);
    
    res.json({
      messages,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
      unreadCount
    });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get single message
router.get('/messages/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const message = await EmailMessage.findOne({ _id: req.params.id, user: userId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Mark as read
    if (!message.isRead) {
      message.isRead = true;
      await message.save();
      
      // Update thread unread count
      if (message.threadId) {
        await EmailThread.findOneAndUpdate(
          { threadId: message.threadId, user: userId },
          { $inc: { unreadCount: -1 } }
        );
      }
    }
    
    res.json({ message });
  } catch (err) {
    console.error('Get message error:', err);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
});

// Get thread messages
router.get('/threads/:threadId', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const messages = await EmailMessage.find({ 
      user: userId, 
      threadId: req.params.threadId,
      deletedAt: null
    }).sort({ createdAt: 1 });
    
    // Mark all as read
    const unreadIds = messages.filter(m => !m.isRead).map(m => m._id);
    if (unreadIds.length > 0) {
      await EmailMessage.updateMany({ _id: { $in: unreadIds } }, { isRead: true });
      await EmailThread.findOneAndUpdate(
        { threadId: req.params.threadId, user: userId },
        { unreadCount: 0 }
      );
    }
    
    res.json({ messages });
  } catch (err) {
    console.error('Get thread error:', err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Compose / Send email
router.post('/messages/send', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { 
      from, // Email address ID or email string
      to, 
      cc, 
      bcc, 
      subject, 
      bodyHtml, 
      bodyText,
      replyTo,
      inReplyTo,
      attachments,
      scheduledAt,
      isDraft
    } = req.body;
    
    // Get sender email address
    let senderEmail, senderName;
    if (mongoose.Types.ObjectId.isValid(from)) {
      const emailAddr = await EmailAddress.findOne({ _id: from, user: userId, isActive: true });
      if (!emailAddr) {
        return res.status(400).json({ error: 'Invalid sender email address' });
      }
      senderEmail = emailAddr.email;
      senderName = emailAddr.displayName;
    } else {
      // Verify user owns this email
      const emailAddr = await EmailAddress.findOne({ email: from, user: userId, isActive: true });
      if (!emailAddr) {
        return res.status(400).json({ error: 'You do not own this email address' });
      }
      senderEmail = emailAddr.email;
      senderName = emailAddr.displayName;
    }
    
    // Generate message ID
    const messageId = `<${crypto.randomBytes(16).toString('hex')}@cybev.io>`;
    
    // Determine thread ID
    let threadId = crypto.randomBytes(8).toString('hex');
    if (inReplyTo) {
      // Find parent message's thread
      const parentMsg = await EmailMessage.findOne({ messageId: inReplyTo, user: userId });
      if (parentMsg) {
        threadId = parentMsg.threadId;
      }
    }
    
    // Parse recipients
    const parseRecipients = (recipients) => {
      if (!recipients) return [];
      if (typeof recipients === 'string') {
        return [{ email: recipients.trim() }];
      }
      return recipients.map(r => typeof r === 'string' ? { email: r.trim() } : r);
    };
    
    const toList = parseRecipients(to);
    const ccList = parseRecipients(cc);
    const bccList = parseRecipients(bcc);
    
    // Create message record
    const message = new EmailMessage({
      user: userId,
      messageId,
      threadId,
      inReplyTo,
      folder: isDraft ? 'drafts' : 'sent',
      direction: 'outbound',
      from: { email: senderEmail, name: senderName },
      to: toList,
      cc: ccList,
      bcc: bccList,
      replyTo: replyTo ? { email: replyTo } : undefined,
      subject: subject || '(No Subject)',
      bodyHtml,
      bodyText: bodyText || stripHtml(bodyHtml),
      attachments: attachments || [],
      isDraft: !!isDraft,
      isRead: true,
      delivery: {
        status: isDraft ? 'pending' : 'pending'
      }
    });
    
    // If scheduled
    if (scheduledAt && !isDraft) {
      message.scheduledAt = new Date(scheduledAt);
      message.folder = 'drafts';
      message.isDraft = true;
      await message.save();
      
      return res.json({ ok: true, message, scheduled: true });
    }
    
    // If draft, just save
    if (isDraft) {
      await message.save();
      return res.json({ ok: true, message, draft: true });
    }
    
    // Send via SES
    const allRecipients = [
      ...toList.map(r => r.email),
      ...ccList.map(r => r.email),
      ...bccList.map(r => r.email)
    ].filter(Boolean);
    
    try {
      const sendResult = await sesService.sendEmail({
        to: allRecipients,
        from: senderEmail,
        fromName: senderName,
        subject: message.subject,
        html: bodyHtml,
        text: message.bodyText,
        replyTo
      });
      
      message.delivery.status = 'sent';
      message.delivery.sesMessageId = sendResult.messageId;
      message.delivery.sentAt = new Date();
      
      // Update sender stats
      await EmailAddress.findOneAndUpdate(
        { email: senderEmail },
        { 
          $inc: { 'stats.sent': 1 },
          'stats.lastSentAt': new Date()
        }
      );
      
      // Add recipients to contacts
      for (const recipient of toList) {
        await EmailContact.findOneAndUpdate(
          { user: userId, email: recipient.email.toLowerCase() },
          { 
            $set: { name: recipient.name, source: 'sent', lastContacted: new Date() },
            $inc: { contactCount: 1 }
          },
          { upsert: true }
        );
      }
      
    } catch (sendError) {
      console.error('Send email error:', sendError);
      message.delivery.status = 'failed';
      message.delivery.error = sendError.message;
    }
    
    await message.save();
    
    // Update thread
    await EmailThread.findOneAndUpdate(
      { threadId, user: userId },
      {
        $set: {
          subject: message.subject,
          'lastMessage.messageId': message._id,
          'lastMessage.snippet': message.snippet,
          'lastMessage.from': message.from,
          'lastMessage.date': message.createdAt
        },
        $addToSet: { participants: { $each: toList } },
        $inc: { messageCount: 1 }
      },
      { upsert: true }
    );
    
    res.json({ 
      ok: true, 
      message,
      sent: message.delivery.status === 'sent'
    });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Update message (move, star, labels, etc.)
router.put('/messages/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { folder, isRead, isStarred, labels, addLabel, removeLabel } = req.body;
    
    const update = {};
    if (folder) update.folder = folder;
    if (isRead !== undefined) update.isRead = isRead;
    if (isStarred !== undefined) update.isStarred = isStarred;
    if (labels) update.labels = labels;
    
    const updateOps = { $set: update };
    if (addLabel) {
      updateOps.$addToSet = { labels: addLabel };
    }
    if (removeLabel) {
      updateOps.$pull = { labels: removeLabel };
    }
    
    const message = await EmailMessage.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      updateOps,
      { new: true }
    );
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.json({ ok: true, message });
  } catch (err) {
    console.error('Update message error:', err);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// Bulk update messages
router.post('/messages/bulk', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { ids, action, value } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No message IDs provided' });
    }
    
    let update = {};
    switch (action) {
      case 'read':
        update = { isRead: true };
        break;
      case 'unread':
        update = { isRead: false };
        break;
      case 'star':
        update = { isStarred: true };
        break;
      case 'unstar':
        update = { isStarred: false };
        break;
      case 'move':
        update = { folder: value };
        break;
      case 'trash':
        update = { folder: 'trash' };
        break;
      case 'delete':
        update = { deletedAt: new Date() };
        break;
      case 'addLabel':
        await EmailMessage.updateMany(
          { _id: { $in: ids }, user: userId },
          { $addToSet: { labels: value } }
        );
        return res.json({ ok: true, updated: ids.length });
      case 'removeLabel':
        await EmailMessage.updateMany(
          { _id: { $in: ids }, user: userId },
          { $pull: { labels: value } }
        );
        return res.json({ ok: true, updated: ids.length });
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    const result = await EmailMessage.updateMany(
      { _id: { $in: ids }, user: userId },
      update
    );
    
    res.json({ ok: true, updated: result.modifiedCount });
  } catch (err) {
    console.error('Bulk update error:', err);
    res.status(500).json({ error: 'Failed to update messages' });
  }
});

// Delete message (move to trash or permanent)
router.delete('/messages/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { permanent } = req.query;
    
    const message = await EmailMessage.findOne({ _id: req.params.id, user: userId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (permanent === 'true' || message.folder === 'trash') {
      // Permanent delete
      message.deletedAt = new Date();
      await message.save();
    } else {
      // Move to trash
      message.folder = 'trash';
      await message.save();
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ==========================================
// LABELS
// ==========================================

// Get labels
router.get('/labels', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const labels = await EmailLabel.find({ user: userId }).sort({ isSystem: -1, name: 1 });
    
    res.json({ labels });
  } catch (err) {
    console.error('Get labels error:', err);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

// Create label
router.post('/labels', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, color } = req.body;
    
    const label = await EmailLabel.create({
      user: userId,
      name,
      color: color || '#6366f1'
    });
    
    res.json({ ok: true, label });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Label already exists' });
    }
    console.error('Create label error:', err);
    res.status(500).json({ error: 'Failed to create label' });
  }
});

// Update label
router.put('/labels/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, color } = req.body;
    
    const label = await EmailLabel.findOneAndUpdate(
      { _id: req.params.id, user: userId, isSystem: false },
      { name, color },
      { new: true }
    );
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found or cannot be modified' });
    }
    
    res.json({ ok: true, label });
  } catch (err) {
    console.error('Update label error:', err);
    res.status(500).json({ error: 'Failed to update label' });
  }
});

// Delete label
router.delete('/labels/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const label = await EmailLabel.findOneAndDelete({ 
      _id: req.params.id, 
      user: userId,
      isSystem: false 
    });
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found or cannot be deleted' });
    }
    
    // Remove label from all messages
    await EmailMessage.updateMany(
      { user: userId, labels: label.name },
      { $pull: { labels: label.name } }
    );
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete label error:', err);
    res.status(500).json({ error: 'Failed to delete label' });
  }
});

// ==========================================
// CONTACTS / ADDRESS BOOK
// ==========================================

// Get contacts
router.get('/contacts', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { search, page = 1, limit = 100 } = req.query;
    
    const query = { user: userId };
    if (search) {
      query.$text = { $search: search };
    }
    
    const [contacts, total] = await Promise.all([
      EmailContact.find(query)
        .sort({ contactCount: -1, name: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      EmailContact.countDocuments(query)
    ]);
    
    res.json({ contacts, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Search contacts (for autocomplete)
router.get('/contacts/search', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ contacts: [] });
    }
    
    const contacts = await EmailContact.find({
      user: userId,
      $or: [
        { email: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } }
      ]
    })
    .sort({ contactCount: -1 })
    .limit(10)
    .select('email name');
    
    res.json({ contacts });
  } catch (err) {
    console.error('Search contacts error:', err);
    res.status(500).json({ error: 'Failed to search contacts' });
  }
});

// ==========================================
// FOLDER COUNTS
// ==========================================

router.get('/counts', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const [inbox, sent, drafts, trash, spam, starred, unread] = await Promise.all([
      EmailMessage.countDocuments({ user: userId, folder: 'inbox', deletedAt: null }),
      EmailMessage.countDocuments({ user: userId, folder: 'sent', deletedAt: null }),
      EmailMessage.countDocuments({ user: userId, folder: 'drafts', deletedAt: null }),
      EmailMessage.countDocuments({ user: userId, folder: 'trash', deletedAt: null }),
      EmailMessage.countDocuments({ user: userId, folder: 'spam', deletedAt: null }),
      EmailMessage.countDocuments({ user: userId, isStarred: true, deletedAt: null }),
      EmailMessage.countDocuments({ user: userId, folder: 'inbox', isRead: false, deletedAt: null })
    ]);
    
    res.json({
      counts: { inbox, sent, drafts, trash, spam, starred, unread }
    });
  } catch (err) {
    console.error('Get counts error:', err);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = router;
