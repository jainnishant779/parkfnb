/**
 * Property Routes
 * Handles property CRUD and geospatial search
 */

const express = require('express');
const router = express.Router();
const propertiesController = require('../controllers/propertiesController');
const { protect, optionalAuth } = require('../middleware/auth');
const { isOwner } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, validateCoordinates, sanitize } = require('../middleware/validation');

// Search properties nearby (public)
router.get('/search/nearby', optionalAuth, propertiesController.searchNearby);

// Get all properties (public)
router.get('/', optionalAuth, propertiesController.getAllProperties);

// Create property (owner only)
router.post(
  '/',
  protect,
  isOwner,
  sanitize,
  validateRequired(['property_name', 'address', 'city', 'state', 'country', 'location_lat', 'location_lng']),
  validateCoordinates,
  propertiesController.createProperty
);

// Get properties by owner
router.get(
  '/owners/:ownerId',
  protect,
  validateObjectId('ownerId'),
  propertiesController.getPropertiesByOwner
);

// Property-specific operations
router.get('/:id', optionalAuth, validateObjectId('id'), propertiesController.getPropertyById);

router.put(
  '/:id',
  protect,
  isOwner,
  validateObjectId('id'),
  sanitize,
  validateCoordinates,
  propertiesController.updateProperty
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  propertiesController.deleteProperty
);

router.post(
  '/:id/images',
  protect,
  isOwner,
  validateObjectId('id'),
  propertiesController.uploadImages
);

module.exports = router;
