const Stake = require('../models/stake.model');
const User = require('../models/user.model'); // assumes a user model exists

exports.stakeTokens = async (req, res) => {
  const { amount, lockPeriod } = req.body;
  const userId = req.user.id;

  if (!amount || !lockPeriod) return res.status(400).json({ error: 'Missing fields' });

  const user = await User.findById(userId);
  if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

  user.balance -= amount;
  user.staked = (user.staked || 0) + amount;
  await user.save();

  const newStake = new Stake({ userId, amount, lockPeriod });
  await newStake.save();

  res.status(200).json({ message: 'Tokens staked successfully', stake: newStake });
};

exports.unstakeTokens = async (req, res) => {
  const { stakeId } = req.body;
  const stake = await Stake.findById(stakeId);

  if (!stake || stake.status !== 'active') return res.status(400).json({ error: 'Invalid stake' });

  const endDate = new Date(stake.startDate);
  endDate.setDate(endDate.getDate() + stake.lockPeriod);

  if (new Date() < endDate) {
    return res.status(400).json({ error: 'Stake is still locked' });
  }

  stake.status = 'completed';
  await stake.save();

  const user = await User.findById(stake.userId);
  user.balance += stake.amount + stake.rewardsEarned;
  user.staked -= stake.amount;
  await user.save();

  res.status(200).json({ message: 'Tokens unstaked and rewards claimed' });
};

exports.getStakeStatus = async (req, res) => {
  const userId = req.user.id;
  const activeStakes = await Stake.find({ userId, status: 'active' });
  res.status(200).json(activeStakes);
};

exports.getStakeHistory = async (req, res) => {
  const userId = req.user.id;
  const allStakes = await Stake.find({ userId });
  res.status(200).json(allStakes);
};