require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

const domainRoutes = require('./routes/domain.routes');
const stakeRoutes = require('./routes/stake.routes');
const mintRoutes = require('./routes/mint.routes'); // ✅ newly added

app.use(cors());
app.use(express.json());

app.get('/', (_, res) => res.send('CYBEV Backend is live ✅'));
app.get('/health', (_, res) => res.status(200).send('OK'));

app.use('/api/domains', domainRoutes);
app.use('/api', stakeRoutes);
app.use('/api', mintRoutes); // ✅ newly added

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(process.env.PORT || 5000, () => {
      console.log('Server running');
    });
  })
  .catch(err => console.error(err));