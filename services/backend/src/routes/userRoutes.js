/**
 * User Routes
 * Handles user profile management and CRUD operations
 */

const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateObjectId, validateCoordinates, sanitize } = require('../middleware/validation');

// Admin only - get all users
router.get('/', protect, authorize('admin'), usersController.getAllUsers);

// Get nearby users
router.get('/nearby', protect, usersController.getNearbyUsers);

// The signed-in user's own profile. Must sit above '/:id' or Express
// matches 'me' as an id and validateObjectId rejects it.
router.put('/me/profile', protect, sanitize, usersController.updateMyProfile);

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
