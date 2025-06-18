
const { ethers } = require('ethers');
const axios = require('axios');

const provider = new ethers.JsonRpcProvider(process.env.MUMBAI_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractABI = require('../abis/CYBEVContentNFT.json');
const contractAddress = process.env.CONTRACT_ADDRESS;

console.log("📦 Using contract address for badges:", contractAddress);

const contract = new ethers.Contract(contractAddress, contractABI, wallet);

const badgeImages = {
  bronze: "https://cdn.cybev.io/badges/bronze.png",
  silver: "https://cdn.cybev.io/badges/silver.png",
  gold: "https://cdn.cybev.io/badges/gold.png",
  diamond: "https://cdn.cybev.io/badges/diamond.png"
};

exports.mintBadge = async (req, res) => {
  try {
    const { tier, userWallet } = req.body;

    if (!badgeImages[tier]) {
      return res.status(400).json({ error: "Invalid badge tier" });
    }

    const metadata = {
      name: `CYBEV ${tier.charAt(0).toUpperCase() + tier.slice(1)} Badge`,
      description: `Official ${tier} staking badge for CYBEV users.`,
      image: badgeImages[tier]
    };

    const ipfsRes = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', metadata, {
      headers: {
        'pinata_api_key': process.env.PINATA_API_KEY,
        'pinata_secret_api_key': process.env.PINATA_SECRET_API_KEY
      }
    });

    const metadataURI = `https://gateway.pinata.cloud/ipfs/${ipfsRes.data.IpfsHash}`;

    const tx = await contract.mint(userWallet, metadataURI);
    const receipt = await tx.wait();

    res.status(200).json({
      success: true,
      txHash: receipt.hash,
      metadataURI,
      badgeTier: tier
    });
  } catch (error) {
    console.error("Mint Badge Error:", error);
    res.status(500).json({ error: "Badge minting failed" });
  }
};
