// ============================================
// FILE: services/trafficSimulation.service.js
// CYBEV Traffic Simulation v2.0 — Concurrent + Analytics
// ============================================
const axios = require('axios');
const mongoose = require('mongoose');

let Blog, User;
try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }

const SITE_URL = process.env.SITE_URL || 'https://cybev.io';
const API_URL = process.env.API_URL || 'https://api.cybev.io';

// ─── Live Stats (in-memory, queryable by admin) ───
const liveStats = {
  isRunning: false,
  startedAt: null,
  progress: { completed: 0, total: 0, errors: 0 },
  speed: { sessionsPerMinute: 0, avgResponseMs: 0 },
  results: { totalVisits: 0, totalViews: 0, totalClicks: 0, socialClicks: 0 },
  history: [], // last 20 batch results
  lastError: null
};

function getLiveStats() { return { ...liveStats, elapsed: liveStats.startedAt ? Math.round((Date.now() - liveStats.startedAt) / 1000) : 0 }; }

// ─── Brightdata Proxy Config ───
function getProxyConfig() {
  const username = process.env.BRIGHTDATA_USERNAME;
  const password = process.env.BRIGHTDATA_PASSWORD;
  if (!username || !password) return null;

  let host = 'brd.superproxy.io', port = 33335;
  if (process.env.BRIGHTDATA_ENDPOINT) {
    const parts = process.env.BRIGHTDATA_ENDPOINT.split(':');
    host = parts[0];
    port = parseInt(parts[1]) || 33335;
  } else {
    host = process.env.BRIGHTDATA_HOST || 'brd.superproxy.io';
    port = parseInt(process.env.BRIGHTDATA_PORT || '33335');
  }
  return { host, port, auth: { username, password }, protocol: 'http' };
}

// ─── Realistic Headers ───
const UA = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/131.0.6778.135 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Edg/131.0.2903.86',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.6778.135 Mobile Safari/537.36',
];
const REFS = ['https://www.google.com/', 'https://www.google.com/search?q=', 'https://www.facebook.com/', 'https://t.co/', 'https://www.bing.com/', 'https://www.youtube.com/', '', '', ''];
const LANGS = ['en-US,en;q=0.9', 'en-GB,en;q=0.9', 'fr-FR,fr;q=0.9,en;q=0.8', 'es-ES,es;q=0.9,en;q=0.8', 'pt-BR,pt;q=0.9,en;q=0.8'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Visit a page ───
async function visitPage(url, options = {}) {
  const proxy = getProxyConfig();
  const config = {
    method: 'GET', url, timeout: 20000,
    headers: {
      'User-Agent': pick(UA),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': pick(LANGS),
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    maxRedirects: 5, validateStatus: () => true,
  };
  if (options.referrer) config.headers['Referer'] = options.referrer;
  if (proxy) config.proxy = proxy;

  try {
    const start = Date.now();
    const r = await axios(config);
    return { success: r.status < 400, status: r.status, elapsed: Date.now() - start };
  } catch (e) {
    return { success: false, error: e.message, elapsed: 0 };
  }
}

// ─── Register view via API ───
async function registerView(blogId, userId) {
  try {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId, id: userId, role: 'user' }, process.env.JWT_SECRET || 'cybev_secret_key_2024', { expiresIn: '5m' });
    await axios.post(`${API_URL}/api/blogs/${blogId}/view`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }).catch(() => {});
    return true;
  } catch { return false; }
}

// ─── Single browsing session (optimized: ~2-5s per session) ───
async function runSession(blog, specialUser) {
  const r = { visits: 0, views: 0, clicks: 0, socialClicks: 0, responseMs: 0 };
  const blogUrl = `${SITE_URL}/blog/${blog.slug || blog._id}`;

  // 1. Visit blog through proxy
  const v1 = await visitPage(blogUrl, { referrer: pick(REFS) });
  if (v1.success) r.visits++;
  r.responseMs = v1.elapsed || 0;

  // 2. Register view
  if (await registerView(blog._id, specialUser._id)) r.views++;

  // 3. Brief dwell (200-800ms — just enough for realistic timing)
  await delay(200 + Math.random() * 600);

  // 4. Click internal link (40% chance)
  if (Math.random() < 0.4 && blog._relatedId) {
    const relUrl = `${SITE_URL}/blog/${blog._relatedSlug || blog._relatedId}`;
    const v2 = await visitPage(relUrl, { referrer: blogUrl });
    if (v2.success) r.visits++;
    r.clicks++;
    if (await registerView(blog._relatedId, specialUser._id)) r.views++;
  }

  // 5. Click social link (15% chance)
  if (Math.random() < 0.15 && blog._socialLink) {
    await visitPage(blog._socialLink, { referrer: blogUrl }).catch(() => {});
    r.socialClicks++;
  }

  return r;
}

// ═══ MAIN: Concurrent traffic simulation ═══
async function runTrafficSimulation(options = {}) {
  const {
    articlesCount = 10,
    visitsPerArticle = 3,
    concurrency = 15,       // Run 15 sessions in parallel
    targetCategory,
    targetBlogIds
  } = options;

  if (liveStats.isRunning) {
    return { success: false, error: 'Simulation already running' };
  }

  // Reset stats
  const totalSessions = articlesCount * visitsPerArticle;
  Object.assign(liveStats, {
    isRunning: true, startedAt: Date.now(),
    progress: { completed: 0, total: totalSessions, errors: 0 },
    speed: { sessionsPerMinute: 0, avgResponseMs: 0 },
    results: { totalVisits: 0, totalViews: 0, totalClicks: 0, socialClicks: 0 },
    lastError: null
  });

  console.log(`🚗 Traffic sim: ${totalSessions} sessions (${articlesCount}×${visitsPerArticle}), concurrency=${concurrency}`);

  // Get target blogs
  const blogQuery = { status: 'published', isDeleted: { $ne: true } };
  if (targetCategory) blogQuery.category = targetCategory;
  if (targetBlogIds?.length) blogQuery._id = { $in: targetBlogIds.map(id => new mongoose.Types.ObjectId(id)) };

  const blogs = await Blog.find(blogQuery)
    .sort({ createdAt: -1 }).limit(articlesCount)
    .select('_id title slug category content').lean();

  if (!blogs.length) {
    liveStats.isRunning = false;
    return { success: false, error: 'No blogs found' };
  }

  // Pre-fetch related blogs for internal linking
  for (const blog of blogs) {
    const related = await Blog.findOne({
      _id: { $ne: blog._id }, status: 'published', isDeleted: { $ne: true }, category: blog.category
    }).select('_id slug').lean();
    if (related) { blog._relatedId = related._id; blog._relatedSlug = related.slug; }

    // Extract first social link from content
    const socialMatch = (blog.content || '').match(/href="(https?:\/\/(www\.)?(youtube|facebook|instagram|tiktok|twitter|x)\.com[^"]*)/i);
    if (socialMatch) blog._socialLink = socialMatch[1];
  }

  // Get special users
  const users = await User.aggregate([
    { $match: { isSynthetic: true } },
    { $sample: { size: Math.min(totalSessions, 200) } },
    { $project: { _id: 1 } }
  ]);

  if (!users.length) {
    liveStats.isRunning = false;
    return { success: false, error: 'No special users' };
  }

  // Build session queue
  const queue = [];
  let ui = 0;
  for (const blog of blogs) {
    for (let v = 0; v < visitsPerArticle; v++) {
      queue.push({ blog, user: users[ui % users.length] });
      ui++;
    }
  }

  // Shuffle queue for natural distribution
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  // Process in concurrent batches
  let responseTimes = [];
  const startTime = Date.now();

  for (let i = 0; i < queue.length; i += concurrency) {
    const batch = queue.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(({ blog, user }) => runSession(blog, user))
    );

    for (const r of results) {
      liveStats.progress.completed++;
      if (r.status === 'fulfilled' && r.value) {
        liveStats.results.totalVisits += r.value.visits;
        liveStats.results.totalViews += r.value.views;
        liveStats.results.totalClicks += r.value.clicks;
        liveStats.results.socialClicks += r.value.socialClicks;
        if (r.value.responseMs > 0) responseTimes.push(r.value.responseMs);
      } else {
        liveStats.progress.errors++;
        if (r.reason) liveStats.lastError = r.reason?.message || String(r.reason);
      }
    }

    // Update speed metrics
    const elapsed = (Date.now() - startTime) / 1000;
    liveStats.speed.sessionsPerMinute = Math.round(liveStats.progress.completed / elapsed * 60);
    liveStats.speed.avgResponseMs = responseTimes.length
      ? Math.round(responseTimes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(responseTimes.length, 50))
      : 0;

    // Small inter-batch delay (200-500ms) to avoid proxy rate limits
    if (i + concurrency < queue.length) {
      await delay(200 + Math.random() * 300);
    }

    // Log progress every 50 sessions
    if (liveStats.progress.completed % 50 === 0 || liveStats.progress.completed === totalSessions) {
      console.log(`🚗 Progress: ${liveStats.progress.completed}/${totalSessions} | ${liveStats.speed.sessionsPerMinute} sess/min | ${liveStats.results.totalViews} views | ${liveStats.progress.errors} errors`);
    }
  }

  const totalElapsed = Math.round((Date.now() - startTime) / 1000);
  liveStats.isRunning = false;

  // Save to history
  const summary = {
    completedAt: new Date().toISOString(),
    elapsed: totalElapsed,
    sessions: totalSessions,
    ...liveStats.results,
    errors: liveStats.progress.errors,
    sessionsPerMinute: liveStats.speed.sessionsPerMinute
  };
  liveStats.history.unshift(summary);
  if (liveStats.history.length > 20) liveStats.history = liveStats.history.slice(0, 20);

  console.log(`🚗 DONE: ${totalSessions} sessions in ${totalElapsed}s (${liveStats.speed.sessionsPerMinute} sess/min) | ${liveStats.results.totalVisits} visits, ${liveStats.results.totalViews} views, ${liveStats.results.totalClicks} clicks`);

  return { success: true, stats: summary };
}

// ═══ Cron ═══
let trafficInterval = null;

function startTrafficCron(intervalMinutes = 60) {
  if (trafficInterval) clearInterval(trafficInterval);
  if (!getProxyConfig()) { console.log('🚗 No Brightdata credentials'); return; }

  trafficInterval = setInterval(async () => {
    if (liveStats.isRunning) return; // Skip if already running
    try { await runTrafficSimulation({ articlesCount: 15, visitsPerArticle: 5, concurrency: 10 }); }
    catch (e) { console.log('Traffic cron error:', e.message); }
  }, intervalMinutes * 60 * 1000);

  console.log(`🚗 Traffic cron started (every ${intervalMinutes} min)`);
}

function stopTrafficCron() {
  if (trafficInterval) { clearInterval(trafficInterval); trafficInterval = null; console.log('🚗 Traffic cron stopped'); }
}

module.exports = { runTrafficSimulation, startTrafficCron, stopTrafficCron, visitPage, getProxyConfig, getLiveStats };
