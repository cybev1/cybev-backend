// ============================================
// FILE: routes/socialPublisher.routes.js
// PATH: cybev-backend/routes/socialPublisher.routes.js
// PURPOSE: Cross-platform social media publishing
// VERSION: 1.0.0
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');

// Auth middleware
let authenticateToken;
try {
  const authMod = require('../middleware/verifyToken');
  authenticateToken = authMod.authenticateToken || authMod.verifyToken || authMod;
} catch {
  try {
    authenticateToken = require('../middleware/auth');
    if (authenticateToken.authenticateToken) authenticateToken = authenticateToken.authenticateToken;
  } catch {
    authenticateToken = (req, res, next) => {
      const jwt = require('jsonwebtoken');
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ ok: false, error: 'No token' });
      try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
        next();
      } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
    };
  }
}
const auth = authenticateToken;

// ==========================================
// MODELS (inline for portability)
// ==========================================

const connectedPlatformSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: {
    type: String,
    enum: ['facebook', 'instagram', 'youtube', 'tiktok', 'twitter', 'linkedin', 'kingschat', 'ceflix'],
    required: true
  },
  accountName: { type: String, required: true },
  accountId: { type: String }, // Platform-specific user/page ID
  pageId: { type: String },    // For Facebook Pages
  channelId: { type: String },  // For YouTube channels
  username: { type: String },
  avatar: { type: String },
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiry: { type: Date },
  scope: [String],
  status: { type: String, enum: ['active', 'expired', 'error', 'disconnected'], default: 'active' },
  lastError: { type: String },
  stats: {
    followers: { type: Number, default: 0 },
    totalPosts: { type: Number, default: 0 },
    totalReach: { type: Number, default: 0 },
    totalEngagement: { type: Number, default: 0 },
    lastSynced: Date
  },
  settings: {
    autoRepost: { type: Boolean, default: false },  // Auto-repost CYBEV blogs
    postFormat: { type: String, default: 'standard' }, // standard, thread, carousel
    hashtagMode: { type: String, enum: ['append', 'comment', 'none'], default: 'append' }
  }
}, { timestamps: true });

connectedPlatformSchema.index({ user: 1, platform: 1 });

const publishQueueSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'AICampaign' }, // Optional — linked to AI campaign
  platforms: [{
    platform: { type: String, required: true },
    accountRef: { type: mongoose.Schema.Types.ObjectId, ref: 'ConnectedPlatform' },
    status: { type: String, enum: ['pending', 'publishing', 'published', 'failed', 'skipped'], default: 'pending' },
    postId: String,
    postUrl: String,
    error: String,
    publishedAt: Date,
    reach: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 }
  }],
  content: {
    text: { type: String, required: true },
    title: String,
    mediaUrls: [{ url: String, type: { type: String, enum: ['image', 'video', 'audio'] } }],
    link: String,
    hashtags: [String],
    callToAction: String
  },
  scheduledFor: { type: Date, required: true },
  timezone: { type: String, default: 'UTC' },
  type: { type: String, enum: ['post', 'reel', 'story', 'blog_share', 'video', 'thread'], default: 'post' },
  status: { type: String, enum: ['scheduled', 'publishing', 'completed', 'partial', 'failed', 'cancelled'], default: 'scheduled' },
  publishedAt: Date,
  metadata: {
    source: { type: String, enum: ['manual', 'campaign', 'auto_blog', 'bulk'], default: 'manual' },
    campaignDay: Number,
    campaignPieceId: String
  }
}, { timestamps: true });

publishQueueSchema.index({ user: 1, status: 1, scheduledFor: 1 });
publishQueueSchema.index({ status: 1, scheduledFor: 1 }); // For cron processor

let ConnectedPlatform, PublishQueue;
try {
  ConnectedPlatform = mongoose.model('ConnectedPlatform');
} catch {
  ConnectedPlatform = mongoose.model('ConnectedPlatform', connectedPlatformSchema);
}
try {
  PublishQueue = mongoose.model('PublishQueue');
} catch {
  PublishQueue = mongoose.model('PublishQueue', publishQueueSchema);
}

// ==========================================
// PLATFORM CONNECTIONS
// ==========================================

// GET /api/social-publisher/platforms - List available platforms
router.get('/platforms', auth, (req, res) => {
  const platforms = [
    {
      id: 'facebook', name: 'Facebook', icon: '📘',
      features: ['posts', 'images', 'videos', 'stories', 'reels'],
      authMethod: 'oauth', connected: false,
      setupGuide: 'Connect your Facebook Page to publish posts, images, and videos directly.'
    },
    {
      id: 'instagram', name: 'Instagram', icon: '📸',
      features: ['posts', 'reels', 'stories', 'carousels'],
      authMethod: 'oauth', connected: false,
      setupGuide: 'Link your Instagram Business account via Facebook to auto-publish.'
    },
    {
      id: 'youtube', name: 'YouTube', icon: '📺',
      features: ['videos', 'shorts', 'community_posts'],
      authMethod: 'oauth', connected: false,
      setupGuide: 'Connect your YouTube channel to upload videos and shorts.'
    },
    {
      id: 'tiktok', name: 'TikTok', icon: '🎵',
      features: ['videos', 'images'],
      authMethod: 'oauth', connected: false,
      setupGuide: 'Connect TikTok to publish videos and images.'
    },
    {
      id: 'twitter', name: 'X (Twitter)', icon: '🐦',
      features: ['tweets', 'threads', 'images', 'videos'],
      authMethod: 'oauth', connected: false,
      setupGuide: 'Connect your X account to post tweets and threads.'
    },
    {
      id: 'linkedin', name: 'LinkedIn', icon: '💼',
      features: ['posts', 'articles', 'images', 'videos'],
      authMethod: 'oauth', connected: false,
      setupGuide: 'Connect your LinkedIn profile or company page.'
    },
    {
      id: 'kingschat', name: 'KingsChat', icon: '👑',
      features: ['posts', 'images'],
      authMethod: 'credentials', connected: false,
      setupGuide: 'Enter your KingsChat credentials to auto-post.'
    },
    {
      id: 'ceflix', name: 'CeFlix', icon: '🎬',
      features: ['videos'],
      authMethod: 'credentials', connected: false,
      setupGuide: 'Connect CeFlix to upload videos directly.'
    }
  ];

  res.json({ ok: true, platforms });
});

// GET /api/social-publisher/accounts - List connected accounts
router.get('/accounts', auth, async (req, res) => {
  try {
    const accounts = await ConnectedPlatform.find({ user: req.user.id })
      .select('-accessToken -refreshToken')
      .sort({ platform: 1 });
    res.json({ ok: true, accounts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social-publisher/accounts - Connect a platform (manual token/credentials)
router.post('/accounts', auth, async (req, res) => {
  try {
    const { platform, accountName, accountId, pageId, channelId, username, avatar, accessToken, refreshToken } = req.body;

    if (!platform || !accountName) {
      return res.status(400).json({ ok: false, error: 'Platform and account name required' });
    }

    // Check if already connected
    const existing = await ConnectedPlatform.findOne({ user: req.user.id, platform, accountId });
    if (existing) {
      existing.accountName = accountName;
      existing.accessToken = accessToken || existing.accessToken;
      existing.refreshToken = refreshToken || existing.refreshToken;
      existing.status = 'active';
      existing.lastError = null;
      await existing.save();
      return res.json({ ok: true, account: existing, message: 'Account updated' });
    }

    const account = new ConnectedPlatform({
      user: req.user.id,
      platform,
      accountName,
      accountId,
      pageId,
      channelId,
      username,
      avatar,
      accessToken,
      refreshToken,
      status: 'active'
    });

    await account.save();
    res.json({ ok: true, account });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/social-publisher/accounts/:id
router.delete('/accounts/:id', auth, async (req, res) => {
  try {
    await ConnectedPlatform.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.json({ ok: true, message: 'Platform disconnected' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social-publisher/accounts/:id/test - Test connection
router.post('/accounts/:id/test', auth, async (req, res) => {
  try {
    const account = await ConnectedPlatform.findOne({ _id: req.params.id, user: req.user.id });
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });

    // Platform-specific connection test
    let testResult = { success: false, message: 'Test not implemented for this platform' };

    if (account.platform === 'facebook' && account.accessToken) {
      try {
        const resp = await axios.get(`https://graph.facebook.com/v19.0/me?access_token=${account.accessToken}`);
        testResult = { success: true, message: `Connected as ${resp.data.name}`, data: resp.data };
        account.status = 'active';
        account.lastError = null;
      } catch (e) {
        testResult = { success: false, message: e.response?.data?.error?.message || e.message };
        account.status = 'error';
        account.lastError = testResult.message;
      }
    } else if (account.platform === 'twitter' && account.accessToken) {
      try {
        const resp = await axios.get('https://api.twitter.com/2/users/me', {
          headers: { 'Authorization': `Bearer ${account.accessToken}` }
        });
        testResult = { success: true, message: `Connected as @${resp.data.data.username}` };
        account.status = 'active';
      } catch (e) {
        testResult = { success: false, message: e.response?.data?.detail || e.message };
        account.status = 'error';
        account.lastError = testResult.message;
      }
    } else {
      // For platforms without API test — just mark as active if token exists
      if (account.accessToken) {
        testResult = { success: true, message: 'Token present — marked as active' };
        account.status = 'active';
      } else {
        testResult = { success: false, message: 'No access token configured' };
      }
    }

    await account.save();
    res.json({ ok: true, ...testResult });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// OAUTH CALLBACK ENDPOINTS
// ==========================================

// GET /api/social-publisher/oauth/:platform/url - Get OAuth authorization URL
router.get('/oauth/:platform/url', auth, async (req, res) => {
  const { platform } = req.params;
  const baseUrl = process.env.API_URL || 'https://api.cybev.io';
  const frontendUrl = process.env.FRONTEND_URL || 'https://cybev.io';

  const configs = {
    facebook: {
      url: `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.FB_APP_ID}&redirect_uri=${baseUrl}/api/social-publisher/oauth/facebook/callback&scope=pages_manage_posts,pages_read_engagement,publish_video,instagram_basic,instagram_content_publish&state=${req.user.id}`
    },
    youtube: {
      url: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${baseUrl}/api/social-publisher/oauth/youtube/callback&scope=https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube&response_type=code&access_type=offline&state=${req.user.id}`
    },
    twitter: {
      url: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${baseUrl}/api/social-publisher/oauth/twitter/callback&scope=tweet.read tweet.write users.read offline.access&state=${req.user.id}&code_challenge=challenge&code_challenge_method=plain`
    },
    tiktok: {
      url: `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&scope=user.info.basic,video.publish&response_type=code&redirect_uri=${baseUrl}/api/social-publisher/oauth/tiktok/callback&state=${req.user.id}`
    },
    linkedin: {
      url: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${baseUrl}/api/social-publisher/oauth/linkedin/callback&scope=w_member_social r_liteprofile&state=${req.user.id}`
    }
  };

  const config = configs[platform];
  if (!config) return res.status(400).json({ ok: false, error: `OAuth not configured for ${platform}` });

  res.json({ ok: true, url: config.url });
});

// GET /api/social-publisher/oauth/:platform/callback - Handle OAuth callback
router.get('/oauth/:platform/callback', async (req, res) => {
  const { platform } = req.params;
  const { code, state: userId, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://cybev.io';

  if (error || !code) {
    return res.redirect(`${frontendUrl}/studio/social/publisher?error=auth_failed&platform=${platform}`);
  }

  try {
    const baseUrl = process.env.API_URL || 'https://api.cybev.io';
    let tokenData = {};

    // Exchange code for token — platform-specific
    if (platform === 'facebook') {
      const resp = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
        params: {
          client_id: process.env.FB_APP_ID,
          client_secret: process.env.FB_APP_SECRET,
          redirect_uri: `${baseUrl}/api/social-publisher/oauth/facebook/callback`,
          code
        }
      });
      tokenData = resp.data;

      // Get long-lived token
      const longResp = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: process.env.FB_APP_ID,
          client_secret: process.env.FB_APP_SECRET,
          fb_exchange_token: tokenData.access_token
        }
      });
      tokenData.access_token = longResp.data.access_token;

      // Get user info & pages
      const meResp = await axios.get(`https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${tokenData.access_token}`);
      const pagesResp = await axios.get(`https://graph.facebook.com/v19.0/me/accounts?access_token=${tokenData.access_token}`);

      // Save user account
      await ConnectedPlatform.findOneAndUpdate(
        { user: userId, platform: 'facebook', accountId: meResp.data.id },
        {
          user: userId,
          platform: 'facebook',
          accountName: meResp.data.name,
          accountId: meResp.data.id,
          avatar: meResp.data.picture?.data?.url,
          accessToken: tokenData.access_token,
          status: 'active',
          scope: ['pages_manage_posts', 'pages_read_engagement']
        },
        { upsert: true, new: true }
      );

      // Save each page as separate connection
      if (pagesResp.data?.data) {
        for (const page of pagesResp.data.data) {
          await ConnectedPlatform.findOneAndUpdate(
            { user: userId, platform: 'facebook', pageId: page.id },
            {
              user: userId,
              platform: 'facebook',
              accountName: `${page.name} (Page)`,
              accountId: meResp.data.id,
              pageId: page.id,
              accessToken: page.access_token,
              status: 'active'
            },
            { upsert: true, new: true }
          );
        }
      }
    } else if (platform === 'youtube') {
      const resp = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${baseUrl}/api/social-publisher/oauth/youtube/callback`,
        grant_type: 'authorization_code'
      });
      tokenData = resp.data;

      const channelResp = await axios.get('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });

      const channel = channelResp.data.items?.[0];
      if (channel) {
        await ConnectedPlatform.findOneAndUpdate(
          { user: userId, platform: 'youtube', channelId: channel.id },
          {
            user: userId,
            platform: 'youtube',
            accountName: channel.snippet.title,
            channelId: channel.id,
            avatar: channel.snippet.thumbnails?.default?.url,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
            status: 'active'
          },
          { upsert: true, new: true }
        );
      }
    }
    // Add more platforms as needed...

    res.redirect(`${frontendUrl}/studio/social/publisher?connected=${platform}`);
  } catch (err) {
    console.error(`OAuth ${platform} callback error:`, err.message);
    res.redirect(`${frontendUrl}/studio/social/publisher?error=${encodeURIComponent(err.message)}&platform=${platform}`);
  }
});

// ==========================================
// PUBLISHING QUEUE
// ==========================================

// GET /api/social-publisher/queue - List scheduled posts
router.get('/queue', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = { user: req.user.id };
    if (status) query.status = status;

    const posts = await PublishQueue.find(query)
      .populate('campaign', 'name')
      .sort({ scheduledFor: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await PublishQueue.countDocuments(query);

    res.json({ ok: true, posts, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social-publisher/queue - Schedule a post
router.post('/queue', auth, async (req, res) => {
  try {
    const { platforms, content, scheduledFor, timezone, type, campaign, metadata } = req.body;

    if (!content?.text) return res.status(400).json({ ok: false, error: 'Content text required' });
    if (!platforms?.length) return res.status(400).json({ ok: false, error: 'At least one platform required' });

    // Validate connected accounts
    const accounts = await ConnectedPlatform.find({
      user: req.user.id,
      platform: { $in: platforms.map(p => p.platform || p) },
      status: 'active'
    });

    const platformEntries = platforms.map(p => {
      const platName = p.platform || p;
      const account = accounts.find(a => a.platform === platName);
      return {
        platform: platName,
        accountRef: account?._id || null,
        status: account ? 'pending' : 'skipped'
      };
    });

    const post = new PublishQueue({
      user: req.user.id,
      campaign,
      platforms: platformEntries,
      content: {
        text: content.text,
        title: content.title,
        mediaUrls: content.mediaUrls || [],
        link: content.link,
        hashtags: content.hashtags || [],
        callToAction: content.callToAction
      },
      scheduledFor: scheduledFor || new Date(),
      timezone: timezone || 'UTC',
      type: type || 'post',
      status: 'scheduled',
      metadata: metadata || { source: 'manual' }
    });

    await post.save();
    res.json({ ok: true, post });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social-publisher/queue/bulk - Schedule multiple posts (from campaign)
router.post('/queue/bulk', auth, async (req, res) => {
  try {
    const { posts } = req.body; // Array of post objects
    if (!posts?.length) return res.status(400).json({ ok: false, error: 'No posts provided' });

    const accounts = await ConnectedPlatform.find({ user: req.user.id, status: 'active' });

    const queueItems = posts.map(post => ({
      user: req.user.id,
      campaign: post.campaign,
      platforms: (post.platforms || ['cybev']).map(p => {
        const platName = p.platform || p;
        const account = accounts.find(a => a.platform === platName);
        return { platform: platName, accountRef: account?._id, status: account ? 'pending' : 'skipped' };
      }),
      content: {
        text: post.content?.text || post.caption || '',
        title: post.title,
        mediaUrls: post.mediaUrls || [],
        link: post.link,
        hashtags: post.hashtags || [],
        callToAction: post.callToAction
      },
      scheduledFor: post.scheduledFor || new Date(),
      timezone: post.timezone || 'UTC',
      type: post.type || 'post',
      status: 'scheduled',
      metadata: post.metadata || { source: 'campaign' }
    }));

    const result = await PublishQueue.insertMany(queueItems);
    res.json({ ok: true, count: result.length, message: `${result.length} posts scheduled` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/social-publisher/queue/:id/publish-now - Publish immediately
router.post('/queue/:id/publish-now', auth, async (req, res) => {
  try {
    const post = await PublishQueue.findOne({ _id: req.params.id, user: req.user.id });
    if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });

    post.scheduledFor = new Date();
    post.status = 'publishing';
    await post.save();

    // Trigger immediate publish (fire and forget)
    publishPost(post).catch(err => console.error('Publish failed:', err));

    res.json({ ok: true, message: 'Publishing now...', post });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/social-publisher/queue/:id - Cancel scheduled post
router.delete('/queue/:id', auth, async (req, res) => {
  try {
    const post = await PublishQueue.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, status: 'scheduled' },
      { status: 'cancelled' },
      { new: true }
    );
    if (!post) return res.status(404).json({ ok: false, error: 'Post not found or already published' });
    res.json({ ok: true, message: 'Post cancelled' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// PUBLISH LOGIC (per-platform)
// ==========================================

async function publishPost(queueItem) {
  const results = [];

  for (const platformEntry of queueItem.platforms) {
    if (platformEntry.status === 'skipped') continue;

    try {
      const account = await ConnectedPlatform.findById(platformEntry.accountRef);
      if (!account || !account.accessToken) {
        platformEntry.status = 'failed';
        platformEntry.error = 'No valid token';
        continue;
      }

      let result = {};

      switch (account.platform) {
        case 'facebook': {
          const fbId = account.pageId || account.accountId;
          const text = queueItem.content.hashtags?.length
            ? `${queueItem.content.text}\n\n${queueItem.content.hashtags.join(' ')}`
            : queueItem.content.text;

          if (queueItem.content.mediaUrls?.length && queueItem.content.mediaUrls[0].type === 'image') {
            const resp = await axios.post(`https://graph.facebook.com/v19.0/${fbId}/photos`, {
              message: text,
              url: queueItem.content.mediaUrls[0].url,
              access_token: account.accessToken
            });
            result = { postId: resp.data.id, postUrl: `https://facebook.com/${resp.data.id}` };
          } else {
            const resp = await axios.post(`https://graph.facebook.com/v19.0/${fbId}/feed`, {
              message: text,
              link: queueItem.content.link,
              access_token: account.accessToken
            });
            result = { postId: resp.data.id, postUrl: `https://facebook.com/${resp.data.id}` };
          }
          break;
        }

        case 'twitter': {
          const text = queueItem.content.hashtags?.length
            ? `${queueItem.content.text}\n\n${queueItem.content.hashtags.join(' ')}`
            : queueItem.content.text;

          const resp = await axios.post('https://api.twitter.com/2/tweets', { text }, {
            headers: { 'Authorization': `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' }
          });
          result = { postId: resp.data.data.id, postUrl: `https://twitter.com/i/status/${resp.data.data.id}` };
          break;
        }

        case 'linkedin': {
          const resp = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
            author: `urn:li:person:${account.accountId}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: queueItem.content.text },
                shareMediaCategory: 'NONE'
              }
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
          }, {
            headers: { 'Authorization': `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' }
          });
          result = { postId: resp.data.id };
          break;
        }

        default:
          result = { error: `Publishing not yet implemented for ${account.platform}` };
          platformEntry.status = 'skipped';
          continue;
      }

      platformEntry.status = 'published';
      platformEntry.postId = result.postId;
      platformEntry.postUrl = result.postUrl;
      platformEntry.publishedAt = new Date();
      results.push(result);
    } catch (err) {
      platformEntry.status = 'failed';
      platformEntry.error = err.response?.data?.error?.message || err.message;
      console.error(`Publish to ${platformEntry.platform} failed:`, platformEntry.error);
    }
  }

  // Update overall status
  const statuses = queueItem.platforms.map(p => p.status);
  if (statuses.every(s => s === 'published')) queueItem.status = 'completed';
  else if (statuses.some(s => s === 'published')) queueItem.status = 'partial';
  else queueItem.status = 'failed';

  queueItem.publishedAt = new Date();
  await queueItem.save();
  return results;
}

// Export publish function for cron
module.exports = router;
module.exports.publishPost = publishPost;
module.exports.PublishQueue = PublishQueue;
module.exports.ConnectedPlatform = ConnectedPlatform;
