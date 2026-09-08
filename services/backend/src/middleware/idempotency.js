/**
 * Idempotency Middleware
 * Prevents duplicate operations using idempotency keys
 */

const { error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

// In-memory store for idempotency keys (use Redis in production)
const idempotencyStore = new Map();
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check and store idempotency key
 * Usage: Add to routes that need idempotency (bookings, payments, refunds)
 */
exports.checkIdempotency = (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  // Idempotency key is optional but recommended for POST requests
  if (!idempotencyKey) {
    return next();
  }

  // Check if this key was used before
  if (idempotencyStore.has(idempotencyKey)) {
    const stored = idempotencyStore.get(idempotencyKey);

    // If same request body, return cached response
    if (JSON.stringify(stored.body) === JSON.stringify(req.body)) {
      return res.status(stored.status).json(stored.response);
    }

    // Different request body with same key - conflict
    return error(
      res,
      errorCodes.IDEMPOTENCY_CONFLICT,
      409,
      'Idempotency key already used with different request'
    );
  }

  // Store original send function
  const originalSend = res.send;

  // Override send to cache response
  res.send = function (data) {
    // Cache response with idempotency key
    idempotencyStore.set(idempotencyKey, {
      body: req.body,
      status: res.statusCode,
      response: JSON.parse(data)
    });

    // Set TTL for cleanup
    setTimeout(() => {
      idempotencyStore.delete(idempotencyKey);
    }, IDEMPOTENCY_TTL);

    // Call original send
    originalSend.call(this, data);
  };

  next();
};

/**
 * Require idempotency key for critical operations
 */
exports.requireIdempotency = (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return error(
      res,
      errorCodes.REQ_MISSING_FIELD,
      400,
      'Idempotency-Key header is required for this operation'
    );
  }

  next();
};

/**
 * Clear old idempotency keys (call periodically)
 */
exports.cleanupIdempotencyStore = () => {
  // In production, this would be handled by Redis TTL
  // This is just for in-memory implementation
  const now = Date.now();
  for (const [key, value] of idempotencyStore.entries()) {
    if (now - value.timestamp > IDEMPOTENCY_TTL) {
      idempotencyStore.delete(key);
    }
  }
};
