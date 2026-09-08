/**
 * Standardized API Response Helper
 * Provides consistent response format across all controllers
 */

/**
 * Success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data (object, array, or null)
 * @param {Object} meta - Optional pagination metadata
 * @param {number} statusCode - HTTP status code (default 200)
 */
exports.success = (res, data = null, meta = null, statusCode = 200) => {
  const response = {
    success: true,
    data
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

/**
 * Error response
 * @param {Object} res - Express response object
 * @param {string} code - Application error code
 * @param {number} httpStatus - HTTP status code
 * @param {string} message - Human-readable error message
 * @param {Object} details - Optional error details
 * @param {string} traceId - Optional trace ID for debugging
 */
exports.error = (res, code, httpStatus, message, details = null, traceId = null) => {
  const response = {
    success: false,
    error: {
      code,
      http: httpStatus,
      message,
      traceId: traceId || generateTraceId()
    }
  };

  if (details) {
    response.error.details = details;
  }

  return res.status(httpStatus).json(response);
};

/**
 * Pagination metadata helper
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 */
exports.paginationMeta = (page, limit, total) => {
  return {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
    totalPages: Math.ceil(total / limit)
  };
};

/**
 * Generate unique trace ID for error tracking
 */
const generateTraceId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
