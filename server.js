// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
console.log('ðŸ”§ Starting CYBEV Backend...');

// ---------- CORS Configuration ----------
const allowedOrigins = [
  'http://localhost:3000',
  'https://cybev.io',
  'https://www.cybev.io',
  'https://api.cybev.io',
  /https:\/\/.*\.vercel\.app$/  // Allow all Vercel preview deployments
];

app.use(cors({
  origin: function (origin, callback) {
    console.log('ðŸŒ CORS Check - Origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      console.log('âœ… No origin - allowing');
      return callback(null, true);
    }

    // Check if origin is in allowed list or matches Vercel pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      console.log('âœ… Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('âŒ Origin blocked:', origin);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

// CORS error handler
app.use((err, req, res, next) => {
  if (err && /CORS/i.test(err.message)) {
    console.error('âŒ CORS Error:', err.message);
    return res.status(403).json({ 
      ok: false, 
      error: 'CORS blocked', 
      detail: err.message 
    });
  }
  next(err);
});

// ---------- Body parsing ----------
app.use(express.json());

// ---------- Diagnostics ----------
app.get('/check-cors', (req, res) => {
  const origin = req.headers.origin || 'no-origin';
  console.log('ðŸ” CORS Check endpoint hit from:', origin);
  res.json({ 
    ok: true, 
    message: 'CORS is working',
    origin: origin,
    allowedOrigins: allowedOrigins.map(o => o instanceof RegExp ? o.toString() : o)
  });
});

// Root + health
app.get('/', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'CYBEV Backend is live âœ…',
    timestamp: Date.now()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    status: 'healthy',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ---------- Routes ----------
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

// ---------- Error Handler ----------
app.use((err, req, res, next) => {
  console.error('ðŸ’¥ Error:', err);
  res.status(500).json({ 
    ok: false, 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// ---------- Mongo + Start ----------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('âŒ ERROR: MONGO_URI not found in environment variables');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('âœ… MongoDB connected');
    app.listen(PORT, () => {
      console.log('ðŸš€ CYBEV Server running on PORT', PORT);
      console.log('ðŸŒ Allowed origins:', allowedOrigins.map(o => o instanceof RegExp ? o.toString() : o));
    });
  })
  .catch(err => {
    console.error('âŒ MongoDB connection failed:', err);
    process.exit(1);
  });
