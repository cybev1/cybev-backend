const clientPromise = require('../../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

// Boost pricing tiers
const BOOST_TIERS = {
  'basic': {
    cost: 10,
    duration: 24, // hours
    multiplier: 2,
    description: 'Double visibility for 24 hours'
  },
  'premium': {
    cost: 25,
    duration: 72, // hours
    multiplier: 3,
    description: 'Triple visibility for 72 hours'
  },
  'super': {
    cost: 50,
    duration: 168, // hours (1 week)
    multiplier: 5,
    description: '5x visibility for 1 week'
  }
};

async function deductTokens(userId, amount, reason, metadata = {}) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    // Check user balance
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { tokenBalance: 1 } }
    );
    
    const currentBalance = user?.tokenBalance || 0;
    if (currentBalance < amount) {
      return { success: false, error: 'Insufficient balance', available: currentBalance, required: amount };
    }
    
    // Deduct tokens
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { tokenBalance: -amount } }
    );
    
    // Log transaction
    await db.collection('earnings').insertOne({
      userId: new ObjectId(userId),
      amount: -parseFloat(amount),
      reason,
      metadata,
      timestamp: new Date(),
      status: 'completed'
    });

    return { success: true, newBalance: currentBalance - amount };
  } catch (error) {
    console.error('Token deduction failed:', error);
    return { success: false, error: 'Transaction failed' };
  }
}

async function awardAuthorTokens(authorId, amount, reason, metadata = {}) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    // Award tokens to post author (10% of boost cost)
    const authorReward = Math.round(amount * 0.1);
    
    await db.collection('earnings').insertOne({
      userId: new ObjectId(authorId),
      amount: parseFloat(authorReward),
      reason,
