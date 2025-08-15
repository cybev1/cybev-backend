const clientPromise = require('../../lib/mongodb');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filter = 'all', page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
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
    
    let query = {};
    let sort = { createdAt: -1 };
    
    switch (filter) {
      case 'trending':
        query = { boosted: true };
        sort = { boostCount: -1, likes: -1, createdAt: -1 };
        break;
      case 'following':
        if (userId) {
          // Get user's following list
          const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
          const following = user?.following || [];
          query = { authorId: { $in: following.map(id => new ObjectId(id)) } };
        } else {
          // If not logged in, show all posts
          query = {};
        }
        break;
      default:
        // All posts
        query = {};
        break;
    }

    const posts = await db.collection('posts')
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    // Get author information for each post
    const postsWithAuthors = await Promise.all(
      posts.map(async (post) => {
        let author = { username: 'anonymous', avatar: '/default-avatar.png' };
        
        if (post.authorId) {
          const authorData = await db.collection('users').findOne(
            { _id: new ObjectId(post.authorId) },
            { projection: { username: 1, avatar: 1, name: 1 } }
          );
          
          if (authorData) {
            author = {
              username: authorData.username || authorData.name || 'user',
              avatar: authorData.avatar || '/default-avatar.png'
            };
          }
        }

        return {
          id: post._id,
          username: author.username,
          avatar: author.avatar,
          content: post.content,
          media: post.media || null,
          timestamp: formatTimeAgo(post.createdAt),
          likes: post.likes || 0,
          comments: post.comments?.length || 0,
          shares: post.shares || 0,
          boosted: post.boosted || false,
          boostCount: post.boostCount || 0,
          liked: false, // TODO: Check if current user liked this post
          createdAt: post.createdAt
        };
      })
    );

    // Sort again after processing (in case we need to sort by multiple fields)
    if (filter === 'trending') {
      postsWithAuthors.sort((a, b) => {
        if (b.boosted && !a.boosted) return 1;
        if (!b.boosted && a.boosted) return -1;
        return b.likes - a.likes;
      });
    }

    res.json({
      success: true,
      posts: postsWithAuthors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: posts.length === parseInt(limit)
      },
      filter
    });

  } catch (error) {
    console.error('Feed fetch error:', error);
    
    // Return mock data on error for development
    const mockPosts = [
      {
        id: 1,
        username: 'cryptoqueen',
        avatar: 'https://i.pravatar.cc/150?img=1',
        content: 'Just launched my blog with CYBEV! The AI content generator is incredible 🚀 #Web3 #BlogBuilder #CYBEV',
        media: 'https://source.unsplash.com/400x300?blog,technology',
        timestamp: '2h ago',
        likes: 45,
        comments: 12,
        shares: 8,
        boosted: true,
        boostCount: 3,
        liked: false
      },
      {
        id: 2,
        username: 'blockbuilder',
        avatar: 'https://i.pravatar.cc/150?img=2',
        content: 'The token earning system on CYBEV is genius! Getting rewarded for creating quality content feels amazing 💎',
        media: null,
        timestamp: '4h ago',
        likes: 38,
        comments: 15,
        shares: 6,
        boosted: false,
        boostCount: 0,
        liked: true
      },
      {
        id: 3,
        username: 'nftartist',
        avatar: 'https://i.pravatar.cc/150?img=3',
        content: 'Minted my first blog post as an NFT! This platform is the future of content creation 🎨',
        media: 'https://source.unsplash.com/400x300?nft,art',
        timestamp: '6h ago',
        likes: 62,
        comments: 20,
        shares: 14,
        boosted: true,
        boostCount: 5,
        liked: false
      }
    ];

    res.json({
      success: true,
      posts: mockPosts,
      pagination: {
        page: 1,
        limit: 20,
        hasMore: false
      },
      filter,
      mock: true
    });
  }
}
