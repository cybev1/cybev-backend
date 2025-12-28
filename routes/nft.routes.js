// ============================================
// FILE: routes/nft.routes.js
// NFT Minting API - REAL BLOCKCHAIN
// ============================================
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Blog = require('../models/blog.model');
const User = require('../models/user.model');
const blockchainService = require('../services/blockchain.service');
const { createNotification } = require('../utils/notifications');
const mongoose = require('mongoose');

// NFT Model
const nftSchema = new mongoose.Schema({
  blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallet: { type: String, required: true },
  tokenId: { type: String, required: true },
  contractAddress: { type: String, required: true },
  transactionHash: { type: String, required: true },
  chainId: { type: String },
  metadata: {
    name: String,
    description: String,
    image: String,
    external_url: String,
    attributes: [{ trait_type: String, value: mongoose.Schema.Types.Mixed }]
  },
  mintedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'minted', 'failed'], default: 'minted' }
}, { timestamps: true });

let NFT;
try {
  NFT = mongoose.model('NFT');
} catch {
  NFT = mongoose.model('NFT', nftSchema);
}

// POST /api/nft/mint - Mint blog as NFT (REAL BLOCKCHAIN)
router.post('/mint', verifyToken, async (req, res) => {
  try {
    const { blogId, wallet, signature } = req.body;

    if (!blogId || !wallet) {
      return res.status(400).json({ ok: false, error: 'Blog ID and wallet required' });
    }

    // Check if blockchain service is enabled
    if (!blockchainService.isEnabled()) {
      return res.status(503).json({ 
        ok: false, 
        error: 'Blockchain service not available. Please configure contract addresses.' 
      });
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

    // Check if already minted in database
    const existingNFT = await NFT.findOne({ blog: blogId });
    if (existingNFT) {
      return res.status(400).json({ ok: false, error: 'Blog already minted as NFT' });
    }

    // Check on blockchain
    const alreadyMinted = await blockchainService.isBlogMinted(blogId);
    if (alreadyMinted) {
      return res.status(400).json({ ok: false, error: 'Blog already minted on blockchain' });
    }

    // Generate metadata URI
    const metadataUri = blockchainService.generateMetadataUri(blogId);

    // Mint on blockchain
    console.log(`🔗 Minting NFT for blog ${blogId} to wallet ${wallet}...`);
    const mintResult = await blockchainService.mintBlogNFT(
      wallet.toLowerCase(),
      blogId,
      metadataUri
    );

    // Create NFT record in database
    const nft = new NFT({
      blog: blogId,
      owner: req.user.id,
      wallet: wallet.toLowerCase(),
      tokenId: mintResult.tokenId,
      contractAddress: mintResult.contractAddress,
      transactionHash: mintResult.txHash,
      chainId: process.env.CHAIN_ID || '137',
      metadata: {
        name: blog.title,
        description: blog.excerpt || blog.content?.substring(0, 200),
        image: blog.featuredImage || '',
        external_url: `${process.env.FRONTEND_URL || 'https://cybev.io'}/blog/${blogId}`,
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
    blog.nftTokenId = mintResult.tokenId;
    blog.nftContractAddress = mintResult.contractAddress;
    await blog.save();

    // Mint reward tokens (if configured)
    try {
      await blockchainService.mintReward(
        wallet.toLowerCase(),
        10, // 10 CYBEV tokens as reward
        `NFT mint reward for blog: ${blog.title.substring(0, 50)}`
      );
    } catch (rewardError) {
      console.log('Reward minting failed (non-critical):', rewardError.message);
    }

    // Send notification
    await createNotification({
      recipient: req.user.id,
      type: 'reward',
      message: `🎉 Your blog "${blog.title.substring(0, 30)}..." was minted as NFT #${mintResult.tokenId}!`
    });

    console.log(`✅ NFT minted: Token #${mintResult.tokenId}, Tx: ${mintResult.txHash}`);

    res.json({
      ok: true,
      nft: {
        _id: nft._id,
        tokenId: nft.tokenId,
        contractAddress: nft.contractAddress,
        transactionHash: nft.transactionHash,
        chainId: nft.chainId,
        metadata: nft.metadata,
        explorerUrl: `https://polygonscan.com/tx/${nft.transactionHash}`
      }
    });
  } catch (error) {
    console.error('NFT mint error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to mint NFT' });
  }
});

// GET /api/nft/metadata/:blogId - NFT Metadata endpoint (for OpenSea etc.)
router.get('/metadata/:blogId', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.blogId)
      .populate('author', 'name username avatar');
    
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    // ERC721 metadata standard
    const metadata = {
      name: blog.title,
      description: blog.excerpt || blog.content?.substring(0, 500),
      image: blog.featuredImage || 'https://cybev.io/nft-placeholder.png',
      external_url: `${process.env.FRONTEND_URL || 'https://cybev.io'}/blog/${blog._id}`,
      attributes: [
        { trait_type: 'Author', value: blog.author?.username || 'Unknown' },
        { trait_type: 'Author Name', value: blog.author?.name || 'Unknown' },
        { trait_type: 'Category', value: blog.category || 'General' },
        { trait_type: 'Views', value: blog.views || 0, display_type: 'number' },
        { trait_type: 'Likes', value: blog.likes?.length || 0, display_type: 'number' },
        { trait_type: 'Comments', value: blog.commentCount || 0, display_type: 'number' },
        { trait_type: 'Created Date', value: blog.createdAt?.toISOString().split('T')[0] || 'Unknown' },
        { trait_type: 'Platform', value: 'CYBEV' }
      ]
    };

    // Set proper content type for metadata
    res.setHeader('Content-Type', 'application/json');
    res.json(metadata);
  } catch (error) {
    console.error('Metadata fetch error:', error);
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

    // Add explorer URLs
    const chainId = nft.chainId || '137';
    const explorer = chainId === '137' ? 'https://polygonscan.com' : 'https://mumbai.polygonscan.com';

    res.json({ 
      ok: true, 
      nft: {
        ...nft.toObject(),
        explorerUrl: `${explorer}/tx/${nft.transactionHash}`,
        openSeaUrl: `https://opensea.io/assets/matic/${nft.contractAddress}/${nft.tokenId}`
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch NFT' });
  }
});

// GET /api/nft/blog/:blogId - Check if blog is minted
router.get('/blog/:blogId', async (req, res) => {
  try {
    // Check database first
    const nft = await NFT.findOne({ blog: req.params.blogId });
    
    if (nft) {
      return res.json({ ok: true, isMinted: true, nft });
    }

    // Also check blockchain if service is available
    if (blockchainService.isEnabled()) {
      const onChain = await blockchainService.isBlogMinted(req.params.blogId);
      if (onChain) {
        const tokenId = await blockchainService.getTokenIdForBlog(req.params.blogId);
        return res.json({ 
          ok: true, 
          isMinted: true, 
          onChainOnly: true,
          tokenId 
        });
      }
    }

    res.json({ ok: true, isMinted: false, nft: null });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to check NFT status' });
  }
});

// GET /api/nft/status - Get blockchain service status
router.get('/status', async (req, res) => {
  try {
    const enabled = blockchainService.isEnabled();
    const networkInfo = enabled ? await blockchainService.getNetworkInfo() : null;
    const gasPrice = enabled ? await blockchainService.getGasPrice() : null;

    res.json({
      ok: true,
      enabled,
      network: networkInfo,
      gasPrice,
      contracts: {
        token: process.env.CYBEV_TOKEN_ADDRESS || null,
        nft: process.env.CYBEV_NFT_ADDRESS || null,
        staking: process.env.CYBEV_STAKING_ADDRESS || null
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get status' });
  }
});

module.exports = router;
