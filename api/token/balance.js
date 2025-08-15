const clientPromise = require('../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { wallet } = req.query;
    
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Extract user ID from token if available
    let userId = null;
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.userId;
      } catch (error) {
        console.log('Token verification failed');
      }
    }

    const client = await clientPromise;
    const db = client.db();
    
    let balance = '0';
    let totalEarned = '0';
    let totalSpent = '0';
    
    if (userId) {
      // Get user balance from database
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(userId) },
        { projection: { tokenBalance: 1 } }
      );
      
      balance = (user?.tokenBalance || 0).toString();
      
      // Calculate total earned and spent
      const earnings = await db.collection('earnings').aggregate([
        {
          $match: { userId: new ObjectId(userId) }
        },
        {
          $group: {
            _id: null,
            totalEarned: { 
              $sum: { 
                $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] 
              }
            },
            totalSpent: { 
              $sum: { 
                $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] 
              }
            }
          }
        }
      ]).toArray();
      
      if (earnings.length > 0) {
        totalEarned = earnings[0].totalEarned.toString();
        totalSpent = earnings[0].totalSpent.toString();
      }
    } else {
      // For demo purposes, return mock balance for non-authenticated users
      balance = '0';
    }

    // Get recent transactions
    let recentTransactions = [];
    if (userId) {
      recentTransactions = await db.collection('earnings')
        .find({ userId: new ObjectId(userId) })
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray();
    }

    const formattedTransactions = recentTransactions.map(tx => ({
      id: tx._id,
      type: tx.amount > 0 ? 'earned' : 'spent',
      amount: Math.abs(tx.amount),
      reason: tx.reason,
      timestamp: formatTimeAgo(tx.timestamp),
      date: tx.timestamp
    }));

    res.json({
      success: true,
      wallet,
      balance,
      totalEarned,
      totalSpent,
      recentTransactions: formattedTransactions,
      currency: 'CYBV'
    });

  } catch (error) {
    console.error('Balance fetch error:', error);
    
    // Return mock data on error for development
    res.json({
      success: true,
      wallet: req.query.wallet,
      balance: '125.50',
      totalEarned: '150.00',
      totalSpent: '24.50',
      recentTransactions: [
        {
          id: 1,
          type: 'earned',
          amount: 25,
          reason: 'blog_create',
          timestamp: '2h ago'
        },
        {
          id: 2,
          type: 'earned',
          amount: 5,
          reason: 'post_create',
          timestamp: '1d ago'
        },
        {
          id: 3,
          type: 'spent',
          amount: 10,
          reason: 'post_boost',
          timestamp: '2d ago'
        }
      ],
      currency: 'CYBV',
      mock: true
    });
  }
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
