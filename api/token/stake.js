const clientPromise = require('../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

// Staking configuration
const STAKING_CONFIG = {
  minimumStake: 1,
  maximumStake: 10000,
  lockPeriods: {
    '7d': { days: 7, apy: 8 },
    '30d': { days: 30, apy: 12 },
    '90d': { days: 90, apy: 18 },
    '365d': { days: 365, apy: 25 }
  },
  penalties: {
    earlyWithdrawal: 0.1 // 10% penalty for early withdrawal
  }
};

async function calculateRewards(stakedAmount, stakingPeriod, daysStaked) {
  const config = STAKING_CONFIG.lockPeriods[stakingPeriod];
  if (!config) return 0;
  
  const dailyRate = config.apy / 365 / 100;
  const rewards = stakedAmount * dailyRate * daysStaked;
  
  return Math.round(rewards * 100) / 100; // Round to 2 decimal places
}

async function getUserBalance(userId) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { tokenBalance: 1 } }
    );
    
    return user?.tokenBalance || 0;
  } catch (error) {
    console.error('Get user balance error:', error);
    return 0;
  }
}

async function updateUserBalance(userId, amount) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { tokenBalance: amount } }
    );
    
    return true;
  } catch (error) {
    console.error('Update user balance error:', error);
    return false;
  }
}

async function logTransaction(userId, type, amount, metadata = {}) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    await db.collection('earnings').insertOne({
      userId: new ObjectId(userId),
      amount: type === 'stake' ? -amount : amount,
      reason: type === 'stake' ? 'token_stake' : 'staking_reward',
      metadata,
      timestamp: new Date(),
      status: 'completed'
    });
    
    return true;
  } catch (error) {
    console.error('Log transaction error:', error);
    return false;
  }
}

export default async function handler(req, res) {
  try {
    // Extract user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    let userId = null;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.userId;
      } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const client = await clientPromise;
    const db = client.db();

    if (req.method === 'POST') {
      // Stake tokens
      const { amount, period = '30d', wallet } = req.body;

      // Validation
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      if (amount < STAKING_CONFIG.minimumStake) {
        return res.status(400).json({ 
          error: `Minimum stake amount is ${STAKING_CONFIG.minimumStake} CYBV` 
        });
      }

      if (amount > STAKING_CONFIG.maximumStake) {
        return res.status(400).json({ 
          error: `Maximum stake amount is ${STAKING_CONFIG.maximumStake} CYBV` 
        });
      }

      if (!STAKING_CONFIG.lockPeriods[period]) {
        return res.status(400).json({ error: 'Invalid staking period' });
      }

      // Check user balance
      const userBalance = await getUserBalance(userId);
      if (userBalance < amount) {
        return res.status(400).json({ 
          error: 'Insufficient balance',
          available: userBalance,
          required: amount
        });
      }

      // Check for existing active stakes
      const existingStake = await db.collection('stakes').findOne({
        userId: new ObjectId(userId),
        status: 'active'
      });

      if (existingStake) {
        return res.status(400).json({ 
          error: 'You already have an active stake. Please wait for it to complete or unstake first.' 
        });
      }

      // Create stake record
      const stake = {
        userId: new ObjectId(userId),
        amount: parseFloat(amount),
        period,
        apy: STAKING_CONFIG.lockPeriods[period].apy,
        startDate: new Date(),
        endDate: new Date(Date.now() + STAKING_CONFIG.lockPeriods[period].days * 24 * 60 * 60 * 1000),
        status: 'active',
        rewards: 0,
        wallet,
        createdAt: new Date()
      };

      const result = await db.collection('stakes').insertOne(stake);

      // Deduct tokens from user balance
      const balanceUpdated = await updateUserBalance(userId, -amount);
      if (!balanceUpdated) {
        // Rollback stake creation
        await db.collection('stakes').deleteOne({ _id: result.insertedId });
        return res.status(500).json({ error: 'Failed to update balance' });
      }

      // Log transaction
      await logTransaction(userId, 'stake', amount, {
        stakeId: result.insertedId,
        period,
        apy: stake.apy,
        endDate: stake.endDate
      });

      res.json({
        success: true,
        stakeId: result.insertedId,
        amount: parseFloat(amount),
        period,
        apy: stake.apy,
        endDate: stake.endDate,
        message: `Successfully staked ${amount} CYBV tokens for ${period} at ${stake.apy}% APY`
      });

    } else if (req.method === 'GET') {
      // Get staking information
      const stakes = await db.collection('stakes')
        .find({ userId: new ObjectId(userId) })
        .sort({ createdAt: -1 })
        .toArray();

      const activeStakes = stakes.filter(stake => stake.status === 'active');
      const completedStakes = stakes.filter(stake => stake.status === 'completed');

      // Calculate current rewards for active stakes
      const stakesWithRewards = await Promise.all(
        activeStakes.map(async (stake) => {
          const now = new Date();
          const daysStaked = Math.floor((now - stake.startDate) / (1000 * 60 * 60 * 24));
          const currentRewards = await calculateRewards(stake.amount, stake.period, daysStaked);
          
          return {
            ...stake,
            currentRewards,
            daysStaked,
            daysRemaining: Math.max(0, STAKING_CONFIG.lockPeriods[stake.period].days - daysStaked),
            canUnstake: now >= stake.endDate
          };
        })
      );

      const totalStaked = activeStakes.reduce((sum, stake) => sum + stake.amount, 0);
      const totalRewards = stakesWithRewards.reduce((sum, stake) => sum + stake.currentRewards, 0);

      res.json({
        success: true,
        activeStakes: stakesWithRewards,
        completedStakes,
        summary: {
          totalStaked,
          totalRewards,
          activeStakeCount: activeStakes.length,
          completedStakeCount: completedStakes.length
        },
        config: STAKING_CONFIG
      });

    } else if (req.method === 'DELETE') {
      // Unstake tokens
      const { stakeId, forceUnstake = false } = req.body;

      if (!stakeId) {
        return res.status(400).json({ error: 'Stake ID is required' });
      }

      const stake = await db.collection('stakes').findOne({
        _id: new ObjectId(stakeId),
        userId: new ObjectId(userId),
        status: 'active'
      });

      if (!stake) {
        return res.status(404).json({ error: 'Active stake not found' });
      }

      const now = new Date();
      const isMatured = now >= stake.endDate;
      const daysStaked = Math.floor((now - stake.startDate) / (1000 * 60 * 60 * 24));

      let penalty = 0;
      let rewards = await calculateRewards(stake.amount, stake.period, daysStaked);

      // Apply early withdrawal penalty if not matured
      if (!isMatured && !forceUnstake) {
        return res.status(400).json({ 
          error: 'Stake has not matured yet',
          maturityDate: stake.endDate,
          daysRemaining: STAKING_CONFIG.lockPeriods[stake.period].days - daysStaked,
          earlyWithdrawalPenalty: `${STAKING_CONFIG.penalties.earlyWithdrawal * 100}%`
        });
      }

      if (!isMatured && forceUnstake) {
        penalty = stake.amount * STAKING_CONFIG.penalties.earlyWithdrawal;
        rewards = Math.max(0, rewards - penalty);
      }

      // Calculate final amounts
      const finalAmount = stake.amount - penalty;
      const totalReturn = finalAmount + rewards;

      // Update stake status
      await db.collection('stakes').updateOne(
        { _id: new ObjectId(stakeId) },
        { 
          $set: { 
            status: 'completed',
            completedAt: now,
            finalRewards: rewards,
            penalty: penalty,
            unstakeType: isMatured ? 'matured' : 'early'
          }
        }
      );

      // Return tokens to user
      await updateUserBalance(userId, totalReturn);

      // Log rewards transaction
      if (rewards > 0) {
        await logTransaction(userId, 'reward', rewards, {
          stakeId: stake._id,
          period: stake.period,
          daysStaked,
          penalty
        });
      }

      res.json({
        success: true,
        stakeId,
        originalAmount: stake.amount,
        rewards,
        penalty,
        totalReturn,
        daysStaked,
        isMatured,
        message: `Successfully unstaked ${totalReturn} CYBV tokens (${stake.amount} principal + ${rewards} rewards${penalty > 0 ? ` - ${penalty} penalty` : ''})`
      });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Staking error:', error);
    res.status(500).json({ 
      error: 'Staking operation failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
