const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

module.exports = async function (req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'No token provided' 
    });
  }

  try {
    // Decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cybev-secret-key');
    
    // ✅ IMPORTANT: Check if user actually exists in database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'User not found. Please login again.' 
      });
    }
    
    // Attach full user object to request
    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      username: user.username,
      isEmailVerified: user.isEmailVerified || false
    };
    
    next();
    
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({ 
      success: false,
      error: 'Invalid or expired token' 
    });
  }
};
