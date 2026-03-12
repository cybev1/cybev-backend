// ============================================
// FILE: liveChat.socket.js
// PATH: /socket/liveChat.socket.js
// CYBEV TV 2.0 — Live Stream Chat Namespace
// ============================================

/**
 * Initialize Live Chat Socket.io namespace
 * Add to socket.js:
 *   const { initLiveChatSocket } = require('./socket/liveChat.socket');
 *   initLiveChatSocket(io);
 */
function initLiveChatSocket(io) {
  const liveChatNs = io.of('/live-chat');

  // Track viewers per stream: { streamId: Set<socketId> }
  const streamViewers = new Map();

  liveChatNs.on('connection', (socket) => {
    let currentStream = null;
    let currentUsername = null;

    socket.on('join-stream', ({ streamId, userId, username, avatar }) => {
      currentStream = streamId;
      currentUsername = username;
      socket.join(streamId);

      // Track viewer
      if (!streamViewers.has(streamId)) streamViewers.set(streamId, new Set());
      streamViewers.get(streamId).add(socket.id);
      const count = streamViewers.get(streamId).size;

      // Broadcast viewer count
      liveChatNs.to(streamId).emit('viewer-count', { count });

      // System message
      liveChatNs.to(streamId).emit('chat-message', {
        type: 'system',
        text: `${username} joined`,
        createdAt: new Date()
      });
    });

    socket.on('chat-message', ({ streamId, text, username, avatar }) => {
      if (!text?.trim()) return;
      liveChatNs.to(streamId).emit('chat-message', {
        type: 'message',
        username: username || currentUsername || 'Anonymous',
        avatar: avatar || '',
        text: text.trim(),
        createdAt: new Date()
      });
    });

    socket.on('reaction', ({ streamId, emoji }) => {
      liveChatNs.to(streamId).emit('reaction', {
        emoji,
        username: currentUsername
      });
    });

    // Streamer can end
    socket.on('end-stream', ({ streamId }) => {
      liveChatNs.to(streamId).emit('stream-ended');
    });

    socket.on('leave-stream', ({ streamId }) => {
      cleanup(streamId);
    });

    socket.on('disconnect', () => {
      if (currentStream) cleanup(currentStream);
    });

    function cleanup(streamId) {
      socket.leave(streamId);
      const viewers = streamViewers.get(streamId);
      if (viewers) {
        viewers.delete(socket.id);
        const count = viewers.size;
        if (count === 0) streamViewers.delete(streamId);
        else liveChatNs.to(streamId).emit('viewer-count', { count });
      }
      if (currentUsername) {
        liveChatNs.to(streamId).emit('chat-message', {
          type: 'system',
          text: `${currentUsername} left`,
          createdAt: new Date()
        });
      }
    }
  });

  console.log('📺 Live Chat Socket.io namespace initialized: /live-chat');
  return liveChatNs;
}

module.exports = { initLiveChatSocket };
