/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches user to request
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Protect routes - verify JWT token
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return error(res, errorCodes.AUTH_UNAUTHORIZED, 401, 'Not authorized, no token');
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password_hash');

      if (!req.user) {
        return error(res, errorCodes.USER_NOT_FOUND, 404, 'User not found');
      }

      if (!req.user.is_active) {
        return error(res, errorCodes.AUTH_ACCOUNT_LOCKED, 403, 'Account is inactive');
      }

      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return error(res, errorCodes.AUTH_TOKEN_EXPIRED, 401, 'Token expired');
      }
      return error(res, errorCodes.AUTH_INVALID_TOKEN, 401, 'Invalid token');
    }
  } catch (err) {
    return error(res, errorCodes.SERVER_ERROR, 500, 'Authentication error');
  }
};

/**
 * Optional authentication - attach user if token exists
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password_hash');
      } catch (err) {
        // Invalid token - continue without user
        req.user = null;
      }
    }

    next();
  } catch (err) {
    next();
  }
};
