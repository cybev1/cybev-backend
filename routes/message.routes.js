// ============================================
// FILE: routes/message.routes.js
// PATH: cybev-backend/routes/message.routes.js
// PURPOSE: Real-time messaging backend routes
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// MESSAGE SCHEMA (define inline if not exists)
// ==========================================

let Message, Conversation;

try {
  Message = mongoose.model('Message');
} catch {
  const messageSchema = new mongoose.Schema({
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    attachments: [{
      type: { type: String, enum: ['image', 'video', 'file', 'audio'] },
      url: String,
      name: String,
      size: Number
    }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    reactions: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      emoji: String
    }],
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date
  }, { timestamps: true });

  messageSchema.index({ conversation: 1, createdAt: -1 });
  messageSchema.index({ sender: 1 });
  
  Message = mongoose.model('Message', messageSchema);
}

try {
  Conversation = mongoose.model('Conversation');
} catch {
  const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    type: { type: String, enum: ['direct', 'group'], default: 'direct' },
    name: String, // For group chats
    avatar: String, // For group chats
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    lastMessageAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // For group chats
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isActive: { type: Boolean, default: true }
  }, { timestamps: true });

  conversationSchema.index({ participants: 1 });
  conversationSchema.index({ lastMessageAt: -1 });
  
  Conversation = mongoose.model('Conversation', conversationSchema);
}

// ==========================================
// CONVERSATIONS
// ==========================================

// GET /api/messages/conversations - Get user's conversations
router.get('/conversations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const conversations = await Conversation.find({
      participants: userId,
      isActive: true
    })
      .populate('participants', 'name username avatar')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Get unread counts for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          sender: { $ne: userId },
          readBy: { $ne: userId },
          isDeleted: false
        });

        return {
          ...conv.toObject(),
          unreadCount
        };
      })
    );

    res.json({
      ok: true,
      conversations: conversationsWithUnread,
      page: parseInt(page),
      hasMore: conversations.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get conversations' });
  }
});

// POST /api/messages/conversations - Create or get existing conversation
router.post('/conversations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { participantId, participantIds, type = 'direct', name } = req.body;

    // For direct messages
    if (type === 'direct') {
      if (!participantId) {
        return res.status(400).json({ ok: false, error: 'participantId required for direct messages' });
      }

      // Check if conversation already exists
      const existingConversation = await Conversation.findOne({
        type: 'direct',
        participants: { $all: [userId, participantId], $size: 2 }
      }).populate('participants', 'name username avatar');

      if (existingConversation) {
        return res.json({ ok: true, conversation: existingConversation, isNew: false });
      }

      // Create new conversation
      const newConversation = await Conversation.create({
        participants: [userId, participantId],
        type: 'direct',
        createdBy: userId,
        lastMessageAt: new Date()
      });

      const populatedConversation = await Conversation.findById(newConversation._id)
        .populate('participants', 'name username avatar');

      return res.json({ ok: true, conversation: populatedConversation, isNew: true });
    }

    // For group chats
    if (type === 'group') {
      if (!participantIds || participantIds.length < 2) {
        return res.status(400).json({ ok: false, error: 'At least 2 participants required for group chat' });
      }

      const allParticipants = [...new Set([userId, ...participantIds])];

      const newConversation = await Conversation.create({
        participants: allParticipants,
        type: 'group',
        name: name || 'New Group',
        createdBy: userId,
        admins: [userId],
        lastMessageAt: new Date()
      });

      const populatedConversation = await Conversation.findById(newConversation._id)
        .populate('participants', 'name username avatar');

      return res.json({ ok: true, conversation: populatedConversation, isNew: true });
    }

    res.status(400).json({ ok: false, error: 'Invalid conversation type' });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ ok: false, error: 'Failed to create conversation' });
  }
});

// GET /api/messages/conversations/:conversationId - Get single conversation
router.get('/conversations/:conversationId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    }).populate('participants', 'name username avatar');

    if (!conversation) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }

    res.json({ ok: true, conversation });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get conversation' });
  }
});

// DELETE /api/messages/conversations/:conversationId - Leave/delete conversation
router.delete('/conversations/:conversationId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }

    if (conversation.type === 'direct') {
      // For direct messages, just mark as inactive for this user
      // In production, you might want a more sophisticated soft-delete
      await Conversation.updateOne(
        { _id: conversationId },
        { isActive: false }
      );
    } else {
      // For group chats, remove user from participants
      await Conversation.updateOne(
        { _id: conversationId },
        { $pull: { participants: userId, admins: userId } }
      );
    }

    res.json({ ok: true, message: 'Left conversation' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete conversation' });
  }
});

// ==========================================
// MESSAGES
// ==========================================

// GET /api/messages/:conversationId - Get messages in a conversation
router.get('/:conversationId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { page = 1, limit = 50, before } = req.query;

    // Verify user is in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }

    // Build query
    const query = {
      conversation: conversationId,
      isDeleted: false
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name username avatar')
      .populate('replyTo')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: userId },
        readBy: { $ne: userId }
      },
      { $addToSet: { readBy: userId } }
    );

    res.json({
      ok: true,
      messages: messages.reverse(), // Return in chronological order
      page: parseInt(page),
      hasMore: messages.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get messages' });
  }
});

// POST /api/messages/:conversationId - Send a message
router.post('/:conversationId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { text, attachments, replyTo } = req.body;

    if (!text && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ ok: false, error: 'Message text or attachment required' });
    }

    // Verify user is in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }

    // Create message
    const message = await Message.create({
      conversation: conversationId,
      sender: userId,
      text: text || '',
      attachments: attachments || [],
      replyTo: replyTo || null,
      readBy: [userId]
    });

    // Update conversation
    await Conversation.updateOne(
      { _id: conversationId },
      {
        lastMessage: message._id,
        lastMessageAt: new Date()
      }
    );

    // Populate sender info
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name username avatar')
      .populate('replyTo');

    // Emit socket event for real-time delivery
    const io = req.app.get('io');
    if (io) {
      conversation.participants.forEach(participantId => {
        if (participantId.toString() !== userId.toString()) {
          io.to(`user_${participantId}`).emit('newMessage', {
            conversationId,
            message: populatedMessage
          });
        }
      });
    }

    // Create notifications for other participants
    try {
      const Notification = mongoose.model('Notification');
      const User = mongoose.model('User');
      const sender = await User.findById(userId).select('name');

      for (const participantId of conversation.participants) {
        if (participantId.toString() !== userId.toString()) {
          await Notification.create({
            recipient: participantId,
            sender: userId,
            type: 'message',
            message: `${sender?.name || 'Someone'} sent you a message`,
            relatedConversation: conversationId
          });
        }
      }
    } catch (notifError) {
      console.log('Notification creation failed:', notifError.message);
    }

    res.json({ ok: true, message: populatedMessage });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send message' });
  }
});

// PUT /api/messages/:conversationId/:messageId - Edit a message
router.put('/:conversationId/:messageId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;
    const { text } = req.body;

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
      sender: userId,
      isDeleted: false
    });

    if (!message) {
      return res.status(404).json({ ok: false, error: 'Message not found or not authorized' });
    }

    message.text = text;
    message.editedAt = new Date();
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name username avatar');

    res.json({ ok: true, message: populatedMessage });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ ok: false, error: 'Failed to edit message' });
  }
});

// DELETE /api/messages/:conversationId/:messageId - Delete a message
router.delete('/:conversationId/:messageId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
      sender: userId
    });

    if (!message) {
      return res.status(404).json({ ok: false, error: 'Message not found or not authorized' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.text = 'This message was deleted';
    await message.save();

    res.json({ ok: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete message' });
  }
});

// ==========================================
// MESSAGE REACTIONS
// ==========================================

// POST /api/messages/:conversationId/:messageId/react - Add reaction to message
router.post('/:conversationId/:messageId/react', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ ok: false, error: 'Emoji required' });
    }

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
      isDeleted: false
    });

    if (!message) {
      return res.status(404).json({ ok: false, error: 'Message not found' });
    }

    // Remove existing reaction from this user
    message.reactions = message.reactions.filter(
      r => r.user.toString() !== userId.toString()
    );

    // Add new reaction
    message.reactions.push({ user: userId, emoji });
    await message.save();

    res.json({ ok: true, reactions: message.reactions });
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ ok: false, error: 'Failed to react to message' });
  }
});

// DELETE /api/messages/:conversationId/:messageId/react - Remove reaction
router.delete('/:conversationId/:messageId/react', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId
    });

    if (!message) {
      return res.status(404).json({ ok: false, error: 'Message not found' });
    }

    message.reactions = message.reactions.filter(
      r => r.user.toString() !== userId.toString()
    );
    await message.save();

    res.json({ ok: true, reactions: message.reactions });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ ok: false, error: 'Failed to remove reaction' });
  }
});

// ==========================================
// READ RECEIPTS
// ==========================================

// POST /api/messages/:conversationId/read - Mark messages as read
router.post('/:conversationId/read', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { upToMessageId } = req.body;

    const query = {
      conversation: conversationId,
      sender: { $ne: userId },
      readBy: { $ne: userId }
    };

    if (upToMessageId) {
      const upToMessage = await Message.findById(upToMessageId);
      if (upToMessage) {
        query.createdAt = { $lte: upToMessage.createdAt };
      }
    }

    const result = await Message.updateMany(
      query,
      { $addToSet: { readBy: userId } }
    );

    // Emit read receipt via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${conversationId}`).emit('messagesRead', {
        conversationId,
        userId,
        count: result.modifiedCount
      });
    }

    res.json({ ok: true, markedRead: result.modifiedCount });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ ok: false, error: 'Failed to mark as read' });
  }
});

// ==========================================
// TYPING INDICATORS
// ==========================================

// POST /api/messages/:conversationId/typing - Send typing indicator
router.post('/:conversationId/typing', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { isTyping } = req.body;

    // Emit typing indicator via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${conversationId}`).emit('userTyping', {
        conversationId,
        userId,
        isTyping: !!isTyping
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Typing indicator error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send typing indicator' });
  }
});

// ==========================================
// SEARCH MESSAGES
// ==========================================

// GET /api/messages/search - Search messages across conversations
router.get('/search/all', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ ok: false, error: 'Search query must be at least 2 characters' });
    }

    // Get user's conversations
    const userConversations = await Conversation.find({
      participants: userId
    }).select('_id');

    const conversationIds = userConversations.map(c => c._id);

    // Search messages
    const messages = await Message.find({
      conversation: { $in: conversationIds },
      text: { $regex: q, $options: 'i' },
      isDeleted: false
    })
      .populate('sender', 'name username avatar')
      .populate('conversation')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ ok: true, messages, query: q });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ ok: false, error: 'Failed to search messages' });
  }
});

module.exports = router;
