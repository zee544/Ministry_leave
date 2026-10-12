const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT token and extract user & division
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Access denied. No authentication token provided.' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader;

  if (!token) {
    return res.status(401).json({ message: 'Access denied. Token missing.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'leave_sys_123');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token. Please log in again.' });
  }
};

/**
 * Middleware to ensure the authenticated user has an admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access forbidden. Admin privileges required.' });
  }
  next();
};

/**
 * Middleware to ensure the authenticated user has an HOD role
 */
const requireHOD = (req, res, next) => {
  if (!req.user || req.user.role !== 'hod') {
    return res.status(403).json({ message: 'Access forbidden. HOD privileges required.' });
  }
  next();
};

/**
 * Middleware to ensure the authenticated user is either Admin or HOD
 */
const requireAdminOrHOD = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'hod')) {
    return res.status(403).json({ message: 'Access forbidden. Admin or HOD privileges required.' });
  }
  next();
};

/**
 * Middleware to ensure the authenticated user is an Employee
 */
const requireEmployee = (req, res, next) => {
  if (!req.user || req.user.role !== 'employee') {
    return res.status(403).json({ message: 'Access forbidden. Employee privileges required.' });
  }
  next();
};

module.exports = {
  verifyToken,
  requireAdmin,
  requireHOD,
  requireAdminOrHOD,
  requireEmployee,
};
