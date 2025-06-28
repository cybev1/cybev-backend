
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: String,
  content: String,
  authorId: mongoose.Schema.Types.ObjectId,
  tags: [String],
  views: { type: Number, default: 0 },
  reactions: { type: Number, default: 0 },
  boosted: { type: Boolean, default: false },
  boostCount: { type: Number, default: 0 },
  boostLogs: [
    {
      userId: String,
      date: Date
    }
  ],
  minted: { type: Boolean, default: false },
  mintTxHash: String,
  tokenId: String
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
