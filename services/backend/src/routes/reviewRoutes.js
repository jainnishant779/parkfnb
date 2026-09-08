/**
 * Review Routes
 * Handles reviews and ratings
 */

const express = require('express');
const router = express.Router();
const reviewsController = require('../controllers/reviewsController');
const { protect, optionalAuth } = require('../middleware/auth');
const { isOwner } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Get all reviews (public)
router.get('/', optionalAuth, reviewsController.getAllReviews);

// Get reviews for a parking space (public)
router.get(
  '/parking-spaces/:spaceId/reviews',
  optionalAuth,
  validateObjectId('spaceId'),
  reviewsController.getSpaceReviews
);

// Get reviews by a user (public)
router.get(
  '/users/:userId/reviews',
  optionalAuth,
  validateObjectId('userId'),
  reviewsController.getUserReviews
);

// Get average rating for a space (public)
router.get(
  '/parking-spaces/:spaceId/rating',
  optionalAuth,
  validateObjectId('spaceId'),
  reviewsController.getSpaceRating
);

// Create review (after completed booking)
router.post(
  '/bookings/:bookingId/review',
  protect,
  validateObjectId('bookingId'),
  sanitize,
  validateRequired(['rating', 'comment']),
  reviewsController.createReview
);

// Review-specific operations
router.get('/:id', optionalAuth, validateObjectId('id'), reviewsController.getReviewById);

router.put(
  '/:id',
  protect,
  validateObjectId('id'),
  sanitize,
  reviewsController.updateReview
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  reviewsController.deleteReview
);

router.post(
  '/:id/response',
  protect,
  isOwner,
  validateObjectId('id'),
  sanitize,
  validateRequired(['response']),
  reviewsController.addOwnerResponse
);

module.exports = router;
