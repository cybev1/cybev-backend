// ============================================
// FILE: server.js
// PATH: cybev-backend/server.js
// PURPOSE: Main Express server with all routes
// VERSION: 6.5.0 - Wildcard Subdomain Support
// NEW: Subdomain middleware + Site renderer
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Socket.IO setup with expanded CORS (including wildcard subdomains)
const io = socketIO(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || '*',
      'http://localhost:3000',
      'https://cybev.io',
      'https://www.cybev.io',
      /\.cybev\.io$/  // Allow ALL subdomains
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);
global.io = io;

// ==========================================
// CORS MIDDLEWARE (Includes wildcard subdomains)
// ==========================================

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost')) return callback(null, true);
    if (origin.includes('cybev.io')) return callback(null, true);
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

// ==========================================
// SUBDOMAIN MIDDLEWARE (EARLY - Before routes)
// ==========================================

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'app', 'admin', 'mail', 'smtp', 'pop', 'imap',
  'ftp', 'ssh', 'cdn', 'assets', 'static', 'media', 'img', 'images',
  'blog', 'shop', 'store', 'help', 'support', 'docs', 'status',
  'billing', 'dashboard', 'studio', 'dev', 'staging', 'test',
  'ns1', 'ns2', 'mx', 'webmail', 'cpanel', 'whm', 'autoconfig',
  'autodiscover', '_dmarc', '_domainkey', 'webdisk', 'cpcalendars', 'cpcontacts'
];

app.use((req, res, next) => {
  // Check for forwarded host from Cloudflare Worker (priority)
  const originalHost = req.headers['x-original-host'] || req.headers['x-forwarded-host'] || '';
  const directHost = req.headers.host || req.hostname || '';
  
  // Use original host if present (from Cloudflare Worker), otherwise use direct host
  const host = originalHost || directHost;
  
  // Also check for X-Subdomain header set by worker
  let subdomain = req.headers['x-subdomain'] || null;
  
  // If no X-Subdomain header, parse from host
  if (!subdomain && host.includes('cybev.io')) {
    const parts = host.split('.');
    if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'api') {
      subdomain = parts[0].toLowerCase();
    }
  }
  
  // Local development support
  if (!subdomain && host.includes('localhost')) {
    const parts = host.split('.');
    if (parts.length > 1 && !parts[0].includes('localhost')) {
      subdomain = parts[0].toLowerCase();
    }
  }
  
  req.subdomain = subdomain;
  req.originalHost = host;
  req.isSubdomainRequest = !!subdomain && !RESERVED_SUBDOMAINS.includes(subdomain);
  
  // Log subdomain requests for debugging
  if (req.isSubdomainRequest) {
    console.log(`🌐 Subdomain request: ${subdomain}.cybev.io → ${req.path}`);
  }
  
  next();
});

// ==========================================
// SUBDOMAIN SITE RENDERER (Before API routes)
// ==========================================

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (!req.isSubdomainRequest) return next();
  if (mongoose.connection.readyState !== 1) return next();
  
  try {
    const sitesCollection = mongoose.connection.db.collection('sites');
    const site = await sitesCollection.findOne({
      subdomain: req.subdomain,
      status: 'published'
    });
    
    if (!site) {
      return res.status(404).send(generateErrorPage(
        'Site Not Found',
        `The site "${req.subdomain}.cybev.io" does not exist or is not published yet.`
      ));
    }
    
    sitesCollection.updateOne({ _id: site._id }, { $inc: { views: 1 } }).catch(() => {});
    
    const html = generateSiteHTML(site);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Subdomain render error:', err);
    next();
  }
});

// ==========================================
// WEBHOOK ROUTES (BEFORE json middleware)
// ==========================================

app.use('/api/webhooks/mux', express.raw({ type: 'application/json' }));

try {
  const webhookRoutes = require('./routes/webhooks.routes');
  app.use('/api/webhooks', webhookRoutes);
  console.log('✅ Webhook routes loaded');
} catch (err) {
  console.log('⚠️ Webhook routes not found:', err.message);
}

// ==========================================
// JSON MIDDLEWARE
// ==========================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}${req.subdomain ? ` [${req.subdomain}]` : ''}`);
  next();
});

// ==========================================
// DATABASE CONNECTION
// ==========================================

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set!');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB error:', err.message));
}

mongoose.connection.on('connected', () => console.log('📦 MongoDB connected'));
mongoose.connection.on('error', (err) => console.error('📦 MongoDB error:', err.message));
mongoose.connection.on('disconnected', () => console.log('📦 MongoDB disconnected'));

// ==========================================
// CONFIGURATION CHECKS
// ==========================================

const MUX_CONFIGURED = !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);
const MUX_WEBHOOK_CONFIGURED = !!process.env.MUX_WEBHOOK_SECRET;
const GOOGLE_OAUTH_CONFIGURED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const FACEBOOK_OAUTH_CONFIGURED = !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
const APPLE_OAUTH_CONFIGURED = !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_KEY_ID);
const BREVO_CONFIGURED = !!process.env.BREVO_API_KEY;
const EMAIL_PROVIDER = BREVO_CONFIGURED ? 'brevo' : 'console';
const EMAIL_SENDER = process.env.BREVO_SENDER_EMAIL || 'noreply@cybev.io';
const FLUTTERWAVE_CONFIGURED = !!process.env.FLUTTERWAVE_SECRET_KEY;
const PAYSTACK_CONFIGURED = !!process.env.PAYSTACK_SECRET_KEY;
const STRIPE_CONFIGURED = !!process.env.STRIPE_SECRET_KEY;
const HUBTEL_CONFIGURED = !!(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET);
const DOMAIN_API_CONFIGURED = !!(process.env.DOMAIN_API_USERNAME && process.env.DOMAIN_API_PASSWORD);

const configuredPayments = [
  FLUTTERWAVE_CONFIGURED && 'flutterwave',
  PAYSTACK_CONFIGURED && 'paystack',
  STRIPE_CONFIGURED && 'stripe',
  HUBTEL_CONFIGURED && 'hubtel'
].filter(Boolean);

console.log(`🎬 Mux: ${MUX_CONFIGURED ? 'Configured' : 'Not configured'}`);
console.log(`🔐 Google OAuth: ${GOOGLE_OAUTH_CONFIGURED ? 'Configured' : 'Not configured'}`);
console.log(`🔐 Facebook OAuth: ${FACEBOOK_OAUTH_CONFIGURED ? 'Configured' : 'Not configured'}`);
console.log(`📧 Email: ${BREVO_CONFIGURED ? 'Brevo' : 'Console'}`);
console.log(`💰 Payments: ${configuredPayments.length > 0 ? configuredPayments.join(', ') : 'None'}`);

// ==========================================
// ALL API ROUTES
// ==========================================

const routes = [
  ['auth', '/api/auth', './routes/auth.routes'],
  ['oauth', '/api/auth', './routes/oauth.routes'],
  ['user', '/api/users', './routes/user.routes'],
  ['user-alt', '/api/user', './routes/user.routes'],
  ['user-profile', '/api/users', './routes/user-profile.routes'],
  ['notification-prefs', '/api/notifications', './routes/notification.preferences.routes'],
  ['blogs-my', '/api/blogs', './routes/blogs-my.routes'],
  ['blog', '/api/blogs', './routes/blog.routes'],
  ['blogsite', '/api/blogsites', './routes/blogsite.routes'],
  ['posts', '/api/posts', './routes/posts.routes'],
  ['feed', '/api/feed', './routes/feed.routes'],
  ['comments', '/api/comments', './routes/comment.routes'],
  ['bookmarks', '/api/bookmarks', './routes/bookmark.routes'],
  ['notifications', '/api/notifications', './routes/notification.routes'],
  ['notifications-adv', '/api/notifications', './routes/notifications-advanced.routes'],
  ['reactions', '/api/reactions', './routes/reaction.routes'],
  ['messages', '/api/messages', './routes/message.routes'],
  ['live', '/api/live', './routes/live.routes'],
  ['webrtc', '/api/webrtc', './routes/webrtc.routes'],
  ['stream-schedule', '/api/streams', './routes/stream-schedule.routes'],
  ['nft', '/api/nft', './routes/nft.routes'],
  ['mint', '/api/mint', './routes/mint.routes'],
  ['mint-badge', '/api/mint-badge', './routes/mint-badge.routes'],
  ['staking', '/api/staking', './routes/staking.routes'],
  ['admin', '/api/admin', './routes/admin.routes'],
  ['admin-charts', '/api/admin/charts', './routes/admin-charts.routes'],
  ['admin-summary', '/api/admin', './routes/admin-summary.routes'],
  ['admin-insight', '/api/admin', './routes/admin-insight.routes'],
  ['push', '/api/push', './routes/push.routes'],
  ['mobile', '/api/mobile', './routes/mobile.routes'],
  ['vlog', '/api/vlogs', './routes/vlog.routes'],
  ['vlog-alt', '/api/vlog', './routes/vlog.routes'],
  ['tipping', '/api/tips', './routes/tipping.routes'],
  ['subscription', '/api/subscriptions', './routes/subscription.routes'],
  ['earnings', '/api/earnings', './routes/earnings.routes'],
  ['content', '/api/content', './routes/content.routes'],
  ['ai', '/api/ai', './routes/ai.routes'],
  ['ai-site', '/api/ai', './routes/ai-site.routes'],
  ['share', '/api/share', './routes/share.routes'],
  ['share-alt', '/api/shares', './routes/share.routes'],
  ['reward', '/api/rewards', './routes/reward.routes'],
  ['leaderboard', '/api/leaderboard', './routes/leaderboard.routes'],
  ['story', '/api/stories', './routes/story.routes'],
  ['monetization', '/api/monetization', './routes/monetization.routes'],
  ['sites-my', '/api/sites', './routes/sites-my.routes'],
  ['sites', '/api/sites', './routes/sites.routes'],
  ['seo', '/api/seo', './routes/seo.routes'],
  ['events', '/api/events', './routes/events.routes'],
  ['group-enhanced', '/api/groups', './routes/group-enhanced.routes'],
  ['moderation', '/api/moderation', './routes/moderation.routes'],
  ['analytics-enhanced', '/api/analytics', './routes/analytics-enhanced.routes'],
  ['i18n', '/api/i18n', './routes/i18n.routes'],
  ['hashtag', '/api/hashtags', './routes/hashtag.routes'],
  ['search', '/api/search', './routes/search.routes'],
  ['payments', '/api/payments', './routes/payments.routes'],
  ['wallet', '/api/wallet', './routes/wallet.routes'],
  ['upload', '/api/upload', './routes/upload.routes'],
  ['follow-check', '/api/follow', './routes/follow-check.routes'],
  ['follow', '/api/follow', './routes/follow.routes'],
  ['domain', '/api/domain', './routes/domain.routes'],
  ['domain-alt', '/api/domains', './routes/domain.routes'],
  ['analytics', '/api/analytics', './routes/analytics.routes'],
  ['creator-analytics', '/api/creator-analytics', './routes/creator-analytics.routes'],
  ['group', '/api/groups', './routes/group.routes'],
  ['marketplace', '/api/marketplace', './routes/marketplace.routes'],
  ['church', '/api/church', './routes/church.routes']  // Online Church Management System
];

routes.forEach(([name, path, file]) => {
  try {
    app.use(path, require(file));
    console.log(`✅ ${name} routes loaded`);
  } catch (err) {
    console.log(`⚠️ ${name} routes not found:`, err.message);
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: '6.5.0',
    subdomain: req.subdomain || null,
    wildcardSubdomains: 'enabled',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'CYBEV API Server v6.5.0',
    wildcardSubdomains: 'enabled',
    subdomain: req.subdomain || null
  });
});

// ==========================================
// SOCKET.IO EVENTS
// ==========================================

io.on('connection', (socket) => {
  console.log('🔌 Connected:', socket.id);
  
  socket.on('join', (userId) => socket.join(`user:${userId}`));
  socket.on('join-conversation', (id) => socket.join(`conversation:${id}`));
  socket.on('leave-conversation', (id) => socket.leave(`conversation:${id}`));
  socket.on('typing', ({ conversationId, userId, isTyping }) => {
    socket.to(`conversation:${conversationId}`).emit('user-typing', { userId, isTyping });
  });
  socket.on('join-stream', (id) => {
    socket.join(`stream:${id}`);
    socket.to(`stream:${id}`).emit('viewer-joined', { socketId: socket.id });
  });
  socket.on('leave-stream', (id) => {
    socket.leave(`stream:${id}`);
    socket.to(`stream:${id}`).emit('viewer-left', { socketId: socket.id });
  });
  socket.on('stream-chat', ({ streamId, message }) => io.to(`stream:${streamId}`).emit('chat-message', message));
  socket.on('stream-reaction', ({ streamId, emoji, userId }) => io.to(`stream:${streamId}`).emit('reaction', { emoji, userId }));
  socket.on('disconnect', () => console.log('🔌 Disconnected:', socket.id));
});

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ ok: false, error: 'Server error' });
});

// ==========================================
// SITE HTML GENERATOR
// ==========================================

function generateSiteHTML(site) {
  const theme = site.theme || {};
  const primary = theme.colors?.primary || '#7c3aed';
  const secondary = theme.colors?.secondary || '#ec4899';
  const fontH = theme.fonts?.heading || 'Inter';
  const fontB = theme.fonts?.body || 'Inter';
  const blocks = site.blocks || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(site.ogTitle || site.name)}</title>
  <meta name="description" content="${esc(site.description || '')}">
  <meta property="og:title" content="${esc(site.ogTitle || site.name)}">
  <meta property="og:description" content="${esc(site.description || '')}">
  ${site.ogImage ? `<meta property="og:image" content="${esc(site.ogImage)}">` : ''}
  <meta property="og:url" content="https://${site.subdomain}.cybev.io">
  ${site.favicon ? `<link rel="icon" href="${esc(site.favicon)}">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=${fontH.replace(/ /g, '+')}:wght@400;600;700&family=${fontB.replace(/ /g, '+')}:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    :root{--p:${primary};--s:${secondary}}
    body{font-family:'${fontB}',sans-serif}
    h1,h2,h3,h4,h5,h6{font-family:'${fontH}',sans-serif}
    .bg-grad{background:linear-gradient(135deg,var(--p),var(--s))}
    .text-p{color:var(--p)}
    ${site.customCss || ''}
  </style>
  ${site.customHead || ''}
  ${site.googleAnalytics ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(site.googleAnalytics)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(site.googleAnalytics)}');</script>` : ''}
</head>
<body class="antialiased">
  <nav class="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold">${esc(site.name)}</a>
      <div class="flex gap-6"><a href="/" class="text-gray-600 hover:text-gray-900">Home</a><a href="#contact" class="text-gray-600 hover:text-gray-900">Contact</a></div>
    </div>
  </nav>
  <main class="pt-16">${blocks.map(b => renderBlock(b, {primary, secondary})).join('')}</main>
  <div class="py-4 text-center text-gray-400 text-sm border-t">Powered by <a href="https://cybev.io" class="text-p hover:underline">CYBEV</a></div>
  <script>lucide.createIcons();</script>
</body>
</html>`;
}

function renderBlock(block, t) {
  const {type, content: c} = block;
  if (!c) return '';
  
  switch(type) {
    case 'hero':
      const bg = c.backgroundImage 
        ? `background:linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)),url('${esc(c.backgroundImage)}');background-size:cover;background-position:center`
        : `background:linear-gradient(135deg,${t.primary},${t.secondary})`;
      return `<section class="min-h-[70vh] flex items-center justify-center text-white" style="${bg}">
        <div class="max-w-4xl mx-auto px-6 text-center">
          <h1 class="text-4xl md:text-6xl font-bold mb-6">${esc(c.title)}</h1>
          <p class="text-xl md:text-2xl opacity-90 mb-8">${esc(c.subtitle)}</p>
          ${c.buttonText ? `<a href="${esc(c.buttonLink||'#')}" class="inline-block px-8 py-4 bg-white text-gray-900 rounded-full font-semibold hover:bg-gray-100">${esc(c.buttonText)}</a>` : ''}
        </div>
      </section>`;
      
    case 'features':
      return `<section class="py-20 px-6 bg-gray-50">
        <div class="max-w-6xl mx-auto">
          ${c.title ? `<h2 class="text-3xl md:text-4xl font-bold text-center mb-12">${esc(c.title)}</h2>` : ''}
          <div class="grid md:grid-cols-3 gap-8">
            ${(c.items||[]).map(i => `<div class="bg-white p-8 rounded-2xl shadow-sm text-center">
              <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style="background:${t.primary}15">
                <i data-lucide="${i.icon||'zap'}" class="w-8 h-8" style="color:${t.primary}"></i>
              </div>
              <h3 class="text-xl font-bold mb-3">${esc(i.title)}</h3>
              <p class="text-gray-600">${esc(i.description)}</p>
            </div>`).join('')}
          </div>
        </div>
      </section>`;
      
    case 'cta':
      return `<section class="py-20 px-6 text-white bg-grad">
        <div class="max-w-4xl mx-auto text-center">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${esc(c.title)}</h2>
          <p class="text-xl opacity-90 mb-8">${esc(c.description)}</p>
          ${c.buttonText ? `<a href="${esc(c.buttonLink||'#')}" class="inline-block px-8 py-4 bg-white text-gray-900 rounded-full font-semibold">${esc(c.buttonText)}</a>` : ''}
        </div>
      </section>`;
      
    case 'testimonials':
      return `<section class="py-20 px-6">
        <div class="max-w-6xl mx-auto">
          ${c.title ? `<h2 class="text-3xl font-bold text-center mb-12">${esc(c.title)}</h2>` : ''}
          <div class="grid md:grid-cols-3 gap-8">
            ${(c.items||[]).map(i => `<div class="bg-white p-8 rounded-2xl shadow-sm border">
              <div class="flex gap-1 mb-4">${'<i data-lucide="star" class="w-5 h-5 fill-yellow-400 text-yellow-400"></i>'.repeat(5)}</div>
              <p class="text-gray-700 mb-6 italic">"${esc(i.quote)}"</p>
              <div class="flex items-center gap-4">
                ${i.avatar ? `<img src="${esc(i.avatar)}" class="w-12 h-12 rounded-full object-cover">` : ''}
                <div><p class="font-semibold">${esc(i.name)}</p><p class="text-sm text-gray-500">${esc(i.role)}</p></div>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </section>`;
      
    case 'contact':
      return `<section id="contact" class="py-20 px-6 bg-gray-900 text-white">
        <div class="max-w-6xl mx-auto text-center">
          <h2 class="text-3xl font-bold mb-12">${esc(c.title||'Contact')}</h2>
          <div class="grid md:grid-cols-3 gap-8">
            ${c.email ? `<div><div class="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="mail" class="w-6 h-6"></i></div><p>${esc(c.email)}</p></div>` : ''}
            ${c.phone ? `<div><div class="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="phone" class="w-6 h-6"></i></div><p>${esc(c.phone)}</p></div>` : ''}
            ${c.address ? `<div><div class="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="map-pin" class="w-6 h-6"></i></div><p>${esc(c.address)}</p></div>` : ''}
          </div>
        </div>
      </section>`;
      
    case 'footer':
      return `<footer class="py-12 px-6 bg-gray-900 text-white">
        <div class="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div class="font-bold">${esc(c.logo||'')}</div>
          <div class="flex gap-6">${(c.links||[]).map(l => `<a href="${esc(l.url||'#')}" class="text-gray-400 hover:text-white">${esc(l.label)}</a>`).join('')}</div>
        </div>
        <div class="mt-8 text-center text-gray-500">${esc(c.copyright||'')}</div>
      </footer>`;
      
    case 'stats':
      return `<section class="py-16 px-6 text-white bg-grad">
        <div class="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          ${(c.items||[]).map(i => `<div><div class="text-4xl font-bold mb-2">${esc(i.value)}</div><div class="opacity-80">${esc(i.label)}</div></div>`).join('')}
        </div>
      </section>`;
      
    case 'gallery':
      return `<section class="py-20 px-6">
        <div class="max-w-6xl mx-auto">
          ${c.title ? `<h2 class="text-3xl font-bold text-center mb-12">${esc(c.title)}</h2>` : ''}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${(c.images||[]).map((img,i) => `<div class="aspect-square rounded-xl overflow-hidden"><img src="${esc(img.src||img)}" alt="Gallery ${i+1}" class="w-full h-full object-cover hover:scale-110 transition duration-500"></div>`).join('')}
          </div>
        </div>
      </section>`;
      
    default: return '';
  }
}

function generateErrorPage(title, msg) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="min-h-screen flex items-center justify-center bg-gray-50"><div class="text-center px-6"><h1 class="text-4xl font-bold mb-4">${title}</h1><p class="text-gray-600 mb-8">${msg}</p><a href="https://cybev.io" class="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold">Go to CYBEV</a></div></body></html>`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         CYBEV API Server v6.5.0           ║
╠═══════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}           ║
║  📦 MongoDB: ${MONGODB_URI ? 'Configured' : 'Not configured'}            ║
║  🔌 Socket.IO: Enabled                    ║
║  🌐 Wildcard Subdomains: ENABLED          ║
║  🎬 Mux Streaming: ${MUX_CONFIGURED ? 'Enabled' : 'Disabled'}              ║
║  📼 Mux Recording: ${MUX_WEBHOOK_CONFIGURED ? 'Enabled' : 'Disabled'}              ║
║  🔐 Google OAuth: ${GOOGLE_OAUTH_CONFIGURED ? 'Enabled' : 'Disabled'}              ║
║  🔐 Facebook OAuth: ${FACEBOOK_OAUTH_CONFIGURED ? 'Enabled' : 'Disabled'}            ║
║  📧 Email (Brevo): ${BREVO_CONFIGURED ? 'Enabled' : 'Disabled'}              ║
║  💰 Payments: ${configuredPayments.length > 0 ? configuredPayments.length + ' providers' : 'Disabled'}             ║
║  🌐 Domain API: ${DOMAIN_API_CONFIGURED ? 'Enabled' : 'Disabled'}               ║
║  📊 Website Builder: Enabled              ║
║  🤖 AI Site Generation: Enabled           ║
║  📅 ${new Date().toISOString()}  ║
╚═══════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
