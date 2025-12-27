// ============================================
// FILE: server/socket.js
// ============================================
const socketIo = require('socket.io');

let io;

function initializeSocket(server) {
  const allowedOrigins = [
    'http://localhost:3000',
    'https://cybev.io',
    'https://www.cybev.io',
    process.env.CLIENT_URL
  ].filter(Boolean);

  io = socketIo(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('✅ Socket connected:', socket.id);

    socket.on('join', (userId) => {
      socket.join(`user:${userId}`);
      console.log(`👤 User ${userId} joined their room`);
    });

    socket.on('leave', (userId) => {
      socket.leave(`user:${userId}`);
      console.log(`👋 User ${userId} left their room`);
    });

    socket.on('disconnect', () => {
      console.log('👋 Socket disconnected:', socket.id);
    });
  });

  console.log('🔌 Socket.io initialized');
  return io;
}

function getIO() {
  return io;
}

function emitNotification(userId, notification) {
  if (io) {
    io.to(`user:${userId}`).emit('notification', notification);
    console.log(`📤 Notification sent to user:${userId}`);
  }
}

function emitToUser(userId, event, data) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

module.exports = { initializeSocket, getIO, emitNotification, emitToUser };
