/**
 * Vehicle Routes
 * Handles user vehicle management
 */

const express = require('express');
const router = express.Router();
const vehiclesController = require('../controllers/userVehiclesController');
const { protect } = require('../middleware/auth');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Get all vehicles for a user
router.get(
  '/users/:userId/vehicles',
  protect,
  validateObjectId('userId'),
  vehiclesController.getUserVehicles
);

// Add vehicle for a user
router.post(
  '/users/:userId/vehicles',
  protect,
  validateObjectId('userId'),
  sanitize,
  validateRequired(['license_plate', 'vehicle_type', 'make', 'model']),
  vehiclesController.addVehicle
);

// Vehicle-specific operations
router.get(
  '/:id',
  protect,
  validateObjectId('id'),
  vehiclesController.getVehicleById
);

router.put(
  '/:id',
  protect,
  validateObjectId('id'),
  sanitize,
  vehiclesController.updateVehicle
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  vehiclesController.deleteVehicle
);

router.put(
  '/:id/set-default',
  protect,
  validateObjectId('id'),
  vehiclesController.setDefaultVehicle
);

module.exports = router;
