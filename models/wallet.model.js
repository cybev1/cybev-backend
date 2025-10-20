const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['BLOG_POST', 'BLOG_LIKE', 'DOMAIN_SETUP', 'REFERRAL', 'BONUS', 'WITHDRAW'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  relatedBlog: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEarned: {
    type: Number,
    default: 0
  },
  totalWithdrawn: {
    type: Number,
    default: 0
  },
  transactions: [transactionSchema],
  streaks: {
    current: {
      type: Number,
      default: 0
    },
    longest: {
      type: Number,
      default: 0
    },
    lastPostDate: {
      type: Date
    }
  },
  achievements: [{
    type: String,
    enum: [
      'FIRST_POST',
      'FIRST_LIKE',
      'DOMAIN_MASTER',
      'POPULAR_AUTHOR',
      'TRENDING_WRITER',
      'VIRAL_POST',
      'WEEK_STREAK',
      'MONTH_STREAK'
    ]
  }]
}, {
  timestamps: true
});

walletSchema.methods.addTokens = function(amount, type, description, relatedBlog = null) {
  this.balance += amount;
  this.totalEarned += amount;
  this.transactions.push({
    type,
    amount,
    description,
    relatedBlog
  });
  return this.save();
};

walletSchema.methods.updateStreak = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (this.streaks.lastPostDate) {
    const lastPost = new Date(this.streaks.lastPostDate);
    lastPost.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((today - lastPost) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      this.streaks.current += 1;
      if (this.streaks.current > this.streaks.longest) {
        this.streaks.longest = this.streaks.current;
      }
    } else if (daysDiff > 1) {
      this.streaks.current = 1;
    }
  } else {
    this.streaks.current = 1;
  }
  
  this.streaks.lastPostDate = today;
  return this.save();
};

walletSchema.index({ user: 1 });
walletSchema.index({ 'transactions.timestamp': -1 });

module.exports = mongoose.model('Wallet', walletSchema);
