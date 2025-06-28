
const { ethers } = require('ethers');
const axios = require('axios');
const NFT = require('../models/nft.model');

const provider = new ethers.JsonRpcProvider(process.env.MUMBAI_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractABI = require('../abis/CYBEVContentNFT.json');
const contractAddress = process.env.CONTRACT_ADDRESS;

console.log("📦 Using contract address:", contractAddress);

const contract = new ethers.Contract(contractAddress, contractABI, wallet);

exports.mintContentNFT = async (req, res) => {
  try {
    const { title, description, mediaUrl, userWallet } = req.body;

    const metadata = {
      name: title,
      description,
      image: mediaUrl
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

    const nftRecord = new NFT({
      wallet: userWallet,
      title,
      description,
      mediaUrl,
      metadataURI,
      txHash: receipt.hash,
      tokenId: receipt.logs[0].topics[3]
    });
    await nftRecord.save();

    res.status(200).json({ success: true, txHash: receipt.hash, tokenId: nftRecord.tokenId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Minting failed' });
  }
};
