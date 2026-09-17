const Booking = require('../models/Booking');
const Device = require('../models/Device');
const UserVehicle = require('../models/UserVehicle');
const AccessAuditLog = require('../models/AccessAuditLog');
const mqttService = require('../services/mqttService');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * ANPR gate events.
 *
 * A camera cannot hold a JWT, so this route authenticates the SERVICE with a
 * shared token instead of a user. Everything after that is identical to
 * bookingAccessController.unlockBarrier — same booking, payment and time
 * window checks. The only thing that changes is how the driver is identified:
 * by number plate rather than by session.
 *
 * ANPR supplies evidence. This controller makes the decision.
 */

// A plate read is not a person, so audit rows need a placeholder actor.
const SYSTEM_ACTOR = '000000000000000000000000';

const EARLY_MS = 30 * 60 * 1000;   // may arrive 30 min before start
const LATE_MS = 30 * 60 * 1000;    // may leave 30 min after end

const ALPHA_TO_DIGIT = { O: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
const DIGIT_TO_ALPHA = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 8: 'B', 6: 'G', 4: 'A' };

const PLATE_RE = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/;
const BH_RE = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

/**
 * Normalise an Indian plate, fixing OCR confusions BY POSITION.
 * A blanket O->0 would turn the MP state code into M0 and match nothing.
 * Re-run here even though the camera already did it — never trust the client.
 */
function normalisePlate(input) {
  const s = String(input || '')
    .toUpperCase()
    .replace(/[|!\[\]]/g, '1')
    .replace(/[^A-Z0-9]/g, '');

  if (!s) return { plate: '', valid: false };
  if (BH_RE.test(s)) return { plate: s, valid: true };
  if (s.length < 8 || s.length > 10) return { plate: s, valid: false };

  const c = s.split('');
  const n = c.length;

  for (let i = n - 4; i < n; i += 1) {          // last four: digits
    if (/[A-Z]/.test(c[i])) c[i] = ALPHA_TO_DIGIT[c[i]] || c[i];
  }
  for (const i of [0, 1]) {                     // state code: letters
    if (/\d/.test(c[i])) c[i] = DIGIT_TO_ALPHA[c[i]] || c[i];
  }
  for (const i of [2, 3]) {                     // RTO district: digits
    if (i < n - 4 && /[A-Z]/.test(c[i])) c[i] = ALPHA_TO_DIGIT[c[i]] || c[i];
  }
  for (let i = 4; i < n - 4; i += 1) {          // series: letters
    if (/\d/.test(c[i])) c[i] = DIGIT_TO_ALPHA[c[i]] || c[i];
  }

  const plate = c.join('');
  return { plate, valid: PLATE_RE.test(plate) };
}

async function logRejection(deviceId, spaceId, plate, reason, ip) {
  try {
    await AccessAuditLog.create({
      device_id: deviceId || 'unknown',
      parking_space_id: spaceId || null,
      booking_id: null,
      user_id: SYSTEM_ACTOR,
      user_role: 'system',
      action: 'rejected',
      success: false,
      error_message: `ANPR: ${plate || 'no plate'} — ${reason}`,
      ip_address: ip || null,
    });
  } catch (e) {
    // A failed audit write must not turn a clean refusal into a 500.
    console.error('ANPR audit write failed:', e.message);
  }
}

/**
 * POST /api/access/anpr-event
 * Header: x-anpr-token
 * Body:   { plate, deviceId, direction?, ocrConfidence?, detConfidence? }
 */
exports.anprEvent = async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'];

  try {
    const token = req.headers['x-anpr-token'];
    const expected = process.env.ANPR_SERVICE_TOKEN;

    if (!expected) {
      return error(res, errorCodes.SERVER_ERROR, 500,
        'ANPR_SERVICE_TOKEN is not configured on the server');
    }
    if (!token || token !== expected) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 401, 'Invalid ANPR service token');
    }

    const { plate: rawPlate, deviceId, direction = 'entry' } = req.body || {};

    if (!deviceId) {
      return error(res, errorCodes.VALIDATION_ERROR, 400, 'deviceId is required');
    }

    const { plate, valid } = normalisePlate(rawPlate);
    if (!plate) {
      await logRejection(deviceId, null, '', 'no plate text', ip);
      return error(res, errorCodes.VALIDATION_ERROR, 400, 'No plate text supplied');
    }

    // 1. The device must exist and be known to us.
    const device = await Device.findOne({ device_id: deviceId });
    if (!device) {
      await logRejection(deviceId, null, plate, 'unknown device', ip);
      return error(res, errorCodes.RES_NOT_FOUND, 404,
        `No barrier device registered as '${deviceId}'`);
    }

    // 2. Plate -> vehicles. Both fields are populated in practice, so check both.
    const vehicles = await UserVehicle.find({
      $or: [{ license_plate: plate }, { registration_number: plate }],
    }).select('_id user_id license_plate registration_number');

    if (!vehicles.length) {
      await logRejection(deviceId, device.parking_space_id, plate,
        'plate not registered', ip);
      return error(res, errorCodes.RES_NOT_FOUND, 404,
        `Plate ${plate} is not registered with any account`);
    }

    // 3. One query expressing the same four guards unlockBarrier applies:
    //    right space, live booking, paid, inside the time window.
    const now = new Date();
    const booking = await Booking.findOne({
      vehicle_id: { $in: vehicles.map((v) => v._id) },
      space_id: device.parking_space_id,
      status: { $in: ['confirmed', 'active'] },
      payment_status: 'paid',
      start_time: { $lte: new Date(now.getTime() + EARLY_MS) },
      end_time: { $gte: new Date(now.getTime() - LATE_MS) },
    }).populate('space_id');

    if (!booking) {
      // Say which guard failed — vague refusals are impossible to support.
      const anyBooking = await Booking.findOne({
        vehicle_id: { $in: vehicles.map((v) => v._id) },
        space_id: device.parking_space_id,
      }).sort({ start_time: -1 });

      let reason = 'no booking for this space';
      if (anyBooking) {
        if (anyBooking.payment_status !== 'paid') reason = 'booking is not paid';
        else if (!['confirmed', 'active'].includes(anyBooking.status)) {
          reason = `booking is '${anyBooking.status}'`;
        } else reason = 'outside the booking time window';
      }

      await logRejection(deviceId, device.parking_space_id, plate, reason, ip);
      return error(res, errorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403,
        `Access denied for ${plate}: ${reason}`);
    }

    // 4. Authorised. mqttService writes its own success audit row in the
    //    publish callback, so do not log it again here.
    const context = {
      userId: booking.user_id,
      userRole: 'system',
      bookingId: booking._id,
      ipAddress: ip,
    };

    const action = direction === 'exit' ? 'close' : 'open';
    const result = await mqttService.sendDeviceCommand(
      device.device_id, action, {}, context,
    );

    // 5. Auto check-in, exactly as the app-tap path does.
    if (action === 'open' && !booking.checked_in) {
      booking.checked_in = true;
      booking.check_in_time = new Date();
      if (booking.status === 'confirmed') booking.status = 'active';
      await booking.save();
    }

    const space = booking.space_id;
    return success(res, {
      message: `Plate ${plate} authorised. Barrier ${action === 'open' ? 'opening' : 'closing'}.`,
      plate,
      valid_format: valid,
      direction,
      device_id: device.device_id,
      space_number: space ? space.space_number : null,
      booking: {
        id: booking._id,
        status: booking.status,
        start_time: booking.start_time,
        end_time: booking.end_time,
      },
      command_result: result,
    });
  } catch (err) {
    console.error('anprEvent error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};

/**
 * GET /api/access/anpr-log?deviceId=&limit=
 * The refusal trail. This is what you show when the gate correctly says no.
 */
exports.anprLog = async (req, res) => {
  try {
    const token = req.headers['x-anpr-token'];
    const isService = token && token === process.env.ANPR_SERVICE_TOKEN;
    const isAdmin = req.user && req.user.user_type === 'admin';

    if (!isService && !isAdmin) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 401, 'Not authorised');
    }

    const { deviceId, limit = 20 } = req.query;
    const filter = { error_message: { $regex: '^ANPR:' } };
    if (deviceId) filter.device_id = deviceId;

    const logs = await AccessAuditLog.find(filter)
      .sort({ created_at: -1 })
      .limit(Math.min(parseInt(limit, 10) || 20, 100))
      .select('device_id action success error_message created_at');

    return success(res, { logs });
  } catch (err) {
    console.error('anprLog error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};

exports.normalisePlate = normalisePlate;
