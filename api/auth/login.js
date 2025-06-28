import clientPromise from "@/lib/mongodb";
import { setLoginSession } from "@/lib/auth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { emailOrUsername, password } = req.body;

  try {
    const client = await clientPromise;
    const db = client.db();

    // Check if the emailOrUsername is email or username and query accordingly
    const user = await db.collection('users').findOne({
      $or: [
        { email: emailOrUsername },
        { username: emailOrUsername }
      ]
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (user.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const session = { email: user.email, username: user.username };
    await setLoginSession(res, session);

    return res.status(200).json({
      success: true,
      user,
      message: "Login successful",
      firstLogin: user.firstLogin,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}
