// ============================================
// FILE: routes/staking.routes.js
// Token Staking API
// ============================================
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const mongoose = require('mongoose');

// Staking Model
const stakeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallet: { type: String },
  amount: { type: Number, required: true },
  tier: { type: String, enum: ['Bronze', 'Silver', 'Gold', 'Diamond'], required: true },
  apy: { type: Number, required: true },
  lockDays: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  unlockDate: { type: Date, required: true },
  earnedRewards: { type: Number, default: 0 },
  lastRewardCalculation: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'unstaked', 'completed'], default: 'active' },
  unstakeDate: { type: Date },
  penalty: { type: Number, default: 0 }
}, { timestamps: true });

let Stake;
try {
  Stake = mongoose.model('Stake');
} catch {
  Stake = mongoose.model('Stake', stakeSchema);
}

// Tier configuration
const TIERS = {
  Bronze: { minStake: 100, apy: 8, lockDays: 30 },
  Silver: { minStake: 500, apy: 12, lockDays: 90 },
  Gold: { minStake: 1000, apy: 18, lockDays: 180 },
  Diamond: { minStake: 5000, apy: 25, lockDays: 365 }
};

// Calculate rewards for a stake
function calculateRewards(stake) {
  const now = new Date();
  const daysPassed = Math.floor((now - stake.lastRewardCalculation) / (1000 * 60 * 60 * 24));
  if (daysPassed < 1) return stake.earnedRewards;
  
  const dailyRate = stake.apy / 100 / 365;
  const newRewards = stake.amount * dailyRate * daysPassed;
  return stake.earnedRewards + newRewards;
}

// GET /api/staking/info - Get user's staking info
router.get('/info', verifyToken, async (req, res) => {
  try {
    const Wallet = require('../models/wallet.model');
    
    // Get active stakes
    const activeStakes = await Stake.find({ 
      user: req.user.id, 
      status: 'active' 
    }).sort({ startDate: -1 });

    // Update rewards for each stake
    let totalStaked = 0;
    let pendingRewards = 0;
    let currentApy = 0;

    const updatedStakes = await Promise.all(activeStakes.map(async (stake) => {
      const rewards = calculateRewards(stake);
      stake.earnedRewards = rewards;
      stake.lastRewardCalculation = new Date();
      await stake.save();

      totalStaked += stake.amount;
      pendingRewards += rewards;
      currentApy = Math.max(currentApy, stake.apy);

      return {
        _id: stake._id,
        amount: stake.amount,
        tier: stake.tier,
        apy: stake.apy,
        startDate: stake.startDate,
        unlockDate: stake.unlockDate,
        earnedRewards: rewards,
        daysRemaining: Math.max(0, Math.ceil((stake.unlockDate - new Date()) / (1000 * 60 * 60 * 24)))
      };
    }));

    // Get wallet balance
    let walletBalance = 0;
    try {
      const wallet = await Wallet.findOne({ user: req.user.id });
      walletBalance = wallet?.balance || 0;
    } catch (e) {}

    res.json({
      ok: true,
      totalStaked,
      pendingRewards: parseFloat(pendingRewards.toFixed(4)),
      currentApy,
      walletBalance,
      activeStakes: updatedStakes,
      tiers: TIERS
    });
  } catch (error) {
    console.error('Staking info error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch staking info' });
  }
});

// POST /api/staking/stake - Stake tokens
router.post('/stake', verifyToken, async (req, res) => {
  try {
    const { amount, tier, wallet } = req.body;
    const Wallet = require('../models/wallet.model');

    if (!amount || !tier) {
      return res.status(400).json({ ok: false, error: 'Amount and tier required' });
    }

    const tierConfig = TIERS[tier];
    if (!tierConfig) {
      return res.status(400).json({ ok: false, error: 'Invalid tier' });
    }

    if (amount < tierConfig.minStake) {
      return res.status(400).json({ 
        ok: false, 
        error: `Minimum stake for ${tier} is ${tierConfig.minStake} CYBEV` 
      });
    }

    // Check wallet balance
    const userWallet = await Wallet.findOne({ user: req.user.id });
    if (!userWallet || userWallet.balance < amount) {
      return res.status(400).json({ ok: false, error: 'Insufficient balance' });
    }

    // Deduct from wallet
    userWallet.balance -= amount;
    await userWallet.save();

    // Create stake
    const unlockDate = new Date();
    unlockDate.setDate(unlockDate.getDate() + tierConfig.lockDays);

    const stake = new Stake({
      user: req.user.id,
      wallet: wallet?.toLowerCase(),
      amount,
      tier,
      apy: tierConfig.apy,
      lockDays: tierConfig.lockDays,
      unlockDate,
      earnedRewards: 0
    });

    await stake.save();

    res.json({
      ok: true,
      stake: {
        _id: stake._id,
        amount: stake.amount,
        tier: stake.tier,
        apy: stake.apy,
        unlockDate: stake.unlockDate
      },
      newBalance: userWallet.balance
    });
  } catch (error) {
    console.error('Stake error:', error);
    res.status(500).json({ ok: false, error: 'Failed to stake tokens' });
  }
});

// POST /api/staking/unstake - Unstake tokens
router.post('/unstake', verifyToken, async (req, res) => {
  try {
    const { stakeId } = req.body;
    const Wallet = require('../models/wallet.model');

    const stake = await Stake.findOne({ _id: stakeId, user: req.user.id, status: 'active' });
    if (!stake) {
      return res.status(404).json({ ok: false, error: 'Stake not found' });
    }

    // Calculate final rewards
    const rewards = calculateRewards(stake);
    
    // Check if early unstake (penalty applies)
    const now = new Date();
    let penalty = 0;
    let returnAmount = stake.amount;

    if (now < stake.unlockDate) {
      // Early unstake - 20% penalty on principal + forfeit rewards
      penalty = stake.amount * 0.2;
      returnAmount = stake.amount - penalty;
      stake.penalty = penalty;
    } else {
      // Matured stake - return principal + rewards
      returnAmount = stake.amount + rewards;
    }

    // Return to wallet
    let userWallet = await Wallet.findOne({ user: req.user.id });
    if (!userWallet) {
      userWallet = new Wallet({ user: req.user.id, balance: 0 });
    }
    userWallet.balance += returnAmount;
    await userWallet.save();

    // Update stake status
    stake.status = 'unstaked';
    stake.unstakeDate = now;
    stake.earnedRewards = now >= stake.unlockDate ? rewards : 0;
    await stake.save();

    res.json({
      ok: true,
      returnAmount,
      penalty,
      rewards: now >= stake.unlockDate ? rewards : 0,
      newBalance: userWallet.balance,
      message: penalty > 0 
        ? `Early unstake penalty: ${penalty.toFixed(2)} CYBEV` 
        : `Returned ${returnAmount.toFixed(2)} CYBEV`
    });
  } catch (error) {
    console.error('Unstake error:', error);
    res.status(500).json({ ok: false, error: 'Failed to unstake tokens' });
  }
});

// POST /api/staking/claim - Claim rewards
router.post('/claim', verifyToken, async (req, res) => {
  try {
    const Wallet = require('../models/wallet.model');

    // Get all active stakes
    const activeStakes = await Stake.find({ user: req.user.id, status: 'active' });
    
    let totalClaimed = 0;
    for (const stake of activeStakes) {
      const rewards = calculateRewards(stake);
      if (rewards > stake.earnedRewards) {
        totalClaimed += rewards - stake.earnedRewards;
      }
      stake.earnedRewards = 0; // Reset after claiming
      stake.lastRewardCalculation = new Date();
      await stake.save();
    }

    if (totalClaimed <= 0) {
      return res.status(400).json({ ok: false, error: 'No rewards to claim' });
    }

    // Add to wallet
    let userWallet = await Wallet.findOne({ user: req.user.id });
    if (!userWallet) {
      userWallet = new Wallet({ user: req.user.id, balance: 0 });
    }
    userWallet.balance += totalClaimed;
    userWallet.totalEarned = (userWallet.totalEarned || 0) + totalClaimed;
    await userWallet.save();

    res.json({
      ok: true,
      amount: parseFloat(totalClaimed.toFixed(4)),
      newBalance: userWallet.balance
    });
  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({ ok: false, error: 'Failed to claim rewards' });
  }
});

// GET /api/staking/history - Get staking history
router.get('/history', verifyToken, async (req, res) => {
  try {
    const stakes = await Stake.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ ok: true, history: stakes });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch history' });
  }
});

module.exports = router;
