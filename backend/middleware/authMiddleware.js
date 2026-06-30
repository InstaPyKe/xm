const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  // Retrieve token from Authorization header
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ message: 'No authentication token provided. Access denied.' });
  }

  // Parse Bearer prefix
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Authorization format must be Bearer <token>.' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_key');
    req.userId = decoded.userId; // Bind decrypted user identity
    next();
  } catch (err) {
    res.status(401).json({ message: 'Session expired or signature invalid. Access denied.' });
  }
};
