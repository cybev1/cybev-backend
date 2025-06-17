
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

console.log("🔧 Starting CYBEV Backend...");

const allowedOrigins = ['http://localhost:3000', 'https://app.cybev.io'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

app.get('/check-cors', (_, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.send('✅ CORS working from backend');
});

app.get('/', (_, res) => res.send('CYBEV Backend is live ✅'));
app.get('/health', (_, res) => res.status(200).send('OK'));

const domainRoutes = require('./routes/domain.routes');
const stakeRoutes = require('./routes/stake.routes');
const mintRoutes = require('./routes/mint.routes');
const mintBadgeRoutes = require('./routes/mint-badge.routes');
const boostRoutes = require('./routes/boost.routes');
const boostedRoutes = require('./routes/boosted.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const geoAnalyticsRoutes = require('./routes/geo-analytics.routes');
const postsRoutes = require('./routes/posts.routes');
const feedRoutes = require('./routes/feed.routes');
const storyRoutes = require('./routes/story.routes');
const liveRoutes = require('./routes/live.routes');
const earningsRoutes = require('./routes/earnings.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const authRoutes = require('./routes/auth.routes');
const auditRoutes = require('./routes/audit-log.routes');

app.use('/api/domains', domainRoutes);
app.use('/api', stakeRoutes);
app.use('/api', mintRoutes);
app.use('/api', mintBadgeRoutes);
app.use('/api', boostRoutes);
app.use('/api', boostedRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/analytics', geoAnalyticsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/posts', feedRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/audit', auditRoutes);

// Cron jobs
require('./cron/weeklyReport');
require('./cron/dailyAuditDigest');
require('./cron/cleanupOldAuditLogs');

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(process.env.PORT || 5000, () => {
      console.log('🚀 CYBEV Server running on PORT', process.env.PORT || 5000);
    });
  })
  .catch(err => console.error('❌ MongoDB connection failed:', err));
