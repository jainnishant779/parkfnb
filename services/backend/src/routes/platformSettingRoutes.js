/**
 * Platform Settings Routes
 * Handles system configuration
 */

const express = require('express');
const router = express.Router();
const platformSettingsController = require('../controllers/platformSettingsController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateRequired, sanitize } = require('../middleware/validation');

// Get public settings (no auth required)
router.get('/public', platformSettingsController.getPublicSettings);

// All other routes require admin authentication
router.get('/', protect, authorize('admin'), platformSettingsController.getAllSettings);

// Bulk and reset routes must come before /:key to avoid path conflicts
router.put(
  '/bulk',
  protect,
  authorize('admin'),
  sanitize,
  platformSettingsController.bulkUpdateSettings
);

router.post(
  '/reset',
  protect,
  authorize('admin'),
  platformSettingsController.resetToDefault
);

router.get('/:key', protect, authorize('admin'), platformSettingsController.getSettingByKey);

router.put(
  '/:key',
  protect,
  authorize('admin'),
  sanitize,
  validateRequired(['value']),
  platformSettingsController.upsertSetting
);

router.delete(
  '/:key',
  protect,
  authorize('admin'),
  platformSettingsController.deleteSetting
);

module.exports = router;
