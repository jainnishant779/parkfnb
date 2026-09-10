const Booking = require('../models/Booking');
const ParkingSpace = require('../models/ParkingSpace');
const Device = require('../models/Device');
const mqttService = require('../services/mqttService');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Unlock parking barrier for an active booking (Driver action)
 * POST /api/v1/bookings/:id/unlock
 */
exports.unlockBarrier = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const booking = await Booking.findById(id).populate('space_id');
    if (!booking) {
      return error(res, errorCodes.RES_NOT_FOUND, 404, 'Booking not found');
    }

    // 1. Authorization: Only the booking driver or an admin can unlock
    if (booking.user_id.toString() !== userId.toString() && req.user.role !== 'admin') {
      return error(res, errorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403, 'You are not authorized to unlock this parking spot');
    }

    // 2. Status check: Booking must be confirmed or active
    if (!['confirmed', 'active'].includes(booking.status)) {
      return error(
        res,
        errorCodes.RES_CONFLICT,
        400,
        `Cannot unlock barrier. Booking status is '${booking.status}' (expected 'confirmed')`
      );
    }

    // 3. Payment check: Booking must be paid
    if (booking.payment_status !== 'paid') {
      return error(
        res,
        errorCodes.AUTH_INSUFFICIENT_PERMISSIONS,
        402,
        'Cannot unlock barrier. Booking payment is pending'
      );
    }

    // 4. Time window check (allow 30m early arrival and 30m departure grace)
    const now = new Date();
    const startTime = new Date(booking.start_time);
    const endTime = new Date(booking.end_time);

    const earlyArrivalWindow = new Date(startTime.getTime() - 30 * 60 * 1000);
    const lateDepartureWindow = new Date(endTime.getTime() + 30 * 60 * 1000);

    if (now < earlyArrivalWindow) {
      const minsUntilStart = Math.ceil((startTime.getTime() - now.getTime()) / (60 * 1000));
      return error(
        res,
        errorCodes.AUTH_INSUFFICIENT_PERMISSIONS,
        403,
        `Reservation starts in ${minsUntilStart} minutes. Barrier unlock becomes available 30 minutes before start time.`
      );
    }

    if (now > lateDepartureWindow) {
      return error(
        res,
        errorCodes.AUTH_INSUFFICIENT_PERMISSIONS,
        403,
        'Reservation period has ended. Please extend your booking or contact the owner.'
      );
    }

    // 5. Find linked IoT device
    const space = booking.space_id;
    let device = null;

    if (space && space.device_id) {
      device = await Device.findOne({ device_id: space.device_id });
    }
    if (!device && space) {
      device = await Device.findOne({ parking_space_id: space._id });
    }

    if (!device) {
      return error(
        res,
        errorCodes.RES_NOT_FOUND,
        404,
        'No smart barrier device is linked to this parking space'
      );
    }

    // 6. Dispatch MQTT unlock command
    const context = {
      userId,
      userRole: 'renter',
      bookingId: booking._id,
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    };

    const result = await mqttService.sendDeviceCommand(device.device_id, 'open', {}, context);

    // Auto-check-in booking if not already checked in
    if (!booking.checked_in) {
      booking.checked_in = true;
      booking.check_in_time = new Date();
      if (booking.status === 'confirmed') {
        booking.status = 'active';
      }
      await booking.save();
    }

    return success(res, {
      message: 'Smart Barrier unlocked successfully. Please enter your spot.',
      device_id: device.device_id,
      space_number: space ? space.space_number : 'Spot',
      auto_close_in_seconds: 60,
      telemetry: device.last_state,
      command_result: result,
    });
  } catch (err) {
    console.error('unlockBarrier error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};

/**
 * Lock parking barrier manually (Driver action after parking or upon leaving)
 * POST /api/v1/bookings/:id/lock
 */
exports.lockBarrier = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const booking = await Booking.findById(id).populate('space_id');
    if (!booking) {
      return error(res, errorCodes.RES_NOT_FOUND, 404, 'Booking not found');
    }

    if (booking.user_id.toString() !== userId.toString() && req.user.role !== 'admin') {
      return error(res, errorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403, 'Forbidden');
    }

    const space = booking.space_id;
    let device = null;
    if (space && space.device_id) {
      device = await Device.findOne({ device_id: space.device_id });
    }
    if (!device && space) {
      device = await Device.findOne({ parking_space_id: space._id });
    }

    if (!device) {
      return error(res, errorCodes.RES_NOT_FOUND, 404, 'No smart barrier device linked to this space');
    }

    const context = {
      userId,
      userRole: 'renter',
      bookingId: booking._id,
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    };

    const result = await mqttService.sendDeviceCommand(device.device_id, 'close', {}, context);

    return success(res, {
      message: 'Smart Barrier secured',
      device_id: device.device_id,
      command_result: result,
    });
  } catch (err) {
    console.error('lockBarrier error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};
