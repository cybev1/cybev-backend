
import { ethers } from 'ethers';
import axios from 'axios';

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.MUMBAI_RPC_URL;

const abi = [
  "function stake(uint256 amount) public",
  "function getStake(address user) public view returns (uint256)"
];

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { amount } = req.body;

    try {
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

      const tx = await contract.stake(ethers.utils.parseUnits(amount.toString(), 18));
      const receipt = await tx.wait();

      res.status(200).json({
        success: true,
        txHash: receipt.transactionHash,
        amount
      });
    } catch (error) {
      console.error("Staking Error:", error);
      res.status(500).json({ error: "Staking failed" });
    }
  } else if (req.method === 'GET') {
    const { address } = req.query;
    try {
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
      const staked = await contract.getStake(address);
      res.status(200).json({ address, staked: staked.toString() });
    } catch (error) {
      console.error("Fetch Stake Error:", error);
      res.status(500).json({ error: "Unable to fetch stake" });
    }
  } else {
    res.status(405).end();
  }
}
