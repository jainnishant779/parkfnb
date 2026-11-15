/**
 * Role-Based Access Control Middleware
 * Restricts access based on user roles
 */

const { error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Authorize specific roles
 * Usage: authorize('admin', 'owner')
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, errorCodes.AUTH_UNAUTHORIZED, 401, 'Not authorized');
    }

    if (!roles.includes(req.user.user_type)) {
      return error(
        res,
        errorCodes.AUTH_FORBIDDEN,
        403,
        `User role '${req.user.user_type}' is not authorized to access this route`
      );
    }

    next();
  };
};

/**
 * Check if user is owner
 */
exports.isOwner = (req, res, next) => {
  if (!req.user) {
    return error(res, errorCodes.AUTH_UNAUTHORIZED, 401, 'Not authorized');
  }

  if (req.user.user_type !== 'owner' && req.user.user_type !== 'admin') {
    return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Access denied: Owner role required');
  }

  next();
};

/**
 * Check if user is admin
 */
exports.isAdmin = (req, res, next) => {
  if (!req.user) {
    return error(res, errorCodes.AUTH_UNAUTHORIZED, 401, 'Not authorized');
  }

  if (req.user.user_type !== 'admin') {
    return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Access denied: Admin role required');
  }

  next();
};

/**
 * Check if user owns the resource
 * Requires req.resourceOwnerId to be set by controller
 */
exports.isResourceOwner = (req, res, next) => {
  if (!req.user) {
    return error(res, errorCodes.AUTH_UNAUTHORIZED, 401, 'Not authorized');
  }

  // Admin can access any resource
  if (req.user.user_type === 'admin') {
    return next();
  }

  // Check if user owns the resource
  if (!req.resourceOwnerId || req.resourceOwnerId.toString() !== req.user._id.toString()) {
    return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Access denied: You do not own this resource');
  }

  next();
};
