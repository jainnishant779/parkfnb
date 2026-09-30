const Device = require('../models/Device');
const ParkingSpace = require('../models/ParkingSpace');
const AccessAuditLog = require('../models/AccessAuditLog');
const mqttService = require('../services/mqttService');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Admin view of every parking space and every registered access device.
 * GET /api/devices/admin/barrier-assignments
 */
exports.getAdminBarrierAssignments = async (req, res) => {
  try {
    const [spaces, devices] = await Promise.all([
      ParkingSpace.find()
        .populate('property_id', 'property_name address city state')
        .populate('owner_id', 'business_name user_id')
        .sort({ created_at: -1 }),
      Device.find({ device_type: { $in: ['barrier', 'gate', 'lock'] } })
        .populate('parking_space_id', 'space_number property_id')
        .sort({ device_id: 1 }),
    ]);

    return success(res, { spaces, devices });
  } catch (err) {
    console.error('getAdminBarrierAssignments error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not load barrier assignments');
  }
};

/**
 * Assign (or unassign) one physical barrier to one parking space while keeping
 * both documents in sync. Send { barrier_id: null } to remove the mapping.
 * PUT /api/devices/admin/parking-spaces/:spaceId/barrier
 */
exports.assignBarrierToSpace = async (req, res) => {
  try {
    const space = await ParkingSpace.findById(req.params.spaceId);
    if (!space) {
      return error(res, errorCodes.RES_NOT_FOUND, 404, 'Parking space not found');
    }

    const requestedId = req.body.barrier_id;
    const barrierId = requestedId === null || requestedId === undefined || requestedId === ''
      ? null
      : String(requestedId).trim();

    let device = null;
    if (barrierId) {
      device = await Device.findOne({ device_id: barrierId });
      if (!device) {
        return error(res, errorCodes.RES_NOT_FOUND, 404, 'Barrier ID is not registered');
      }

      const deviceSpaceId = device.parking_space_id?.toString();
      if (deviceSpaceId && deviceSpaceId !== space._id.toString()) {
        return error(
          res,
          errorCodes.RES_CONFLICT,
          409,
          'This barrier is already assigned to another parking space'
        );
      }

      // ParkingSpace.device_id is the operational lookup used by access flows.
      // Guard it as well in case legacy data has only that side populated.
      const conflictingSpace = await ParkingSpace.findOne({
        _id: { $ne: space._id },
        device_id: barrierId,
      }).select('_id space_number');
      if (conflictingSpace) {
        return error(
          res,
          errorCodes.RES_CONFLICT,
          409,
          `This barrier is already assigned to parking space ${conflictingSpace.space_number}`
        );
      }
    }

    const previousBarrierId = space.device_id;
    if (previousBarrierId && previousBarrierId !== barrierId) {
      await Device.updateOne(
        { device_id: previousBarrierId, parking_space_id: space._id },
        { $set: { parking_space_id: null } }
      );
    }

    if (device) {
      device.parking_space_id = space._id;
      await device.save();
    } else {
      // Also clears legacy records where ParkingSpace.device_id was missing.
      await Device.updateMany(
        { parking_space_id: space._id },
        { $set: { parking_space_id: null } }
      );
    }

    space.device_id = barrierId;
    space.has_smart_barrier = Boolean(barrierId);
    await space.save();

    const updatedSpace = await ParkingSpace.findById(space._id)
      .populate('property_id', 'property_name address city state')
      .populate('owner_id', 'business_name user_id');

    return success(res, {
      space: updatedSpace,
      device,
      message: barrierId
        ? `Barrier ${barrierId} assigned to parking space ${space.space_number}`
        : `Barrier removed from parking space ${space.space_number}`,
    });
  } catch (err) {
    console.error('assignBarrierToSpace error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not update barrier assignment');
  }
};

/**
 * Pair or register a new IoT smart barrier with an owner's parking space
 * POST /api/v1/devices/pair
 */
exports.pairDevice = async (req, res) => {
  try {
    const { device_id, name, parking_space_id, device_type, secret_token } = req.body;

    if (!device_id) {
      return error(res, errorCodes.REQ_MISSING_FIELD, 400, 'device_id is required');
    }

    const userId = req.user._id;

    // Verify parking space if provided
    let space = null;
    if (parking_space_id) {
      space = await ParkingSpace.findById(parking_space_id);
      if (!space) {
        return error(res, errorCodes.RES_NOT_FOUND, 404, 'Parking space not found');
      }
      // Verify that this parking space belongs to the user
      const ownerId = space.owner_id ? space.owner_id.toString() : '';
      if (ownerId !== userId.toString()) {
        // Also check if user has an associated Owner record
        const Owner = require('../models/Owner');
        const ownerRec = await Owner.findOne({ user_id: userId });
        if (!ownerRec || ownerRec._id.toString() !== ownerId) {
          return error(res, errorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403, 'You do not own this parking space');
        }
      }
    }

    const cleanDeviceId = device_id.trim();

    // Check if device is already registered by someone else
    let device = await Device.findOne({ device_id: cleanDeviceId });
    if (device && device.owner_id.toString() !== userId.toString()) {
      return error(res, errorCodes.RES_CONFLICT, 409, 'This device ID is already registered to another owner');
    }

    if (!device) {
      device = new Device({
        device_id: cleanDeviceId,
        owner_id: userId,
        name: name || `Barrier ${cleanDeviceId}`,
        device_type: device_type || 'barrier',
        parking_space_id: parking_space_id || null,
        secret_token: secret_token || 'change-me-to-a-long-random-string',
      });
    } else {
      if (name) device.name = name;
      if (device_type) device.device_type = device_type;
      if (parking_space_id !== undefined) device.parking_space_id = parking_space_id || null;
      if (secret_token) device.secret_token = secret_token;
    }

    await device.save();

    // Update ParkingSpace linkage
    if (space) {
      space.device_id = cleanDeviceId;
      space.has_smart_barrier = true;
      await space.save();
    }

    return success(res, {
      device,
      message: 'Device paired successfully',
    }, null, 201);
  } catch (err) {
    console.error('pairDevice error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};

/**
 * Get all devices registered to logged-in owner
 * GET /api/v1/devices/my-devices
 */
exports.getMyDevices = async (req, res) => {
  try {
    const userId = req.user._id;
    const devices = await Device.find({ owner_id: userId })
      .populate('parking_space_id', 'space_number space_type price_per_hour property_id')
      .sort({ created_at: -1 });

    return success(res, { devices });
  } catch (err) {
    console.error('getMyDevices error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};

/**
 * Get telemetry & state for a specific device
 * GET /api/v1/devices/:id/telemetry
 */
exports.getDeviceTelemetry = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findOne({
      $or: [{ device_id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    }).populate('parking_space_id', 'space_number space_type');

    if (!device) {
      return error(res, errorCodes.RES_NOT_FOUND, 404, 'Device not found');
    }

    // Owner authorization
    if (device.owner_id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return error(res, errorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403, 'Forbidden');
    }

    return success(res, {
      device_id: device.device_id,
      name: device.name,
      status: device.status,
      last_state: device.last_state,
      last_seen_at: device.last_seen_at,
      parking_space: device.parking_space_id,
      is_broker_connected: mqttService.isBrokerConnected(),
    });
  } catch (err) {
    console.error('getDeviceTelemetry error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};

/**
 * Send manual command to device (Owner manual control)
 * POST /api/v1/devices/:id/command
 */
exports.sendCommand = async (req, res) => {
  try {
    const { id } = req.params;
    const { command, params } = req.body;

    if (!command) {
      return error(res, errorCodes.REQ_MISSING_FIELD, 400, 'command is required (open, close, stop, cal, status)');
    }

    const validCommands = ['open', 'close', 'stop', 'cal', 'status', 'clear', 'goto'];
    if (!validCommands.includes(command)) {
      return error(res, errorCodes.REQ_INVALID_FORMAT, 400, `Invalid command. Allowed: ${validCommands.join(', ')}`);
    }

    const device = await Device.findOne({
      $or: [{ device_id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!device) {
      return error(res, errorCodes.RES_NOT_FOUND, 404, 'Device not found');
    }

    if (device.owner_id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return error(res, errorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403, 'Forbidden');
    }

    const context = {
      userId: req.user._id,
      userRole: 'owner',
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    };

    const result = await mqttService.sendDeviceCommand(device.device_id, command, params || {}, context);

    return success(res, {
      result,
      message: `Command '${command}' dispatched successfully`,
    });
  } catch (err) {
    console.error('sendCommand error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};

/**
 * Unpair device from parking space
 * DELETE /api/v1/devices/:id/unpair
 */
exports.unpairDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findOne({
      $or: [{ device_id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
      owner_id: req.user._id,
    });

    if (!device) {
      return error(res, errorCodes.RES_NOT_FOUND, 404, 'Device not found');
    }

    if (device.parking_space_id) {
      await ParkingSpace.findByIdAndUpdate(device.parking_space_id, {
        device_id: null,
        has_smart_barrier: false,
      });
      device.parking_space_id = null;
      await device.save();
    }

    return success(res, { message: 'Device unpaired from parking space' });
  } catch (err) {
    console.error('unpairDevice error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};

/**
 * Get device access audit history
 * GET /api/v1/devices/:id/logs
 */
exports.getDeviceLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findOne({
      $or: [{ device_id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
      owner_id: req.user._id,
    });

    if (!device) {
      return error(res, errorCodes.RES_NOT_FOUND, 404, 'Device not found');
    }

    const logs = await AccessAuditLog.find({ device_id: device.device_id })
      .sort({ created_at: -1 })
      .limit(50);

    return success(res, { logs });
  } catch (err) {
    console.error('getDeviceLogs error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, err.message);
  }
};
