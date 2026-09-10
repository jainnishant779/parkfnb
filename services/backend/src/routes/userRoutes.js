/**
 * User Routes
 * Handles user profile management and CRUD operations
 */

const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const vehiclesController = require('../controllers/userVehiclesController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateObjectId, validateCoordinates, validateRequired, sanitize } = require('../middleware/validation');

// Normalization middleware for vehicle creation
const normalizeVehicle = (req, res, next) => {
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

// Admin only - get all users
router.get('/', protect, authorize('admin'), usersController.getAllUsers);

// Get nearby users
router.get('/nearby', protect, usersController.getNearbyUsers);

// The signed-in user's own profile. Must sit above '/:id' or Express
// matches 'me' as an id and validateObjectId rejects it.
router.put('/me/profile', protect, sanitize, usersController.updateMyProfile);

// User vehicles (route alias for /api/users/:userId/vehicles)
router.get('/:userId/vehicles', protect, validateObjectId('userId'), vehiclesController.getUserVehicles);
router.post(
  '/:userId/vehicles',
  protect,
  validateObjectId('userId'),
  sanitize,
  normalizeVehicle,
  validateRequired(['license_plate', 'vehicle_type', 'make', 'model']),
  vehiclesController.addVehicle
);

// User-specific routes
router.get('/:id', protect, validateObjectId('id'), usersController.getUserById);

router.put(
  '/:id',
  protect,
  validateObjectId('id'),
  sanitize,
  usersController.updateUser
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  usersController.deleteUser
);

router.get(
  '/:id/stats',
  protect,
  validateObjectId('id'),
  usersController.getUserStats
);

router.put(
  '/:id/location',
  protect,
  validateObjectId('id'),
  validateCoordinates,
  usersController.updateLocation
);

module.exports = router;
