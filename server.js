// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
console.log('🔧 Starting CYBEV Backend...');

// ---------- CORS (env-driven with wildcard support) ----------
const defaultWhitelist = [
  'http://localhost:3000',
  'https://*.vercel.app',
  'https://api.cybev.io',
  'https://app.cybev.io',
];

const whitelist = (process.env.CORS_WHITELIST || defaultWhitelist.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true; // allow curl/Postman/no-origin requests
  return whitelist.some(rule => {
    if (rule.includes('*')) {
      // allow subdomain wildcard like https://*.vercel.app
      const normalized = rule.replace(/^https?:\/\//, '').replace('*.', '');
      try {
        const oHost = new URL(origin).host;
        return oHost.endsWith(normalized);
      } catch {
        return false;
      }
    }
    return origin === rule;
  });
}

app.use(
  cors({
    origin(origin, cb) {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

// helpful CORS error response (so you see JSON instead of a crash)
app.use((err, _req, res, next) => {
  if (err && /CORS/i.test(err.message)) {
    return res.status(403).json({ ok: false, error: 'CORS blocked', detail: err.message });
  }
  return next(err);
});

// ---------- Body parsing ----------
app.use(express.json());

// ---------- Diagnostics ----------
app.get('/check-cors', (req, res) => {
  const origin = req.headers.origin || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.send('✅ CORS working from backend');
});

// Root + health
app.get('/', (_req, res) => res.send('CYBEV Backend is live ✅'));
app.get('/health', (_req, res) => res.status(200).send('OK'));
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- Routes ----------
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes); // /api/auth/login, /api/auth/register

// ---------- Mongo + Start ----------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI; // ensure this is set in Railway

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log('🚀 CYBEV Server running on PORT', PORT);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });
