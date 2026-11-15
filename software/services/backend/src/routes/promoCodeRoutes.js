/**
 * Promo Code Routes
 * Handles promo code management and validation
 */

const express = require('express');
const router = express.Router();
const promoCodesController = require('../controllers/promoCodesController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Get all promo codes (admin only)
router.get('/', protect, authorize('admin'), promoCodesController.getAllPromoCodes);

// Validate promo code (authenticated users)
router.post(
  '/validate',
  protect,
  sanitize,
  validateRequired(['code']),
  promoCodesController.validatePromoCode
);

// Apply promo code (authenticated users)
router.post(
  '/apply',
  protect,
  sanitize,
  validateRequired(['code', 'booking_id']),
  promoCodesController.applyPromoCode
);

// Create promo code (admin only)
router.post(
  '/',
  protect,
  authorize('admin'),
  sanitize,
  validateRequired(['code', 'promo_type', 'discount_value', 'valid_from', 'valid_to']),
  promoCodesController.createPromoCode
);

// Get promo code by code (public for checking)
router.get('/:code', promoCodesController.getPromoCodeByCode);

// Get promo code usage (admin only)
router.get(
  '/:id/usage',
  protect,
  authorize('admin'),
  validateObjectId('id'),
  promoCodesController.getPromoCodeUsage
);

// Update promo code (admin only)
router.put(
  '/:id',
  protect,
  authorize('admin'),
  validateObjectId('id'),
  sanitize,
  promoCodesController.updatePromoCode
);

// Delete promo code (admin only)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  validateObjectId('id'),
  promoCodesController.deletePromoCode
);

module.exports = router;
