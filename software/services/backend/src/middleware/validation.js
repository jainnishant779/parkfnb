/**
 * Request Validation Middleware
 * Validates request body, params, and query parameters
 */

const { error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');
const validators = require('../utils/validators');

/**
 * Validate required fields in request body
 */
exports.validateRequired = (fields) => {
  return (req, res, next) => {
    const missing = [];

    fields.forEach(field => {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    });

    if (missing.length > 0) {
      return error(
        res,
        errorCodes.REQ_MISSING_FIELD,
        400,
        'Missing required fields',
        { missing }
      );
    }

    next();
  };
};

/**
 * Validate email format
 */
exports.validateEmail = (req, res, next) => {
  if (req.body.email && !validators.isValidEmail(req.body.email)) {
    return error(res, errorCodes.REQ_INVALID_FORMAT, 400, 'Invalid email format');
  }
  next();
};

/**
 * Validate phone format
 */
exports.validatePhone = (req, res, next) => {
  if (req.body.phone && !validators.isValidPhone(req.body.phone)) {
    return error(res, errorCodes.REQ_INVALID_FORMAT, 400, 'Invalid phone format');
  }
  next();
};

/**
 * Validate password strength
 */
exports.validatePassword = (req, res, next) => {
  if (req.body.password && !validators.isStrongPassword(req.body.password)) {
    return error(
      res,
      errorCodes.REQ_VALIDATION,
      400,
      'Password must be at least 8 characters with uppercase, lowercase, and number'
    );
  }
  next();
};

/**
 * Validate ObjectId format
 */
exports.validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!validators.isValidObjectId(id)) {
      return error(res, errorCodes.REQ_INVALID_FORMAT, 400, `Invalid ${paramName} format`);
    }
    next();
  };
};

/**
 * Validate coordinates
 */
exports.validateCoordinates = (req, res, next) => {
  const { location_lat, location_lng } = req.body;

  if ((location_lat || location_lng) && !validators.isValidCoordinates(location_lat, location_lng)) {
    return error(res, errorCodes.REQ_INVALID_FORMAT, 400, 'Invalid coordinates');
  }

  next();
};

/**
 * Validate date range
 */
exports.validateDateRange = (req, res, next) => {
  const { start_time, end_time } = req.body;

  if (start_time && end_time) {
    const start = new Date(start_time);
    const end = new Date(end_time);

    if (start >= end) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'End time must be after start time');
    }
  }

  next();
};

/**
 * Sanitize input fields
 */
exports.sanitize = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = validators.sanitizeString(req.body[key]);
      }
    });
  }
  next();
};
