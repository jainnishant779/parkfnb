/**
 * Reviews Controller
 * Handles reviews, ratings, and owner responses
 */

const Review = require('../models/Review');
const Booking = require('../models/Booking');
const ParkingSpace = require('../models/ParkingSpace');
const Owner = require('../models/Owner');
const mongoose = require('mongoose');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');
const { validatePagination } = require('../utils/validators');

/**
 * @desc    Get all reviews
 * @route   GET /api/reviews
 * @access  Public
 */
exports.getAllReviews = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, rating, space_id } = req.query;
    const { page: validPage, limit: validLimit } = validatePagination(page, limit);

    // Build filter
    const filter = {};
    if (rating) filter.rating = parseInt(rating);
    if (space_id) filter.space_id = space_id;

    // Get total count
    const total = await Review.countDocuments(filter);

    // Get reviews with pagination
    const reviews = await Review.find(filter)
      .populate('user_id', 'first_name last_name email')
      .populate('space_id', 'space_number space_type property_id')
      .populate('owner_id', 'business_name')
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    return success(
      res,
      { reviews },
      paginationMeta(validPage, validLimit, total)
    );
  } catch (err) {
    console.error('Get all reviews error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching reviews');
  }
};

/**
 * @desc    Get review by ID
 * @route   GET /api/reviews/:id
 * @access  Public
 */
exports.getReviewById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id)
      .populate('user_id', 'first_name last_name email')
      .populate('space_id', 'space_number space_type property_id hourly_rate')
      .populate('owner_id', 'business_name user_id')
      .populate('booking_id', 'booking_number start_time end_time');

    if (!review) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Review not found');
    }

    return success(res, { review });
  } catch (err) {
    console.error('Get review by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching review');
  }
};

/**
 * @desc    Get reviews for a parking space
 * @route   GET /api/reviews/parking-spaces/:spaceId/reviews
 * @access  Public
 */
exports.getSpaceReviews = async (req, res, next) => {
  try {
    const { spaceId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;
    const { page: validPage, limit: validLimit } = validatePagination(page, limit);

    // Build filter
    const filter = { space_id: spaceId };
    if (rating) filter.rating = parseInt(rating);

    // Get total count
    const total = await Review.countDocuments(filter);

    // Get reviews
    const reviews = await Review.find(filter)
      .populate('user_id', 'first_name last_name')
      .populate('booking_id', 'booking_number start_time end_time')
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    // Calculate rating distribution
    const ratingDistribution = await Review.aggregate([
      { $match: { space_id: new mongoose.Types.ObjectId(spaceId) } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    // Calculate average rating
    const avgRatingResult = await Review.aggregate([
      { $match: { space_id: new mongoose.Types.ObjectId(spaceId) } },
      {
        $group: {
          _id: null,
          average_rating: { $avg: '$rating' },
          total_reviews: { $sum: 1 }
        }
      }
    ]);

    const stats = avgRatingResult.length > 0 ? {
      average_rating: parseFloat(avgRatingResult[0].average_rating.toFixed(2)),
      total_reviews: avgRatingResult[0].total_reviews,
      rating_distribution: ratingDistribution
    } : {
      average_rating: 0,
      total_reviews: 0,
      rating_distribution: []
    };

    return success(
      res,
      { reviews, stats },
      paginationMeta(validPage, validLimit, total)
    );
  } catch (err) {
    console.error('Get space reviews error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching space reviews');
  }
};

/**
 * @desc    Get reviews by a user
 * @route   GET /api/reviews/users/:userId/reviews
 * @access  Public
 */
exports.getUserReviews = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const { page: validPage, limit: validLimit } = validatePagination(page, limit);

    // Get total count
    const total = await Review.countDocuments({ user_id: userId });

    // Get reviews
    const reviews = await Review.find({ user_id: userId })
      .populate('space_id', 'space_number space_type property_id')
      .populate('booking_id', 'booking_number start_time end_time')
      .populate('owner_id', 'business_name')
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    return success(
      res,
      { reviews },
      paginationMeta(validPage, validLimit, total)
    );
  } catch (err) {
    console.error('Get user reviews error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching user reviews');
  }
};

/**
 * @desc    Create review
 * @route   POST /api/reviews/bookings/:bookingId/review
 * @access  Private
 */
exports.createReview = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { rating, comment, review_images } = req.body;

    // Check if booking exists
    const booking = await Booking.findById(bookingId)
      .populate('space_id', 'owner_id');

    if (!booking) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Booking not found');
    }

    // Check if user owns the booking
    if (booking.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to review this booking');
    }

    // Check if booking is completed
    if (booking.status !== 'completed') {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Can only review completed bookings');
    }

    // Check if review already exists for this booking
    const existingReview = await Review.findOne({ booking_id: bookingId });
    if (existingReview) {
      return error(res, errorCodes.BIZ_CONFLICT, 409, 'Review already exists for this booking');
    }

    // Validate rating
    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Rating must be between 1 and 5');
    }

    // Create review
    const review = await Review.create({
      booking_id: bookingId,
      user_id: req.user._id,
      space_id: booking.space_id._id,
      owner_id: booking.space_id.owner_id,
      rating: ratingNum,
      review_text: comment,
      review_images: review_images || []
    });

    // Update parking space average rating
    await updateSpaceAverageRating(booking.space_id._id);

    // Update owner average rating
    await updateOwnerAverageRating(booking.space_id.owner_id);

    // Populate review for response
    const populatedReview = await Review.findById(review._id)
      .populate('user_id', 'first_name last_name')
      .populate('space_id', 'space_number space_type')
      .populate('booking_id', 'booking_number');

    return success(res, { review: populatedReview }, null, 201);
  } catch (err) {
    console.error('Create review error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error creating review');
  }
};

/**
 * @desc    Update review
 * @route   PUT /api/reviews/:id
 * @access  Private
 */
exports.updateReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment, review_images } = req.body;

    const review = await Review.findById(id);

    if (!review) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Review not found');
    }

    // Check if user owns the review
    if (review.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to update this review');
    }

    // Update fields
    if (rating) {
      const ratingNum = parseInt(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return error(res, errorCodes.REQ_VALIDATION, 400, 'Rating must be between 1 and 5');
      }
      review.rating = ratingNum;
    }
    if (comment !== undefined) review.review_text = comment;
    if (review_images !== undefined) review.review_images = review_images;

    await review.save();

    // Update parking space average rating if rating changed
    if (rating) {
      await updateSpaceAverageRating(review.space_id);
      await updateOwnerAverageRating(review.owner_id);
    }

    // Populate review for response
    const populatedReview = await Review.findById(review._id)
      .populate('user_id', 'first_name last_name')
      .populate('space_id', 'space_number space_type')
      .populate('booking_id', 'booking_number');

    return success(res, { review: populatedReview });
  } catch (err) {
    console.error('Update review error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating review');
  }
};

/**
 * @desc    Delete review
 * @route   DELETE /api/reviews/:id
 * @access  Private
 */
exports.deleteReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);

    if (!review) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Review not found');
    }

    // Check if user owns the review or is admin
    if (review.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to delete this review');
    }

    const spaceId = review.space_id;
    const ownerId = review.owner_id;

    await review.deleteOne();

    // Update parking space average rating
    await updateSpaceAverageRating(spaceId);

    // Update owner average rating
    await updateOwnerAverageRating(ownerId);

    return success(res, { message: 'Review deleted successfully' });
  } catch (err) {
    console.error('Delete review error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting review');
  }
};

/**
 * @desc    Add owner response to review
 * @route   POST /api/reviews/:id/response
 * @access  Private/Owner
 */
exports.addOwnerResponse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { response } = req.body;

    const review = await Review.findById(id)
      .populate('space_id', 'owner_id');

    if (!review) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Review not found');
    }

    // Check if user is the owner of the space
    const owner = await Owner.findOne({ user_id: req.user._id });
    if (!owner || owner._id.toString() !== review.space_id.owner_id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only the space owner can respond to reviews');
    }

    // Add owner response
    review.owner_response = response;
    review.owner_responded_at = new Date();
    await review.save();

    // Populate review for response
    const populatedReview = await Review.findById(review._id)
      .populate('user_id', 'first_name last_name')
      .populate('space_id', 'space_number space_type')
      .populate('owner_id', 'business_name');

    return success(res, { review: populatedReview });
  } catch (err) {
    console.error('Add owner response error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error adding owner response');
  }
};

/**
 * @desc    Get average rating for a space
 * @route   GET /api/reviews/parking-spaces/:spaceId/rating
 * @access  Public
 */
exports.getSpaceRating = async (req, res, next) => {
  try {
    const { spaceId } = req.params;

    // Calculate average rating using aggregation
    const result = await Review.aggregate([
      { $match: { space_id: new mongoose.Types.ObjectId(spaceId) } },
      {
        $group: {
          _id: null,
          average_rating: { $avg: '$rating' },
          total_reviews: { $sum: 1 },
          rating_5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          rating_4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          rating_3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          rating_2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          rating_1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
        }
      }
    ]);

    const rating = result.length > 0 ? {
      average_rating: parseFloat(result[0].average_rating.toFixed(2)),
      total_reviews: result[0].total_reviews,
      rating_distribution: {
        5: result[0].rating_5,
        4: result[0].rating_4,
        3: result[0].rating_3,
        2: result[0].rating_2,
        1: result[0].rating_1
      }
    } : {
      average_rating: 0,
      total_reviews: 0,
      rating_distribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      }
    };

    return success(res, { rating });
  } catch (err) {
    console.error('Get space rating error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching space rating');
  }
};

/**
 * Helper function to update parking space average rating
 */
const updateSpaceAverageRating = async (spaceId) => {
  try {
    const result = await Review.aggregate([
      { $match: { space_id: spaceId } },
      {
        $group: {
          _id: null,
          average_rating: { $avg: '$rating' }
        }
      }
    ]);

    const averageRating = result.length > 0 ? parseFloat(result[0].average_rating.toFixed(2)) : 0;

    await ParkingSpace.findByIdAndUpdate(spaceId, {
      average_rating: averageRating
    });
  } catch (err) {
    console.error('Update space average rating error:', err);
  }
};

/**
 * Helper function to update owner average rating
 */
const updateOwnerAverageRating = async (ownerId) => {
  try {
    const result = await Review.aggregate([
      { $match: { owner_id: ownerId } },
      {
        $group: {
          _id: null,
          average_rating: { $avg: '$rating' }
        }
      }
    ]);

    const averageRating = result.length > 0 ? parseFloat(result[0].average_rating.toFixed(2)) : 0;

    await Owner.findByIdAndUpdate(ownerId, {
      average_rating: averageRating
    });
  } catch (err) {
    console.error('Update owner average rating error:', err);
  }
};
