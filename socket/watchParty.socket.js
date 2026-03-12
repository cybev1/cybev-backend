// ============================================
// FILE: watchParty.socket.js
// PATH: /socket/watchParty.socket.js
// CYBEV Watch Party Real-Time Sync
// ============================================
const WatchParty = require('../models/watchParty.model');
const User = require('../models/user.model');

/**
 * Initialize Watch Party Socket.io namespace
 * Call this from your main socket.js init:
 *   const { initWatchPartySocket } = require('./socket/watchParty.socket');
 *   initWatchPartySocket(io);
 */
function initWatchPartySocket(io) {
  const wpNamespace = io.of('/watch-party');

  wpNamespace.on('connection', (socket) => {
    console.log(`🎬 Watch Party socket connected: ${socket.id}`);

    let currentRoom = null;
    let currentUserId = null;
    let currentUsername = null;

    // ─── JOIN ROOM ───
    socket.on('join-room', async ({ partyId, userId, username, avatar }) => {
      try {
        currentRoom = partyId;
        currentUserId = userId;
        currentUsername = username;

        socket.join(partyId);

        // Update participant status in DB
        const party = await WatchParty.findById(partyId);
        if (!party) return socket.emit('error', { message: 'Party not found' });

        const existing = party.participants.find(p => p.user.toString() === userId);
        if (existing) {
          existing.isActive = true;
          existing.joinedAt = new Date();
        } else {
          party.participants.push({
            user: userId,
            username,
            avatar: avatar || '',
            role: 'viewer',
            isActive: true
          });
        }

        const activeCount = party.participants.filter(p => p.isActive).length;
        if (activeCount > party.peakViewers) party.peakViewers = activeCount;
        await party.save();

        // Send current state to joining user
        socket.emit('sync-state', {
          playbackState: party.playbackState,
          activeViewers: activeCount,
          participants: party.participants.filter(p => p.isActive)
        });

        // Broadcast to room that someone joined
        socket.to(partyId).emit('user-joined', {
          userId,
          username,
          avatar,
          activeViewers: activeCount
        });

        // System message in chat
        wpNamespace.to(partyId).emit('chat-message', {
          type: 'system',
          text: `${username} joined the party`,
          createdAt: new Date()
        });

        console.log(`👤 ${username} joined room ${partyId} (${activeCount} active)`);
      } catch (err) {
        console.error('join-room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ─── PLAYBACK SYNC (host/co-host only) ───
    socket.on('sync-playback', async ({ partyId, isPlaying, currentTime, playbackRate }) => {
      try {
        const party = await WatchParty.findById(partyId).select('host participants playbackState');
        if (!party) return;

        // Only host or co-host can control playback
        const participant = party.participants.find(p => p.user.toString() === currentUserId);
        if (!participant || (participant.role !== 'host' && participant.role !== 'co-host')) {
          return socket.emit('error', { message: 'Only the host can control playback' });
        }

        // Update DB
        party.playbackState = {
          isPlaying: isPlaying !== undefined ? isPlaying : party.playbackState.isPlaying,
          currentTime: currentTime !== undefined ? currentTime : party.playbackState.currentTime,
          playbackRate: playbackRate || party.playbackState.playbackRate,
          lastUpdated: new Date(),
          updatedBy: currentUserId
        };
        await party.save();

        // Broadcast to everyone else in the room
        socket.to(partyId).emit('sync-state', {
          playbackState: party.playbackState,
          syncedBy: currentUsername
        });
      } catch (err) {
        console.error('sync-playback error:', err);
      }
    });

    // ─── SEEK (host/co-host only) ───
    socket.on('seek', async ({ partyId, currentTime }) => {
      try {
        const party = await WatchParty.findById(partyId).select('host participants playbackState');
        if (!party) return;

        const participant = party.participants.find(p => p.user.toString() === currentUserId);
        if (!participant || (participant.role !== 'host' && participant.role !== 'co-host')) {
          return socket.emit('error', { message: 'Only the host can seek' });
        }

        party.playbackState.currentTime = currentTime;
        party.playbackState.lastUpdated = new Date();
        party.playbackState.updatedBy = currentUserId;
        await party.save();

        socket.to(partyId).emit('force-seek', { currentTime, seekedBy: currentUsername });
      } catch (err) {
        console.error('seek error:', err);
      }
    });

    // ─── CHAT MESSAGE ───
    socket.on('chat-message', async ({ partyId, text }) => {
      try {
        if (!text || !text.trim()) return;

        const message = {
          user: currentUserId,
          username: currentUsername,
          text: text.trim(),
          type: 'message',
          createdAt: new Date()
        };

        // Save to DB (fire-and-forget for speed)
        WatchParty.findByIdAndUpdate(partyId, {
          $push: { chatMessages: { $each: [message], $slice: -500 } }
        }).catch(err => console.error('Chat save error:', err));

        // Broadcast to entire room including sender
        wpNamespace.to(partyId).emit('chat-message', message);
      } catch (err) {
        console.error('chat-message error:', err);
      }
    });

    // ─── REACTION ───
    socket.on('reaction', async ({ partyId, emoji }) => {
      try {
        const allowedEmojis = ['🔥', '❤️', '😂', '👏', '🎉', '😮', '💯', '🙌', '😍', '💀', '🤣', '👀'];
        if (!allowedEmojis.includes(emoji)) return;

        const reaction = {
          userId: currentUserId,
          username: currentUsername,
          emoji,
          createdAt: new Date()
        };

        // Save to DB (fire-and-forget)
        WatchParty.findByIdAndUpdate(partyId, {
          $push: { reactions: { $each: [{ user: currentUserId, emoji }], $slice: -1000 } }
        }).catch(err => console.error('Reaction save error:', err));

        // Broadcast floating reaction to entire room
        wpNamespace.to(partyId).emit('reaction', reaction);
      } catch (err) {
        console.error('reaction error:', err);
      }
    });

    // ─── PROMOTE / DEMOTE ───
    socket.on('set-role', async ({ partyId, targetUserId, role }) => {
      try {
        const party = await WatchParty.findById(partyId).select('host participants');
        if (!party || party.host.toString() !== currentUserId) return;

        const target = party.participants.find(p => p.user.toString() === targetUserId);
        if (target) {
          target.role = role; // 'co-host' or 'viewer'
          await party.save();
          wpNamespace.to(partyId).emit('role-changed', { targetUserId, role });
        }
      } catch (err) {
        console.error('set-role error:', err);
      }
    });

    // ─── REQUEST SYNC (viewer asks for current state) ───
    socket.on('request-sync', async ({ partyId }) => {
      try {
        const party = await WatchParty.findById(partyId).select('playbackState participants');
        if (!party) return;
        socket.emit('sync-state', {
          playbackState: party.playbackState,
          activeViewers: party.participants.filter(p => p.isActive).length,
          participants: party.participants.filter(p => p.isActive)
        });
      } catch (err) {
        console.error('request-sync error:', err);
      }
    });

    // ─── DISCONNECT ───
    socket.on('disconnect', async () => {
      try {
        if (currentRoom && currentUserId) {
          const party = await WatchParty.findById(currentRoom);
          if (party) {
            const participant = party.participants.find(p => p.user.toString() === currentUserId);
            if (participant) {
              participant.isActive = false;
              await party.save();

              const activeCount = party.participants.filter(p => p.isActive).length;

              socket.to(currentRoom).emit('user-left', {
                userId: currentUserId,
                username: currentUsername,
                activeViewers: activeCount
              });

              wpNamespace.to(currentRoom).emit('chat-message', {
                type: 'system',
                text: `${currentUsername} left the party`,
                createdAt: new Date()
              });

              // Auto-end if host leaves and no co-host
              if (party.host.toString() === currentUserId && activeCount === 0) {
                party.status = 'ended';
                party.endedAt = new Date();
                await party.save();
                wpNamespace.to(currentRoom).emit('party-ended', { reason: 'Host left and no viewers remain' });
              }
            }
          }
        }
        console.log(`🎬 Watch Party socket disconnected: ${socket.id}`);
      } catch (err) {
        console.error('disconnect error:', err);
      }
    });
  });

  console.log('🎬 Watch Party Socket.io namespace initialized: /watch-party');
  return wpNamespace;
}

module.exports = { initWatchPartySocket };
