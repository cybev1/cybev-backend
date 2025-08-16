const mongoose = require('mongoose');

// Earnings schema for tracking all token transactions
const earningsSchema = new mongoose.Schema({
  // User who earned/spent the tokens
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Amount earned (positive) or spent (negative)
  amount: {
    type: Number,
    required: true,
    validate: {
      validator: function(v) {
        return v !== 0; // Amount cannot be zero
      },
      message: 'Amount cannot be zero'
    }
  },
  
  // Reason for the earning/spending
  reason: {
    type: String,
    required: true,
    enum: [
      // Earning reasons
      'post_create',
      'post_like', 
      'post_comment',
      'post_share',
      'blog_create',
      'nft_mint',
      'daily_login',
      'referral',
      'content_view',
      'ai_content_generation',
      'profile_complete',
      'email_verify',
      'first_post',
      'week_streak',
      'month_streak',
      'staking_reward',
      'contest_win',
      'achievement_unlock',
      
      // Spending reasons
      'post_boost',
      'nft_purchase',
      'premium_feature',
      'token_stake',
      'tip_user',
      'marketplace_fee',
      'withdrawal',
      'domain_purchase',
      'template_purchase'
    ],
    index: true
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed',
    index: true
  },
  
  // Additional metadata for the transaction
  metadata: {
    // Related post, blog, NFT, etc.
    relatedId: mongoose.Schema.Types.ObjectId,
    relatedType: {
      type: String,
      enum: ['post', 'blog', 'nft', 'user', 'comment', 'stake']
    },
    
    // For referrals
    referredUserId: mongoose.Schema.Types.ObjectId,
    
    // For staking
    stakeId: mongoose.Schema.Types.ObjectId,
    stakingPeriod: String,
    
    // For content interactions
    contentLength: Number,
    hashtagCount: Number,
    hasMedia: Boolean,
    
    // For boosting
    boostDuration: Number,
    boostTarget: String,
    
    // Wallet address (for blockchain transactions)
    walletAddress: String,
    
    // Blockchain transaction hash
    txHash: String,
    
    // IP address for security
    ipAddress: String,
    
    // Any additional data
    extra: mongoose.Schema.Types.Mixed
  },
  
  // Timestamp when the earning occurred
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // For batch processing or scheduled transactions
  batchId: {
    type: String,
    sparse: true
  },
  
  // Exchange rate if transaction involves conversion
  exchangeRate: {
    fromCurrency: String,
    toCurrency: String,
    rate: Number,
    timestamp: Date
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
earningsSchema.index({ userId: 1, timestamp: -1 });
earningsSchema.index({ reason: 1, timestamp: -1 });
earningsSchema.index({ status: 1, timestamp: -1 });
earningsSchema.index({ 'metadata.relatedId': 1, 'metadata.relatedType': 1 });
earningsSchema.index({ amount: 1, timestamp: -1 });

// Virtual for transaction type (earned vs spent)
earningsSchema.virtual('transactionType').get(function() {
  return this.amount > 0 ? 'earned' : 'spent';
});

// Virtual for absolute amount
earningsSchema.virtual('absoluteAmount').get(function() {
  return Math.abs(this.amount);
});

// Static methods for analytics
earningsSchema.statics.getUserTotalEarnings = async function(userId) {
  const result = await this.aggregate([
    {
      $match: { 
        userId: mongoose.Types.ObjectId(userId),
        amount: { $gt: 0 },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$amount' },
        transactionCount: { $sum: 1 }
      }
    }
  ]);
  
  return result[0] || { totalEarnings: 0, transactionCount: 0 };
};

earningsSchema.statics.getUserTotalSpent = async function(userId) {
  const result = await this.aggregate([
    {
      $match: { 
        userId: mongoose.Types.ObjectId(userId),
        amount: { $lt: 0 },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: { $abs: '$amount' } },
        transactionCount: { $sum: 1 }
      }
    }
  ]);
  
  return result[0] || { totalSpent: 0, transactionCount: 0 };
};

earningsSchema.statics.getEarningsByReason = async function(userId, dateRange = {}) {
  const matchStage = {
    userId: mongoose.Types.ObjectId(userId),
    amount: { $gt: 0 },
    status: 'completed'
  };
  
  if (dateRange.start && dateRange.end) {
    matchStage.timestamp = {
      $gte: new Date(dateRange.start),
      $lte: new Date(dateRange.end)
    };
  }
  
  return await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$reason',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        lastEarned: { $max: '$timestamp' }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);
};

earningsSchema.statics.getDailyEarnings = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        },
        earned: {
          $sum: {
            $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
          }
        },
        spent: {
          $sum: {
            $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0]
          }
        },
        net: { $sum: '$amount' },
        transactions: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);
};

// Instance methods
earningsSchema.methods.getRelatedContent = async function() {
  if (!this.metadata?.relatedId || !this.metadata?.relatedType) {
    return null;
  }
  
  const Model = mongoose.model(this.metadata.relatedType.charAt(0).toUpperCase() + 
                               this.metadata.relatedType.slice(1));
  
  return await Model.findById(this.metadata.relatedId);
};

// Pre-save middleware for validation and processing
earningsSchema.pre('save', function(next) {
  // Ensure timestamp is set
  if (!this.timestamp) {
    this.timestamp = new Date();
  }
  
  // Round amount to 2 decimal places
  this.amount = Math.round(this.amount * 100) / 100;
  
  next();
});

// Post-save middleware for updating user balance
earningsSchema.post('save', async function(doc) {
  if (doc.status === 'completed') {
    try {
      const User = mongoose.model('User');
      await User.findByIdAndUpdate(
        doc.userId,
        { 
          $inc: { tokenBalance: doc.amount },
          $set: { lastEarning: doc.timestamp }
        }
      );
    } catch (error) {
      console.error('Failed to update user balance:', error);
    }
  }
});

module.exports = mongoose.model('Earning', earningsSchema);
