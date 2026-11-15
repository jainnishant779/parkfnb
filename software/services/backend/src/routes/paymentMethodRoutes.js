/**
 * Payment Method Routes
 * Handles user payment method management
 */

const express = require('express');
const router = express.Router();
const paymentMethodsController = require('../controllers/userPaymentMethodsController');
const { protect } = require('../middleware/auth');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Get all payment methods for a user
router.get(
  '/users/:userId/payment-methods',
  protect,
  validateObjectId('userId'),
  paymentMethodsController.getPaymentMethods
);

// Add payment method for a user
router.post(
  '/users/:userId/payment-methods',
  protect,
  validateObjectId('userId'),
  sanitize,
  validateRequired(['payment_type', 'provider']),
  paymentMethodsController.addPaymentMethod
);

// Payment method-specific operations
router.get(
  '/:id',
  protect,
  validateObjectId('id'),
  paymentMethodsController.getPaymentMethodById
);

router.put(
  '/:id',
  protect,
  validateObjectId('id'),
  sanitize,
  paymentMethodsController.updatePaymentMethod
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  paymentMethodsController.deletePaymentMethod
);

router.put(
  '/:id/set-default',
  protect,
  validateObjectId('id'),
  paymentMethodsController.setDefaultPaymentMethod
);

module.exports = router;
