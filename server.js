/**
 * CYBEV Backend Server v6.8.0
 * GitHub: https://github.com/cybev1/cybev-backend
 * 
 * CHANGELOG v6.8.0:
 * - Added Meet routes (video conferencing with Jitsi/Daily.co)
 * - Added Social Tools routes (Facebook automation)
 * - Added Campaigns routes (Email/SMS/WhatsApp marketing)
 * - Added Contacts routes (contact management)
 * - Added AI Generate routes (DeepSeek/OpenAI/Claude)
 * - Added Socket.IO events for real-time meetings
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Make io available to routes
app.set('io', io);

// ============================================
// EXISTING ROUTES (keep your current imports)
// ============================================
// const authRoutes = require('./routes/auth.routes');
// const userRoutes = require('./routes/user.routes');
// const blogRoutes = require('./routes/blog.routes');
// const vlogRoutes = require('./routes/vlogs.routes');
// const websiteRoutes = require('./routes/website.routes');
// const churchRoutes = require('./routes/church.routes');
// const formRoutes = require('./routes/form.routes');
// const cellRoutes = require('./routes/cell.routes');
// ... add your existing route imports

// ============================================
// NEW STUDIO V2.0 ROUTES
// ============================================
const meetRoutes = require('./routes/meet.routes');
const socialToolsRoutes = require('./routes/social-tools.routes');
const campaignsRoutes = require('./routes/campaigns.routes');
const contactsRoutes = require('./routes/contacts.routes');
const aiGenerateRoutes = require('./routes/ai-generate.routes');

// ============================================
// ROUTE REGISTRATION
// ============================================

// Existing routes (uncomment and add your existing routes)
// app.use('/api/auth', authRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/blogs', blogRoutes);
// app.use('/api/vlogs', vlogRoutes);
// app.use('/api/websites', websiteRoutes);
// app.use('/api/churches', churchRoutes);
// app.use('/api/forms', formRoutes);
// app.use('/api/cells', cellRoutes);

// New Studio v2.0 routes
app.use('/api/meet', meetRoutes);
app.use('/api/social-tools', socialToolsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/ai-generate', aiGenerateRoutes);

// ============================================
// SOCKET.IO EVENTS FOR MEETINGS
// ============================================
const meetingRooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a meeting room
  socket.on('join-meeting', ({ roomId, userId, userName }) => {
    socket.join(roomId);
    
    if (!meetingRooms.has(roomId)) {
      meetingRooms.set(roomId, new Set());
    }
    meetingRooms.get(roomId).add({ odId, odlean: userName });
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { odId, odlean: userName });
    
    // Send current participants to the new user
    socket.emit('room-participants', Array.from(meetingRooms.get(roomId)));
  });

  // Leave meeting
  socket.on('leave-meeting', ({ roomId, userId }) => {
    socket.leave(roomId);
    
    if (meetingRooms.has(roomId)) {
      const participants = meetingRooms.get(roomId);
      participants.forEach(p => {
        if (p.userId === odlean) participants.delete(p);
      });
    }
    
    socket.to(roomId).emit('user-left', { userId });
  });

  // WebRTC signaling
  socket.on('meeting-signal', ({ roomId, userId, signal }) => {
    socket.to(roomId).emit('meeting-signal', { userId, signal });
  });

  // Meeting chat
  socket.on('meeting-chat', ({ roomId, userId, userName, message }) => {
    io.to(roomId).emit('meeting-chat', {
      odId, odlean: userName,
      message,
      timestamp: new Date()
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '6.8.0',
    features: ['meet', 'social-tools', 'campaigns', 'ai-generate']
  });
});

// ============================================
// DATABASE CONNECTION
// ============================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 CYBEV Server v6.8.0 running on port ${PORT}`);
  console.log(`   New features: Meet, Social Tools, Campaigns, AI Generate`);
});

module.exports = { app, server, io };
