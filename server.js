require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

const domainRoutes = require('./routes/domain.routes');
const stakeRoutes = require('./routes/stake.routes');
const mintRoutes = require('./routes/mint.routes');
const mintBadgeRoutes = require('./routes/mint-badge.routes');
const boostRoutes = require('./routes/boost.routes');
const boostedRoutes = require('./routes/boosted.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const postsRoutes = require('./routes/posts.routes');
const feedRoutes = require('./routes/feed.routes');
const storyRoutes = require('./routes/story.routes');
const liveRoutes = require('./routes/live.routes');
const earningsRoutes = require('./routes/earnings.routes');
const notificationsRoutes = require('./routes/notifications.routes');

app.use(cors());
app.use(express.json());

app.get('/', (_, res) => res.send('CYBEV Backend is live ✅'));
app.get('/health', (_, res) => res.status(200).send('OK'));

app.use('/api/domains', domainRoutes);
app.use('/api', stakeRoutes);
app.use('/api', mintRoutes);
app.use('/api', mintBadgeRoutes);
app.use('/api', boostRoutes);
app.use('/api', boostedRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/posts', feedRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/notifications', notificationsRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(process.env.PORT || 5000, () => {
      console.log('Server running');
    });
  })
  .catch(err => console.error(err));
