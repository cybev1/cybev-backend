// ============================================
// FILE: routes/staking.routes.js
// PATH: cybev-backend/routes/staking.routes.js
// PURPOSE: Staking backend - stake, unstake, rewards
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// STAKING SCHEMA
// ==========================================

let Stake, StakingPool;

try {
  Stake = mongoose.model('Stake');
} catch {
  const stakeSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pool: { type: mongoose.Schema.Types.ObjectId, ref: 'StakingPool', required: true },
    amount: { type: Number, required: true, min: 0 },
    rewardsClaimed: { type: Number, default: 0 },
    pendingRewards: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    lastRewardCalculation: { type: Date, default: Date.now },
    status: { 
      type: String, 
      enum: ['active', 'completed', 'withdrawn', 'locked'],
      default: 'active'
    },
    autoCompound: { type: Boolean, default: false },
    transactionHash: String,
    withdrawnAt: Date,
    withdrawTransactionHash: String
  }, { timestamps: true });

  stakeSchema.index({ user: 1, status: 1 });
  stakeSchema.index({ pool: 1 });
  stakeSchema.index({ endDate: 1, status: 1 });
  
  Stake = mongoose.model('Stake', stakeSchema);
}

try {
  StakingPool = mongoose.model('StakingPool');
} catch {
  const stakingPoolSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    apy: { type: Number, required: true }, // Annual percentage yield
    minStake: { type: Number, default: 10 },
    maxStake: { type: Number, default: 1000000 },
    lockPeriod: { type: Number, required: true }, // In days
    totalStaked: { type: Number, default: 0 },
    totalStakers: { type: Number, default: 0 },
    rewardToken: { type: String, default: 'CYBEV' },
    isActive: { type: Boolean, default: true },
    earlyWithdrawalPenalty: { type: Number, default: 10 }, // Percentage
    compoundFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
    maxCapacity: { type: Number, default: 0 }, // 0 = unlimited
    startDate: Date,
    endDate: Date,
    contractAddress: String,
    icon: String,
    color: String
  }, { timestamps: true });

  stakingPoolSchema.index({ isActive: 1, apy: -1 });
  
  StakingPool = mongoose.model('StakingPool', stakingPoolSchema);
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Calculate pending rewards
const calculateRewards = (stake, pool) => {
  const now = new Date();
  const lastCalc = new Date(stake.lastRewardCalculation);
  const daysElapsed = (now - lastCalc) / (1000 * 60 * 60 * 24);
  
  // Daily rate = APY / 365
  const dailyRate = pool.apy / 100 / 365;
  const rewards = stake.amount * dailyRate * daysElapsed;
  
  return Math.max(0, rewards);
};

// ==========================================
// POOLS
// ==========================================

// GET /api/staking/pools - Get all staking pools
router.get('/pools', async (req, res) => {
  try {
    const pools = await StakingPool.find({ isActive: true })
      .sort({ apy: -1 });

    res.json({ ok: true, pools });
  } catch (error) {
    console.error('Get pools error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get pools' });
  }
});

// GET /api/staking/pools/:poolId - Get single pool
router.get('/pools/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    const pool = await StakingPool.findById(poolId);
    
    if (!pool) {
      return res.status(404).json({ ok: false, error: 'Pool not found' });
    }

    res.json({ ok: true, pool });
  } catch (error) {
    console.error('Get pool error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get pool' });
  }
});

// POST /api/staking/pools - Create pool (admin only)
router.post('/pools', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if admin
    const User = mongoose.model('User');
    const user = await User.findById(userId);
    if (!user?.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }

    const pool = await StakingPool.create(req.body);
    res.json({ ok: true, pool });
  } catch (error) {
    console.error('Create pool error:', error);
    res.status(500).json({ ok: false, error: 'Failed to create pool' });
  }
});

// ==========================================
// USER STAKES
// ==========================================

// GET /api/staking/my-stakes - Get user's stakes
router.get('/my-stakes', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const stakes = await Stake.find({ user: userId })
      .populate('pool')
      .sort({ createdAt: -1 });

    // Calculate pending rewards for each stake
    const stakesWithRewards = stakes.map(stake => {
      if (stake.status === 'active' && stake.pool) {
        const pendingRewards = calculateRewards(stake, stake.pool);
        return {
          ...stake.toObject(),
          pendingRewards: stake.pendingRewards + pendingRewards
        };
      }
      return stake.toObject();
    });

    // Calculate totals
    const totals = {
      totalStaked: stakesWithRewards.filter(s => s.status === 'active').reduce((sum, s) => sum + s.amount, 0),
      totalRewards: stakesWithRewards.reduce((sum, s) => sum + (s.pendingRewards || 0) + (s.rewardsClaimed || 0), 0),
      pendingRewards: stakesWithRewards.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.pendingRewards || 0), 0),
      claimedRewards: stakesWithRewards.reduce((sum, s) => sum + (s.rewardsClaimed || 0), 0),
      activeStakes: stakesWithRewards.filter(s => s.status === 'active').length
    };

    res.json({ ok: true, stakes: stakesWithRewards, totals });
  } catch (error) {
    console.error('Get stakes error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get stakes' });
  }
});

// GET /api/staking/stats - Get user's staking stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const activeStakes = await Stake.find({ user: userId, status: 'active' }).populate('pool');
    
    let totalStaked = 0;
    let pendingRewards = 0;
    let projectedAnnualRewards = 0;

    activeStakes.forEach(stake => {
      totalStaked += stake.amount;
      pendingRewards += stake.pendingRewards + calculateRewards(stake, stake.pool);
      projectedAnnualRewards += stake.amount * (stake.pool.apy / 100);
    });

    const claimedRewards = await Stake.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$rewardsClaimed' } } }
    ]);

    res.json({
      ok: true,
      stats: {
        totalStaked,
        pendingRewards,
        claimedRewards: claimedRewards[0]?.total || 0,
        projectedAnnualRewards,
        activeStakes: activeStakes.length
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get stats' });
  }
});

// ==========================================
// STAKING ACTIONS
// ==========================================

// POST /api/staking/stake - Stake tokens
router.post('/stake', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { poolId, amount, autoCompound, transactionHash } = req.body;

    if (!poolId || !amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Pool ID and valid amount required' });
    }

    // Get pool
    const pool = await StakingPool.findById(poolId);
    if (!pool || !pool.isActive) {
      return res.status(404).json({ ok: false, error: 'Pool not found or inactive' });
    }

    // Validate amount
    if (amount < pool.minStake) {
      return res.status(400).json({ ok: false, error: `Minimum stake is ${pool.minStake} CYBEV` });
    }
    if (pool.maxStake && amount > pool.maxStake) {
      return res.status(400).json({ ok: false, error: `Maximum stake is ${pool.maxStake} CYBEV` });
    }

    // Check capacity
    if (pool.maxCapacity > 0 && (pool.totalStaked + amount) > pool.maxCapacity) {
      return res.status(400).json({ ok: false, error: 'Pool capacity exceeded' });
    }

    // Calculate end date
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + pool.lockPeriod);

    // Create stake
    const stake = await Stake.create({
      user: userId,
      pool: poolId,
      amount,
      autoCompound: autoCompound || false,
      endDate,
      transactionHash,
      status: 'locked'
    });

    // Update pool stats
    await StakingPool.updateOne(
      { _id: poolId },
      { 
        $inc: { totalStaked: amount, totalStakers: 1 }
      }
    );

    // Update user token balance (in production, verify blockchain transaction)
    // await User.updateOne({ _id: userId }, { $inc: { tokenBalance: -amount } });

    const populatedStake = await Stake.findById(stake._id).populate('pool');

    res.json({ ok: true, stake: populatedStake });
  } catch (error) {
    console.error('Stake error:', error);
    res.status(500).json({ ok: false, error: 'Failed to stake' });
  }
});

// POST /api/staking/unstake/:stakeId - Unstake tokens
router.post('/unstake/:stakeId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { stakeId } = req.params;
    const { transactionHash } = req.body;

    const stake = await Stake.findOne({ _id: stakeId, user: userId }).populate('pool');
    
    if (!stake) {
      return res.status(404).json({ ok: false, error: 'Stake not found' });
    }

    if (stake.status !== 'active' && stake.status !== 'locked') {
      return res.status(400).json({ ok: false, error: 'Stake already withdrawn' });
    }

    const now = new Date();
    const isEarlyWithdrawal = now < stake.endDate;
    
    let withdrawAmount = stake.amount;
    let penalty = 0;

    // Apply early withdrawal penalty
    if (isEarlyWithdrawal && stake.pool.earlyWithdrawalPenalty > 0) {
      penalty = stake.amount * (stake.pool.earlyWithdrawalPenalty / 100);
      withdrawAmount = stake.amount - penalty;
    }

    // Calculate final rewards
    const pendingRewards = stake.pendingRewards + calculateRewards(stake, stake.pool);
    const finalRewards = isEarlyWithdrawal ? 0 : pendingRewards; // No rewards for early withdrawal

    // Update stake
    stake.status = 'withdrawn';
    stake.withdrawnAt = now;
    stake.withdrawTransactionHash = transactionHash;
    stake.rewardsClaimed += finalRewards;
    stake.pendingRewards = 0;
    await stake.save();

    // Update pool stats
    await StakingPool.updateOne(
      { _id: stake.pool._id },
      { 
        $inc: { totalStaked: -stake.amount, totalStakers: -1 }
      }
    );

    // Update user token balance (in production, execute blockchain transaction)
    // await User.updateOne({ _id: userId }, { $inc: { tokenBalance: withdrawAmount + finalRewards } });

    res.json({
      ok: true,
      message: 'Successfully unstaked',
      withdrawAmount,
      rewards: finalRewards,
      penalty,
      isEarlyWithdrawal
    });
  } catch (error) {
    console.error('Unstake error:', error);
    res.status(500).json({ ok: false, error: 'Failed to unstake' });
  }
});

// POST /api/staking/claim/:stakeId - Claim rewards
router.post('/claim/:stakeId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { stakeId } = req.params;

    const stake = await Stake.findOne({ _id: stakeId, user: userId, status: 'active' }).populate('pool');
    
    if (!stake) {
      return res.status(404).json({ ok: false, error: 'Active stake not found' });
    }

    // Calculate rewards
    const pendingRewards = stake.pendingRewards + calculateRewards(stake, stake.pool);

    if (pendingRewards <= 0) {
      return res.status(400).json({ ok: false, error: 'No rewards to claim' });
    }

    // Update stake
    stake.rewardsClaimed += pendingRewards;
    stake.pendingRewards = 0;
    stake.lastRewardCalculation = new Date();
    await stake.save();

    // Update user token balance (in production, execute blockchain transaction)
    // await User.updateOne({ _id: userId }, { $inc: { tokenBalance: pendingRewards } });

    res.json({
      ok: true,
      message: 'Rewards claimed successfully',
      claimedAmount: pendingRewards,
      totalClaimed: stake.rewardsClaimed
    });
  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({ ok: false, error: 'Failed to claim rewards' });
  }
});

// POST /api/staking/compound/:stakeId - Compound rewards
router.post('/compound/:stakeId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { stakeId } = req.params;

    const stake = await Stake.findOne({ _id: stakeId, user: userId, status: 'active' }).populate('pool');
    
    if (!stake) {
      return res.status(404).json({ ok: false, error: 'Active stake not found' });
    }

    // Calculate rewards
    const pendingRewards = stake.pendingRewards + calculateRewards(stake, stake.pool);

    if (pendingRewards <= 0) {
      return res.status(400).json({ ok: false, error: 'No rewards to compound' });
    }

    // Add rewards to stake amount
    stake.amount += pendingRewards;
    stake.pendingRewards = 0;
    stake.lastRewardCalculation = new Date();
    await stake.save();

    // Update pool total staked
    await StakingPool.updateOne(
      { _id: stake.pool._id },
      { $inc: { totalStaked: pendingRewards } }
    );

    res.json({
      ok: true,
      message: 'Rewards compounded successfully',
      compoundedAmount: pendingRewards,
      newStakeAmount: stake.amount
    });
  } catch (error) {
    console.error('Compound error:', error);
    res.status(500).json({ ok: false, error: 'Failed to compound rewards' });
  }
});

// ==========================================
// LEADERBOARD
// ==========================================

// GET /api/staking/leaderboard - Get top stakers
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const leaderboard = await Stake.aggregate([
      { $match: { status: 'active' } },
      { 
        $group: { 
          _id: '$user', 
          totalStaked: { $sum: '$amount' },
          stakesCount: { $sum: 1 }
        } 
      },
      { $sort: { totalStaked: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          totalStaked: 1,
          stakesCount: 1,
          'user.name': 1,
          'user.username': 1,
          'user.avatar': 1
        }
      }
    ]);

    res.json({ ok: true, leaderboard });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get leaderboard' });
  }
});

// ==========================================
// PLATFORM STATS
// ==========================================

// GET /api/staking/platform-stats - Get platform staking stats
router.get('/platform-stats', async (req, res) => {
  try {
    const pools = await StakingPool.find({ isActive: true });
    
    const totalStaked = pools.reduce((sum, p) => sum + p.totalStaked, 0);
    const totalStakers = await Stake.distinct('user', { status: 'active' });
    const highestAPY = Math.max(...pools.map(p => p.apy));

    res.json({
      ok: true,
      stats: {
        totalStaked,
        totalStakers: totalStakers.length,
        activePools: pools.length,
        highestAPY
      }
    });
  } catch (error) {
    console.error('Platform stats error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get stats' });
  }
});

// Initialize default pools if none exist
const initDefaultPools = async () => {
  try {
    const count = await StakingPool.countDocuments();
    if (count === 0) {
      await StakingPool.insertMany([
        {
          name: 'Flexible',
          description: 'No lock period, withdraw anytime',
          apy: 5,
          minStake: 10,
          lockPeriod: 0,
          earlyWithdrawalPenalty: 0,
          icon: '🌊',
          color: '#3B82F6'
        },
        {
          name: '30 Day',
          description: 'Lock for 30 days for higher returns',
          apy: 10,
          minStake: 100,
          lockPeriod: 30,
          earlyWithdrawalPenalty: 10,
          icon: '🔥',
          color: '#F59E0B'
        },
        {
          name: '90 Day',
          description: 'Lock for 90 days for premium returns',
          apy: 15,
          minStake: 500,
          lockPeriod: 90,
          earlyWithdrawalPenalty: 15,
          icon: '💎',
          color: '#8B5CF6'
        },
        {
          name: '180 Day',
          description: 'Maximum returns for long-term stakers',
          apy: 25,
          minStake: 1000,
          lockPeriod: 180,
          earlyWithdrawalPenalty: 20,
          icon: '👑',
          color: '#EC4899'
        }
      ]);
      console.log('Default staking pools created');
    }
  } catch (error) {
    console.error('Failed to init pools:', error);
  }
};

// Call on module load
initDefaultPools();

module.exports = router;
