
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

// Routes
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
const impersonateRoutes = require('./routes/impersonate.routes');
const promoteRoutes = require('./routes/promote-user.routes');
const manualReportRoutes = require('./routes/report-manual.routes');
const userListRoutes = require('./routes/user-list.routes');
const toggleStatusRoutes = require('./routes/toggle-status.routes');
const auditExportRoutes = require('./routes/audit-export.routes');
const auditArchiveRoutes = require('./routes/audit-archive.routes');
const adminChartsRoutes = require('./routes/admin-charts.routes');
const adminInsightRoutes = require('./routes/admin-insight.routes');

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
app.use('/api/users', userListRoutes);
app.use('/api/users', promoteRoutes);
app.use('/api/users', toggleStatusRoutes);
app.use('/api/users', impersonateRoutes);
app.use('/api/analytics', auditExportRoutes);
app.use('/api/analytics', auditArchiveRoutes);
app.use('/api/admin', adminChartsRoutes);
app.use('/api/admin', adminInsightRoutes);
app.use('/api/analytics', manualReportRoutes);

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
