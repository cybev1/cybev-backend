// ============================================
// FILE: routes/staking.routes.js
// Token Staking API
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// Staking Schema
const stakingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallet: { type: String, required: true },
  amount: { type: Number, required: true },
  tier: { type: Number, enum: [0, 1, 2, 3], required: true }, // 0=Bronze, 1=Silver, 2=Gold, 3=Diamond
  transactionHash: { type: String },
  stakeIndex: { type: Number }, // Index in smart contract
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  status: { type: String, enum: ['active', 'unstaked', 'pending'], default: 'pending' },
  rewards: { type: Number, default: 0 },
  unstakedAt: { type: Date }
}, { timestamps: true });

let Staking;
try {
  Staking = mongoose.model('Staking');
} catch {
  Staking = mongoose.model('Staking', stakingSchema);
}

// Tier configurations (must match smart contract)
const TIERS = [
  { name: 'Bronze', minStake: 100, lockDays: 30, apy: 8 },
  { name: 'Silver', minStake: 500, lockDays: 90, apy: 12 },
  { name: 'Gold', minStake: 1000, lockDays: 180, apy: 18 },
  { name: 'Diamond', minStake: 5000, lockDays: 365, apy: 25 }
];

// GET /api/staking/tiers - Get staking tiers info
router.get('/tiers', (req, res) => {
  res.json({
    ok: true,
    tiers: TIERS.map((tier, index) => ({
      id: index,
      ...tier,
      lockDaysFormatted: tier.lockDays >= 365 ? '1 Year' : `${tier.lockDays} Days`
    })),
    contractAddress: process.env.CYBEV_STAKING_ADDRESS || null,
    tokenAddress: process.env.CYBEV_TOKEN_ADDRESS || null
  });
});

// POST /api/staking/stake - Record new stake
router.post('/stake', verifyToken, async (req, res) => {
  try {
    const { wallet, amount, tier, transactionHash, stakeIndex } = req.body;

    if (!wallet || amount === undefined || tier === undefined) {
      return res.status(400).json({ ok: false, error: 'Wallet, amount, and tier required' });
    }

    if (tier < 0 || tier > 3) {
      return res.status(400).json({ ok: false, error: 'Invalid tier' });
    }

    if (amount < TIERS[tier].minStake) {
      return res.status(400).json({ 
        ok: false, 
        error: `Minimum stake for ${TIERS[tier].name} is ${TIERS[tier].minStake} CYBEV` 
      });
    }

    const tierConfig = TIERS[tier];
    const endTime = new Date(Date.now() + tierConfig.lockDays * 24 * 60 * 60 * 1000);

    const stake = new Staking({
      user: req.user.id,
      wallet: wallet.toLowerCase(),
      amount,
      tier,
      transactionHash,
      stakeIndex,
      startTime: new Date(),
      endTime,
      status: transactionHash ? 'active' : 'pending'
    });

    await stake.save();

    res.json({
      ok: true,
      stake: {
        _id: stake._id,
        amount: stake.amount,
        tier: tierConfig.name,
        apy: tierConfig.apy,
        lockDays: tierConfig.lockDays,
        startTime: stake.startTime,
        endTime: stake.endTime,
        status: stake.status
      }
    });
  } catch (error) {
    console.error('Stake error:', error);
    res.status(500).json({ ok: false, error: 'Failed to record stake' });
  }
});

// PUT /api/staking/confirm/:id - Confirm stake with transaction
router.put('/confirm/:id', verifyToken, async (req, res) => {
  try {
    const { transactionHash, stakeIndex } = req.body;
    
    const stake = await Staking.findById(req.params.id);
    if (!stake) {
      return res.status(404).json({ ok: false, error: 'Stake not found' });
    }

    if (stake.user.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    stake.transactionHash = transactionHash;
    stake.stakeIndex = stakeIndex;
    stake.status = 'active';
    await stake.save();

    res.json({ ok: true, stake });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to confirm stake' });
  }
});

// POST /api/staking/unstake/:id - Record unstake
router.post('/unstake/:id', verifyToken, async (req, res) => {
  try {
    const { transactionHash, rewards } = req.body;
    
    const stake = await Staking.findById(req.params.id);
    if (!stake) {
      return res.status(404).json({ ok: false, error: 'Stake not found' });
    }

    if (stake.user.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    if (stake.status !== 'active') {
      return res.status(400).json({ ok: false, error: 'Stake is not active' });
    }

    stake.status = 'unstaked';
    stake.unstakedAt = new Date();
    stake.rewards = rewards || 0;
    if (transactionHash) stake.transactionHash = transactionHash;
    await stake.save();

    const isEarly = new Date() < stake.endTime;

    res.json({ 
      ok: true, 
      stake,
      earlyUnstake: isEarly,
      message: isEarly ? 'Early unstake - 20% penalty applied' : 'Successfully unstaked with rewards'
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to unstake' });
  }
});

// GET /api/staking/my-stakes - Get user's stakes
router.get('/my-stakes', verifyToken, async (req, res) => {
  try {
    const stakes = await Staking.find({ user: req.user.id })
      .sort({ createdAt: -1 });

    const formattedStakes = stakes.map(stake => {
      const tierConfig = TIERS[stake.tier];
      const now = new Date();
      const isLocked = now < stake.endTime;
      const elapsed = now - stake.startTime;
      const totalDuration = stake.endTime - stake.startTime;
      const progress = Math.min(100, (elapsed / totalDuration) * 100);
      
      // Calculate pending rewards
      const elapsedDays = elapsed / (24 * 60 * 60 * 1000);
      const pendingRewards = (stake.amount * tierConfig.apy * elapsedDays) / (365 * 100);

      return {
        _id: stake._id,
        amount: stake.amount,
        tier: stake.tier,
        tierName: tierConfig.name,
        apy: tierConfig.apy,
        startTime: stake.startTime,
        endTime: stake.endTime,
        status: stake.status,
        isLocked,
        progress: progress.toFixed(1),
        pendingRewards: pendingRewards.toFixed(2),
        rewards: stake.rewards,
        transactionHash: stake.transactionHash
      };
    });

    res.json({ ok: true, stakes: formattedStakes });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch stakes' });
  }
});

// GET /api/staking/stats - Get staking statistics
router.get('/stats', async (req, res) => {
  try {
    const [totalStaked, activeStakes, totalStakers] = await Promise.all([
      Staking.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Staking.countDocuments({ status: 'active' }),
      Staking.distinct('user', { status: 'active' })
    ]);

    res.json({
      ok: true,
      stats: {
        totalStaked: totalStaked[0]?.total || 0,
        activeStakes,
        totalStakers: totalStakers.length,
        contractAddress: process.env.CYBEV_STAKING_ADDRESS || null
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch stats' });
  }
});

// GET /api/staking/leaderboard - Top stakers
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const leaderboard = await Staking.aggregate([
      { $match: { status: 'active' } },
      { $group: { 
        _id: '$user', 
        totalStaked: { $sum: '$amount' },
        stakes: { $sum: 1 }
      }},
      { $sort: { totalStaked: -1 } },
      { $limit: limit },
      { $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }},
      { $unwind: '$user' },
      { $project: {
        _id: 1,
        totalStaked: 1,
        stakes: 1,
        'user.name': 1,
        'user.username': 1,
        'user.avatar': 1
      }}
    ]);

    res.json({ ok: true, leaderboard });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;
