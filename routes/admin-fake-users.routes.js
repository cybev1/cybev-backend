// ============================================
// FILE: routes/admin-fake-users.routes.js
// Admin Special Users & Engagement Engine V3.0
// FIXES: Engagement targets Blog + Comment models
// NEW: AI article + post generation
// ===========================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
console.log('🤖 Admin Special Users Routes v3.0 loaded');

let verifyToken;
try { verifyToken = require('../middleware/verifyToken'); } catch {
  try { verifyToken = require('../middleware/auth'); } catch {
    verifyToken = (req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token' });
      try { req.user = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'cybev-secret-key'); next(); }
      catch { return res.status(401).json({ error: 'Invalid token' }); }
    };
  }
}
const requireAdmin = async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(req.user.id || req.user._id);
    if (!user || (user.role !== 'admin' && !user.isAdmin)) return res.status(403).json({ error: 'Admin access required' });
    req.adminUser = user; next();
  } catch (err) { return res.status(500).json({ error: 'Auth check failed' }); }
};

let FakeUserGenerator;
try { ({ FakeUserGenerator } = require('../services/fake-user-generator.service')); console.log('✅ FakeUserGenerator loaded'); } catch (e) { console.log('⚠️ FakeUserGenerator:', e.message); }

// AI Content Helper
async function generateAI(prompt, system = 'You are a creative writer.') {
  const providers = [
    { url: 'https://api.deepseek.com/v1/chat/completions', key: process.env.DEEPSEEK_API_KEY, model: 'deepseek-chat', name: 'DeepSeek' },
    { url: 'https://api.openai.com/v1/chat/completions', key: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', name: 'OpenAI' },
  ];
  for (const p of providers) {
    if (!p.key) continue;
    try {
      const r = await axios.post(p.url, { model: p.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.8 },
        { headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' }, timeout: 30000 });
      const t = r.data.choices?.[0]?.message?.content;
      if (t) { console.log(`✅ AI via ${p.name}`); return t; }
    } catch (e) { console.log(`⚠️ ${p.name}:`, e.message); }
  }
  return null;
}

// Auto-Follow System
let _mfCache = null, _mfTime = 0;
async function getMustFollowAccounts() {
  if (_mfCache && Date.now() - _mfTime < 300000) return _mfCache;
  try {
    const User = mongoose.model('User');
    _mfCache = await User.find({ $or: [{ username: 'prince' }, { _mustFollow: true }, { role: 'admin', isAdmin: true }], status: 'active' }).select('_id username name').lean();
    _mfTime = Date.now(); return _mfCache;
  } catch { return []; }
}
async function autoFollowAdmins(userId) {
  try {
    const mf = await getMustFollowAccounts(); if (!mf.length) return 0;
    const User = mongoose.model('User');
    let Follow; try { Follow = mongoose.model('Follow'); } catch { try { Follow = require('../models/follow.model'); } catch { return 0; } }
    let n = 0;
    for (const a of mf) {
      if (a._id.toString() === userId.toString()) continue;
      try {
        if (!(await Follow.findOne({ follower: userId, following: a._id }))) {
          await Follow.create({ follower: userId, following: a._id }); 
          await User.findByIdAndUpdate(a._id, { $inc: { followerCount: 1, followersCount: 1 } });
          await User.findByIdAndUpdate(userId, { $inc: { followingCount: 1 } }); n++;
        }
      } catch {}
    }
    return n;
  } catch { return 0; }
}
router.autoFollowAdmins = autoFollowAdmins;
router.getMustFollowAccounts = getMustFollowAccounts;

async function getSpecialUsers(count) {
  return mongoose.model('User').aggregate([{ $match: { isSynthetic: true, status: 'active' } }, { $sample: { size: Math.min(count, 1000) } }, { $project: { _id: 1, name: 1, username: 1, avatar: 1 } }]);
}

// GET /stats
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const User = mongoose.model('User');
    const [totalSynthetic, totalReal, recentSynthetic, countryBreakdown] = await Promise.all([
      User.countDocuments({ isSynthetic: true }),
      User.countDocuments({ $or: [{ isSynthetic: false }, { isSynthetic: { $exists: false } }] }),
      User.countDocuments({ isSynthetic: true, createdAt: { $gte: new Date(Date.now() - 86400000) } }),
      User.aggregate([{ $match: { isSynthetic: true } }, { $group: { _id: '$locationData.providedCountry', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 30 }]),
    ]);
    const mf = await getMustFollowAccounts();
    let aiArticles = 0;
    try { const Blog = mongoose.model('Blog'); const ids = (await User.find({ isSynthetic: true }).select('_id').lean()).map(u => u._id); aiArticles = await Blog.countDocuments({ author: { $in: ids }, isAIGenerated: true }); } catch {}
    res.json({ ok: true, stats: { totalSynthetic, totalReal, recentSynthetic, aiArticles, ratio: totalReal > 0 ? (totalSynthetic / totalReal).toFixed(1) : '∞',
      countryBreakdown: countryBreakdown.map(c => ({ country: c._id || 'Unknown', count: c.count })),
      mustFollowAccounts: mf.map(u => ({ id: u._id, username: u.username, name: u.name })) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /generate
router.post('/generate', verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!FakeUserGenerator) return res.status(500).json({ error: 'Generator not loaded' });
    const { count = 100, country = null, daysBack = 365 } = req.body;
    const n = Math.min(count, 5000);
    const gen = new FakeUserGenerator();
    const batchId = `batch_${Date.now()}`;
    const data = gen.generateBatch(n, { country: country || undefined, daysBack, batchId });
    const User = mongoose.model('User');
    let inserted = 0, errors = 0; const insertedIds = [];
    for (let i = 0; i < data.length; i += 500) {
      try { const r = await User.insertMany(data.slice(i, i + 500), { ordered: false, rawResult: true }); inserted += r.insertedCount || 500; if (r.insertedIds) insertedIds.push(...Object.values(r.insertedIds));
      } catch (e) { if (e.insertedDocs) { inserted += e.insertedDocs.length; insertedIds.push(...e.insertedDocs.map(d => d._id)); } errors += 500 - (e.insertedDocs?.length || 0); }
    }
    let autoFollowed = 0;
    const mf = await getMustFollowAccounts();
    if (mf.length > 0 && insertedIds.length > 0) {
      let Follow; try { Follow = mongoose.model('Follow'); } catch { try { Follow = require('../models/follow.model'); } catch {} }
      if (Follow) {
        const docs = []; for (const uid of insertedIds) for (const a of mf) if (a._id.toString() !== uid.toString()) docs.push({ follower: uid, following: a._id });
        if (docs.length) { try { await Follow.insertMany(docs, { ordered: false }); autoFollowed = docs.length;
          for (const a of mf) { const c = docs.filter(f => f.following.toString() === a._id.toString()).length; if (c) await User.findByIdAndUpdate(a._id, { $inc: { followerCount: c, followersCount: c } }); }
          await User.updateMany({ _id: { $in: insertedIds } }, { $inc: { followingCount: mf.length } }); } catch {} }
      }
    }
    res.json({ ok: true, generated: inserted, errors, batchId, autoFollowed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /simulate-engagement (V3 FIXED - targets Blog model)
router.post('/simulate-engagement', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { action = 'like', count = 50, targetId = null } = req.body;
    const users = await getSpecialUsers(Math.min(count, 500));
    if (!users.length) return res.status(400).json({ error: 'No special users. Generate first.' });
    let engaged = 0, errors = 0;

    if (action === 'like' || action === 'react') {
      let Blog; try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }
      let targets = targetId ? [await Blog.findById(targetId)].filter(Boolean) :
        await Blog.find({ status: 'published', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(30).select('_id').lean();
      if (!targets.length) return res.status(400).json({ error: 'No published blogs found' });
      const rxns = ['like','love','fire','clap','wow','haha'];
      for (const u of users) {
        try {
          const b = targets[Math.floor(Math.random() * targets.length)];
          const rx = rxns[Math.floor(Math.random() * rxns.length)];
          await Blog.findOneAndUpdate({ _id: b._id, likes: { $ne: u._id } }, { $addToSet: { likes: u._id, [`reactions.${rx}`]: u._id } });
          engaged++;
        } catch { errors++; }
      }
    }

    if (action === 'comment') {
      let Blog, Comment;
      try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }
      try { Comment = mongoose.model('Comment'); } catch { Comment = require('../models/comment.model'); }
      const COMMENTS = ['Amazing content! 🔥','Love this! ❤️','So inspiring!','Great article!','This is exactly what I needed today','Keep it up! 💪','Wow, incredible!','Thank you for sharing!','Blessed! 🙏','This spoke to me deeply','Amen! 🙌','So powerful!','Absolutely beautiful!','Sharing with friends!','God is good! 🙏','This is gold! 💛','More of this please!','What a blessing!','So true!','This is fire! 🔥🔥','Love the energy!','Incredible work!','Made my day! 😊','Keep creating!','Very insightful 👏','Well researched!','I learned so much','Bookmarking this','This deserves more attention','Beautifully written! ✍️','Can\'t wait for more!','Wise words 🙏'];
      let targets = targetId ? [await Blog.findById(targetId)].filter(Boolean) :
        await Blog.find({ status: 'published', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(20).lean();
      if (!targets.length) return res.status(400).json({ error: 'No blogs found' });
      for (const u of users) {
        try {
          const b = targets[Math.floor(Math.random() * targets.length)];
          await Comment.create({ content: COMMENTS[Math.floor(Math.random() * COMMENTS.length)], user: u._id, authorName: u.name, authorAvatar: u.avatar || '', blog: b._id });
          await Blog.findByIdAndUpdate(b._id, { $inc: { commentsCount: 1 } });
          engaged++;
        } catch { errors++; }
      }
    }

    if (action === 'follow') {
      const User = mongoose.model('User');
      let Follow; try { Follow = mongoose.model('Follow'); } catch { try { Follow = require('../models/follow.model'); } catch { return res.status(400).json({ error: 'Follow model unavailable' }); } }
      const realUsers = await User.find({ $or: [{ isSynthetic: false }, { isSynthetic: { $exists: false } }], status: 'active' }).select('_id').limit(50).lean();
      if (!realUsers.length) return res.status(400).json({ error: 'No real users' });
      for (const su of users) {
        try {
          const tu = realUsers[Math.floor(Math.random() * realUsers.length)];
          if (!(await Follow.findOne({ follower: su._id, following: tu._id }))) {
            await Follow.create({ follower: su._id, following: tu._id });
            await User.findByIdAndUpdate(tu._id, { $inc: { followerCount: 1, followersCount: 1 } });
            await User.findByIdAndUpdate(su._id, { $inc: { followingCount: 1 } }); engaged++;
          }
        } catch { errors++; }
      }
    }

    if (action === 'view') {
      let Blog; try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }
      let targets = targetId ? [await Blog.findById(targetId)].filter(Boolean) :
        await Blog.find({ status: 'published', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(30).lean();
      for (const u of users) { try { const b = targets[Math.floor(Math.random() * targets.length)]; await Blog.findByIdAndUpdate(b._id, { $inc: { views: 1 } }); engaged++; } catch { errors++; } }
    }

    if (action === 'share') {
      let Blog; try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }
      let targets = targetId ? [await Blog.findById(targetId)].filter(Boolean) :
        await Blog.find({ status: 'published', isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(20).lean();
      for (const u of users) { try { const b = targets[Math.floor(Math.random() * targets.length)]; await Blog.findByIdAndUpdate(b._id, { $inc: { shareCount: 1 } }); engaged++; } catch { errors++; } }
    }

    res.json({ ok: true, action, engaged, errors, usersInvolved: users.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /generate-articles (AI-powered)
router.post('/generate-articles', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { count = 5, topics = [], category = 'general' } = req.body;
    const n = Math.min(count, 20);
    let Blog; try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }
    const authors = await getSpecialUsers(n);
    if (!authors.length) return res.status(400).json({ error: 'No special users. Generate first.' });

    const defaultTopics = [
      'The Power of Gratitude in Daily Life','Top 10 Productivity Hacks for Remote Workers','Understanding Cryptocurrency: A Beginner\'s Guide',
      'How Music Influences Our Emotions','Building Strong Communities in the Digital Age','The Future of AI in Healthcare',
      'Travel Tips: Hidden Gems in West Africa','Leadership Lessons from Successful Entrepreneurs','Impact of Social Media on Mental Health',
      'Healthy Eating for Busy Professionals','Why Faith Matters in Modern Society','The Rise of African Tech Startups',
      'Climate Change: What You Can Do','Youth Empowerment Through Technology','Financial Literacy in Your 20s',
      'Cultural Diversity Around the World','Starting a Side Business While Working Full-time','The Science of Mindfulness',
      'How Football Brings People Together','The Art of Effective Communication',
    ];
    const topicList = topics.length ? topics : defaultTopics;
    let created = 0, failed = 0; const articles = [];

    for (let i = 0; i < n; i++) {
      const author = authors[i % authors.length];
      const topic = topicList[i % topicList.length];
      try {
        const content = await generateAI(
          `Write a blog article about "${topic}". 4-6 paragraphs, engaging and conversational. Include ## subheadings. Don't include the title.`,
          `You are ${author.name}, a content creator on CYBEV.io. Write naturally.`
        );
        if (!content) { failed++; continue; }
        const blog = await Blog.create({
          title: topic, content, excerpt: content.substring(0, 200).replace(/[#*\n]/g, ' ').trim() + '...',
          author: author._id, authorName: author.name, category, status: 'published', isAIGenerated: true,
          tags: topic.toLowerCase().split(' ').filter(w => w.length > 4).slice(0, 5),
          readTime: Math.ceil(content.split(' ').length / 200),
          views: Math.floor(Math.random() * 200) + 10,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 86400000)),
        });
        articles.push({ id: blog._id, title: topic, author: author.name }); created++;
      } catch (e) { console.log(`❌ Article failed:`, e.message); failed++; }
    }
    res.json({ ok: true, created, failed, articles });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /generate-posts (quick social posts)
router.post('/generate-posts', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { count = 10 } = req.body;
    let Blog; try { Blog = mongoose.model('Blog'); } catch { Blog = require('../models/blog.model'); }
    const authors = await getSpecialUsers(Math.min(count, 50));
    if (!authors.length) return res.status(400).json({ error: 'No special users.' });
    const POSTS = [
      'Just had an amazing day! Life is beautiful 🌟','Working on something exciting! 🚀','Grateful for this community! 🙏',
      'Sunday vibes ✨ What\'s everyone up to?','Just finished an incredible book 📚','The sunset today was breathtaking 🌅',
      'New week, new goals! 💪','Cooking something special tonight 🍳','Music heals the soul 🎵',
      'Travel is the best education ✈️','Early morning hustle! 🌅💪','Best coffee of my life ☕',
      'Blessed beyond measure 🙏❤️','Working from home today 💻','Anyone excited about the weekend? 🎉',
      'Friday feelings! Productive week 🙌','Love seeing our community grow! 🤗','Consistency is underrated 🏃',
      'Just helped someone and it made my day 💛','Learning something new every day 🎯',
      'Happy to connect with everyone here on CYBEV!','The future is digital 🌐','Just celebrated a milestone! 🎊',
    ];
    let created = 0;
    for (let i = 0; i < Math.min(count, 50); i++) {
      try {
        const a = authors[i % authors.length]; const c = POSTS[Math.floor(Math.random() * POSTS.length)];
        await Blog.create({ title: c.substring(0, 60), content: c, author: a._id, authorName: a.name, category: 'general', status: 'published', contentType: 'post', type: 'post', views: Math.floor(Math.random() * 100) + 5, createdAt: new Date(Date.now() - Math.floor(Math.random() * 3 * 86400000)) });
        created++;
      } catch {}
    }
    res.json({ ok: true, created });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stream viewers, list, delete, countries, must-follow
router.post('/simulate-stream-viewers', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { streamId, viewerCount = 50 } = req.body;
    if (!streamId) return res.status(400).json({ error: 'streamId required' });
    const users = await getSpecialUsers(Math.min(viewerCount, 1000));
    const ids = users.map(u => u._id);

    // Try LiveStream first
    let r = null;
    try {
      r = await mongoose.model('LiveStream').findByIdAndUpdate(streamId, {
        $addToSet: { viewers: { $each: ids } },
        $inc: { totalViews: ids.length },
        $max: { peakViewers: viewerCount }
      }, { new: true });
    } catch (e) {}

    // If not found, try WatchParty
    if (!r) {
      try {
        const WatchParty = require('../models/watchParty.model');
        const party = await WatchParty.findById(streamId);
        if (party) {
          party.boostedViewers = (party.boostedViewers || 0) + parseInt(viewerCount);
          if (!party.syntheticEngagement) party.syntheticEngagement = { totalComments: 0, totalReactions: 0, totalViews: 0 };
          party.syntheticEngagement.totalViews += parseInt(viewerCount);
          const totalViewers = party.participants.filter(p => p.isActive).length + party.boostedViewers + (party.syntheticEngagement?.totalViews || 0);
          if (totalViewers > party.peakViewers) party.peakViewers = totalViewers;
          await party.save();
          return res.json({ ok: true, addedViewers: parseInt(viewerCount), totalViewers, type: 'watch-party' });
        }
      } catch (e) {}
    }

    if (!r) return res.status(404).json({ error: 'Stream or Watch Party not found' });
    res.json({ ok: true, addedViewers: ids.length, totalViewers: r.viewers?.length || 0, type: 'livestream' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/list', verifyToken, requireAdmin, async (req, res) => {
  try { const User = mongoose.model('User'); const p = parseInt(req.query.page) || 1; const l = Math.min(parseInt(req.query.limit) || 50, 100);
    const f = { isSynthetic: true }; if (req.query.country) f['locationData.providedCountry'] = req.query.country;
    if (req.query.search) f.$or = [{ name: { $regex: req.query.search, $options: 'i' } }, { email: { $regex: req.query.search, $options: 'i' } }, { username: { $regex: req.query.search, $options: 'i' } }];
    const [users, total] = await Promise.all([User.find(f).select('name email username avatar location bio personalInfo.gender personalInfo.phone followerCount followingCount createdAt syntheticMeta').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(), User.countDocuments(f)]);
    res.json({ ok: true, users, pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/batch/:batchId', verifyToken, requireAdmin, async (req, res) => { try { const r = await mongoose.model('User').deleteMany({ isSynthetic: true, 'syntheticMeta.batchId': req.params.batchId }); res.json({ ok: true, deleted: r.deletedCount }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/all', verifyToken, requireAdmin, async (req, res) => { try { if (req.body.confirm !== 'DELETE_ALL_SYNTHETIC') return res.status(400).json({ error: 'Confirm with DELETE_ALL_SYNTHETIC' }); const r = await mongoose.model('User').deleteMany({ isSynthetic: true }); res.json({ ok: true, deleted: r.deletedCount }); } catch (e) { res.status(500).json({ error: e.message }); } });

router.get('/countries', verifyToken, requireAdmin, async (req, res) => {
  try { const { COUNTRIES } = require('../services/fake-user-generator.service');
    const c = Object.entries(COUNTRIES).map(([name, d]) => ({ name, weight: d.weight || 1, ethnicGroups: d.ethnicGroups.map(e => e.name), cities: d.ethnicGroups.reduce((s, e) => s + e.regions.reduce((s2, r) => s2 + r.cities.length, 0), 0) }));
    res.json({ ok: true, countries: c, total: c.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/must-follow/add', verifyToken, requireAdmin, async (req, res) => { try { const { username } = req.body; if (!username) return res.status(400).json({ error: 'username required' }); const u = await mongoose.model('User').findOneAndUpdate({ username: username.toLowerCase().replace('@', '') }, { $set: { _mustFollow: true } }, { new: true }); if (!u) return res.status(404).json({ error: 'Not found' }); _mfCache = null; res.json({ ok: true, user: { id: u._id, username: u.username, name: u.name } }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/must-follow/remove', verifyToken, requireAdmin, async (req, res) => { try { await mongoose.model('User').findOneAndUpdate({ username: req.body.username?.toLowerCase().replace('@', '') }, { $unset: { _mustFollow: 1 } }); _mfCache = null; res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/must-follow', verifyToken, requireAdmin, async (req, res) => { try { const a = await getMustFollowAccounts(); res.json({ ok: true, accounts: a.map(u => ({ id: u._id, username: u.username, name: u.name })) }); } catch (e) { res.status(500).json({ error: e.message }); } });

module.exports = router;
