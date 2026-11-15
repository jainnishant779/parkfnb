/**
 * Refund Routes
 * Handles refund processing and management
 */

const express = require('express');
const router = express.Router();
const refundsController = require('../controllers/refundsController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');
// const { checkIdempotency } = require('../middleware/idempotency');

// Get all refunds (admin only)
router.get('/', protect, authorize('admin'), refundsController.getAllRefunds);

// Get refunds for a booking
router.get(
  '/bookings/:bookingId/refunds',
  protect,
  validateObjectId('bookingId'),
  refundsController.getBookingRefunds
);

// Request refund
router.post(
  '/bookings/:bookingId/refund',
  protect,
  // checkIdempotency,
  validateObjectId('bookingId'),
  sanitize,
  validateRequired(['reason']),
  refundsController.requestRefund
);

// Refund-specific operations
router.get('/:id', protect, validateObjectId('id'), refundsController.getRefundById);

router.put(
  '/:id/approve',
  protect,
  authorize('admin'),
  validateObjectId('id'),
  refundsController.approveRefund
);

router.put(
  '/:id/reject',
  protect,
  authorize('admin'),
  validateObjectId('id'),
  sanitize,
  validateRequired(['rejection_reason']),
  refundsController.rejectRefund
);

router.put(
  '/:id/process',
  protect,
  authorize('admin'),
  validateObjectId('id'),
  refundsController.processRefund
);

module.exports = router;
