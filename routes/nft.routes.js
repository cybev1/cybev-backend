// ============================================
// FILE: routes/nft.routes.js
// PATH: cybev-backend/routes/nft.routes.js
// PURPOSE: NFT minting, marketplace, and management
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// ==========================================
// NFT SCHEMA
// ==========================================

let NFT, Collection;

try {
  NFT = mongoose.model('NFT');
} catch {
  const nftSchema = new mongoose.Schema({
    // Basic Info
    name: { type: String, required: true },
    description: { type: String, default: '' },
    image: { type: String, required: true }, // IPFS or Cloudinary URL
    animationUrl: String, // For video/audio NFTs
    externalUrl: String,
    
    // Creator & Owner
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Collection
    collection: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection' },
    
    // Blockchain Data
    tokenId: { type: String, unique: true, sparse: true },
    contractAddress: String,
    chainId: { type: Number, default: 137 }, // Polygon mainnet
    transactionHash: String,
    mintedAt: Date,
    
    // Metadata
    attributes: [{
      trait_type: String,
      value: mongoose.Schema.Types.Mixed,
      display_type: String // number, date, etc.
    }],
    category: { 
      type: String, 
      enum: ['art', 'music', 'video', 'photography', 'collectible', 'gaming', 'other'],
      default: 'art'
    },
    
    // Marketplace
    isListed: { type: Boolean, default: false },
    listingPrice: { type: Number, default: 0 }, // In CYBEV tokens
    listingType: { type: String, enum: ['fixed', 'auction'], default: 'fixed' },
    auctionEndTime: Date,
    highestBid: { type: Number, default: 0 },
    highestBidder: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bids: [{
      bidder: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      amount: Number,
      createdAt: { type: Date, default: Date.now }
    }],
    
    // Stats
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    
    // History
    history: [{
      event: { type: String, enum: ['minted', 'listed', 'unlisted', 'sold', 'transferred', 'bid'] },
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      price: Number,
      transactionHash: String,
      createdAt: { type: Date, default: Date.now }
    }],
    
    // Status
    status: { 
      type: String, 
      enum: ['draft', 'minting', 'minted', 'failed'],
      default: 'draft'
    },
    isHidden: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    
    // Royalties
    royaltyPercentage: { type: Number, default: 10, min: 0, max: 50 },
    
    // Content link (if NFT represents a blog post or content)
    linkedContent: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
    
    // Unlockable content
    hasUnlockable: { type: Boolean, default: false },
    unlockableContent: String // Encrypted or hidden until purchase
    
  }, { timestamps: true });

  nftSchema.index({ creator: 1, createdAt: -1 });
  nftSchema.index({ owner: 1 });
  nftSchema.index({ isListed: 1, listingPrice: 1 });
  nftSchema.index({ category: 1 });
  nftSchema.index({ collection: 1 });
  nftSchema.index({ tokenId: 1 });
  
  NFT = mongoose.model('NFT', nftSchema);
}

try {
  Collection = mongoose.model('Collection');
} catch {
  const collectionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    image: String, // Collection cover image
    banner: String,
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, default: 'art' },
    contractAddress: String,
    symbol: String,
    isVerified: { type: Boolean, default: false },
    floorPrice: { type: Number, default: 0 },
    totalVolume: { type: Number, default: 0 },
    itemCount: { type: Number, default: 0 },
    ownerCount: { type: Number, default: 0 },
    socialLinks: {
      website: String,
      twitter: String,
      discord: String
    }
  }, { timestamps: true });

  collectionSchema.index({ creator: 1 });
  collectionSchema.index({ isVerified: 1, totalVolume: -1 });
  
  Collection = mongoose.model('Collection', collectionSchema);
}

// ==========================================
// NFT CRUD OPERATIONS
// ==========================================

// GET /api/nft - Get all NFTs (marketplace)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      category, 
      sort = 'recent',
      listed,
      minPrice,
      maxPrice,
      creator,
      owner,
      collection,
      search
    } = req.query;

    const query = { status: 'minted', isHidden: false };
    
    if (category && category !== 'all') query.category = category;
    if (listed === 'true') query.isListed = true;
    if (creator) query.creator = creator;
    if (owner) query.owner = owner;
    if (collection) query.collection = collection;
    
    if (minPrice || maxPrice) {
      query.listingPrice = {};
      if (minPrice) query.listingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.listingPrice.$lte = parseFloat(maxPrice);
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    let sortOption = { createdAt: -1 };
    switch (sort) {
      case 'price_low': sortOption = { listingPrice: 1 }; break;
      case 'price_high': sortOption = { listingPrice: -1 }; break;
      case 'popular': sortOption = { views: -1 }; break;
      case 'likes': sortOption = { likes: -1 }; break;
      case 'oldest': sortOption = { createdAt: 1 }; break;
    }

    const nfts = await NFT.find(query)
      .populate('creator', 'name username avatar')
      .populate('owner', 'name username avatar')
      .populate('collection', 'name image')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await NFT.countDocuments(query);

    res.json({
      ok: true,
      nfts,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      hasMore: nfts.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Get NFTs error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get NFTs' });
  }
});

// GET /api/nft/featured - Get featured NFTs
router.get('/featured', async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const nfts = await NFT.find({ 
      status: 'minted', 
      isHidden: false,
      $or: [{ isFeatured: true }, { isListed: true }]
    })
      .populate('creator', 'name username avatar')
      .populate('owner', 'name username avatar')
      .sort({ isFeatured: -1, views: -1 })
      .limit(parseInt(limit));

    res.json({ ok: true, nfts });
  } catch (error) {
    console.error('Get featured error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get featured NFTs' });
  }
});

// GET /api/nft/:nftId - Get single NFT
router.get('/:nftId', async (req, res) => {
  try {
    const { nftId } = req.params;

    const nft = await NFT.findById(nftId)
      .populate('creator', 'name username avatar bio')
      .populate('owner', 'name username avatar')
      .populate('collection', 'name image description')
      .populate('history.from', 'name username avatar')
      .populate('history.to', 'name username avatar')
      .populate('bids.bidder', 'name username avatar');

    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found' });
    }

    // Increment views
    nft.views += 1;
    await nft.save();

    res.json({ ok: true, nft });
  } catch (error) {
    console.error('Get NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get NFT' });
  }
});

// POST /api/nft - Create/Mint NFT
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      description,
      image,
      animationUrl,
      externalUrl,
      category,
      attributes,
      collection,
      royaltyPercentage,
      isListed,
      listingPrice,
      listingType,
      auctionEndTime,
      hasUnlockable,
      unlockableContent,
      linkedContent
    } = req.body;

    if (!name || !image) {
      return res.status(400).json({ ok: false, error: 'Name and image are required' });
    }

    // Create NFT
    const nft = await NFT.create({
      name,
      description: description || '',
      image,
      animationUrl,
      externalUrl,
      category: category || 'art',
      attributes: attributes || [],
      creator: userId,
      owner: userId,
      collection: collection || null,
      royaltyPercentage: royaltyPercentage || 10,
      isListed: isListed || false,
      listingPrice: listingPrice || 0,
      listingType: listingType || 'fixed',
      auctionEndTime: auctionEndTime || null,
      hasUnlockable: hasUnlockable || false,
      unlockableContent: unlockableContent || null,
      linkedContent: linkedContent || null,
      status: 'draft',
      history: [{
        event: 'minted',
        from: null,
        to: userId,
        createdAt: new Date()
      }]
    });

    // Update collection item count
    if (collection) {
      await Collection.updateOne(
        { _id: collection },
        { $inc: { itemCount: 1 } }
      );
    }

    const populatedNft = await NFT.findById(nft._id)
      .populate('creator', 'name username avatar')
      .populate('collection', 'name image');

    res.json({ ok: true, nft: populatedNft });
  } catch (error) {
    console.error('Create NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to create NFT' });
  }
});

// POST /api/nft/:nftId/mint - Confirm blockchain mint
router.post('/:nftId/mint', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nftId } = req.params;
    const { tokenId, transactionHash, contractAddress } = req.body;

    const nft = await NFT.findOne({ _id: nftId, creator: userId });
    
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found or not authorized' });
    }

    nft.tokenId = tokenId;
    nft.transactionHash = transactionHash;
    nft.contractAddress = contractAddress;
    nft.status = 'minted';
    nft.mintedAt = new Date();
    await nft.save();

    res.json({ ok: true, nft });
  } catch (error) {
    console.error('Mint NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to confirm mint' });
  }
});

// PUT /api/nft/:nftId - Update NFT
router.put('/:nftId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nftId } = req.params;
    const updates = req.body;

    const nft = await NFT.findOne({ _id: nftId, creator: userId });
    
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found or not authorized' });
    }

    // Only allow certain updates
    const allowedUpdates = ['name', 'description', 'category', 'attributes', 'isHidden'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        nft[field] = updates[field];
      }
    });

    await nft.save();

    res.json({ ok: true, nft });
  } catch (error) {
    console.error('Update NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update NFT' });
  }
});

// DELETE /api/nft/:nftId - Delete NFT (only drafts)
router.delete('/:nftId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nftId } = req.params;

    const nft = await NFT.findOne({ _id: nftId, creator: userId, status: 'draft' });
    
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found or cannot be deleted' });
    }

    await NFT.deleteOne({ _id: nftId });

    res.json({ ok: true, message: 'NFT deleted' });
  } catch (error) {
    console.error('Delete NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete NFT' });
  }
});

// ==========================================
// MARKETPLACE OPERATIONS
// ==========================================

// POST /api/nft/:nftId/list - List NFT for sale
router.post('/:nftId/list', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nftId } = req.params;
    const { price, listingType = 'fixed', auctionEndTime } = req.body;

    if (!price || price <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid price required' });
    }

    const nft = await NFT.findOne({ _id: nftId, owner: userId, status: 'minted' });
    
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found or not authorized' });
    }

    nft.isListed = true;
    nft.listingPrice = price;
    nft.listingType = listingType;
    nft.auctionEndTime = listingType === 'auction' ? auctionEndTime : null;
    nft.history.push({
      event: 'listed',
      from: userId,
      price,
      createdAt: new Date()
    });
    
    await nft.save();

    res.json({ ok: true, nft });
  } catch (error) {
    console.error('List NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to list NFT' });
  }
});

// POST /api/nft/:nftId/unlist - Remove NFT from sale
router.post('/:nftId/unlist', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nftId } = req.params;

    const nft = await NFT.findOne({ _id: nftId, owner: userId });
    
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found or not authorized' });
    }

    nft.isListed = false;
    nft.listingPrice = 0;
    nft.bids = [];
    nft.highestBid = 0;
    nft.highestBidder = null;
    nft.history.push({
      event: 'unlisted',
      from: userId,
      createdAt: new Date()
    });
    
    await nft.save();

    res.json({ ok: true, nft });
  } catch (error) {
    console.error('Unlist NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to unlist NFT' });
  }
});

// POST /api/nft/:nftId/buy - Buy NFT (fixed price)
router.post('/:nftId/buy', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nftId } = req.params;
    const { transactionHash } = req.body;

    const nft = await NFT.findOne({ 
      _id: nftId, 
      isListed: true, 
      listingType: 'fixed',
      status: 'minted'
    });
    
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found or not for sale' });
    }

    if (nft.owner.toString() === userId) {
      return res.status(400).json({ ok: false, error: 'Cannot buy your own NFT' });
    }

    const previousOwner = nft.owner;
    const salePrice = nft.listingPrice;

    // Transfer ownership
    nft.owner = userId;
    nft.isListed = false;
    nft.listingPrice = 0;
    nft.history.push({
      event: 'sold',
      from: previousOwner,
      to: userId,
      price: salePrice,
      transactionHash,
      createdAt: new Date()
    });
    
    await nft.save();

    // Update collection stats
    if (nft.collection) {
      await Collection.updateOne(
        { _id: nft.collection },
        { $inc: { totalVolume: salePrice } }
      );
    }

    // Create notifications
    try {
      const Notification = mongoose.model('Notification');
      const User = mongoose.model('User');
      const buyer = await User.findById(userId).select('name');

      await Notification.create({
        recipient: previousOwner,
        sender: userId,
        type: 'nft_sold',
        message: `${buyer?.name || 'Someone'} bought your NFT "${nft.name}" for ${salePrice} CYBEV`,
        relatedNFT: nft._id
      });
    } catch (notifError) {
      console.log('Notification failed:', notifError.message);
    }

    res.json({ ok: true, nft, message: 'Purchase successful' });
  } catch (error) {
    console.error('Buy NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to buy NFT' });
  }
});

// POST /api/nft/:nftId/bid - Place bid (auction)
router.post('/:nftId/bid', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nftId } = req.params;
    const { amount } = req.body;

    const nft = await NFT.findOne({ 
      _id: nftId, 
      isListed: true, 
      listingType: 'auction',
      status: 'minted'
    });
    
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found or not in auction' });
    }

    if (nft.owner.toString() === userId) {
      return res.status(400).json({ ok: false, error: 'Cannot bid on your own NFT' });
    }

    if (nft.auctionEndTime && new Date() > nft.auctionEndTime) {
      return res.status(400).json({ ok: false, error: 'Auction has ended' });
    }

    if (amount <= nft.highestBid) {
      return res.status(400).json({ ok: false, error: 'Bid must be higher than current highest bid' });
    }

    if (amount < nft.listingPrice) {
      return res.status(400).json({ ok: false, error: 'Bid must be at least the starting price' });
    }

    nft.bids.push({
      bidder: userId,
      amount,
      createdAt: new Date()
    });
    nft.highestBid = amount;
    nft.highestBidder = userId;
    nft.history.push({
      event: 'bid',
      from: userId,
      price: amount,
      createdAt: new Date()
    });
    
    await nft.save();

    res.json({ ok: true, nft });
  } catch (error) {
    console.error('Bid error:', error);
    res.status(500).json({ ok: false, error: 'Failed to place bid' });
  }
});

// POST /api/nft/:nftId/like - Like/unlike NFT
router.post('/:nftId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nftId } = req.params;

    const nft = await NFT.findById(nftId);
    
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found' });
    }

    const hasLiked = nft.likedBy.includes(userId);
    
    if (hasLiked) {
      nft.likedBy = nft.likedBy.filter(id => id.toString() !== userId);
      nft.likes = Math.max(0, nft.likes - 1);
    } else {
      nft.likedBy.push(userId);
      nft.likes += 1;
    }

    await nft.save();

    res.json({ ok: true, liked: !hasLiked, likes: nft.likes });
  } catch (error) {
    console.error('Like NFT error:', error);
    res.status(500).json({ ok: false, error: 'Failed to like NFT' });
  }
});

// ==========================================
// COLLECTIONS
// ==========================================

// GET /api/nft/collections - Get all collections
router.get('/collections/all', async (req, res) => {
  try {
    const { page = 1, limit = 20, creator } = req.query;

    const query = {};
    if (creator) query.creator = creator;

    const collections = await Collection.find(query)
      .populate('creator', 'name username avatar')
      .sort({ totalVolume: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ ok: true, collections });
  } catch (error) {
    console.error('Get collections error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get collections' });
  }
});

// POST /api/nft/collections - Create collection
router.post('/collections', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, image, banner, category, symbol, socialLinks } = req.body;

    if (!name) {
      return res.status(400).json({ ok: false, error: 'Collection name required' });
    }

    const collection = await Collection.create({
      name,
      description,
      image,
      banner,
      category,
      symbol,
      socialLinks,
      creator: userId
    });

    res.json({ ok: true, collection });
  } catch (error) {
    console.error('Create collection error:', error);
    res.status(500).json({ ok: false, error: 'Failed to create collection' });
  }
});

// GET /api/nft/collections/:collectionId - Get single collection
router.get('/collections/:collectionId', async (req, res) => {
  try {
    const { collectionId } = req.params;

    const collection = await Collection.findById(collectionId)
      .populate('creator', 'name username avatar');

    if (!collection) {
      return res.status(404).json({ ok: false, error: 'Collection not found' });
    }

    // Get collection NFTs
    const nfts = await NFT.find({ collection: collectionId, status: 'minted', isHidden: false })
      .populate('owner', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ ok: true, collection, nfts });
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get collection' });
  }
});

// ==========================================
// USER NFTs
// ==========================================

// GET /api/nft/user/:userId - Get user's NFTs
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type = 'owned', page = 1, limit = 20 } = req.query;

    let query = { status: 'minted', isHidden: false };
    
    if (type === 'owned') {
      query.owner = userId;
    } else if (type === 'created') {
      query.creator = userId;
    } else if (type === 'listed') {
      query.owner = userId;
      query.isListed = true;
    }

    const nfts = await NFT.find(query)
      .populate('creator', 'name username avatar')
      .populate('collection', 'name image')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await NFT.countDocuments(query);

    res.json({ ok: true, nfts, total });
  } catch (error) {
    console.error('Get user NFTs error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get user NFTs' });
  }
});

// GET /api/nft/my - Get current user's NFTs
router.get('/my/all', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'all' } = req.query;

    let query = { $or: [{ owner: userId }, { creator: userId }] };
    
    if (type === 'owned') query = { owner: userId };
    if (type === 'created') query = { creator: userId };
    if (type === 'drafts') query = { creator: userId, status: 'draft' };

    const nfts = await NFT.find(query)
      .populate('collection', 'name image')
      .sort({ createdAt: -1 });

    res.json({ ok: true, nfts });
  } catch (error) {
    console.error('Get my NFTs error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get your NFTs' });
  }
});

module.exports = router;
