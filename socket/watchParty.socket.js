// ============================================
// FILE: watchParty.socket.js
// PATH: /socket/watchParty.socket.js
// VERSION: v3.0.0
// CYBEV Watch Party Real-Time Sync
// FEATURES: Smart traffic simulation, guest support,
//           organic viewer count fluctuation
// UPDATED: 2026-03-13
// ============================================
const WatchParty = require('../models/watchParty.model');
const User = require('../models/user.model');

// Load smart simulation compute function at module level
let boostCompute;
try { boostCompute = require('../services/boostSimulation.service').computeCurrentViewers; } catch (e) { console.log('⚠️ boostSimulation.service not found, using raw counts'); }

/**
 * ─── SMART TRAFFIC SIMULATOR ───
 * Makes boosted viewer counts look organic by fluctuating up/down
 * like real human traffic patterns.
 *
 * Pattern: base → dip 1-5% → recover → hold peak → dip 3-10% → recover → repeat
 * Never drops below 85% of boosted base. Broadcasts every 8-15 seconds.
 */
class TrafficSimulator {
  constructor(wpNamespace) {
    this.wpNamespace = wpNamespace;
    this.rooms = new Map(); // partyId → { baseCount, currentOffset, phase, interval, peakHoldTicks }
  }

  start(partyId, baseCount) {
    if (this.rooms.has(partyId)) {
      // Update base if boost was added on top
      const room = this.rooms.get(partyId);
      room.baseCount = baseCount;
      return;
    }

    const room = {
      baseCount,
      currentOffset: 0,          // +/- offset from base
      phase: 'rising',           // rising | peak | dipping | recovering
      peakHoldTicks: 0,
      tickCount: 0,
    };

    room.interval = setInterval(() => this._tick(partyId, room), this._randomInterval());
    this.rooms.set(partyId, room);
    console.log(`📊 Traffic sim started for ${partyId} (base: ${baseCount})`);
  }

  stop(partyId) {
    const room = this.rooms.get(partyId);
    if (room) {
      clearInterval(room.interval);
      this.rooms.delete(partyId);
      console.log(`📊 Traffic sim stopped for ${partyId}`);
    }
  }

  updateBase(partyId, newBase) {
    const room = this.rooms.get(partyId);
    if (room) room.baseCount = newBase;
  }

  getOffset(partyId) {
    const room = this.rooms.get(partyId);
    return room ? room.currentOffset : 0;
  }

  _randomInterval() {
    return (8 + Math.random() * 7) * 1000; // 8-15 seconds
  }

  _tick(partyId, room) {
    room.tickCount++;

    switch (room.phase) {
      case 'rising': {
        // Gradually increase offset toward 0 or small positive
        const step = Math.ceil(room.baseCount * (0.002 + Math.random() * 0.008)); // 0.2-1%
        room.currentOffset = Math.min(room.currentOffset + step, Math.ceil(room.baseCount * 0.03));
        if (room.currentOffset >= 0 && Math.random() > 0.4) {
          room.phase = 'peak';
          room.peakHoldTicks = 2 + Math.floor(Math.random() * 4); // Hold 2-5 ticks
        }
        break;
      }
      case 'peak': {
        // Small micro-fluctuations at peak
        const micro = Math.ceil(room.baseCount * (Math.random() * 0.005)); // ±0.5%
        room.currentOffset += (Math.random() > 0.5 ? micro : -micro);
        room.peakHoldTicks--;
        if (room.peakHoldTicks <= 0) {
          room.phase = 'dipping';
        }
        break;
      }
      case 'dipping': {
        // Dip down 1-15% from base (never below 85%)
        const maxDip = room.baseCount * 0.15; // Max 15% dip
        const dipStep = Math.ceil(room.baseCount * (0.01 + Math.random() * 0.04)); // 1-5% per tick
        room.currentOffset -= dipStep;
        room.currentOffset = Math.max(room.currentOffset, -maxDip);
        // Chance to start recovering
        if (Math.abs(room.currentOffset) >= room.baseCount * 0.03 && Math.random() > 0.35) {
          room.phase = 'recovering';
        }
        break;
      }
      case 'recovering': {
        // Climb back up toward base
        const recovStep = Math.ceil(room.baseCount * (0.005 + Math.random() * 0.015)); // 0.5-2%
        room.currentOffset += recovStep;
        if (room.currentOffset >= -Math.ceil(room.baseCount * 0.01)) {
          room.phase = 'rising';
        }
        break;
      }
    }

    // Broadcast updated viewer count
    this._broadcast(partyId, room);

    // Reset interval to a new random delay for organic feel
    clearInterval(room.interval);
    room.interval = setInterval(() => this._tick(partyId, room), this._randomInterval());
  }

  async _broadcast(partyId, room) {
    try {
      const party = await WatchParty.findById(partyId).select('participants boostedViewers syntheticEngagement boostConfig status');
      if (!party || party.status === 'ended') {
        this.stop(partyId);
        return;
      }
      const real = (party.participants || []).filter(p => p.isActive).length;
      const boosted = party.boostConfig?.isActive && boostCompute
        ? boostCompute(party.boostConfig)
        : (party.boostedViewers || 0);
      const synthetic = party.syntheticEngagement?.totalViews || 0;
      const base = real + boosted + synthetic;

      // Apply offset but floor at 85% of boosted portion
      const minAllowed = real + Math.floor((boosted + synthetic) * 0.85);
      const displayed = Math.max(base + room.currentOffset, minAllowed, real);

      this.wpNamespace.to(partyId).emit('viewer-count-update', {
        activeViewers: displayed,
        phase: room.phase // for debug
      });
    } catch (err) {
      // Silently continue
    }
  }

  stopAll() {
    for (const [id] of this.rooms) {
      this.stop(id);
    }
  }
}

function initWatchPartySocket(io) {
  const wpNamespace = io.of('/watch-party');
  const trafficSim = new TrafficSimulator(wpNamespace);

  // Expose trafficSim for route access
  wpNamespace.trafficSim = trafficSim;

  // Helper: total viewer count = real + simulated/boosted + synthetic
  // boostCompute loaded at module level (line 14)

  const getActiveViewers = (party) => {
    const real = (party.participants || []).filter(p => p.isActive).length;
    // Use live computation from boost service when simulation is active
    const boosted = party.boostConfig?.isActive && boostCompute
      ? boostCompute(party.boostConfig)
      : party.boostConfig?.isActive
        ? (party.boostConfig.currentSimulated || 0)
        : (party.boostedViewers || 0);
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

        // Start traffic simulation if party has boosted viewers
        const boostedTotal = (party.boostedViewers || 0) + (party.syntheticEngagement?.totalViews || 0);
        if (boostedTotal > 0) {
          trafficSim.start(partyId, boostedTotal);
        }
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
        const party = await WatchParty.findById(partyId).select('playbackState participants boostedViewers syntheticEngagement boostConfig');
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
        trafficSim.stop(partyId);
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

  // ═══════════════════════════════════════════════════════
  // BOOST TRAFFIC SIMULATION ENGINE
  // Runs every 30-45s for all active boosted parties
  // Simulates organic human traffic patterns:
  //   climbing → peak → dipping → recovering → peak → ...
  // ═══════════════════════════════════════════════════════
  const TICK_INTERVAL = 35000; // ~35 seconds between ticks

  const simulateTick = async () => {
    try {
      const parties = await WatchParty.find({
        status: 'live',
        'boostConfig.isActive': true,
        'boostConfig.peakTarget': { $gt: 0 }
      }).select('boostConfig boostedViewers participants syntheticEngagement');

      for (const party of parties) {
        const cfg = party.boostConfig;
        const peak = cfg.peakTarget;
        const current = cfg.currentSimulated || 0;
        const now = Date.now();
        const phaseAge = cfg.phaseStartedAt ? (now - cfg.phaseStartedAt.getTime()) / 1000 : 999;

        let newCount = current;
        let newPhase = cfg.phase;

        switch (cfg.phase) {
          case 'climbing': {
            // Climb toward peak — fast at first, then slow (ease-out)
            const gap = peak - current;
            const step = Math.max(1, Math.floor(gap * (0.15 + Math.random() * 0.15)));
            newCount = Math.min(peak, current + step);
            if (newCount >= peak * 0.97) {
              newPhase = 'peak';
            }
            break;
          }
          case 'peak': {
            // Stay near peak with tiny ±1-3% micro-fluctuations for 2-5 ticks
            const micro = (Math.random() - 0.45) * 0.03 * peak; // slight upward bias
            newCount = Math.round(Math.min(peak * 1.02, Math.max(peak * 0.97, current + micro)));
            if (phaseAge > 90 + Math.random() * 120) { // 90-210s at peak
              newPhase = 'dipping';
            }
            break;
          }
          case 'dipping': {
            // Natural dip — lose 1-15% of peak gradually
            const dipTarget = peak * (0.85 + Math.random() * 0.05); // floor at 85-90% of peak
            const dipStep = Math.max(1, Math.floor((current - dipTarget) * (0.08 + Math.random() * 0.1)));
            newCount = Math.max(Math.floor(dipTarget), current - dipStep);
            const minFloor = cfg.minFloor || Math.floor(peak * 0.75);
            newCount = Math.max(minFloor, newCount);
            if (newCount <= dipTarget * 1.02 || phaseAge > 60 + Math.random() * 60) {
              newPhase = 'recovering';
            }
            break;
          }
          case 'recovering': {
            // Climb back up toward peak — organic recovery
            const recoverTarget = peak * (0.95 + Math.random() * 0.05);
            const recoverStep = Math.max(1, Math.floor((recoverTarget - current) * (0.1 + Math.random() * 0.12)));
            newCount = Math.min(Math.floor(recoverTarget), current + recoverStep);
            if (newCount >= peak * 0.94 || phaseAge > 45 + Math.random() * 45) {
              newPhase = 'peak';
            }
            break;
          }
          default:
            continue; // stopped — skip
        }

        // Ensure never negative
        newCount = Math.max(0, Math.round(newCount));

        // Update DB
        const update = {
          'boostConfig.currentSimulated': newCount,
          'boostConfig.lastTickAt': new Date(),
          'boostedViewers': newCount // sync to main field
        };
        if (newPhase !== cfg.phase) {
          update['boostConfig.phase'] = newPhase;
          update['boostConfig.phaseStartedAt'] = new Date();
        }
        await WatchParty.findByIdAndUpdate(party._id, { $set: update });

        // Broadcast updated viewer count to all viewers in the room
        const real = party.participants.filter(p => p.isActive).length;
        const synthetic = party.syntheticEngagement?.totalViews || 0;
        const totalViewers = real + newCount + synthetic;
        wpNamespace.to(party._id.toString()).emit('viewer-count-update', {
          activeViewers: totalViewers,
          boostedViewers: newCount,
          phase: newPhase
        });
      }
    } catch (err) {
      console.error('⚠️ Boost simulation tick error:', err.message);
    }
  };

  // Start the simulation loop
  const tickInterval = setInterval(simulateTick, TICK_INTERVAL + Math.random() * 10000);
  console.log(`🎯 Boost traffic simulation engine started (every ~${Math.round(TICK_INTERVAL / 1000)}s)`);

  // Cleanup on process exit
  process.on('SIGTERM', () => clearInterval(tickInterval));
  process.on('SIGINT', () => clearInterval(tickInterval));

  console.log('🎬 Watch Party Socket.io namespace initialized: /watch-party');
  return wpNamespace;
}

module.exports = { initWatchPartySocket };
