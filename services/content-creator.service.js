// ============================================
// SERVER.JS ROUTES SECTION - Add this to your server.js
// Make sure these lines are in your server.js
// ============================================

// Load routes
const feedRoutes = require('./routes/feed.routes');
const contentRoutes = require('./routes/content.routes');
const blogRoutes = require('./routes/blog.routes');
// ... other routes

// Mount routes - IMPORTANT: Order matters!
// Make sure these are BEFORE any catch-all error handlers

// API Routes
app.use('/api/feed', feedRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/blogs', blogRoutes);
// ... other routes

// ============================================
// FULL ROUTES MOUNTING EXAMPLE
// ============================================

/*
// Auth & User
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Content
app.use('/api/feed', feedRoutes);         // IMPORTANT!
app.use('/api/content', contentRoutes);    // IMPORTANT!
app.use('/api/blogs', blogRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);

// Social
app.use('/api/follow', followRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);

// Media & Live
app.use('/api/upload', uploadRoutes);
app.use('/api/live', liveRoutes);

// Web3 & Finance
app.use('/api/wallet', walletRoutes);
app.use('/api/nft', nftRoutes);
app.use('/api/staking', stakingRoutes);
app.use('/api/monetization', monetizationRoutes);

// Admin & Analytics
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/domain', domainRoutes);
app.use('/api/push', pushRoutes);
*/

// ============================================
// CHECK YOUR SERVER.JS FOR THIS PATTERN
// ============================================

/*
WRONG (routes won't work):
--------------------------
app.use('/api', feedRoutes);  // This mounts at /api/ not /api/feed/

RIGHT (routes will work):
-------------------------
app.use('/api/feed', feedRoutes);  // This mounts at /api/feed/
*/
