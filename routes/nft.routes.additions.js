// ============================================
// FILE: routes/nft.routes.additions.js
// NFT Routes - Auto Post to Feed on Mint
// ADD TO YOUR EXISTING nft.routes.js
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Auth middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    next();
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }
};

// Helper: Create feed post for NFT
const createNftFeedPost = async (nft, userId) => {
  try {
    const Post = mongoose.models.Post || require('../models/post.model');
    
    // Create a post about the NFT
    const post = new Post({
      author: userId,
      content: `🎨 Just minted a new NFT!\n\n"${nft.name}"\n\n${nft.description || ''}\n\n#NFT #Web3 #CYBEV`,
      media: nft.image ? [{
        type: 'image',
        url: nft.image
      }] : [],
      postType: 'nft',
      nftData: {
        nftId: nft._id,
        name: nft.name,
        image: nft.image,
        price: nft.price,
        tokenId: nft.tokenId,
        contractAddress: nft.contractAddress
      },
      isPublished: true
    });

    await post.save();
    return post;
  } catch (err) {
    console.error('Create NFT feed post error:', err);
    return null;
  }
};

// POST /api/nfts - Create/Mint NFT (with feed post)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      name,
      description,
      image,
      price,
      royalties,
      collection,
      attributes,
      category,
      postToFeed = true // Default to posting to feed
    } = req.body;

    if (!name || !image) {
      return res.status(400).json({ ok: false, error: 'Name and image are required' });
    }

    const NFT = mongoose.models.NFT || require('../models/nft.model');

    const nft = new NFT({
      name,
      description,
      image,
      creator: req.user.id,
      owner: req.user.id,
      price: price || 0,
      royalties: royalties || 0,
      collection,
      attributes: attributes || [],
      category: category || 'art',
      status: 'minted',
      mintedAt: new Date()
    });

    await nft.save();

    // Create feed post if enabled
    let feedPost = null;
    if (postToFeed) {
      feedPost = await createNftFeedPost(nft, req.user.id);
    }

    res.status(201).json({
      ok: true,
      nft,
      feedPost: feedPost ? {
        _id: feedPost._id,
        message: 'NFT shared to your feed!'
      } : null
    });

  } catch (error) {
    console.error('Mint NFT error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/nfts/:id/share-to-feed - Share existing NFT to feed
router.post('/:id/share-to-feed', verifyToken, async (req, res) => {
  try {
    const NFT = mongoose.models.NFT || require('../models/nft.model');
    const nft = await NFT.findById(req.params.id);

    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found' });
    }

    // Only owner or creator can share
    if (nft.owner.toString() !== req.user.id && nft.creator.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const feedPost = await createNftFeedPost(nft, req.user.id);

    if (!feedPost) {
      return res.status(500).json({ ok: false, error: 'Failed to create feed post' });
    }

    res.json({
      ok: true,
      feedPost: {
        _id: feedPost._id,
        message: 'NFT shared to your feed!'
      }
    });

  } catch (error) {
    console.error('Share NFT to feed error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;

/* ============================================
 * INTEGRATION INSTRUCTIONS:
 * 
 * Option 1: Replace your existing NFT create endpoint
 * 
 * Option 2: Add the share-to-feed endpoint to your existing routes:
 * 
 * In your existing nft.routes.js, add after the mint endpoint:
 * 
 * // Share NFT to feed
 * router.post('/:id/share-to-feed', verifyToken, async (req, res) => {
 *   // ... copy the code from above
 * });
 * 
 * ============================================ */
