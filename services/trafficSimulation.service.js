// ============================================
// FILE: services/trafficSimulation.service.js
// CYBEV SEO Traffic Simulation — Brightdata Powered
// VERSION: 1.0
// 
// Special Users visit blog articles through Brightdata
// residential proxies, simulating real human traffic.
// They visit pages, click internal links, and interact
// with content to build real traffic signals.
// ============================================
const axios = require('axios');
const mongoose = require('mongoose');

let Blog, User;
try { Blog = require('../models/blog.model'); } catch { Blog = mongoose.model('Blog'); }
try { User = require('../models/user.model'); } catch { User = mongoose.model('User'); }

const SITE_URL = process.env.SITE_URL || 'https://cybev.io';
const API_URL = process.env.API_URL || 'https://api.cybev.io';

// ─── Brightdata Proxy Config ───
// Set these in Railway env vars:
//   BRIGHTDATA_HOST=brd.superproxy.io
//   BRIGHTDATA_PORT=22225
//   BRIGHTDATA_USERNAME=brd-customer-XXXX-zone-residential
//   BRIGHTDATA_PASSWORD=XXXX
function getProxyConfig() {
  const host = process.env.BRIGHTDATA_HOST || 'brd.superproxy.io';
  const port = process.env.BRIGHTDATA_PORT || '22225';
  const username = process.env.BRIGHTDATA_USERNAME;
  const password = process.env.BRIGHTDATA_PASSWORD;

  if (!username || !password) return null;

  return {
    host,
    port: parseInt(port),
    auth: { username, password },
    protocol: 'http'
  };
}

// ─── Realistic User Agents ───
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const REFERRERS = [
  'https://www.google.com/', 'https://www.google.com/search?q=',
  'https://www.facebook.com/', 'https://t.co/', 'https://www.bing.com/',
  'https://www.youtube.com/', 'https://www.linkedin.com/',
  '', '', '', // Direct visits (no referrer)
];

const LANGUAGES = ['en-US,en;q=0.9', 'en-GB,en;q=0.9', 'en;q=0.9', 'fr-FR,fr;q=0.9,en;q=0.8', 'es-ES,es;q=0.9,en;q=0.8', 'pt-BR,pt;q=0.9,en;q=0.8', 'de-DE,de;q=0.9,en;q=0.8'];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomDelay(min, max) { return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min) + min))); }

// ─── Simulate a single page visit ───
async function visitPage(url, options = {}) {
  const proxy = getProxyConfig();
  const ua = randomItem(USER_AGENTS);
  const ref = options.referrer || randomItem(REFERRERS);
  const lang = randomItem(LANGUAGES);

  const config = {
    method: 'GET',
    url,
    timeout: 30000,
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': lang,
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': ref ? 'cross-site' : 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
    maxRedirects: 5,
    validateStatus: () => true, // Accept any status
  };

  if (ref) config.headers['Referer'] = ref;
  if (proxy) config.proxy = proxy;

  try {
    const start = Date.now();
    const response = await axios(config);
    const elapsed = Date.now() - start;
    return { success: response.status < 400, status: response.status, elapsed, url };
  } catch (e) {
    return { success: false, error: e.message, url };
  }
}

// ─── Register a view on the API (as a special user) ───
async function registerView(blogId, userId) {
  try {
    // Create a temporary JWT for the special user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId, id: userId, role: 'user' },
      process.env.JWT_SECRET || 'cybev_secret_key_2024',
      { expiresIn: '5m' }
    );

    await axios.post(`${API_URL}/api/blogs/${blogId}/view`, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    }).catch(() => {});

    return true;
  } catch { return false; }
}

// ─── Simulate a full browsing session ───
// Visit blog → scroll time → click internal link → visit another page
async function simulateBrowsingSession(blog, specialUser) {
  const results = { pagesVisited: 0, viewsRegistered: 0, linksClicked: 0 };
  const blogUrl = `${SITE_URL}/blog/${blog.slug || blog._id}`;

  // 1. Visit the main blog page through Brightdata
  const visit1 = await visitPage(blogUrl);
  if (visit1.success) results.pagesVisited++;

  // 2. Register the view on the API
  const viewed = await registerView(blog._id, specialUser._id);
  if (viewed) results.viewsRegistered++;

  // 3. Simulate reading time (2-8 seconds)
  await randomDelay(2000, 8000);

  // 4. Sometimes visit the homepage first (30% chance)
  if (Math.random() < 0.3) {
    await visitPage(SITE_URL, { referrer: blogUrl });
    results.pagesVisited++;
    await randomDelay(1000, 3000);
  }

  // 5. Click an internal link (visit another random blog, 50% chance)
  if (Math.random() < 0.5) {
    try {
      const relatedBlogs = await Blog.find({
        _id: { $ne: blog._id },
        status: 'published',
        isDeleted: { $ne: true },
        category: blog.category
      }).limit(5).select('_id slug').lean();

      if (relatedBlogs.length > 0) {
        const related = randomItem(relatedBlogs);
        const relatedUrl = `${SITE_URL}/blog/${related.slug || related._id}`;
        const visit2 = await visitPage(relatedUrl, { referrer: blogUrl });
        if (visit2.success) results.pagesVisited++;
        results.linksClicked++;

        // Register that view too
        await registerView(related._id, specialUser._id);
        results.viewsRegistered++;
        await randomDelay(1000, 4000);
      }
    } catch {}
  }

  // 6. Sometimes visit a social link embedded in the article (20% chance)
  if (Math.random() < 0.2 && blog.content) {
    const socialLinks = [];
    const linkRegex = /href="(https?:\/\/(www\.)?(youtube|facebook|instagram|tiktok|twitter|x)\.com[^"]*)/gi;
    let match;
    while ((match = linkRegex.exec(blog.content)) !== null) {
      socialLinks.push(match[1]);
    }
    if (socialLinks.length > 0) {
      await visitPage(randomItem(socialLinks), { referrer: blogUrl });
      results.linksClicked++;
    }
  }

  return results;
}

// ═══ MAIN: Run traffic simulation batch ═══
async function runTrafficSimulation(options = {}) {
  const {
    articlesCount = 10,   // How many articles to target
    visitsPerArticle = 3, // How many visits per article
    targetCategory,       // Optional: focus on specific category
    targetBlogIds,        // Optional: specific blog IDs to target
    useProxy = true       // Whether to use Brightdata proxy
  } = options;

  const proxy = getProxyConfig();
  if (useProxy && !proxy) {
    console.log('⚠️ Traffic sim: Brightdata proxy not configured. Set BRIGHTDATA_USERNAME and BRIGHTDATA_PASSWORD.');
    // Still continue — visits will come from server IP (less effective but still registers views)
  }

  console.log(`🚗 Traffic simulation starting: ${articlesCount} articles × ${visitsPerArticle} visits`);

  // Get target blogs
  const blogQuery = { status: 'published', isDeleted: { $ne: true } };
  if (targetCategory) blogQuery.category = targetCategory;
  if (targetBlogIds?.length) blogQuery._id = { $in: targetBlogIds };

  const blogs = await Blog.find(blogQuery)
    .sort({ createdAt: -1 })
    .limit(articlesCount)
    .select('_id title slug category content')
    .lean();

  if (blogs.length === 0) {
    console.log('⚠️ No published blogs found for traffic simulation');
    return { success: false, error: 'No blogs found' };
  }

  // Get special users for the simulation
  const specialUsers = await User.aggregate([
    { $match: { isSynthetic: true } },
    { $sample: { size: Math.min(visitsPerArticle * blogs.length, 50) } },
    { $project: { _id: 1, username: 1, name: 1 } }
  ]);

  if (specialUsers.length === 0) {
    console.log('⚠️ No special users found. Generate some first.');
    return { success: false, error: 'No special users' };
  }

  const stats = {
    totalVisits: 0,
    totalViews: 0,
    totalClicks: 0,
    articlesTargeted: blogs.length,
    usersUsed: specialUsers.length,
    errors: 0,
    startTime: Date.now()
  };

  let userIndex = 0;

  for (const blog of blogs) {
    for (let v = 0; v < visitsPerArticle; v++) {
      try {
        const user = specialUsers[userIndex % specialUsers.length];
        userIndex++;

        const result = await simulateBrowsingSession(blog, user);
        stats.totalVisits += result.pagesVisited;
        stats.totalViews += result.viewsRegistered;
        stats.totalClicks += result.linksClicked;

        // Random delay between sessions (3-15 seconds)
        await randomDelay(3000, 15000);
      } catch (e) {
        stats.errors++;
        console.log(`Traffic sim error for ${blog._id}:`, e.message);
      }
    }
  }

  stats.elapsed = Math.round((Date.now() - stats.startTime) / 1000);
  console.log(`🚗 Traffic simulation done: ${stats.totalVisits} visits, ${stats.totalViews} views, ${stats.totalClicks} clicks in ${stats.elapsed}s`);

  return { success: true, stats };
}

// ═══ Cron: Auto-run traffic simulation ═══
let trafficInterval = null;

function startTrafficCron(intervalMinutes = 60) {
  if (trafficInterval) clearInterval(trafficInterval);

  const proxy = getProxyConfig();
  if (!proxy) {
    console.log('🚗 Traffic simulation cron NOT started (no Brightdata credentials)');
    return;
  }

  trafficInterval = setInterval(async () => {
    try {
      await runTrafficSimulation({
        articlesCount: 15,
        visitsPerArticle: 2,
        useProxy: true
      });
    } catch (e) {
      console.log('Traffic cron error:', e.message);
    }
  }, intervalMinutes * 60 * 1000);

  console.log(`🚗 Traffic simulation cron started (every ${intervalMinutes} min)`);
}

function stopTrafficCron() {
  if (trafficInterval) {
    clearInterval(trafficInterval);
    trafficInterval = null;
    console.log('🚗 Traffic simulation cron stopped');
  }
}

module.exports = {
  runTrafficSimulation,
  startTrafficCron,
  stopTrafficCron,
  visitPage,
  getProxyConfig
};
