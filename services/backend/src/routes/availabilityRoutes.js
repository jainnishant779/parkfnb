/**
 * Availability Routes
 * Handles parking space availability schedules
 */

const express = require('express');
const router = express.Router();
const availabilityController = require('../controllers/availabilityController');
const { protect, optionalAuth } = require('../middleware/auth');
const { isOwner } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Get availability for a parking space (public)
router.get(
  '/space/:spaceId',
  optionalAuth,
  validateObjectId('spaceId'),
  availabilityController.getSpaceAvailability
);

// Bulk create availability (owner only) - must come before general POST
router.post(
  '/space/:spaceId/bulk',
  protect,
  isOwner,
  validateObjectId('spaceId'),
  sanitize,
  availabilityController.bulkCreateAvailability
);

// Check conflicts (owner only) - must come before general POST
router.post(
  '/space/:spaceId/check/conflict',
  protect,
  isOwner,
  validateObjectId('spaceId'),
  sanitize,
  availabilityController.checkConflicts
);

// Create availability schedule (owner only)
router.post(
  '/space/:spaceId',
  protect,
  isOwner,
  validateObjectId('spaceId'),
  sanitize,
  validateRequired(['day_of_week', 'available_from', 'available_to']),
  availabilityController.createAvailability
);

// Availability-specific operations
router.put(
  '/:id',
  protect,
  isOwner,
  validateObjectId('id'),
  sanitize,
  availabilityController.updateAvailability
);

router.delete(
  '/:id',
  protect,
  isOwner,
  validateObjectId('id'),
  availabilityController.deleteAvailability
);

module.exports = router;
