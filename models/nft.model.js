const mongoose = require('mongoose');

const NFTSchema = new mongoose.Schema({
  wallet: String,
  title: String,
  description: String,
  mediaUrl: String,
  metadataURI: String,
  txHash: String,
  tokenId: String
}, { timestamps: true });

module.exports = mongoose.model('NFT', NFTSchema);