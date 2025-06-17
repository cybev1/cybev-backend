
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

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(process.env.PORT || 5000, () => {
      console.log('🚀 CYBEV Server running on PORT', process.env.PORT || 5000);
    });
  })
  .catch(err => console.error('❌ MongoDB connection failed:', err));
