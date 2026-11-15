/**
 * Vehicle Routes
 * Handles user vehicle management
 */

const express = require('express');
const router = express.Router();
const vehiclesController = require('../controllers/userVehiclesController');
const { protect } = require('../middleware/auth');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Normalization middleware to support both camelCase and snake_case vehicle fields
const normalizeVehicleBody = (req, res, next) => {
  if (req.body) {
    const plate = req.body.license_plate || req.body.licensePlate || req.body.registration_number || req.body.registrationNumber;
    if (plate) {
      req.body.license_plate = plate;
      req.body.registration_number = plate;
    }
    const type = req.body.vehicle_type || req.body.vehicleType;
    if (type) {
      req.body.vehicle_type = type.toLowerCase();
    }
    const make = req.body.make || req.body.vehicle_make || req.body.vehicleMake || plate;
    if (make) {
      req.body.make = make;
    }
    const model = req.body.model || req.body.vehicle_model || req.body.vehicleModel || type;
    if (model) {
      req.body.model = model;
    }
  }
  next();
};

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
  normalizeVehicleBody,
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
