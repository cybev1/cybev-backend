// backend/config/cors.js
const cors = require('cors');

const defaultWhitelist = [
  'http://localhost:3000',
  'https://*.vercel.app',
  'https://api.cybev.io',
  'https://app.cybev.io'
];

const whitelist = (process.env.CORS_WHITELIST || defaultWhitelist.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function originAllowed(origin) {
  if (!origin) return true; // allow curl/Postman
  return whitelist.some(rule => {
    if (rule.includes('*')) {
      const r = rule.replace(/^https?:\/\//, '').replace('*.', '');
      return origin.endsWith(r);
    }
    return origin === rule;
  });
}

const corsMiddleware = cors({
  origin(origin, cb) {
    if (originAllowed(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
});

module.exports = { corsMiddleware, whitelist };
