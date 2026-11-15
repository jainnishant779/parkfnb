/**
 * Availability Controller
 * Handles parking space availability schedules and conflict detection
 */

const SpaceAvailability = require('../models/SpaceAvailability');
const ParkingSpace = require('../models/ParkingSpace');
const Owner = require('../models/Owner');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Helper function to check time conflicts
 */
const hasTimeConflict = (start1, end1, start2, end2) => {
  // Convert HH:MM to minutes for easier comparison
  const toMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);

  // Check if ranges overlap
  return (s1 < e2 && e1 > s2);
};

/**
 * @desc    Get availability schedules for a parking space
 * @route   GET /api/parking-spaces/:spaceId/availability
 * @access  Public
 */
exports.getSpaceAvailability = async (req, res, next) => {
  try {
    const { spaceId } = req.params;
    const { day_of_week } = req.query;

    // Check if parking space exists
    const parkingSpace = await ParkingSpace.findById(spaceId);
    if (!parkingSpace) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Parking space not found');
    }

    // Build filter
    const filter = { space_id: spaceId };
    if (day_of_week !== undefined) {
      filter.day_of_week = parseInt(day_of_week);
    }

    // Get availability schedules
    const schedules = await SpaceAvailability.find(filter).sort({ day_of_week: 1, available_from: 1 });

    return success(res, {
      space_id: spaceId,
      schedules,
      total: schedules.length
    });
  } catch (err) {
    console.error('Get space availability error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching availability schedules');
  }
};

/**
 * @desc    Create availability schedule
 * @route   POST /api/parking-spaces/:spaceId/availability
 * @access  Private/Owner
 */
exports.createAvailability = async (req, res, next) => {
  try {
    const { spaceId } = req.params;
    const { day_of_week, available_from, available_to, is_available } = req.body;

    // Check if parking space exists
    const parkingSpace = await ParkingSpace.findById(spaceId);
    if (!parkingSpace) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Parking space not found');
    }

    // Check if user is the owner of the parking space
    if (req.user.user_type !== 'admin') {
      const owner = await Owner.findOne({ user_id: req.user._id });
      if (!owner || parkingSpace.owner_id.toString() !== owner._id.toString()) {
        return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to manage this parking space');
      }
    }

    // Validate time range
    const fromMinutes = parseInt(available_from.split(':')[0]) * 60 + parseInt(available_from.split(':')[1]);
    const toMinutes = parseInt(available_to.split(':')[0]) * 60 + parseInt(available_to.split(':')[1]);

    if (fromMinutes >= toMinutes) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'available_from must be before available_to');
    }

    // Check for conflicts with existing schedules
    const existingSchedules = await SpaceAvailability.find({
      space_id: spaceId,
      day_of_week: day_of_week
    });

    for (const schedule of existingSchedules) {
      if (hasTimeConflict(available_from, available_to, schedule.available_from, schedule.available_to)) {
        return error(res, errorCodes.BIZ_CONFLICT, 409, 'Time slot conflicts with existing availability', {
          conflicting_schedule: {
            id: schedule._id,
            day_of_week: schedule.day_of_week,
            available_from: schedule.available_from,
            available_to: schedule.available_to
          }
        });
      }
    }

    // Create availability
    const availability = await SpaceAvailability.create({
      space_id: spaceId,
      day_of_week,
      available_from,
      available_to,
      is_available: is_available !== undefined ? is_available : true
    });

    return success(res, { availability }, null, 201);
  } catch (err) {
    console.error('Create availability error:', err);

    // Handle validation errors
    if (err.name === 'ValidationError') {
      return error(res, errorCodes.REQ_VALIDATION, 400, err.message);
    }

    return error(res, errorCodes.SERVER_ERROR, 500, 'Error creating availability schedule');
  }
};

/**
 * @desc    Update availability schedule
 * @route   PUT /api/availability/:id
 * @access  Private/Owner
 */
exports.updateAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { day_of_week, available_from, available_to, is_available } = req.body;

    // Find availability
    const availability = await SpaceAvailability.findById(id);
    if (!availability) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Availability schedule not found');
    }

    // Check if parking space exists and user is owner
    const parkingSpace = await ParkingSpace.findById(availability.space_id);
    if (!parkingSpace) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Parking space not found');
    }

    if (req.user.user_type !== 'admin') {
      const owner = await Owner.findOne({ user_id: req.user._id });
      if (!owner || parkingSpace.owner_id.toString() !== owner._id.toString()) {
        return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to manage this parking space');
      }
    }

    // If updating time range, validate it
    const newFrom = available_from || availability.available_from;
    const newTo = available_to || availability.available_to;
    const newDay = day_of_week !== undefined ? day_of_week : availability.day_of_week;

    const fromMinutes = parseInt(newFrom.split(':')[0]) * 60 + parseInt(newFrom.split(':')[1]);
    const toMinutes = parseInt(newTo.split(':')[0]) * 60 + parseInt(newTo.split(':')[1]);

    if (fromMinutes >= toMinutes) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'available_from must be before available_to');
    }

    // Check for conflicts (excluding current schedule)
    const existingSchedules = await SpaceAvailability.find({
      _id: { $ne: id },
      space_id: availability.space_id,
      day_of_week: newDay
    });

    for (const schedule of existingSchedules) {
      if (hasTimeConflict(newFrom, newTo, schedule.available_from, schedule.available_to)) {
        return error(res, errorCodes.BIZ_CONFLICT, 409, 'Time slot conflicts with existing availability', {
          conflicting_schedule: {
            id: schedule._id,
            day_of_week: schedule.day_of_week,
            available_from: schedule.available_from,
            available_to: schedule.available_to
          }
        });
      }
    }

    // Update fields
    if (day_of_week !== undefined) availability.day_of_week = day_of_week;
    if (available_from) availability.available_from = available_from;
    if (available_to) availability.available_to = available_to;
    if (is_available !== undefined) availability.is_available = is_available;

    await availability.save();

    return success(res, { availability });
  } catch (err) {
    console.error('Update availability error:', err);

    // Handle validation errors
    if (err.name === 'ValidationError') {
      return error(res, errorCodes.REQ_VALIDATION, 400, err.message);
    }

    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating availability schedule');
  }
};

/**
 * @desc    Delete availability schedule
 * @route   DELETE /api/availability/:id
 * @access  Private/Owner
 */
exports.deleteAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find availability
    const availability = await SpaceAvailability.findById(id);
    if (!availability) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Availability schedule not found');
    }

    // Check if parking space exists and user is owner
    const parkingSpace = await ParkingSpace.findById(availability.space_id);
    if (!parkingSpace) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Parking space not found');
    }

    if (req.user.user_type !== 'admin') {
      const owner = await Owner.findOne({ user_id: req.user._id });
      if (!owner || parkingSpace.owner_id.toString() !== owner._id.toString()) {
        return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to manage this parking space');
      }
    }

    // Delete availability
    await SpaceAvailability.findByIdAndDelete(id);

    return success(res, { message: 'Availability schedule deleted successfully' });
  } catch (err) {
    console.error('Delete availability error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting availability schedule');
  }
};

/**
 * @desc    Bulk create weekly availability
 * @route   POST /api/parking-spaces/:spaceId/availability/bulk
 * @access  Private/Owner
 */
exports.bulkCreateAvailability = async (req, res, next) => {
  try {
    const { spaceId } = req.params;
    const { schedules } = req.body;

    // Validate schedules array
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'schedules must be a non-empty array');
    }

    // Check if parking space exists
    const parkingSpace = await ParkingSpace.findById(spaceId);
    if (!parkingSpace) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Parking space not found');
    }

    // Check if user is the owner of the parking space
    if (req.user.user_type !== 'admin') {
      const owner = await Owner.findOne({ user_id: req.user._id });
      if (!owner || parkingSpace.owner_id.toString() !== owner._id.toString()) {
        return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to manage this parking space');
      }
    }

    // Get existing schedules
    const existingSchedules = await SpaceAvailability.find({ space_id: spaceId });

    const createdSchedules = [];
    const errors = [];

    // Process each schedule
    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i];
      const { day_of_week, available_from, available_to, is_available } = schedule;

      try {
        // Validate required fields
        if (day_of_week === undefined || !available_from || !available_to) {
          errors.push({
            index: i,
            schedule,
            error: 'Missing required fields: day_of_week, available_from, available_to'
          });
          continue;
        }

        // Validate time range
        const fromMinutes = parseInt(available_from.split(':')[0]) * 60 + parseInt(available_from.split(':')[1]);
        const toMinutes = parseInt(available_to.split(':')[0]) * 60 + parseInt(available_to.split(':')[1]);

        if (fromMinutes >= toMinutes) {
          errors.push({
            index: i,
            schedule,
            error: 'available_from must be before available_to'
          });
          continue;
        }

        // Check for conflicts with existing schedules
        let hasConflict = false;
        for (const existing of existingSchedules) {
          if (existing.day_of_week === day_of_week &&
              hasTimeConflict(available_from, available_to, existing.available_from, existing.available_to)) {
            errors.push({
              index: i,
              schedule,
              error: 'Conflicts with existing schedule',
              conflicting_schedule: {
                id: existing._id,
                day_of_week: existing.day_of_week,
                available_from: existing.available_from,
                available_to: existing.available_to
              }
            });
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) continue;

        // Check for conflicts with newly created schedules
        for (const created of createdSchedules) {
          if (created.day_of_week === day_of_week &&
              hasTimeConflict(available_from, available_to, created.available_from, created.available_to)) {
            errors.push({
              index: i,
              schedule,
              error: 'Conflicts with another schedule in this bulk request'
            });
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) continue;

        // Create availability
        const availability = await SpaceAvailability.create({
          space_id: spaceId,
          day_of_week,
          available_from,
          available_to,
          is_available: is_available !== undefined ? is_available : true
        });

        createdSchedules.push(availability);
      } catch (err) {
        errors.push({
          index: i,
          schedule,
          error: err.message
        });
      }
    }

    return success(res, {
      created: createdSchedules,
      created_count: createdSchedules.length,
      failed_count: errors.length,
      errors: errors.length > 0 ? errors : undefined
    }, null, 201);
  } catch (err) {
    console.error('Bulk create availability error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error bulk creating availability schedules');
  }
};

/**
 * @desc    Check for conflicts
 * @route   POST /api/parking-spaces/:spaceId/availability/check-conflict
 * @access  Private/Owner
 */
exports.checkConflicts = async (req, res, next) => {
  try {
    const { spaceId } = req.params;
    const { day_of_week, available_from, available_to, exclude_id } = req.body;

    // Validate required fields
    if (day_of_week === undefined || !available_from || !available_to) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'day_of_week, available_from, and available_to are required');
    }

    // Check if parking space exists
    const parkingSpace = await ParkingSpace.findById(spaceId);
    if (!parkingSpace) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Parking space not found');
    }

    // Check if user is the owner of the parking space
    if (req.user.user_type !== 'admin') {
      const owner = await Owner.findOne({ user_id: req.user._id });
      if (!owner || parkingSpace.owner_id.toString() !== owner._id.toString()) {
        return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to check conflicts for this parking space');
      }
    }

    // Build filter
    const filter = {
      space_id: spaceId,
      day_of_week: day_of_week
    };

    // Exclude specific ID if provided (useful for update operations)
    if (exclude_id) {
      filter._id = { $ne: exclude_id };
    }

    // Get existing schedules for that day
    const existingSchedules = await SpaceAvailability.find(filter);

    // Check for conflicts
    const conflicts = [];
    for (const schedule of existingSchedules) {
      if (hasTimeConflict(available_from, available_to, schedule.available_from, schedule.available_to)) {
        conflicts.push({
          id: schedule._id,
          day_of_week: schedule.day_of_week,
          available_from: schedule.available_from,
          available_to: schedule.available_to,
          is_available: schedule.is_available
        });
      }
    }

    return success(res, {
      has_conflict: conflicts.length > 0,
      conflicts,
      checked_time: {
        day_of_week,
        available_from,
        available_to
      }
    });
  } catch (err) {
    console.error('Check conflicts error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error checking conflicts');
  }
};
