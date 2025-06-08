const mongoose = require('mongoose');

const StakeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  lockPeriod: { type: Number, required: true }, // in days
  startDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  rewardsEarned: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Stake', StakeSchema);