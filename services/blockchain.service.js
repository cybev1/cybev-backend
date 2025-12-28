// ============================================
// FILE: services/blockchain.service.js
// Backend Blockchain Integration Service
// ============================================
const { ethers } = require('ethers');

// Contract ABIs
const CYBEV_TOKEN_ABI = [
  "function mintReward(address to, uint256 amount, string reason)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const CYBEV_NFT_ABI = [
  "function mintBlog(address to, bytes32 blogId, string uri) returns (uint256)",
  "function isBlogMinted(bytes32 blogId) view returns (bool)",
  "function getTokenIdForBlog(bytes32 blogId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const CYBEV_STAKING_ABI = [
  "function getUserStakes(address user) view returns (uint256[], uint256[], uint256[], uint8[], uint256[])",
  "function calculateRewards(address user, uint256 stakeId) view returns (uint256)"
];

class BlockchainService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.tokenContract = null;
    this.nftContract = null;
    this.stakingContract = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'https://polygon-rpc.com';
      const privateKey = process.env.MINTER_PRIVATE_KEY;

      if (!privateKey) {
        console.log('⚠️  MINTER_PRIVATE_KEY not set - blockchain features disabled');
        return;
      }

      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.signer = new ethers.Wallet(privateKey, this.provider);

      // Initialize contracts if addresses are set
      if (process.env.CYBEV_TOKEN_ADDRESS) {
        this.tokenContract = new ethers.Contract(
          process.env.CYBEV_TOKEN_ADDRESS,
          CYBEV_TOKEN_ABI,
          this.signer
        );
      }

      if (process.env.CYBEV_NFT_ADDRESS) {
        this.nftContract = new ethers.Contract(
          process.env.CYBEV_NFT_ADDRESS,
          CYBEV_NFT_ABI,
          this.signer
        );
      }

      if (process.env.CYBEV_STAKING_ADDRESS) {
        this.stakingContract = new ethers.Contract(
          process.env.CYBEV_STAKING_ADDRESS,
          CYBEV_STAKING_ABI,
          this.signer
        );
      }

      this.initialized = true;
      console.log('✅ Blockchain service initialized');
      console.log(`   Minter address: ${this.signer.address}`);
    } catch (error) {
      console.error('❌ Blockchain service initialization failed:', error.message);
    }
  }

  isEnabled() {
    return this.initialized && !!this.tokenContract;
  }

  // ==========================================
  // TOKEN FUNCTIONS
  // ==========================================

  /**
   * Mint reward tokens to a user
   * @param {string} userWallet - User's wallet address
   * @param {number} amount - Amount in CYBEV tokens (will be converted to wei)
   * @param {string} reason - Reason for minting (logged on-chain)
   */
  async mintReward(userWallet, amount, reason) {
    if (!this.tokenContract) {
      throw new Error('Token contract not initialized');
    }

    try {
      const amountWei = ethers.parseEther(amount.toString());
      const tx = await this.tokenContract.mintReward(userWallet, amountWei, reason);
      const receipt = await tx.wait();
      
      return {
        success: true,
        txHash: receipt.hash,
        amount: amount
      };
    } catch (error) {
      console.error('Mint reward error:', error);
      throw error;
    }
  }

  /**
   * Get token balance for an address
   */
  async getTokenBalance(address) {
    if (!this.tokenContract) return '0';
    
    try {
      const balance = await this.tokenContract.balanceOf(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Get balance error:', error);
      return '0';
    }
  }

  // ==========================================
  // NFT FUNCTIONS
  // ==========================================

  /**
   * Mint a blog post as NFT
   * @param {string} authorWallet - Author's wallet address
   * @param {string} blogId - MongoDB ObjectId as string
   * @param {string} metadataUri - IPFS or API URI for metadata
   */
  async mintBlogNFT(authorWallet, blogId, metadataUri) {
    if (!this.nftContract) {
      throw new Error('NFT contract not initialized');
    }

    try {
      // Convert blog ID to bytes32
      const blogIdBytes = this.blogIdToBytes32(blogId);

      // Check if already minted
      const isMinted = await this.nftContract.isBlogMinted(blogIdBytes);
      if (isMinted) {
        throw new Error('Blog already minted as NFT');
      }

      // Mint NFT
      const tx = await this.nftContract.mintBlog(authorWallet, blogIdBytes, metadataUri);
      const receipt = await tx.wait();

      // Parse event to get token ID
      let tokenId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = this.nftContract.interface.parseLog(log);
          if (parsed?.name === 'BlogMinted') {
            tokenId = parsed.args.tokenId.toString();
            break;
          }
        } catch {}
      }

      return {
        success: true,
        tokenId,
        txHash: receipt.hash,
        contractAddress: await this.nftContract.getAddress()
      };
    } catch (error) {
      console.error('Mint NFT error:', error);
      throw error;
    }
  }

  /**
   * Check if a blog has been minted
   */
  async isBlogMinted(blogId) {
    if (!this.nftContract) return false;
    
    try {
      const blogIdBytes = this.blogIdToBytes32(blogId);
      return await this.nftContract.isBlogMinted(blogIdBytes);
    } catch {
      return false;
    }
  }

  /**
   * Get token ID for a blog
   */
  async getTokenIdForBlog(blogId) {
    if (!this.nftContract) return null;
    
    try {
      const blogIdBytes = this.blogIdToBytes32(blogId);
      const tokenId = await this.nftContract.getTokenIdForBlog(blogIdBytes);
      return tokenId.toString();
    } catch {
      return null;
    }
  }

  // ==========================================
  // STAKING FUNCTIONS
  // ==========================================

  /**
   * Get user's stakes from blockchain
   */
  async getUserStakes(userWallet) {
    if (!this.stakingContract) return [];

    try {
      const result = await this.stakingContract.getUserStakes(userWallet);
      const stakes = [];
      
      const tierNames = ['Bronze', 'Silver', 'Gold', 'Diamond'];
      
      for (let i = 0; i < result[0].length; i++) {
        stakes.push({
          stakeId: result[0][i].toString(),
          amount: ethers.formatEther(result[1][i]),
          endTime: new Date(Number(result[2][i]) * 1000),
          tier: tierNames[result[3][i]],
          pendingRewards: ethers.formatEther(result[4][i])
        });
      }
      
      return stakes;
    } catch (error) {
      console.error('Get stakes error:', error);
      return [];
    }
  }

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  /**
   * Convert MongoDB ObjectId to bytes32
   */
  blogIdToBytes32(blogId) {
    // MongoDB ObjectId is 24 hex characters (12 bytes)
    // Pad to 32 bytes
    const hex = blogId.toString().padStart(64, '0');
    return '0x' + hex;
  }

  /**
   * Generate NFT metadata URI
   */
  generateMetadataUri(blogId) {
    const baseUrl = process.env.API_BASE_URL || 'https://api.cybev.io';
    return `${baseUrl}/api/nft/metadata/${blogId}`;
  }

  /**
   * Get network info
   */
  async getNetworkInfo() {
    if (!this.provider) return null;
    
    try {
      const network = await this.provider.getNetwork();
      return {
        chainId: network.chainId.toString(),
        name: network.name
      };
    } catch {
      return null;
    }
  }

  /**
   * Get gas price
   */
  async getGasPrice() {
    if (!this.provider) return null;
    
    try {
      const feeData = await this.provider.getFeeData();
      return {
        gasPrice: ethers.formatUnits(feeData.gasPrice || 0, 'gwei'),
        maxFeePerGas: ethers.formatUnits(feeData.maxFeePerGas || 0, 'gwei'),
        maxPriorityFeePerGas: ethers.formatUnits(feeData.maxPriorityFeePerGas || 0, 'gwei')
      };
    } catch {
      return null;
    }
  }
}

// Export singleton instance
const blockchainService = new BlockchainService();

// Initialize on import
blockchainService.initialize().catch(console.error);

module.exports = blockchainService;
module.exports.BlockchainService = BlockchainService;
