// ============================================
// FILE: watchParty.socket.js
// PATH: /socket/watchParty.socket.js
// VERSION: v2.3.0
// CYBEV Watch Party Real-Time Sync
// FIXES: Guest viewer support (guest_* IDs),
//        Boosted viewer counts, end-party + leave-room
// UPDATED: 2026-03-13
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

  // Helper: total viewer count = real + boosted + synthetic
  const getActiveViewers = (party) => {
    const real = (party.participants || []).filter(p => p.isActive).length;
    const boosted = party.boostedViewers || 0;
    const synthetic = party.syntheticEngagement?.totalViews || 0;
    return real + boosted + synthetic;
  };

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
        currentUsername = username || 'Guest';

        socket.join(partyId);

        const party = await WatchParty.findById(partyId);
        if (!party) return socket.emit('error', { message: 'Party not found' });

        // Guest users (guest_*) don't get stored in DB participants — just socket room
        const isGuest = typeof userId === 'string' && userId.startsWith('guest_');

        if (!isGuest && userId) {
          // Authenticated user — update participant status in DB
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
        }

        // Always increment total views (guest or not)
        party.totalViews = (party.totalViews || 0) + 1;
        const activeCount = getActiveViewers(party) + (isGuest ? 1 : 0);
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
        const isGuest = typeof currentUserId === 'string' && currentUserId.startsWith('guest_');

        const message = {
          user: isGuest ? null : currentUserId,
          username: currentUsername || 'Guest',
          text: text.trim(),
          type: 'message',
          createdAt: new Date()
        };

        // Save to DB (fire-and-forget for speed) — skip user field for guests
        if (!isGuest) {
          WatchParty.findByIdAndUpdate(partyId, {
            $push: { chatMessages: { $each: [message], $slice: -500 } }
          }).catch(err => console.error('Chat save error:', err));
        }

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
        const party = await WatchParty.findById(partyId).select('playbackState participants boostedViewers syntheticEngagement');
        if (!party) return;
        socket.emit('sync-state', {
          playbackState: party.playbackState,
          activeViewers: getActiveViewers(party),
          participants: party.participants.filter(p => p.isActive)
        });
      } catch (err) {
        console.error('request-sync error:', err);
      }
    });

    // ─── END PARTY (host broadcasts to all viewers) ───
    socket.on('end-party', async ({ partyId }) => {
      try {
        const party = await WatchParty.findById(partyId).select('host status participants');
        if (!party) return;
        // Only host can end via socket
        if (party.host.toString() !== currentUserId) {
          return socket.emit('error', { message: 'Only the host can end the party' });
        }
        // Update DB if not already ended (REST may have already done this)
        if (party.status !== 'ended') {
          party.status = 'ended';
          party.endedAt = new Date();
          party.participants.forEach(p => { p.isActive = false; });
          await party.save();
        }
        // Broadcast to ALL viewers in room (including sender)
        wpNamespace.to(partyId).emit('party-ended', {
          reason: 'Host ended the party',
          endedBy: currentUsername
        });
        console.log(`🛑 Watch Party ended by host: ${partyId}`);
      } catch (err) {
        console.error('end-party error:', err);
      }
    });

    // ─── LEAVE ROOM (explicit, before disconnect) ───
    socket.on('leave-room', async ({ partyId }) => {
      try {
        if (!partyId || !currentUserId) return;
        socket.leave(partyId);
        const isGuest = typeof currentUserId === 'string' && currentUserId.startsWith('guest_');

        const party = await WatchParty.findById(partyId);
        if (party) {
          if (!isGuest) {
            const participant = party.participants.find(p => p.user.toString() === currentUserId);
            if (participant) {
              participant.isActive = false;
              await party.save();
            }
          }

          const activeCount = getActiveViewers(party);
          socket.to(partyId).emit('user-left', {
            userId: currentUserId,
            username: currentUsername,
            activeViewers: activeCount
          });
        }
        currentRoom = null;
      } catch (err) {
        console.error('leave-room error:', err);
      }
    });

    // ─── DISCONNECT ───
    socket.on('disconnect', async () => {
      try {
        if (currentRoom && currentUserId) {
          const isGuest = typeof currentUserId === 'string' && currentUserId.startsWith('guest_');
          const party = await WatchParty.findById(currentRoom);

          if (party) {
            if (!isGuest) {
              // Authenticated user — mark inactive in DB
              const participant = party.participants.find(p => p.user.toString() === currentUserId);
              if (participant) {
                participant.isActive = false;
                await party.save();
              }
            }

            const activeCount = getActiveViewers(party);
            const realActive = party.participants.filter(p => p.isActive).length;

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

            // Auto-end if host leaves and no real viewers remain
            if (!isGuest && party.host.toString() === currentUserId && realActive === 0) {
              party.status = 'ended';
              party.endedAt = new Date();
              await party.save();
              wpNamespace.to(currentRoom).emit('party-ended', { reason: 'Host left and no viewers remain' });
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
