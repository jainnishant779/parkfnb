const Booking = require('../models/Booking');
const ParkingSpace = require('../models/ParkingSpace');
const Device = require('../models/Device');
const mqttService = require('../services/mqttService');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Demo mode for MVP testing on a single bench barrier.
 *
 * With BARRIER_DEMO_MODE=true the booking gates (status, payment, time window)
 * are skipped, and a space with no device of its own falls back to one shared
 * demo device — so Open/Close works from any booking on any space. You still
 * have to be the person who made the booking.
 *
 * This exists so a demo never dies on "your reservation starts in 14 hours".
 * It must be off in production: with it on, a booking for next month opens the
 * barrier today.
 */
const DEMO_MODE = process.env.BARRIER_DEMO_MODE === 'true';
const DEMO_DEVICE_ID = process.env.BARRIER_DEMO_DEVICE_ID || 'pb-001';

/**
 * Find the barrier for a space.
 *
 * ParkingSpace.device_id (a string) is the primary link and Device.parking_space_id
 * (a ref) is the fallback, because pairing writes both but older rows only have one.
 */
async function findDeviceForSpace(space) {
  // In demo mode every space drives the one bench barrier, whatever it is
  // paired to. Seeded spaces each point at their own device id (pb-001 …
  // pb-007) but only one of those is a real unit, so a booking on any other
  // space dispatched a command that physically went nowhere — the app looked
  // broken while it was in fact working perfectly.
  if (DEMO_MODE) {
    const demo = await Device.findOne({ device_id: DEMO_DEVICE_ID });
    if (demo) {
      if (!space || space.device_id !== DEMO_DEVICE_ID) {
        console.warn(`[BARRIER_DEMO_MODE] routing to ${DEMO_DEVICE_ID} instead of ${space && space.device_id ? space.device_id : 'unpaired space'}`);
      }
      return demo;
    }
  }
  let device = null;
  if (space && space.device_id) {
    device = await Device.findOne({ device_id: space.device_id });
  }
  if (!device && space) {
    device = await Device.findOne({ parking_space_id: space._id });
  }
  return device;
}

/**
 * The gates that decide whether this booking may drive its barrier right now.
 * Returns null when allowed, or an already-sent error response when not.
 */
function checkBookingMayDriveBarrier(booking, res) {
  if (DEMO_MODE) {
    console.warn(`[BARRIER_DEMO_MODE] skipping status/payment/time checks for booking ${booking.booking_number || booking._id}`);
    return null;
  }

  if (!['confirmed', 'active'].includes(booking.status)) {
    return error(
      res,
      errorCodes.RES_CONFLICT,
      400,
      `Cannot operate barrier. Booking status is '${booking.status}'`
    );
  }

  // A cash booking only settles at checkout, which happens when the guest
  // LEAVES — so requiring 'paid' here meant a cash guest could never get in,
  // and cash is currently the only working payment method.
  if (booking.payment_status !== 'paid' && booking.payment_method !== 'cash') {
    return error(
      res,
      errorCodes.AUTH_INSUFFICIENT_PERMISSIONS,
      402,
      'Cannot operate barrier. Booking payment is pending'
    );
  }

  // 30m early arrival and 30m departure grace.
  const now = new Date();
  const startTime = new Date(booking.start_time);
  const endTime = new Date(booking.end_time);

  if (now < new Date(startTime.getTime() - 30 * 60 * 1000)) {
    const minsUntilStart = Math.ceil((startTime.getTime() - now.getTime()) / (60 * 1000));
    return error(
      res,
      errorCodes.AUTH_INSUFFICIENT_PERMISSIONS,
      403,
      `Reservation starts in ${minsUntilStart} minutes. The barrier unlocks 30 minutes before start time.`
    );
  }

  if (now > new Date(endTime.getTime() + 30 * 60 * 1000)) {
    return error(
      res,
      errorCodes.AUTH_INSUFFICIENT_PERMISSIONS,
      403,
      'Reservation period has ended. Please extend your booking or contact the owner.'
    );
  }

  return null;
}

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

    // 2. Status, payment and time-window gates (shared with lockBarrier, so
    //    Close cannot be used on a booking that may not Open)
    const blocked = checkBookingMayDriveBarrier(booking, res);
    if (blocked) return blocked;

    // 3. Find linked IoT device
    const space = booking.space_id;
    const device = await findDeviceForSpace(space);

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

    // Auto-check-in booking if not already checked in.
    // `checked_in` is not a schema path — Mongoose dropped it on save, so the
    // guard never held and this block re-ran (and rewrote check_in_time) on
    // every unlock. check_in_time is the real field; use it as the flag.
    let touched = false;
    if (!booking.check_in_time) {
      booking.check_in_time = new Date();
      touched = true;
    }
    if (booking.status === 'confirmed') {
      booking.status = 'active';
      touched = true;
    }
    if (touched) {
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

    // Close used to have no gates at all, so a booking that Open refused —
    // one starting tomorrow, or already completed — could still slam the
    // barrier on whoever was legitimately parked there. Same rules as Open.
    const blocked = checkBookingMayDriveBarrier(booking, res);
    if (blocked) return blocked;

    const space = booking.space_id;
    const device = await findDeviceForSpace(space);

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
