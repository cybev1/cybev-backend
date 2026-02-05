// ============================================
// FILE: routes/meet.routes.js
// Meet (Jitsi) Routes - Zoom-style host control + tier limits + Event Boost routing
// VERSION: 2.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const verifyToken = require('../middleware/verifyToken');
const Meeting = require('../models/meeting.model');
const MeetAccount = require('../models/meet-account.model');
const MeetBoost = require('../models/meet-boost.model');
const { TIERS, EVENT, POOLS, monthKey } = require('../utils/meetTiers');

// --------------------------------------------
// Helpers
// --------------------------------------------

const generateRoomId = () => {
  return crypto.randomBytes(4).toString('hex') + '-' +
         crypto.randomBytes(2).toString('hex') + '-' +
         crypto.randomBytes(2).toString('hex');
};

function getUserId(req) {
  return req.user?.userId || req.user?.id || req.user?._id;
}

async function getOrInitAccount(userId) {
  const mk = monthKey();
  let acct = await MeetAccount.findOne({ user: userId });
  if (!acct) {
    acct = await MeetAccount.create({ user: userId, tier: 'free', monthKey: mk, minutesUsed: 0 });
    return acct;
  }
  // rollover month
  if (acct.monthKey !== mk) {
    acct.monthKey = mk;
    acct.minutesUsed = 0;
    await acct.save();
  }
  return acct;
}

function tierLimits(acct) {
  const base = TIERS[acct?.tier || 'free'] || TIERS.free;
  return {
    tier: acct?.tier || 'free',
    maxParticipants: acct.maxParticipantsOverride ?? base.maxParticipants,
    perMeetingCapMin: acct.perMeetingCapOverrideMin ?? base.perMeetingCapMin,
    monthlyCapMin: acct.monthlyCapOverrideMin ?? base.monthlyCapMin,
    pool: base.pool,
  };
}

function makeJoinUrl(pool, roomId) {
  const base = POOLS[pool] || POOLS.small;
  // keep room names stable across pools
  return `${base}/cybev-${roomId}`;
}

function makeJitsiJwt({ roomId, user, isModerator }) {
  // Optional: enable if you self-host Jitsi with JWT auth
  const appId = process.env.JITSI_APP_ID;
  const secret = process.env.JITSI_APP_SECRET;
  if (!appId || !secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'jitsi',
    iss: appId,
    sub: process.env.JITSI_SUB || process.env.JITSI_DOMAIN || 'meet.cybev.io',
    room: `cybev-${roomId}`,
    exp: now + 60 * 60, // 1h token (client refreshes via backend if needed)
    nbf: now - 10,
    context: {
      user: {
        id: user?._id?.toString?.() || user?.id?.toString?.(),
        name: user?.name || user?.username || 'CYBEV User',
        email: user?.email,
        avatar: user?.avatar
      },
      features: {
        livestreaming: false,
        recording: isModerator ? true : false,
        "outbound-call": false,
        transcription: false
      }
    },
    moderator: !!isModerator
  };

  return jwt.sign(payload, secret, { algorithm: 'HS256', header: { kid: process.env.JITSI_KID } });
}

// --------------------------------------------
// Meet Account (admin-only upgrade hook for now)
// --------------------------------------------
router.post('/account/set-tier', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (req.user?.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });

    const { targetUserId, tier } = req.body;
    if (!targetUserId || !['free', 'pro'].includes(tier)) {
      return res.status(400).json({ ok: false, error: 'targetUserId and tier (free|pro) required' });
    }

    const acct = await getOrInitAccount(targetUserId);
    acct.tier = tier;
    await acct.save();

    res.json({ ok: true, account: acct });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/account/usage', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const acct = await getOrInitAccount(userId);
    const limits = tierLimits(acct);
    res.json({
      ok: true,
      tier: limits.tier,
      monthKey: acct.monthKey,
      minutesUsed: acct.minutesUsed,
      monthlyCapMin: limits.monthlyCapMin,
      remainingMin: Math.max(0, limits.monthlyCapMin - acct.minutesUsed),
      maxParticipants: limits.maxParticipants,
      perMeetingCapMin: limits.perMeetingCapMin
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --------------------------------------------
// Event Boost purchase / activation
// --------------------------------------------
// Create a pending boost (hook your payment gateway, then call /boost/activate)
router.post('/boost/create', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { maxParticipants = 100, minutesTotal = 120, amount, currency = 'USD', paymentRef } = req.body;

    const maxP = Number(maxParticipants);
    const mins = Number(minutesTotal);

    if (![100, 150, 200, 300].includes(maxP)) {
      return res.status(400).json({ ok: false, error: 'maxParticipants must be one of 100/150/200/300' });
    }
    if (!Number.isFinite(mins) || mins < 30 || mins > 24 * 60) {
      return res.status(400).json({ ok: false, error: 'minutesTotal must be between 30 and 1440' });
    }

    const expiresDays = Number(process.env.MEET_BOOST_EXPIRES_DAYS || 30);
    const boost = await MeetBoost.create({
      user: userId,
      maxParticipants: maxP,
      minutesTotal: mins,
      amount,
      currency,
      paymentRef,
      status: 'pending',
      expiresAt: new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
    });

    res.json({ ok: true, boost });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Activate boost (admin/webhook)
router.post('/boost/activate', verifyToken, async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
    const { boostId } = req.body;
    if (!boostId || !mongoose.Types.ObjectId.isValid(boostId)) return res.status(400).json({ ok: false, error: 'boostId required' });

    const boost = await MeetBoost.findById(boostId);
    if (!boost) return res.status(404).json({ ok: false, error: 'Boost not found' });

    boost.status = 'active';
    await boost.save();
    res.json({ ok: true, boost });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/boost/my', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const now = new Date();
    // expire boosts automatically
    await MeetBoost.updateMany({ user: userId, status: 'active', expiresAt: { $lte: now } }, { $set: { status: 'expired' } });

    const boosts = await MeetBoost.find({ user: userId }).sort({ createdAt: -1 }).limit(20);
    res.json({ ok: true, boosts });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --------------------------------------------
// Create Meeting (host starts)
// --------------------------------------------
router.post('/create', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const acct = await getOrInitAccount(userId);
    const limits = tierLimits(acct);

    const { title = 'Instant Meeting', expectedParticipants = 10, requestedMaxParticipants, useEventBoostId } = req.body;

    // Enforce monthly cap before allowing new meeting
    if (acct.minutesUsed >= limits.monthlyCapMin) {
      return res.status(402).json({ ok: false, error: 'Monthly meeting minutes exhausted. Please upgrade or top up.' });
    }

    const exp = Number(requestedMaxParticipants || expectedParticipants || 10);

    let pool = limits.pool;
    let finalLimits = { ...limits };

    // If user wants more than tier max, require active boost
    if (exp > limits.maxParticipants) {
      // event boost path
      if (!useEventBoostId || !mongoose.Types.ObjectId.isValid(useEventBoostId)) {
        return res.status(402).json({ ok: false, error: 'Event Boost required for this participant size.' });
      }
      const boost = await MeetBoost.findOne({ _id: useEventBoostId, user: userId, status: 'active', expiresAt: { $gt: new Date() } });
      if (!boost) return res.status(402).json({ ok: false, error: 'Event Boost not active/valid.' });
      const remaining = Math.max(0, boost.minutesTotal - boost.minutesUsed);
      if (remaining <= 0) return res.status(402).json({ ok: false, error: 'Event Boost minutes exhausted.' });

      pool = EVENT.pool;
      finalLimits = {
        tier: limits.tier,
        maxParticipants: Math.min(boost.maxParticipants, EVENT.maxParticipants),
        perMeetingCapMin: Math.min(EVENT.perMeetingCapMin, boost.minutesTotal), // cap by purchased minutes
        monthlyCapMin: limits.monthlyCapMin,
        pool,
        isEventBoost: true,
        eventBoostId: boost._id
      };
    }

    const meeting = await Meeting.create({
      roomId: generateRoomId(),
      title,
      host: userId,
      status: 'active',
      pool,
      startedAt: new Date(),
      limits: {
        maxParticipants: finalLimits.maxParticipants,
        perMeetingCapMin: finalLimits.perMeetingCapMin,
        monthlyCapMin: finalLimits.monthlyCapMin,
        isEventBoost: !!finalLimits.isEventBoost,
        eventBoostId: finalLimits.eventBoostId
      }
    });

    const joinUrl = makeJoinUrl(pool, meeting.roomId);
    const jitsiJwt = makeJitsiJwt({ roomId: meeting.roomId, user: req.user, isModerator: true });

    res.json({
      ok: true,
      meeting,
      joinUrl,
      pool,
      token: jitsiJwt,
      limits: meeting.limits
    });
  } catch (e) {
    console.error('Create meeting error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --------------------------------------------
// Join Meeting (guests cannot start meeting)
// --------------------------------------------
router.post('/:roomId/join', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const meeting = await Meeting.findOne({ roomId: req.params.roomId, isDeleted: false });
    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });

    const isHost = meeting.host.toString() === userId.toString();

    // Host-only start: if meeting not active, only host can activate
    if (meeting.status !== 'active' && !isHost) {
      return res.status(423).json({ ok: false, error: 'Waiting for host to start the meeting.' });
    }

    // Participant cap
    const currentCount = meeting.participants?.length || 0;
    const cap = meeting.limits?.maxParticipants || 10;

    if (!isHost && currentCount >= cap) {
      return res.status(402).json({ ok: false, error: 'Participant limit reached for this meeting.' });
    }

    // Add participant
    if (!meeting.participants.map(x => x.toString()).includes(userId.toString())) {
      meeting.participants.push(userId);
    }

    // Activate if host
    if (isHost && meeting.status !== 'active') {
      meeting.status = 'active';
      meeting.startedAt = meeting.startedAt || new Date();
    }

    await meeting.save();

    const joinUrl = makeJoinUrl(meeting.pool, meeting.roomId);
    const jitsiJwt = makeJitsiJwt({ roomId: meeting.roomId, user: req.user, isModerator: isHost });

    res.json({ ok: true, meeting, joinUrl, token: jitsiJwt, isHost });
  } catch (e) {
    console.error('Join meeting error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --------------------------------------------
// Heartbeat (usage metering + enforcement)
// Client should call every ~30s while in meeting
// We bill meeting-minutes (room time) once per interval (host-driven)
// --------------------------------------------
router.post('/:roomId/heartbeat', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const meeting = await Meeting.findOne({ roomId: req.params.roomId, isDeleted: false });
    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });

    if (meeting.status !== 'active') {
      return res.json({ ok: true, active: false, ended: meeting.status === 'ended' });
    }

    const isHost = meeting.host.toString() === userId.toString();
    // We meter only from host heartbeat to avoid double counting
    if (!isHost) return res.json({ ok: true, active: true, billed: false });

    const now = new Date();
    const last = meeting.lastHeartbeatAt || meeting.startedAt || now;
    const deltaSec = Math.max(0, Math.floor((now - last) / 1000));
    meeting.lastHeartbeatAt = now;
    meeting.activeSeconds += deltaSec;

    // Check per-meeting cap
    const capMin = meeting.limits?.perMeetingCapMin || 40;
    const usedMin = Math.floor(meeting.activeSeconds / 60);

    // Apply usage to monthly cap (non-event meetings)
    if (!meeting.limits?.isEventBoost) {
      const acct = await getOrInitAccount(userId);
      const limits = tierLimits(acct);

      // add minutes based on deltaSec (rounded up per minute)
      const addMin = Math.max(0, Math.ceil(deltaSec / 60));
      acct.minutesUsed += addMin;
      await acct.save();

      const remainingMonth = Math.max(0, limits.monthlyCapMin - acct.minutesUsed);
      if (acct.minutesUsed >= limits.monthlyCapMin) {
        meeting.status = 'ended';
        meeting.endedAt = now;
        await meeting.save();
        return res.json({ ok: true, active: false, ended: true, reason: 'monthly_limit', minutesUsed: usedMin, monthlyRemaining: 0 });
      }

      if (usedMin >= capMin) {
        meeting.status = 'ended';
        meeting.endedAt = now;
        await meeting.save();
        return res.json({ ok: true, active: false, ended: true, reason: 'per_meeting_limit', minutesUsed: usedMin, monthlyRemaining: remainingMonth });
      }

      await meeting.save();
      return res.json({ ok: true, active: true, ended: false, minutesUsed: usedMin, monthlyRemaining: remainingMonth });
    }

    // Event boost metering
    if (meeting.limits?.isEventBoost && meeting.limits?.eventBoostId) {
      const boost = await MeetBoost.findById(meeting.limits.eventBoostId);
      if (boost && boost.status === 'active') {
        const addMin = Math.max(0, Math.ceil(deltaSec / 60));
        boost.minutesUsed += addMin;
        const remaining = Math.max(0, boost.minutesTotal - boost.minutesUsed);

        if (boost.minutesUsed >= boost.minutesTotal || usedMin >= capMin) {
          boost.status = boost.minutesUsed >= boost.minutesTotal ? 'consumed' : boost.status;
          await boost.save();

          meeting.status = 'ended';
          meeting.endedAt = now;
          await meeting.save();

          return res.json({ ok: true, active: false, ended: true, reason: 'event_boost_exhausted', minutesUsed: usedMin, boostRemaining: remaining });
        }

        await boost.save();
        await meeting.save();
        return res.json({ ok: true, active: true, ended: false, minutesUsed: usedMin, boostRemaining: remaining });
      }

      // boost missing/inactive => end for safety
      meeting.status = 'ended';
      meeting.endedAt = now;
      await meeting.save();
      return res.json({ ok: true, active: false, ended: true, reason: 'event_boost_inactive', minutesUsed: usedMin });
    }

    // fallback
    await meeting.save();
    return res.json({ ok: true, active: true, ended: false, minutesUsed: usedMin });

  } catch (e) {
    console.error('Heartbeat error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --------------------------------------------
// End Meeting (host/admin)
// --------------------------------------------
router.post('/:roomId/end', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const meeting = await Meeting.findOne({ roomId: req.params.roomId, isDeleted: false });
    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });

    const isHost = meeting.host.toString() === userId.toString();
    if (!isHost && req.user?.role !== 'admin') return res.status(403).json({ ok: false, error: 'Only host can end meeting' });

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await meeting.save();

    res.json({ ok: true, meeting });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --------------------------------------------
// My meetings
// --------------------------------------------
router.get('/my-meetings', verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const meetings = await Meeting.find({
      isDeleted: false,
      $or: [{ host: userId }, { participants: userId }]
    }).sort({ createdAt: -1 }).limit(50);

    res.json({ ok: true, meetings });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get meeting by room ID (public metadata)
router.get('/:roomId', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId, isDeleted: false })
      .populate('host', 'username name avatar');

    if (!meeting) return res.status(404).json({ ok: false, error: 'Meeting not found' });

    res.json({
      ok: true,
      meeting,
      joinUrl: makeJoinUrl(meeting.pool, meeting.roomId),
      pool: meeting.pool
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
