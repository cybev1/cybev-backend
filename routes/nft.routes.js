// ============================================
// FILE: routes/nft.routes.js
// NFT Minting API - Real Blockchain
// ============================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

// NFT Schema
const nftSchema = new mongoose.Schema({
  blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallet: { type: String, required: true },
  tokenId: { type: String },
  contractAddress: { type: String, default: process.env.CYBEV_NFT_ADDRESS },
  transactionHash: { type: String },
  chainId: { type: String, default: '137' },
  metadata: {
    name: String,
    description: String,
    image: String,
    external_url: String
  },
  status: { type: String, enum: ['pending', 'minted', 'failed'], default: 'pending' },
  mintedAt: { type: Date }
}, { timestamps: true });

let NFT;
try {
  NFT = mongoose.model('NFT');
} catch {
  NFT = mongoose.model('NFT', nftSchema);
}

// POST /api/nft/mint - Record NFT mint
router.post('/mint', verifyToken, async (req, res) => {
  try {
    const { blogId, wallet, tokenId, transactionHash } = req.body;

    if (!blogId || !wallet) {
      return res.status(400).json({ ok: false, error: 'Blog ID and wallet required' });
    }

    const Blog = mongoose.model('Blog');
    const blog = await Blog.findById(blogId).populate('author', 'name username');
    
    if (!blog) {
      return res.status(404).json({ ok: false, error: 'Blog not found' });
    }

    // Check if already minted
    const existingNFT = await NFT.findOne({ blog: blogId });
    if (existingNFT) {
      return res.status(400).json({ ok: false, error: 'Blog already minted as NFT' });
    }

    // Create NFT record
    const nft = new NFT({
      blog: blogId,
      owner: req.user.id,
      wallet: wallet.toLowerCase(),
      tokenId: tokenId || null,
      transactionHash: transactionHash || null,
      contractAddress: process.env.CYBEV_NFT_ADDRESS,
      chainId: process.env.CHAIN_ID || '137',
      metadata: {
        name: blog.title,
        description: blog.excerpt || blog.content?.substring(0, 200),
        image: blog.featuredImage || '',
        external_url: `${process.env.FRONTEND_URL || 'https://cybev.io'}/blog/${blogId}`
      },
      status: tokenId ? 'minted' : 'pending',
      mintedAt: tokenId ? new Date() : null
    });

    await nft.save();

    // Update blog
    blog.nft = nft._id;
    blog.isNFT = true;
    if (tokenId) blog.nftTokenId = tokenId;
    await blog.save();

    res.json({
      ok: true,
      nft: {
        _id: nft._id,
        tokenId: nft.tokenId,
        contractAddress: nft.contractAddress,
        transactionHash: nft.transactionHash,
        status: nft.status
      }
    });
  } catch (error) {
    console.error('NFT mint error:', error);
    res.status(500).json({ ok: false, error: 'Failed to record NFT' });
  }
});

// PUT /api/nft/confirm/:id - Confirm NFT mint with transaction details
router.put('/confirm/:id', verifyToken, async (req, res) => {
  try {
    const { tokenId, transactionHash } = req.body;
    
    const nft = await NFT.findById(req.params.id);
    if (!nft) {
      return res.status(404).json({ ok: false, error: 'NFT record not found' });
    }

    if (nft.owner.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    nft.tokenId = tokenId;
    nft.transactionHash = transactionHash;
    nft.status = 'minted';
    nft.mintedAt = new Date();
    await nft.save();

    // Update blog
    const Blog = mongoose.model('Blog');
    await Blog.findByIdAndUpdate(nft.blog, { nftTokenId: tokenId });

    res.json({ ok: true, nft });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to confirm NFT' });
  }
});

// GET /api/nft/metadata/:blogId - NFT Metadata (OpenSea compatible)
router.get('/metadata/:blogId', async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const blog = await Blog.findById(req.params.blogId)
      .populate('author', 'name username avatar');
    
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    const metadata = {
      name: blog.title,
      description: blog.excerpt || blog.content?.substring(0, 500),
      image: blog.featuredImage || 'https://cybev.io/nft-placeholder.png',
      external_url: `${process.env.FRONTEND_URL || 'https://cybev.io'}/blog/${blog._id}`,
      attributes: [
        { trait_type: 'Author', value: blog.author?.username || 'Unknown' },
        { trait_type: 'Category', value: blog.category || 'General' },
        { trait_type: 'Views', value: blog.views || 0, display_type: 'number' },
        { trait_type: 'Likes', value: blog.likes?.length || 0, display_type: 'number' },
        { trait_type: 'Platform', value: 'CYBEV' }
      ]
    };

    res.setHeader('Content-Type', 'application/json');
    res.json(metadata);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metadata' });
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
    res.status(500).json({ ok: false, error: 'Failed to fetch NFTs' });
  }
});

// GET /api/nft/blog/:blogId - Check if blog is minted
router.get('/blog/:blogId', async (req, res) => {
  try {
    const nft = await NFT.findOne({ blog: req.params.blogId });
    res.json({ 
      ok: true, 
      isMinted: !!nft, 
      nft: nft || null 
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to check NFT status' });
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

    const explorer = nft.chainId === '137' 
      ? 'https://polygonscan.com' 
      : 'https://mumbai.polygonscan.com';

    res.json({ 
      ok: true, 
      nft: {
        ...nft.toObject(),
        explorerUrl: nft.transactionHash ? `${explorer}/tx/${nft.transactionHash}` : null,
        openSeaUrl: nft.tokenId ? `https://opensea.io/assets/matic/${nft.contractAddress}/${nft.tokenId}` : null
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch NFT' });
  }
});

// GET /api/nft/contract/info - Get contract info
router.get('/contract/info', (req, res) => {
  res.json({
    ok: true,
    contract: {
      address: process.env.CYBEV_NFT_ADDRESS || null,
      chainId: process.env.CHAIN_ID || '137',
      network: process.env.CHAIN_ID === '137' ? 'Polygon Mainnet' : 'Polygon Mumbai'
    }
  });
});

module.exports = router;
