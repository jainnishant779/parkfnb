/**
 * Admin Routes
 * Handles admin user management
 */

const express = require('express');
const router = express.Router();
const adminsController = require('../controllers/adminsController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// All admin routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// Get all admins
router.get('/', adminsController.getAllAdmins);

// Create admin (super admin only - additional check in controller)
router.post(
  '/',
  sanitize,
  validateRequired(['user_id', 'role']),
  adminsController.createAdmin
);

// Admin-specific operations
router.get('/:id', validateObjectId('id'), adminsController.getAdminById);

router.put(
  '/:id',
  validateObjectId('id'),
  sanitize,
  adminsController.updateAdmin
);

router.delete(
  '/:id',
  validateObjectId('id'),
  adminsController.deleteAdmin
);

router.put(
  '/:id/permissions',
  validateObjectId('id'),
  sanitize,
  adminsController.updatePermissions
);

router.get(
  '/:id/activity',
  validateObjectId('id'),
  adminsController.getAdminActivity
);

module.exports = router;
