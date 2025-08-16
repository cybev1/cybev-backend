const clientPromise = require('../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract user ID from token if available
    let userId = null;
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.userId;
      } catch (error) {
        console.log('Token verification failed');
      }
    }

    const client = await clientPromise;
    const db = client.db();

    // Stories expire after 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all active stories (within last 24 hours)
    const stories = await db.collection('stories')
      .find({ 
        createdAt: { $gte: twentyFourHoursAgo },
        status: 'active'
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Group stories by user
    const storyGroups = {};
    
    for (const story of stories) {
      const authorId = story.authorId?.toString() || 'anonymous';
      
      if (!storyGroups[authorId]) {
        // Get user info
        let userInfo = { username: 'anonymous', avatar: '/default-avatar.png' };
        
        if (story.authorId) {
          const user = await db.collection('users').findOne(
            { _id: new ObjectId(story.authorId) },
            { projection: { username: 1, avatar: 1, name: 1 } }
          );
          
          if (user) {
            userInfo = {
              username: user.username || user.name || 'user',
              avatar: user.avatar || '/default-avatar.png'
            };
          }
        }

        storyGroups[authorId] = {
          id: authorId,
          username: userInfo.username,
          avatar: userInfo.avatar,
          stories: [],
          hasStory: true,
          lastUpdated: story.createdAt,
          viewedByUser: false
        };
      }
      
      storyGroups[authorId].stories.push({
        id: story._id,
        type: story.type, // 'image', 'video', 'text'
        content: story.content,
        mediaUrl: story.mediaUrl,
        backgroundColor: story.backgroundColor,
        textColor: story.textColor,
        duration: story.duration || 5000, // Default 5 seconds
        createdAt: story.createdAt,
        views: story.views || 0,
        reactions: story.reactions || []
      });

      // Update last updated time to most recent story
      if (story.createdAt > storyGroups[authorId].lastUpdated) {
        storyGroups[authorId].lastUpdated = story.createdAt;
      }
    }

    // Check which stories the current user has viewed
    if (userId) {
      for (const groupId in storyGroups) {
        const viewedStories = await db.collection('story_views').find({
          userId: new ObjectId(userId),
          storyId: { $in: storyGroups[groupId].stories.map(s => new ObjectId(s.id)) }
        }).toArray();

        storyGroups[groupId].viewedByUser = viewedStories.length === storyGroups[groupId].stories.length;
      }
    }

    // Convert to array and sort
    let storyArray = Object.values(storyGroups);
    
    // Sort: current user first, then unviewed, then by last updated
    storyArray.sort((a, b) => {
      // Current user first
      if (userId && a.id === userId) return -1;
      if (userId && b.id === userId) return 1;
      
      // Unviewed before viewed
      if (!a.viewedByUser && b.viewedByUser) return -1;
      if (a.viewedByUser && !b.viewedByUser) return 1;
      
      // Then by most recent
      return new Date(b.lastUpdated) - new Date(a.lastUpdated);
    });

    // Add current user to beginning if they don't have stories
    if (userId) {
      const hasCurrentUserStory = storyArray.some(group => group.id === userId);
      
      if (!hasCurrentUserStory) {
        // Get current user info
        const currentUser = await db.collection('users').findOne(
          { _id: new ObjectId(userId) },
          { projection: { username: 1, avatar: 1, name: 1 } }
        );

        const currentUserStory = {
          id: userId,
          username: currentUser?.username || currentUser?.name || 'You',
          avatar: currentUser?.avatar || '/default-avatar.png',
          stories: [],
          hasStory: false,
          lastUpdated: new Date(),
          viewedByUser: false
        };

        storyArray.unshift(currentUserStory);
      }
    }

    // Limit to first 20 story groups to avoid overwhelming the UI
    storyArray = storyArray.slice(0, 20);

    res.json({
      success: true,
      stories: storyArray,
      totalGroups: storyArray.length,
      totalStories: stories.length
    });

  } catch (error) {
    console.error('Stories feed error:', error);
    
    // Return mock stories on error
    const mockStories = [
      {
        id: 'current_user',
        username: 'You',
        avatar: '/default-avatar.png',
        stories: [],
        hasStory: false,
        lastUpdated: new Date(),
        viewedByUser: false
      },
      {
        id: '1',
        username: 'cryptoqueen',
        avatar: 'https://i.pravatar.cc/150?img=1',
        stories: [
          {
            id: '1',
            type: 'image',
            mediaUrl: 'https://source.unsplash.com/400x600?crypto',
    // Return mock stories on error
    const mockStories = [
      {
        id: 'current_user',
        username: 'You',
        avatar: '/default-avatar.png',
        stories: [],
        hasStory: false,
        lastUpdated: new Date(),
        viewedByUser: false
      },
      {
        id: '1',
        username: 'cryptoqueen',
        avatar: 'https://i.pravatar.cc/150?img=1',
        stories: [
          {
            id: '1',
            type: 'image',
            mediaUrl: 'https://source.unsplash.com/400x600?crypto',
            content: 'Just minted my latest NFT! 🚀',
            duration: 5000,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            views: 45,
            reactions: ['🔥', '💎', '🚀']
          }
        ],
        hasStory: true,
        lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000),
        viewedByUser: false
      },
      {
        id: '2', 
        username: 'blockbuilder',
        avatar: 'https://i.pravatar.cc/150?img=2',
        stories: [
          {
            id: '2',
            type: 'text',
            content: 'Building the future with CYBEV! 💯',
            backgroundColor: '#667eea',
            textColor: '#ffffff',
            duration: 4000,
            createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
            views: 23,
            reactions: ['👏', '💪']
          }
        ],
        hasStory: true,
        lastUpdated: new Date(Date.now() - 4 * 60 * 60 * 1000),
        viewedByUser: true
      },
      {
        id: '3',
        username: 'nftartist',
        avatar: 'https://i.pravatar.cc/150?img=3',
        stories: [
          {
            id: '3',
            type: 'video',
            mediaUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_640x360_1mb.mp4',
            content: 'Creating digital art magic ✨',
            duration: 8000,
            createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
            views: 67,
            reactions: ['🎨', '✨', '😍']
          }
        ],
        hasStory: true,
        lastUpdated: new Date(Date.now() - 6 * 60 * 60 * 1000),
        viewedByUser: false
      },
      {
        id: '4',
        username: 'aiexpert',
        avatar: 'https://i.pravatar.cc/150?img=4',
        stories: [
          {
            id: '4',
            type: 'image',
            mediaUrl: 'https://source.unsplash.com/400x600?artificial-intelligence',
            content: 'AI is revolutionizing everything! 🤖',
            duration: 5000,
            createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
            views: 34,
            reactions: ['🤖', '🧠', '⚡']
          }
        ],
        hasStory: true,
        lastUpdated: new Date(Date.now() - 8 * 60 * 60 * 1000),
        viewedByUser: false
      }
    ];

    res.json({
      success: true,
      stories: mockStories,
      totalGroups: mockStories.length,
      totalStories: mockStories.reduce((sum, group) => sum + group.stories.length, 0),
      mock: true
    });
  }
}