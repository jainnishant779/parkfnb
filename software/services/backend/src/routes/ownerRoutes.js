/**
 * Owner Routes
 * Handles owner registration, KYC, and earnings
 */

const express = require('express');
const router = express.Router();
const ownersController = require('../controllers/ownersController');
const { protect } = require('../middleware/auth');
const { authorize, isOwner, isAdmin } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Get all owners (admin only)
router.get('/', protect, isAdmin, ownersController.getAllOwners);

// Register as owner
router.post(
  '/register',
  protect,
  sanitize,
  ownersController.registerOwner
);

// The owner app's onboarding wizard. These must stay ABOVE '/:id' — Express
// matches in order and would otherwise read 'me' as an owner id.
router.put('/me/profile', protect, sanitize, ownersController.updateMyOwnerProfile);
router.put('/me/kyc/draft', protect, sanitize, ownersController.saveMyKycDraft);
router.put('/me/kyc', protect, sanitize, ownersController.submitMyKyc);

// Owner-specific routes
router.get(
  '/:id',
  protect,
  validateObjectId('id'),
  ownersController.getOwnerById
);

router.put(
  '/:id',
  protect,
  validateObjectId('id'),
  sanitize,
  ownersController.updateOwner
);

router.post(
  '/:id/kyc',
  protect,
  isOwner,
  validateObjectId('id'),
  sanitize,
  ownersController.submitKYC
);

router.put(
  '/:id/verify/kyc',
  protect,
  isAdmin,
  validateObjectId('id'),
  ownersController.verifyKYC
);

router.get(
  '/:id/earnings',
  protect,
  validateObjectId('id'),
  ownersController.getEarnings
);

router.get(
  '/:id/stats',
  protect,
  validateObjectId('id'),
  ownersController.getOwnerStats
);

module.exports = router;
