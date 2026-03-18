// ============================================
// FILE: services/trafficSimulation.service.js
// CYBEV Traffic Simulation v3.0 — Humanized + Social Focused
// 
// Changes from v2:
//   - Loads saved social channels from User model (not scraping articles)
//   - Every session visits 1-2 social links (not 15% random)
//   - Humanized delays: reading time, scroll pauses, natural patterns
//   - Varied session patterns (bounce, read, deep-engage, social-hop)
//   - Quality over quantity: fewer concurrent, more realistic
// ============================================
const axios = require('axios');
const mongoose = require('mongoose');

let Blog, User;
try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }

const SITE_URL = process.env.SITE_URL || 'https://cybev.io';
const API_URL = process.env.API_URL || 'https://api.cybev.io';

// ─── Live Stats ───
const liveStats = {
  isRunning: false, startedAt: null,
  progress: { completed: 0, total: 0, errors: 0 },
  speed: { sessionsPerMinute: 0, avgResponseMs: 0 },
  results: { totalVisits: 0, totalViews: 0, totalClicks: 0, socialClicks: 0, avgDwellMs: 0 },
  history: [], lastError: null
};
function getLiveStats() { return { ...liveStats, elapsed: liveStats.startedAt ? Math.round((Date.now() - liveStats.startedAt) / 1000) : 0 }; }

// ─── Proxy ───
function getProxyConfig() {
  const username = process.env.BRIGHTDATA_USERNAME;
  const password = process.env.BRIGHTDATA_PASSWORD;
  if (!username || !password) return null;
  let host = 'brd.superproxy.io', port = 33335;
  if (process.env.BRIGHTDATA_ENDPOINT) {
    const parts = process.env.BRIGHTDATA_ENDPOINT.split(':');
    host = parts[0]; port = parseInt(parts[1]) || 33335;
  } else {
    host = process.env.BRIGHTDATA_HOST || host;
    port = parseInt(process.env.BRIGHTDATA_PORT || port);
  }
  return { host, port, auth: { username, password }, protocol: 'http' };
}

// ─── Human-like User Agents (weighted: desktop 60%, mobile 40%) ───
const DESKTOP_UA = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86',
];
const MOBILE_UA = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
];

// Weighted referrers: 40% Google, 20% social, 20% direct, 20% other
const REFERRERS = [
  'https://www.google.com/', 'https://www.google.com/', 'https://www.google.com/search?q=',
  'https://www.google.com/', 'https://www.google.com/search?q=',
  'https://www.facebook.com/', 'https://t.co/',
  'https://www.youtube.com/', 'https://www.linkedin.com/',
  '', '', // direct
  'https://www.bing.com/', 'https://duckduckgo.com/',
];
const LANGS = ['en-US,en;q=0.9', 'en-GB,en;q=0.9', 'en;q=0.9', 'fr-FR,fr;q=0.9,en;q=0.8', 'es;q=0.9,en;q=0.8'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min) + min);
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Human reading time: based on word count (avg 200-250 wpm)
function humanReadDelay(contentLength) {
  const words = Math.max(200, contentLength / 5); // rough word estimate
  const readTimeSec = words / 230; // 230 wpm average
  // People read 15-60% of an article, plus scroll time
  const readPortion = 0.15 + Math.random() * 0.45;
  const baseMs = readTimeSec * readPortion * 1000;
  // Add natural variance (±30%)
  return Math.max(3000, Math.min(45000, baseMs * (0.7 + Math.random() * 0.6)));
}

// ─── Page visit with human-like headers ───
async function visitPage(url, options = {}) {
  const proxy = getProxyConfig();
  const isMobile = Math.random() < 0.4;
  const ua = isMobile ? pick(MOBILE_UA) : pick(DESKTOP_UA);
  const ref = options.referrer || pick(REFERRERS);

  const config = {
    method: 'GET', url, timeout: 25000,
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': pick(LANGS),
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': ref ? 'cross-site' : 'none',
      'Sec-Fetch-User': '?1',
      'DNT': Math.random() < 0.3 ? '1' : undefined,
      'Cache-Control': Math.random() < 0.5 ? 'no-cache' : 'max-age=0',
    },
    maxRedirects: 5, validateStatus: () => true,
  };
  if (ref) config.headers['Referer'] = ref;
  // Clean undefined headers
  Object.keys(config.headers).forEach(k => { if (config.headers[k] === undefined) delete config.headers[k]; });
  if (proxy) config.proxy = proxy;

  try {
    const start = Date.now();
    const r = await axios(config);
    return { success: r.status < 400, status: r.status, elapsed: Date.now() - start, contentLength: r.data?.length || 0 };
  } catch (e) {
    return { success: false, error: e.message, elapsed: 0, contentLength: 0 };
  }
}

// ─── Register view ───
async function registerView(blogId, userId) {
  try {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId, id: userId, role: 'user' }, process.env.JWT_SECRET || 'cybev_secret_key_2024', { expiresIn: '5m' });
    await axios.post(`${API_URL}/api/blogs/${blogId}/view`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }).catch(() => {});
    return true;
  } catch { return false; }
}

// ─── Session Patterns ───
// Each session follows one of these human behavior patterns:
// 1. BOUNCE (15%): Visit page, leave after 3-8s
// 2. READER (35%): Visit page, read 15-45s, click internal link
// 3. SOCIAL_HOPPER (30%): Visit page, read, click 1-2 social links
// 4. DEEP_ENGAGE (20%): Read, click internal, then visit social, maybe homepage

async function runSession(blog, specialUser, socialChannels) {
  const r = { visits: 0, views: 0, clicks: 0, socialClicks: 0, dwellMs: 0 };
  const blogUrl = `${SITE_URL}/blog/${blog.slug || blog._id}`;

  // Determine session pattern
  const roll = Math.random();
  const pattern = roll < 0.15 ? 'bounce' : roll < 0.50 ? 'reader' : roll < 0.80 ? 'social_hopper' : 'deep_engage';

  // 1. Visit the blog page
  const ref = pick(REFERRERS);
  const v1 = await visitPage(blogUrl, { referrer: ref.includes('google') ? ref + encodeURIComponent(blog.title?.split(' ').slice(0, 3).join(' ') || '') : ref });
  if (v1.success) r.visits++;
  r.dwellMs += v1.elapsed;

  // 2. Register the view
  if (await registerView(blog._id, specialUser._id)) r.views++;

  // 3. Simulate reading based on pattern
  if (pattern === 'bounce') {
    // Quick bounce: 3-8 seconds
    const bounceTime = rand(3000, 8000);
    await delay(bounceTime);
    r.dwellMs += bounceTime;
    return r;
  }

  // Reading time (simulates scrolling + reading)
  const readTime = humanReadDelay(v1.contentLength || 5000);
  await delay(readTime);
  r.dwellMs += readTime;

  // 4. Internal link click (reader + deep_engage patterns)
  if ((pattern === 'reader' || pattern === 'deep_engage') && blog._relatedId) {
    const relUrl = `${SITE_URL}/blog/${blog._relatedSlug || blog._relatedId}`;
    // Small pause before clicking (human scans, then clicks)
    await delay(rand(800, 2500));
    const v2 = await visitPage(relUrl, { referrer: blogUrl });
    if (v2.success) r.visits++;
    r.clicks++;
    if (await registerView(blog._relatedId, specialUser._id)) r.views++;
    // Brief read on second page
    await delay(rand(4000, 15000));
    r.dwellMs += v2.elapsed + rand(4000, 15000);
  }

  // 5. Social channel visits (social_hopper + deep_engage)
  if ((pattern === 'social_hopper' || pattern === 'deep_engage') && socialChannels.length > 0) {
    // Visit 1-2 social channels
    const channelsToVisit = Math.random() < 0.5 ? 2 : 1;
    const shuffled = [...socialChannels].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(channelsToVisit, shuffled.length); i++) {
      const ch = shuffled[i];
      if (!ch.url) continue;

      // Pause like a human deciding to click (1-4 seconds)
      await delay(rand(1000, 4000));

      const sv = await visitPage(ch.url, { referrer: blogUrl });
      if (sv.success) {
        r.socialClicks++;
        r.visits++;
      }

      // Time spent on social page (3-12 seconds)
      await delay(rand(3000, 12000));
      r.dwellMs += (sv.elapsed || 0) + rand(3000, 12000);
    }
  }

  // 6. Deep engage: sometimes visit homepage at the end
  if (pattern === 'deep_engage' && Math.random() < 0.4) {
    await delay(rand(1000, 3000));
    const hv = await visitPage(SITE_URL, { referrer: blogUrl });
    if (hv.success) r.visits++;
    r.dwellMs += hv.elapsed || 0;
  }

  return r;
}

// ═══ MAIN: Humanized traffic simulation ═══
async function runTrafficSimulation(options = {}) {
  const {
    articlesCount = 10,
    visitsPerArticle = 3,
    concurrency = 5,  // Lower default for quality
    targetCategory,
    targetBlogIds
  } = options;

  if (liveStats.isRunning) return { success: false, error: 'Already running' };

  const totalSessions = articlesCount * visitsPerArticle;
  Object.assign(liveStats, {
    isRunning: true, startedAt: Date.now(),
    progress: { completed: 0, total: totalSessions, errors: 0 },
    speed: { sessionsPerMinute: 0, avgResponseMs: 0 },
    results: { totalVisits: 0, totalViews: 0, totalClicks: 0, socialClicks: 0, avgDwellMs: 0 },
    lastError: null
  });

  console.log(`🚗 Traffic sim v3: ${totalSessions} sessions, concurrency=${concurrency}, humanized`);

  // Load social channels from admin user (or first user with channels)
  let socialChannels = [];
  try {
    const usersWithChannels = await User.findOne({ seoSocialChannels: { $exists: true, $ne: [] } }).select('seoSocialChannels').lean();
    socialChannels = (usersWithChannels?.seoSocialChannels || []).filter(ch => ch.url && ch.enabled !== false);
    console.log(`🚗 Social channels loaded: ${socialChannels.length} (${socialChannels.map(c => c.platform).join(', ')})`);
  } catch (e) { console.log('No social channels:', e.message); }

  // Get blogs
  const blogQuery = { status: 'published', isDeleted: { $ne: true } };
  if (targetCategory) blogQuery.category = targetCategory;
  if (targetBlogIds?.length) blogQuery._id = { $in: targetBlogIds.map(id => { try { return new mongoose.Types.ObjectId(id); } catch { return id; } }) };

  const blogs = await Blog.find(blogQuery).sort({ createdAt: -1 }).limit(articlesCount).select('_id title slug category content').lean();
  if (!blogs.length) { liveStats.isRunning = false; return { success: false, error: 'No blogs' }; }

  // Pre-fetch related blogs
  for (const blog of blogs) {
    const related = await Blog.findOne({ _id: { $ne: blog._id }, status: 'published', isDeleted: { $ne: true }, category: blog.category }).select('_id slug').lean();
    if (related) { blog._relatedId = related._id; blog._relatedSlug = related.slug; }
  }

  // Get special users
  const users = await User.aggregate([
    { $match: { isSynthetic: true } },
    { $sample: { size: Math.min(totalSessions, 200) } },
    { $project: { _id: 1 } }
  ]);
  if (!users.length) { liveStats.isRunning = false; return { success: false, error: 'No special users' }; }

  // Build and shuffle queue
  const queue = [];
  let ui = 0;
  for (const blog of blogs) {
    for (let v = 0; v < visitsPerArticle; v++) {
      queue.push({ blog, user: users[ui % users.length] });
      ui++;
    }
  }
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  // Process in concurrent batches
  let totalDwell = 0, dwellCount = 0;
  const responseTimes = [];
  const startTime = Date.now();

  for (let i = 0; i < queue.length; i += concurrency) {
    const batch = queue.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(({ blog, user }) => runSession(blog, user, socialChannels))
    );

    for (const r of results) {
      liveStats.progress.completed++;
      if (r.status === 'fulfilled' && r.value) {
        const v = r.value;
        liveStats.results.totalVisits += v.visits;
        liveStats.results.totalViews += v.views;
        liveStats.results.totalClicks += v.clicks;
        liveStats.results.socialClicks += v.socialClicks;
        if (v.dwellMs > 0) { totalDwell += v.dwellMs; dwellCount++; }
      } else {
        liveStats.progress.errors++;
        if (r.reason) liveStats.lastError = r.reason?.message || String(r.reason);
      }
    }

    // Update metrics
    const elapsed = (Date.now() - startTime) / 1000;
    liveStats.speed.sessionsPerMinute = Math.round(liveStats.progress.completed / elapsed * 60);
    liveStats.results.avgDwellMs = dwellCount > 0 ? Math.round(totalDwell / dwellCount) : 0;

    // Human-like inter-batch pause (1-3 seconds)
    if (i + concurrency < queue.length) {
      await delay(rand(1000, 3000));
    }

    // Log progress
    if (liveStats.progress.completed % 20 === 0 || liveStats.progress.completed === totalSessions) {
      console.log(`🚗 ${liveStats.progress.completed}/${totalSessions} | ${liveStats.results.totalViews} views | ${liveStats.results.socialClicks} social | ${liveStats.speed.sessionsPerMinute} sess/min | avg dwell ${Math.round(liveStats.results.avgDwellMs / 1000)}s`);
    }
  }

  const totalElapsed = Math.round((Date.now() - startTime) / 1000);
  liveStats.isRunning = false;

  const summary = {
    completedAt: new Date().toISOString(),
    elapsed: totalElapsed, sessions: totalSessions,
    ...liveStats.results,
    avgDwellSec: Math.round(liveStats.results.avgDwellMs / 1000),
    errors: liveStats.progress.errors,
    sessionsPerMinute: liveStats.speed.sessionsPerMinute,
    socialChannelsUsed: socialChannels.length
  };
  liveStats.history.unshift(summary);
  if (liveStats.history.length > 20) liveStats.history = liveStats.history.slice(0, 20);

  console.log(`🚗 DONE: ${totalSessions} sessions in ${totalElapsed}s | ${liveStats.results.totalVisits} visits, ${liveStats.results.totalViews} views, ${liveStats.results.socialClicks} social clicks, avg dwell ${Math.round(liveStats.results.avgDwellMs / 1000)}s`);
  return { success: true, stats: summary };
}

// ═══ Cron ═══
let trafficInterval = null;
function startTrafficCron(intervalMinutes = 60) {
  if (trafficInterval) clearInterval(trafficInterval);
  if (!getProxyConfig()) { console.log('🚗 No Brightdata creds'); return; }
  trafficInterval = setInterval(async () => {
    if (liveStats.isRunning) return;
    try { await runTrafficSimulation({ articlesCount: 15, visitsPerArticle: 3, concurrency: 5 }); }
    catch (e) { console.log('Cron error:', e.message); }
  }, intervalMinutes * 60 * 1000);
  console.log(`🚗 Traffic cron started (every ${intervalMinutes} min, humanized)`);
}
function stopTrafficCron() {
  if (trafficInterval) { clearInterval(trafficInterval); trafficInterval = null; console.log('🚗 Cron stopped'); }
}

module.exports = { runTrafficSimulation, startTrafficCron, stopTrafficCron, visitPage, getProxyConfig, getLiveStats };
