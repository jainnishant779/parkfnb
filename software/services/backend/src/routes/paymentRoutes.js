/**
 * Payment Routes
 * Handles payment processing and verification
 */

const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/paymentsController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');
// const { paymentLimiter } = require('../middleware/rateLimit');
// const { checkIdempotency, requireIdempotency } = require('../middleware/idempotency');

// Get all payments (admin only)
router.get('/', protect, authorize('admin'), paymentsController.getAllPayments);

// Get user's payments
router.get(
  '/users/:userId/payments',
  protect,
  validateObjectId('userId'),
  paymentsController.getUserPayments
);

// Get booking's payments
router.get(
  '/bookings/:bookingId/payments',
  protect,
  validateObjectId('bookingId'),
  paymentsController.getBookingPayments
);

// Process payment
router.post(
  '/',
  protect,
  // paymentLimiter,
  // requireIdempotency,
  // checkIdempotency,
  sanitize,
  validateRequired(['booking_id', 'amount', 'payment_method']),
  paymentsController.processPayment
);

// Payment webhook (public but verified)
router.post('/webhook', paymentsController.paymentWebhook);

// Payment-specific operations
router.get('/:id', protect, validateObjectId('id'), paymentsController.getPaymentById);

router.put(
  '/:id/verify',
  protect,
  validateObjectId('id'),
  paymentsController.verifyPayment
);

module.exports = router;
