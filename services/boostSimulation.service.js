// ===========================================
// FILE: boostSimulation.service.js
// PATH: /services/boostSimulation.service.js
// VERSION: v1.0.0
// CYBEV Watch Party — Smart Boost Traffic Simulation
// Simulates organic viewer fluctuations:
//   climb → peak → dip (1-15%) → recover → dip → etc.
// Stateless: computes current count on-the-fly from boostConfig
// AUTHOR: @prince
// CREATED: 2026-03-13
// ============================================

const mongoose = require('mongoose');

/**
 * Compute current simulated viewer count from boostConfig.
 * Uses sine waves + noise for organic feel. No intervals needed.
 */
function computeCurrentViewers(boostConfig) {
  if (!boostConfig || !boostConfig.isActive || !boostConfig.peakTarget) return 0;

  const peak = boostConfig.peakTarget;
  const floor = boostConfig.minFloor || Math.round(peak * 0.85);
  const startedAt = new Date(boostConfig.phaseStartedAt || boostConfig.lastTickAt || Date.now());
  const elapsed = (Date.now() - startedAt.getTime()) / 1000 / 60; // minutes

  const climbDuration = Math.max(2, Math.min(peak / 5000, 10)); // 2-10 min
  const cycleDuration = 8; // minutes per oscillation cycle

  let count;

  if (elapsed < climbDuration) {
    // ─── CLIMBING: Gradual ramp up with ease-out ───
    const progress = elapsed / climbDuration;
    const eased = 1 - Math.pow(1 - progress, 2.5);
    count = Math.round(floor * 0.3 + (peak - floor * 0.3) * eased);
    count += Math.round((Math.random() - 0.4) * peak * 0.008);
  } else {
    // ─── OSCILLATING: Near peak with organic dips ───
    const t = elapsed - climbDuration;

    // Primary wave: slow sine, 1-15% dips
    const primary = Math.sin(t * (2 * Math.PI) / cycleDuration);
    // Secondary wave: faster, smaller texture
    const secondary = Math.sin(t * (2 * Math.PI) / (cycleDuration * 0.37)) * 0.3;

    const combined = (primary + secondary) / 1.3; // -1 to +1
    const range = peak - floor;
    count = Math.round(floor + range * (0.5 + 0.5 * combined));

    // Micro-jitter: ±1%
    count += Math.round((Math.random() - 0.5) * peak * 0.015);

    // Occasional spike: 5% chance of +1-2%
    if (Math.random() < 0.05) {
      count += Math.round(peak * 0.01 * (1 + Math.random()));
    }
  }

  // Clamp to safe range
  return Math.max(Math.round(floor * 0.8), Math.min(peak + Math.round(peak * 0.02), count));
}

/**
 * Start or add to a boost simulation.
 */
async function startSimulation(partyId, additionalViewers) {
  const WatchParty = mongoose.model('WatchParty');
  const party = await WatchParty.findById(partyId);
  if (!party) throw new Error('Party not found');

  const existing = party.boostConfig || {};
  const wasActive = existing.isActive;
  const previousPeak = wasActive ? (existing.peakTarget || 0) : (party.boostedViewers || 0);
  const newPeak = previousPeak + additionalViewers;

  party.boostConfig = {
    isActive: true,
    peakTarget: newPeak,
    currentSimulated: computeCurrentViewers({
      isActive: true, peakTarget: newPeak,
      phaseStartedAt: wasActive ? existing.phaseStartedAt : new Date(),
      minFloor: Math.round(newPeak * 0.85)
    }),
    minFloor: Math.round(newPeak * 0.85),
    phase: wasActive ? existing.phase : 'climbing',
    phaseStartedAt: wasActive ? existing.phaseStartedAt : new Date(),
    lastTickAt: new Date(),
    totalBoostedEver: (existing.totalBoostedEver || 0) + additionalViewers
  };

  party.boostedViewers = newPeak;
  await party.save();
  return party.boostConfig;
}

/**
 * Reduce the simulation peak by a percentage.
 */
async function reduceSimulation(partyId, percent) {
  const WatchParty = mongoose.model('WatchParty');
  const party = await WatchParty.findById(partyId);
  if (!party) throw new Error('Party not found');

  const config = party.boostConfig || {};
  if (!config.isActive && !party.boostedViewers) throw new Error('No active boost');

  const factor = Math.max(0, Math.min(100, percent)) / 100;

  if (config.isActive) {
    const newPeak = Math.round(config.peakTarget * (1 - factor));
    config.peakTarget = newPeak;
    config.minFloor = Math.round(newPeak * 0.85);
    config.currentSimulated = computeCurrentViewers(config);
    config.lastTickAt = new Date();
    if (newPeak <= 0) {
      config.isActive = false;
      config.phase = 'stopped';
      config.currentSimulated = 0;
    }
    party.boostConfig = config;
    party.boostedViewers = newPeak;
  } else {
    party.boostedViewers = Math.round((party.boostedViewers || 0) * (1 - factor));
    if (party.syntheticEngagement) {
      party.syntheticEngagement.totalViews = Math.round((party.syntheticEngagement.totalViews || 0) * (1 - factor));
    }
  }

  await party.save();
  return party.boostConfig || { boostedViewers: party.boostedViewers };
}

/**
 * Stop and clear all boost simulation.
 */
async function stopSimulation(partyId) {
  const WatchParty = mongoose.model('WatchParty');
  const party = await WatchParty.findById(partyId);
  if (!party) throw new Error('Party not found');

  const totalEver = party.boostConfig?.totalBoostedEver || 0;
  party.boostConfig = {
    isActive: false, peakTarget: 0, currentSimulated: 0, minFloor: 0,
    phase: 'stopped', phaseStartedAt: null, lastTickAt: new Date(),
    totalBoostedEver: totalEver
  };
  party.boostedViewers = 0;
  if (party.syntheticEngagement) party.syntheticEngagement.totalViews = 0;

  await party.save();
  return { cleared: true, totalBoostedEver: totalEver };
}

/**
 * Get current simulation status with live computed count.
 */
async function getSimulationStatus(partyId) {
  const WatchParty = mongoose.model('WatchParty');
  const party = await WatchParty.findById(partyId)
    .select('title status boostConfig boostedViewers syntheticEngagement participants peakViewers').lean();
  if (!party) throw new Error('Party not found');

  const config = party.boostConfig || {};
  const sim = config.isActive ? computeCurrentViewers(config) : 0;
  const real = (party.participants || []).filter(p => p.isActive).length;
  const synth = party.syntheticEngagement?.totalViews || 0;

  return {
    title: party.title, status: party.status,
    boost: {
      isActive: config.isActive || false,
      phase: config.phase || 'stopped',
      peakTarget: config.peakTarget || 0,
      currentSimulated: sim,
      minFloor: config.minFloor || 0,
      totalBoostedEver: config.totalBoostedEver || 0,
      rawBoostedViewers: party.boostedViewers || 0,
      syntheticViews: synth
    },
    viewers: { real, simulated: sim, synthetic: synth, total: real + sim + synth },
    peakViewers: party.peakViewers || 0
  };
}

/**
 * Tick — update stored currentSimulated + phase. Call on viewer requests.
 */
async function tickSimulation(partyId) {
  const WatchParty = mongoose.model('WatchParty');
  const party = await WatchParty.findById(partyId).select('boostConfig boostedViewers');
  if (!party || !party.boostConfig?.isActive) return null;

  const newCount = computeCurrentViewers(party.boostConfig);
  party.boostConfig.currentSimulated = newCount;
  party.boostConfig.lastTickAt = new Date();

  const startedAt = new Date(party.boostConfig.phaseStartedAt || Date.now());
  const elapsed = (Date.now() - startedAt.getTime()) / 1000 / 60;
  const climbDuration = Math.max(2, Math.min(party.boostConfig.peakTarget / 5000, 10));

  if (elapsed < climbDuration) party.boostConfig.phase = 'climbing';
  else {
    const ratio = newCount / party.boostConfig.peakTarget;
    if (ratio >= 0.95) party.boostConfig.phase = 'peak';
    else if (ratio < 0.9) party.boostConfig.phase = 'dipping';
    else party.boostConfig.phase = 'recovering';
  }

  await party.save();
  return { currentSimulated: newCount, phase: party.boostConfig.phase };
}

module.exports = { computeCurrentViewers, startSimulation, reduceSimulation, stopSimulation, getSimulationStatus, tickSimulation };
