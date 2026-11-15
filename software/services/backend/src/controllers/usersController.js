/**
 * Users Controller
 * Handles user profile management and CRUD operations
 */

const User = require('../models/User');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Calculate distance between two coordinates using Haversine formula
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * @desc    Get all users (admin only)
 * @route   GET /api/users
 * @access  Private/Admin
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};

    if (req.query.user_type) {
      filter.user_type = req.query.user_type;
    }

    if (req.query.is_verified !== undefined) {
      filter.is_verified = req.query.is_verified === 'true';
    }

    if (req.query.is_active !== undefined) {
      filter.is_active = req.query.is_active === 'true';
    }

    if (req.query.search) {
      filter.$or = [
        { first_name: { $regex: req.query.search, $options: 'i' } },
        { last_name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Sort options
    let sortOptions = { created_at: -1 }; // Default sort by newest
    if (req.query.sort_by) {
      if (req.query.sort_by === 'name') {
        sortOptions = { first_name: 1, last_name: 1 };
      } else if (req.query.sort_by === 'email') {
        sortOptions = { email: 1 };
      } else if (req.query.sort_by === 'last_login') {
        sortOptions = { last_login: -1 };
      }
    }

    const users = await User.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .select('-password_hash -verification_token -reset_password_token');

    const total = await User.countDocuments(filter);

    return success(
      res,
      { users },
      paginationMeta(page, limit, total),
      200
    );
  } catch (err) {
    console.error('Get all users error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching users');
  }
};

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:id
 * @access  Private/Admin or Owner
 */
exports.getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('-password_hash -verification_token -reset_password_token');

    if (!user) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'User not found');
    }

    // Authorization check: Only the user themselves or admin can view full profile
    if (req.user._id.toString() !== id && req.user.user_type !== 'admin') {
      // Return limited public profile
      return success(res, {
        user: {
          _id: user._id,
          first_name: user.first_name,
          last_name: user.last_name,
          profile_picture_url: user.profile_picture_url,
          user_type: user.user_type,
          is_verified: user.is_verified
        }
      }, null, 200);
    }

    return success(res, { user }, null, 200);
  } catch (err) {
    console.error('Get user by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching user');
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/users/:id
 * @access  Private/Owner
 */
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, phone, profile_picture_url, location_lat, location_lng } = req.body;

    // Authorization check: Only the user themselves or admin can update
    if (req.user._id.toString() !== id && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to update this user');
    }

    const user = await User.findById(id);

    if (!user) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'User not found');
    }

    // Update allowed fields
    if (first_name) user.first_name = first_name;
    if (last_name) user.last_name = last_name;
    if (phone) user.phone = phone;
    if (profile_picture_url !== undefined) user.profile_picture_url = profile_picture_url;

    if (location_lat !== undefined && location_lng !== undefined) {
      user.location_lat = location_lat;
      user.location_lng = location_lng;
    }

    await user.save();

    // Remove sensitive fields
    const userResponse = user.toObject();
    delete userResponse.password_hash;
    delete userResponse.verification_token;
    delete userResponse.reset_password_token;

    return success(res, { user: userResponse }, null, 200);
  } catch (err) {
    console.error('Update user error:', err);
    if (err.code === 11000) {
      return error(res, errorCodes.BIZ_CONFLICT, 409, 'Phone number already in use');
    }
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating user');
  }
};

/**
 * @desc    Update the signed-in user's own profile
 * @route   PUT /api/users/me/profile
 * @access  Private
 *
 * The consumer app's onboarding screen posts here and treats a success as
 * "onboarding done", so this is also where onboarding_step advances.
 */
exports.updateMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return error(res, errorCodes.USER_NOT_FOUND, 404, 'User not found');
    }

    const {
      legal_name,
      first_name,
      last_name,
      email,
      profile_picture_url,
      notification_booking,
      notification_promotion,
      preferred_language,
      alternate_phone,
      date_of_birth,
      address_line1,
      address_line2,
      city,
      state,
      postal_code
    } = req.body || {};

    if (legal_name !== undefined) {
      user.legal_name = legal_name;
      // The apps collect one "full name" field, so split it for the
      // first/last pair the rest of the API already returns.
      const parts = String(legal_name).trim().split(/\s+/);
      if (parts[0]) {
        user.first_name = parts[0];
        user.last_name = parts.slice(1).join(' ');
      }
    }
    if (first_name !== undefined) user.first_name = first_name;
    if (last_name !== undefined) user.last_name = last_name;
    if (email !== undefined) user.email = email;
    if (profile_picture_url !== undefined) user.profile_picture_url = profile_picture_url;
    if (notification_booking !== undefined) user.notification_booking = !!notification_booking;
    if (notification_promotion !== undefined) user.notification_promotion = !!notification_promotion;
    if (preferred_language !== undefined) user.preferred_language = preferred_language;
    if (alternate_phone !== undefined) user.alternate_phone = alternate_phone;
    if (date_of_birth !== undefined) user.date_of_birth = date_of_birth;
    if (address_line1 !== undefined) user.address_line1 = address_line1;
    if (address_line2 !== undefined) user.address_line2 = address_line2;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;
    if (postal_code !== undefined) user.postal_code = postal_code;

    // Consumers are done once the profile is filled. Owners still have KYC
    // ahead of them, so they only move off the auth step.
    if (user.user_type === 'owner') {
      if (user.onboarding_step === 'auth_complete') user.onboarding_step = 'profile_setup';
    } else {
      user.onboarding_step = 'completed';
    }

    await user.save();

    const { publicUser } = require('./otpController');
    return success(res, { user: publicUser(user) });
  } catch (err) {
    console.error('Update my profile error:', err);
    if (err.code === 11000) {
      return error(res, errorCodes.REQ_DUPLICATE, 409, 'That email is already in use');
    }
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating profile');
  }
};

/**
 * @desc    Delete user (soft delete)
 * @route   DELETE /api/users/:id
 * @access  Private/Admin or Owner
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Authorization check: Only the user themselves or admin can delete
    if (req.user._id.toString() !== id && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to delete this user');
    }

    const user = await User.findById(id);

    if (!user) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'User not found');
    }

    // Soft delete - set is_active to false
    user.is_active = false;
    await user.save();

    return success(res, { message: 'User deactivated successfully' }, null, 200);
  } catch (err) {
    console.error('Delete user error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting user');
  }
};

/**
 * @desc    Get user statistics
 * @route   GET /api/users/:id/stats
 * @access  Private/Admin or Owner
 */
exports.getUserStats = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Authorization check: Only the user themselves or admin can view stats
    if (req.user._id.toString() !== id && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view user statistics');
    }

    const user = await User.findById(id);

    if (!user) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'User not found');
    }

    // Get booking statistics
    const totalBookings = await Booking.countDocuments({ user_id: id });
    const completedBookings = await Booking.countDocuments({ user_id: id, status: 'completed' });
    const cancelledBookings = await Booking.countDocuments({ user_id: id, status: 'cancelled' });
    const activeBookings = await Booking.countDocuments({
      user_id: id,
      status: { $in: ['confirmed', 'active'] }
    });

    // Get total amount spent
    const spendingResult = await Booking.aggregate([
      { $match: { user_id: user._id, status: 'completed' } },
      { $group: { _id: null, total_spent: { $sum: '$total_amount' } } }
    ]);
    const totalSpent = spendingResult.length > 0 ? spendingResult[0].total_spent : 0;

    // Get review statistics
    const totalReviews = await Review.countDocuments({ user_id: id });
    const avgRatingResult = await Review.aggregate([
      { $match: { user_id: user._id } },
      { $group: { _id: null, average_rating: { $avg: '$rating' } } }
    ]);
    const averageRatingGiven = avgRatingResult.length > 0 ? parseFloat(avgRatingResult[0].average_rating.toFixed(2)) : 0;

    const stats = {
      bookings: {
        total: totalBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
        active: activeBookings
      },
      spending: {
        total_spent: totalSpent,
        currency: 'USD'
      },
      reviews: {
        total_reviews: totalReviews,
        average_rating_given: averageRatingGiven
      },
      account: {
        member_since: user.created_at,
        is_verified: user.is_verified,
        last_login: user.last_login
      }
    };

    return success(res, { stats }, null, 200);
  } catch (err) {
    console.error('Get user stats error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching user statistics');
  }
};

/**
 * @desc    Update user location
 * @route   PUT /api/users/:id/location
 * @access  Private/Owner
 */
exports.updateLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    // Authorization check: Only the user themselves can update location
    if (req.user._id.toString() !== id) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to update user location');
    }

    const user = await User.findById(id);

    if (!user) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'User not found');
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid latitude. Must be between -90 and 90');
    }

    if (longitude < -180 || longitude > 180) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid longitude. Must be between -180 and 180');
    }

    user.location_lat = latitude;
    user.location_lng = longitude;
    await user.save();

    return success(res, {
      message: 'Location updated successfully',
      location: {
        latitude: user.location_lat,
        longitude: user.location_lng
      }
    }, null, 200);
  } catch (err) {
    console.error('Update location error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating location');
  }
};

/**
 * @desc    Get nearby users (for testing/admin)
 * @route   GET /api/users/nearby
 * @access  Private
 */
exports.getNearbyUsers = async (req, res, next) => {
  try {
    const { latitude, longitude, radius } = req.query;

    // Validate required parameters
    if (!latitude || !longitude) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Latitude and longitude are required');
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const searchRadius = parseFloat(radius) || 10; // Default 10km

    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid coordinates');
    }

    // Find users with location data
    const users = await User.find({
      location_lat: { $exists: true, $ne: null },
      location_lng: { $exists: true, $ne: null },
      is_active: true
    }).select('first_name last_name location_lat location_lng user_type profile_picture_url');

    // Calculate distances and filter by radius
    const nearbyUsers = users
      .map(user => {
        const distance = calculateDistance(lat, lng, user.location_lat, user.location_lng);
        return {
          _id: user._id,
          first_name: user.first_name,
          last_name: user.last_name,
          user_type: user.user_type,
          profile_picture_url: user.profile_picture_url,
          location: {
            latitude: user.location_lat,
            longitude: user.location_lng
          },
          distance: parseFloat(distance.toFixed(2))
        };
      })
      .filter(user => user.distance <= searchRadius)
      .sort((a, b) => a.distance - b.distance);

    return success(res, {
      users: nearbyUsers,
      total: nearbyUsers.length,
      search_params: {
        latitude: lat,
        longitude: lng,
        radius: searchRadius
      }
    }, null, 200);
  } catch (err) {
    console.error('Get nearby users error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching nearby users');
  }
};
