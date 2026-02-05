// ============================================
// FILE: utils/meetTiers.js
// PURPOSE: Central meet tier limits & pool routing
// ============================================

const TIERS = {
  free: {
    name: 'Free',
    maxParticipants: 10,
    perMeetingCapMin: 40,
    monthlyCapMin: 300,
    pool: 'small',
  },
  pro: {
    name: 'Pro',
    maxParticipants: 30,
    perMeetingCapMin: 240, // "long meetings" default (4h)
    monthlyCapMin: 3000,
    pool: 'pro',
  }
};

const EVENT = {
  name: 'Event Boost',
  maxParticipants: 300,
  perMeetingCapMin: 480, // 8h safety cap
  pool: 'event',
};

const POOLS = {
  small: process.env.MEET_BASE_URL_SMALL || process.env.MEET_BASE_URL || 'https://meet.jit.si',
  pro: process.env.MEET_BASE_URL_PRO || process.env.MEET_BASE_URL_SMALL || process.env.MEET_BASE_URL || 'https://meet.jit.si',
  event: process.env.MEET_BASE_URL_EVENT || process.env.MEET_BASE_URL_PRO || process.env.MEET_BASE_URL_SMALL || process.env.MEET_BASE_URL || 'https://meet.jit.si',
};

function monthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

module.exports = { TIERS, EVENT, POOLS, monthKey };
