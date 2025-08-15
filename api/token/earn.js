const clientPromise = require('../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

// Token earning rates for different actions
const EARNING_RATES = {
  'post_create': 5,
  'post_like': 1,
  'post_comment': 2,
  'post_share': 3,
  'blog_create': 25,
  'nft_mint': 10,
  'daily_login': 1,
  'referral': 50,
  'content_view': 0.1,
  'ai_content_generation': 2,
  'profile_complete': 10,
  'email_verify': 5,
  'first_post': 15,
  'week_streak': 20,
  'month_streak': 100
};

// Daily limits to prevent abuse
const DAILY_LIMITS = {
  'post_like': 50,        // Max 50 likes per day
  'post_comment': 20,     // Max 20 comments per day
  'post_share': 10,       // Max 10 shares per day
  'daily_login': 1,       // Once per day
  'content_view': 100     // Max 100 view rewards per day
};

async function checkDailyLimit(userId, action, amount = 1) {
  if (!DAILY_LIMITS[action]) return true;

  try {
    const client = await clientPromise;
    const db = client.db();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayEarnings = await db.collection('earnings').aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          reason: action,
          timestamp: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 }
        }
      }
    ]).toArray();

    const currentCount = todayEarnings[0]?.total || 0;
    return (currentCount + amount) <= DAILY_LIMITS[action];
  } catch (error) {
    console.error('Daily limit check failed:', error);
    return true; // Allow on error
  }
}

async function awardTokens(userId, amount, reason, metadata = {}) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    // Create earning record
    const earning = {
      userId: new ObjectId(userId),
      amount: parseFloat(amount),
      reason,
      metadata,
      timestamp: new Date(),
      status: 'completed'
    };

    await db.collection('earnings').insertOne(earning);

    // Update user token balance
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { 
        $inc: { tokenBalance: parseFloat(amount) },
        $set: { lastEarning: new Date() }
      },
      { upsert: true }
    );

    // Update user activity
    await db.collection('user_activities').insertOne({
      userId: new ObjectId(userId),
      action: 'tokens_earned',
      details: {
        amount: parseFloat(amount),
        reason,
        metadata
      },
      timestamp: new Date()
    });

    return true;
  } catch (error) {
    console.error('Token award failed:', error);
    return false;
  }
}

async function checkSpecialConditions(userId, action) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    // Check for streak bonuses
    if (action === 'daily_login') {
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      const lastLogin = user?.lastLogin;
      const now = new Date();
      
      if (lastLogin) {
        const daysDiff = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
        
        // Update streak
        let streak = user?.loginStreak || 0;
        if (daysDiff === 1) {
          streak += 1;
        } else if (daysDiff > 1) {
          streak = 1; // Reset streak
        }
        
        await db.collection('users').updateOne(
          { _id: new ObjectId(userId) },
          { 
            $set: { 
              lastLogin: now,
              loginStreak: streak
            }
          }
        );
        
        // Bonus for streaks
        if (streak === 7) {
          await awardTokens(userId, EARNING_RATES.week_streak, 'week_streak', { streak });
        } else if (streak === 30) {
          await awardTokens(userId, EARNING_RATES.month_streak, 'month_streak', { streak });
        }
      } else {
        // First time login
        await db.collection('users').updateOne(
          { _id: new ObjectId(userId) },
          { 
            $set: { 
              lastLogin: now,
              loginStreak: 1
            }
          }
        );
      }
    }
    
    // Check for first post bonus
    if (action === 'post_create') {
      const postCount = await db.collection('posts').countDocuments({ 
        authorId: new ObjectId(userId) 
      });
      
      if (postCount === 1) {
        await awardTokens(userId, EARNING_RATES.first_post, 'first_post');
      }
    }
    
  } catch (error) {
    console.error('Special conditions check failed:', error);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    let userId = req.body.userId;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.userId;
      } catch (error) {
        console.log('Token verification failed');
      }
    }

    const { wallet, action, metadata = {} } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    if (!EARNING_RATES[action]) {
      return res.status(400).json({ error: 'Invalid action for earning' });
    }

    // Check daily limits
    if (userId && !(await checkDailyLimit(userId, action))) {
      return res.status(429).json({ 
        error: 'Daily limit reached for this action',
        limit: DAILY_LIMITS[action]
      });
    }

    const amount = EARNING_RATES[action];
    
    if (userId) {
      const success = await awardTokens(userId, amount, action, {
        wallet,
        ...metadata
      });
      
      if (success) {
        // Check for special bonuses
        await checkSpecialConditions(userId, action);
        
        res.json({ 
          success: true, 
          earned: amount,
          action,
          message: `Earned ${amount} CYBV tokens for ${action.replace('_', ' ')}`
        });
      } else {
        res.status(500).json({ error: 'Failed to award tokens' });
      }
    } else {
      // For users without accounts, simulate earning (won't persist)
      res.json({ 
        success: true, 
        earned: amount,
        action,
        message: `Would earn ${amount} CYBV tokens for ${action.replace('_', ' ')}`,
        note: 'Create an account to start earning real tokens!'
      });
    }
    
  } catch (error) {
    console.error('Token earning error:', error);
    res.status(500).json({ 
      error: 'Failed to process token earning',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}