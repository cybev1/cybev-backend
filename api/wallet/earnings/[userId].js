// Backend API: Fetch wallet and earnings data for a user
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    // Fetch wallet data (balance in CYBV and USD)
    const wallet = await db.collection('wallets').findOne({ userId });

    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    // Fetch earnings data
    const earnings = await db.collection('earnings').aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$userId',
          totalEarnings: { $sum: '$amount' },
        }
      }
    ]).toArray();

    return res.status(200).json({
      success: true,
      wallet: wallet.balance, // CYBV balance
      earnings: earnings[0] ? earnings[0].totalEarnings : 0 // Total earnings
    });
  } catch (error) {
    console.error('Error fetching wallet and earnings:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
