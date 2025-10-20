const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        ok: false,
        error: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email,
      name: decoded.name
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        ok: false,
        error: 'Token expired. Please login again.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        ok: false,
        error: 'Invalid token.' 
      });
    }

    return res.status(500).json({ 
      ok: false,
      error: 'Failed to authenticate token.' 
    });
  }
};

const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      ok: false,
      error: 'Authentication required' 
    });
  }

  if (!req.user.isAdmin) {
    return res.status(403).json({ 
      ok: false,
      error: 'Admin access required' 
    });
  }

  next();
};

module.exports = {
  authenticateToken,
  isAdmin
};
