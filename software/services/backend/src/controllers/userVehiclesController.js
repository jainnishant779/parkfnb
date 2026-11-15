/**
 * User Vehicles Controller
 * Handles vehicle management for users
 */

const UserVehicle = require('../models/UserVehicle');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

const formatVehicle = (v) => {
  if (!v) return v;
  const doc = v.toObject ? v.toObject() : v;
  const id = doc._id?.toString() || doc.id;
  const regNumber = doc.registration_number || doc.registrationNumber || doc.license_plate || doc.licensePlate || '';
  const vType = doc.vehicle_type || doc.vehicleType || 'car';
  const vSize = doc.vehicle_size || doc.vehicleSize || 'medium';
  const vYear = doc.vehicle_year !== undefined ? doc.vehicle_year : doc.vehicleYear;
  const isDef = doc.is_default !== undefined ? doc.is_default : (doc.isDefault !== undefined ? doc.isDefault : false);
  const isElec = doc.is_electric !== undefined ? doc.is_electric : (doc.isElectric !== undefined ? doc.isElectric : false);
  const vMake = doc.make || doc.vehicle_make || doc.vehicleMake || '';
  const vModel = doc.model || doc.vehicle_model || doc.vehicleModel || '';

  return {
    ...doc,
    id,
    _id: id,
    vehicle_type: vType,
    vehicleType: vType,
    vehicle_size: vSize,
    vehicleSize: vSize,
    registration_number: regNumber,
    registrationNumber: regNumber,
    license_plate: regNumber,
    licensePlate: regNumber,
    make: vMake,
    vehicle_make: vMake,
    model: vModel,
    vehicle_model: vModel,
    vehicle_year: vYear,
    vehicleYear: vYear,
    is_default: isDef,
    isDefault: isDef,
    is_electric: isElec,
    isElectric: isElec,
  };
};

/**
 * @desc    Get all vehicles for a user
 * @route   GET /api/users/:userId/vehicles
 * @access  Private/Owner
 */
exports.getUserVehicles = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Authorization check: Only the user themselves or admin can view
    if (req.user._id.toString() !== userId && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view vehicles');
    }

    const vehicles = await UserVehicle.find({ user_id: userId })
      .sort({ is_default: -1, created_at: -1 });

    return success(res, { vehicles: vehicles.map(formatVehicle), total: vehicles.length }, null, 200);
  } catch (err) {
    console.error('Get user vehicles error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching vehicles');
  }
};

/**
 * @desc    Get vehicle by ID
 * @route   GET /api/vehicles/:id
 * @access  Private/Owner
 */
exports.getVehicleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vehicle = await UserVehicle.findById(id);

    if (!vehicle) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Vehicle not found');
    }

    // Authorization check: Only the vehicle owner or admin can view
    if (vehicle.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view this vehicle');
    }

    return success(res, { vehicle: formatVehicle(vehicle) }, null, 200);
  } catch (err) {
    console.error('Get vehicle by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching vehicle');
  }
};

/**
 * @desc    Add new vehicle
 * @route   POST /api/users/:userId/vehicles
 * @access  Private
 */
exports.addVehicle = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Authorization check: Only the user themselves can add vehicles
    if (req.user._id.toString() !== userId) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to add vehicles for this user');
    }

    const vehicle_type = (req.body.vehicle_type || req.body.vehicleType || '').toLowerCase();
    const validVehicleTypes = ['car', 'suv', 'truck', 'van', 'motorcycle', 'bicycle', 'rv', 'trailer'];
    if (!validVehicleTypes.includes(vehicle_type)) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid vehicle type');
    }

    const defaultSizeForType = {
      motorcycle: 'small',
      bicycle: 'small',
      car: 'medium',
      suv: 'large',
      van: 'large',
      truck: 'extra_large',
      rv: 'extra_large',
      trailer: 'extra_large',
    };
    const vehicle_size = req.body.vehicle_size || req.body.vehicleSize || defaultSizeForType[vehicle_type] || 'medium';
    const validVehicleSizes = ['small', 'medium', 'large', 'extra_large'];
    if (!validVehicleSizes.includes(vehicle_size)) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid vehicle size');
    }

    const regNumber = (req.body.registration_number || req.body.registrationNumber || req.body.license_plate || req.body.licensePlate || '').trim();
    if (!regNumber) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Registration number or license plate is required');
    }

    const make = req.body.make || req.body.vehicle_make || req.body.vehicleMake || regNumber;
    const model = req.body.model || req.body.vehicle_model || req.body.vehicleModel || vehicle_type;
    const vehicle_year = req.body.vehicle_year !== undefined ? req.body.vehicle_year : req.body.vehicleYear;
    const is_default = req.body.is_default !== undefined ? req.body.is_default : (req.body.isDefault !== undefined ? req.body.isDefault : false);
    const is_electric = req.body.is_electric !== undefined ? req.body.is_electric : (req.body.isElectric !== undefined ? req.body.isElectric : false);

    // Validate year if provided
    if (vehicle_year) {
      const year = parseInt(vehicle_year, 10);
      if (year < 1900 || year > 2100) {
        return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid vehicle year. Must be between 1900 and 2100');
      }
    }

    // If setting as default, unset other defaults
    if (is_default) {
      await UserVehicle.updateMany(
        { user_id: userId, is_default: true },
        { is_default: false }
      );
    }

    // Check if this is the first vehicle for the user
    const existingVehiclesCount = await UserVehicle.countDocuments({ user_id: userId });
    const shouldBeDefault = existingVehiclesCount === 0 ? true : (is_default || false);

    const vehicle = await UserVehicle.create({
      user_id: userId,
      vehicle_type,
      vehicle_size,
      registration_number: regNumber.toUpperCase(),
      license_plate: regNumber.toUpperCase(),
      make,
      model,
      vehicle_make: make,
      vehicle_model: model,
      vehicle_year: vehicle_year || null,
      is_electric: is_electric || false,
      is_default: shouldBeDefault
    });

    return success(res, { vehicle: formatVehicle(vehicle) }, null, 201);
  } catch (err) {
    console.error('Add vehicle error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error adding vehicle');
  }
};

/**
 * @desc    Update vehicle
 * @route   PUT /api/vehicles/:id
 * @access  Private/Owner
 */
exports.updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      vehicle_type,
      vehicle_size,
      registration_number,
      license_plate,
      make,
      model,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      is_electric,
      is_default,
      is_verified
    } = req.body;

    const vehicle = await UserVehicle.findById(id);

    if (!vehicle) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Vehicle not found');
    }

    // Authorization check: Only the vehicle owner can update
    if (vehicle.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to update this vehicle');
    }

    // Update allowed fields
    if (vehicle_type) {
      const validVehicleTypes = ['car', 'suv', 'truck', 'van', 'motorcycle', 'bicycle', 'rv', 'trailer'];
      if (!validVehicleTypes.includes(vehicle_type)) {
        return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid vehicle type');
      }
      vehicle.vehicle_type = vehicle_type;
    }

    if (vehicle_size) {
      const validVehicleSizes = ['small', 'medium', 'large', 'extra_large'];
      if (!validVehicleSizes.includes(vehicle_size)) {
        return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid vehicle size');
      }
      vehicle.vehicle_size = vehicle_size;
    }

    if (registration_number || license_plate) {
      const regNumber = registration_number || license_plate;
      vehicle.registration_number = regNumber.toUpperCase();
      vehicle.license_plate = regNumber.toUpperCase();
    }

    if (make || vehicle_make) {
      vehicle.make = make || vehicle_make;
      vehicle.vehicle_make = make || vehicle_make;
    }

    if (model || vehicle_model) {
      vehicle.model = model || vehicle_model;
      vehicle.vehicle_model = model || vehicle_model;
    }

    if (vehicle_year !== undefined) {
      if (vehicle_year !== null) {
        const year = parseInt(vehicle_year);
        if (year < 1900 || year > 2100) {
          return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid vehicle year. Must be between 1900 and 2100');
        }
      }
      vehicle.vehicle_year = vehicle_year;
    }

    if (is_electric !== undefined) {
      vehicle.is_electric = is_electric;
    }

    if (is_verified !== undefined && req.user.user_type === 'admin') {
      vehicle.is_verified = is_verified;
    }

    // If setting as default, use setDefaultVehicle logic
    if (is_default !== undefined && is_default === true) {
      // Unset other defaults
      await UserVehicle.updateMany(
        { user_id: vehicle.user_id, _id: { $ne: id }, is_default: true },
        { is_default: false }
      );
      vehicle.is_default = true;
    }

    await vehicle.save();

    return success(res, { vehicle: formatVehicle(vehicle) }, null, 200);
  } catch (err) {
    console.error('Update vehicle error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating vehicle');
  }
};

/**
 * @desc    Delete vehicle
 * @route   DELETE /api/vehicles/:id
 * @access  Private/Owner
 */
exports.deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vehicle = await UserVehicle.findById(id);

    if (!vehicle) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Vehicle not found');
    }

    // Authorization check: Only the vehicle owner can delete
    if (vehicle.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to delete this vehicle');
    }

    const wasDefault = vehicle.is_default;
    const userId = vehicle.user_id;

    await UserVehicle.findByIdAndDelete(id);

    // If deleted vehicle was default, set another one as default
    if (wasDefault) {
      const nextVehicle = await UserVehicle.findOne({ user_id: userId })
        .sort({ created_at: -1 });

      if (nextVehicle) {
        nextVehicle.is_default = true;
        await nextVehicle.save();
      }
    }

    return success(res, { message: 'Vehicle deleted successfully' }, null, 200);
  } catch (err) {
    console.error('Delete vehicle error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting vehicle');
  }
};

/**
 * @desc    Set default vehicle
 * @route   PUT /api/vehicles/:id/set-default
 * @access  Private/Owner
 */
exports.setDefaultVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vehicle = await UserVehicle.findById(id);

    if (!vehicle) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Vehicle not found');
    }

    // Authorization check: Only the vehicle owner can set default
    if (vehicle.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to modify this vehicle');
    }

    // If already default, no action needed
    if (vehicle.is_default) {
      return success(res, { vehicle: formatVehicle(vehicle), message: 'Vehicle is already the default' }, null, 200);
    }

    // Unset all other defaults for this user
    await UserVehicle.updateMany(
      { user_id: vehicle.user_id, is_default: true },
      { is_default: false }
    );

    // Set this as default
    vehicle.is_default = true;
    await vehicle.save();

    return success(res, { vehicle: formatVehicle(vehicle), message: 'Default vehicle updated' }, null, 200);
  } catch (err) {
    console.error('Set default vehicle error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error setting default vehicle');
  }
};
