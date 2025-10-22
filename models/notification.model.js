```javascript
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['like', 'comment', 'follow', 'reply', 'mention'],
    required: true
  },
  targetModel: {
    type: String,
    enum: ['Blog', 'Comment'],
    required: false
  },
  target: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel',
    required: false
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index for fetching user's unread notifications
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
```

---

### Backend - Notification Routes
