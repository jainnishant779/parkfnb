/**
 * Global Error Handler Middleware
 * Catches all errors and formats them consistently
 */

const errorCodes = require('../utils/errorCodes');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let errorCode = err.code || errorCodes.SERVER_ERROR;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = errorCodes.REQ_VALIDATION;
    message = 'Validation failed';
    details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    errorCode = errorCodes.REQ_DUPLICATE;
    message = 'Duplicate entry';
    const field = Object.keys(err.keyPattern)[0];
    details = { field, message: `${field} already exists` };
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = errorCodes.REQ_INVALID_FORMAT;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = errorCodes.AUTH_INVALID_TOKEN;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = errorCodes.AUTH_TOKEN_EXPIRED;
    message = 'Token expired';
  }

  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      code: errorCode
    });
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      http: statusCode,
      message,
      ...(details && { details }),
      traceId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
  });
};

module.exports = errorHandler;
