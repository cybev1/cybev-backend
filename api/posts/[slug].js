// Backend API: Handle fetching post details by 'slug'
import clientPromise from '@/lib/mongodb';

export default async function handler(req, res) {
  const { slug } = req.query; // Use 'slug' for identifying the post

  if (!slug) {
    return res.status(400).json({ success: false, message: 'Post slug is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    const post = await db.collection('posts').findOne({ slug });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    return res.status(200).json({ success: true, post });
  } catch (error) {
    console.error('Error fetching post:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
