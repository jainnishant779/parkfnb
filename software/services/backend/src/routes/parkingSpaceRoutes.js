/**
 * Parking Space Routes
 * Handles parking space CRUD, search, and availability
 */

const express = require('express');
const router = express.Router();
const parkingSpacesController = require('../controllers/parkingSpacesController');
const { protect, optionalAuth } = require('../middleware/auth');
const { isOwner } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Search parking spaces (public)
router.get('/search', optionalAuth, parkingSpacesController.searchSpaces);

// Get all parking spaces (public)
router.get('/', optionalAuth, parkingSpacesController.getAllSpaces);

// Get spaces by property (public)
router.get(
  '/properties/:propertyId',
  optionalAuth,
  validateObjectId('propertyId'),
  parkingSpacesController.getSpacesByProperty
);

// Create parking space (owner only)
router.post(
  '/properties/:propertyId/spaces',
  protect,
  isOwner,
  validateObjectId('propertyId'),
  sanitize,
  validateRequired(['space_number', 'space_type', 'length_meters', 'width_meters', 'price_per_hour']),
  parkingSpacesController.createSpace
);

// Parking space-specific operations
router.get('/:id', optionalAuth, validateObjectId('id'), parkingSpacesController.getSpaceById);

router.get(
  '/:id/availability',
  optionalAuth,
  validateObjectId('id'),
  parkingSpacesController.checkAvailability
);

router.put(
  '/:id',
  protect,
  isOwner,
  validateObjectId('id'),
  sanitize,
  parkingSpacesController.updateSpace
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  parkingSpacesController.deleteSpace
);

router.put(
  '/:id/pricing',
  protect,
  isOwner,
  validateObjectId('id'),
  sanitize,
  parkingSpacesController.updatePricing
);

module.exports = router;
