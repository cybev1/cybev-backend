const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reaction: { type: String, default: 'like' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CommentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const PostSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, default: '' },
    content: { type: String, required: true },

    // Simple media support (optional)
    imageUrl: { type: String, default: '' },
    videoUrl: { type: String, default: '' },

    // Classification
    postType: { type: String, enum: ['post', 'story', 'update'], default: 'post' },
    isAIGenerated: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },

    // Engagement
    likes: { type: [LikeSchema], default: [] },
    comments: { type: [CommentSchema], default: [] },
    shareCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },

    // Monetization / gamification (optional)
    tokensEarned: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PostSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', PostSchema);
