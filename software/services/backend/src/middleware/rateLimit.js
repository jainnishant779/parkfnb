/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting requests per time window
 */

const rateLimit = require('express-rate-limit');
const { error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Custom handler for rate limit exceeded
 */
const rateLimitHandler = (req, res) => {
  return error(
    res,
    errorCodes.RATE_LIMIT_EXCEEDED,
    429,
    'Too many requests, please try again later'
  );
};

/**
 * General API rate limiter
 * 100 requests per 15 minutes
 */
exports.generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Auth route rate limiter
 * 5 login/register attempts per 15 minutes
 */
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skipSuccessfulRequests: true // Don't count successful requests
});

/**
 * Booking creation rate limiter
 * 10 booking attempts per hour
 */
exports.bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many booking attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Message sending rate limiter
 * 20 messages per 10 minutes
 */
exports.messageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  message: 'Too many messages sent, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Payment processing rate limiter
 * 5 payment attempts per hour
 */
exports.paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many payment attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});
