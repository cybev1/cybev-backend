// ============================================
// FILE: routes/nft.routes.js
// NFT Minting API
// ============================================
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Blog = require('../models/blog.model');
const User = require('../models/user.model');
const { createNotification } = require('../utils/notifications');

// NFT Model (inline for simplicity)
const mongoose = require('mongoose');
const nftSchema = new mongoose.Schema({
  blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallet: { type: String, required: true },
  tokenId: { type: String },
  contractAddress: { type: String },
  transactionHash: { type: String },
  metadata: {
    name: String,
    description: String,
    image: String,
    attributes: [{ trait_type: String, value: mongoose.Schema.Types.Mixed }]
  },
  mintedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'minted', 'failed'], default: 'pending' }
}, { timestamps: true });

let NFT;
try {
  NFT = mongoose.model('NFT');
} catch {
  NFT = mongoose.model('NFT', nftSchema);
}

// POST /api/nft/mint - Mint blog as NFT
router.post('/mint', verifyToken, async (req, res) => {
  try {
    const { blogId, wallet, signature, message } = req.body;

    if (!blogId || !wallet) {
      return res.status(400).json({ ok: false, error: 'Blog ID and wallet required' });
    }

    // Get blog
    const blog = await Blog.findById(blogId).populate('author', 'name username');
    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Verify ownership
    if (blog.author._id.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Only the author can mint this blog' });
    }

    // Check if already minted
    const existingNFT = await NFT.findOne({ blog: blogId });
    if (existingNFT) {
      return res.status(400).json({ ok: false, error: 'Blog already minted as NFT' });
    }

    // Generate mock token ID (in production, this would come from blockchain)
    const tokenId = `CYBEV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const contractAddress = process.env.NFT_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

    // Create NFT record
    const nft = new NFT({
      blog: blogId,
      owner: req.user.id,
      wallet: wallet.toLowerCase(),
      tokenId,
      contractAddress,
      transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`, // Mock tx hash
      metadata: {
        name: blog.title,
        description: blog.excerpt || blog.content?.substring(0, 200),
        image: blog.featuredImage || '',
        attributes: [
          { trait_type: 'Author', value: blog.author.username },
          { trait_type: 'Category', value: blog.category },
          { trait_type: 'Views', value: blog.views || 0 },
          { trait_type: 'Likes', value: blog.likes?.length || 0 },
          { trait_type: 'Created', value: blog.createdAt.toISOString().split('T')[0] }
        ]
      },
      status: 'minted'
    });

    await nft.save();

    // Update blog with NFT reference
    blog.nft = nft._id;
    blog.isNFT = true;
    await blog.save();

    // Award tokens for minting
    try {
      const Wallet = require('../models/wallet.model');
      let userWallet = await Wallet.findOne({ user: req.user.id });
      if (userWallet) {
        await userWallet.addTokens(10, 'NFT_MINT', 'Minted blog as NFT', blogId);
      }
    } catch (e) {
      console.log('Token reward failed:', e.message);
    }

    // Send notification
    await createNotification({
      recipient: req.user.id,
      type: 'reward',
      message: `Your blog "${blog.title.substring(0, 30)}..." was minted as NFT!`
    });

    res.json({
      ok: true,
      nft: {
        _id: nft._id,
        tokenId: nft.tokenId,
        contractAddress: nft.contractAddress,
        transactionHash: nft.transactionHash,
        metadata: nft.metadata
      }
    });
  } catch (error) {
    console.error('NFT mint error:', error);
    res.status(500).json({ ok: false, error: 'Failed to mint NFT' });
  }
});

// GET /api/nft/my-nfts - Get user's NFTs
router.get('/my-nfts', verifyToken, async (req, res) => {
  try {
    const nfts = await NFT.find({ owner: req.user.id })
      .populate('blog', 'title excerpt featuredImage views likes')
      .sort({ mintedAt: -1 });

    res.json({ ok: true, nfts });
  } catch (error) {
    console.error('Get NFTs error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch NFTs' });
  }
});

// GET /api/nft/:id - Get NFT details
router.get('/:id', async (req, res) => {
  try {
    const nft = await NFT.findById(req.params.id)
      .populate('blog', 'title content excerpt featuredImage views likes author')
      .populate('owner', 'name username');

    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT not found' });
    }

    res.json({ ok: true, nft });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch NFT' });
  }
});

// GET /api/nft/blog/:blogId - Check if blog is minted
router.get('/blog/:blogId', async (req, res) => {
  try {
    const nft = await NFT.findOne({ blog: req.params.blogId });
    res.json({ ok: true, isMinted: !!nft, nft: nft || null });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to check NFT status' });
  }
});

module.exports = router;
