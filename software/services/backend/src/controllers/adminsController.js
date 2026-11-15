/**
 * Admins Controller
 * Handles admin user management and role assignment
 */

const Admin = require('../models/Admin');
const User = require('../models/User');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');
const { validatePagination } = require('../utils/validators');

/**
 * @desc    Get all admins
 * @route   GET /api/admins
 * @access  Private/Admin
 */
exports.getAllAdmins = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, is_active } = req.query;
    const { page: validPage, limit: validLimit } = validatePagination(page, limit);

    // Build filter
    const filter = {};
    if (role) filter.admin_role = role;
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    // Get total count
    const total = await Admin.countDocuments(filter);

    // Get admins with pagination
    const admins = await Admin.find(filter)
      .populate('user_id', 'email first_name last_name phone')
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    return success(
      res,
      admins,
      paginationMeta(validPage, validLimit, total)
    );
  } catch (err) {
    console.error('Get all admins error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching admins');
  }
};

/**
 * @desc    Get admin by ID
 * @route   GET /api/admins/:id
 * @access  Private/Admin
 */
exports.getAdminById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id).populate('user_id', 'email first_name last_name phone user_type');

    if (!admin) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Admin not found');
    }

    return success(res, { admin });
  } catch (err) {
    console.error('Get admin by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching admin');
  }
};

/**
 * @desc    Create admin user
 * @route   POST /api/admins
 * @access  Private/Admin (super admin only)
 */
exports.createAdmin = async (req, res, next) => {
  try {
    const { user_id, role } = req.body;

    // Check if requesting user is super admin
    const requestingAdmin = await Admin.findOne({ user_id: req.user._id });
    if (!requestingAdmin || requestingAdmin.admin_role !== 'super_admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only super admins can create admin users');
    }

    // Check if user exists
    const user = await User.findById(user_id);
    if (!user) {
      return error(res, errorCodes.USER_NOT_FOUND, 404, 'User not found');
    }

    // Check if user is already an admin
    const existingAdmin = await Admin.findOne({ user_id });
    if (existingAdmin) {
      return error(res, errorCodes.REQ_DUPLICATE, 409, 'User is already an admin');
    }

    // Create admin
    const admin = await Admin.create({
      user_id,
      admin_role: role || 'support',
      is_active: true
    });

    // Update user type to admin
    user.user_type = 'admin';
    await user.save();

    const populatedAdmin = await Admin.findById(admin._id).populate('user_id', 'email first_name last_name phone');

    return success(res, { admin: populatedAdmin }, null, 201);
  } catch (err) {
    console.error('Create admin error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error creating admin');
  }
};

/**
 * @desc    Update admin
 * @route   PUT /api/admins/:id
 * @access  Private/Admin (super admin only)
 */
exports.updateAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, is_active } = req.body;

    // Check if requesting user is super admin
    const requestingAdmin = await Admin.findOne({ user_id: req.user._id });
    if (!requestingAdmin || requestingAdmin.admin_role !== 'super_admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only super admins can update admin users');
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Admin not found');
    }

    // Prevent super admin from demoting themselves
    if (admin.user_id.toString() === req.user._id.toString() && role && role !== 'super_admin') {
      return error(res, errorCodes.BIZ_OPERATION_NOT_ALLOWED, 400, 'Cannot demote yourself from super admin');
    }

    // Update fields
    if (role) admin.admin_role = role;
    if (is_active !== undefined) admin.is_active = is_active;

    await admin.save();

    const updatedAdmin = await Admin.findById(id).populate('user_id', 'email first_name last_name phone');

    return success(res, { admin: updatedAdmin });
  } catch (err) {
    console.error('Update admin error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating admin');
  }
};

/**
 * @desc    Delete admin
 * @route   DELETE /api/admins/:id
 * @access  Private/Admin (super admin only)
 */
exports.deleteAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if requesting user is super admin
    const requestingAdmin = await Admin.findOne({ user_id: req.user._id });
    if (!requestingAdmin || requestingAdmin.admin_role !== 'super_admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only super admins can delete admin users');
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Admin not found');
    }

    // Prevent super admin from deleting themselves
    if (admin.user_id.toString() === req.user._id.toString()) {
      return error(res, errorCodes.BIZ_OPERATION_NOT_ALLOWED, 400, 'Cannot delete yourself');
    }

    // Get user and revert user_type
    const user = await User.findById(admin.user_id);
    if (user) {
      user.user_type = 'user';
      await user.save();
    }

    // Delete admin record
    await Admin.findByIdAndDelete(id);

    return success(res, { message: 'Admin deleted successfully' });
  } catch (err) {
    console.error('Delete admin error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting admin');
  }
};

/**
 * @desc    Update admin permissions
 * @route   PUT /api/admins/:id/permissions
 * @access  Private/Admin (super admin only)
 */
exports.updatePermissions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    // Check if requesting user is super admin
    const requestingAdmin = await Admin.findOne({ user_id: req.user._id });
    if (!requestingAdmin || requestingAdmin.admin_role !== 'super_admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only super admins can update permissions');
    }

    // Validate permissions array
    if (!Array.isArray(permissions)) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Permissions must be an array');
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Admin not found');
    }

    // Update permissions
    admin.permissions = permissions;
    await admin.save();

    const updatedAdmin = await Admin.findById(id).populate('user_id', 'email first_name last_name phone');

    return success(res, { admin: updatedAdmin });
  } catch (err) {
    console.error('Update permissions error:', err);

    // Handle validation errors
    if (err.name === 'ValidationError') {
      return error(res, errorCodes.REQ_VALIDATION, 400, err.message);
    }

    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating permissions');
  }
};

/**
 * @desc    Get admin activity logs
 * @route   GET /api/admins/:id/activity
 * @access  Private/Admin
 */
exports.getAdminActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, start_date, end_date } = req.query;
    const { page: validPage, limit: validLimit } = validatePagination(page, limit);

    const admin = await Admin.findById(id);
    if (!admin) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Admin not found');
    }

    // Build activity filter
    const activityFilter = { admin_id: id };

    if (start_date || end_date) {
      activityFilter.created_at = {};
      if (start_date) activityFilter.created_at.$gte = new Date(start_date);
      if (end_date) activityFilter.created_at.$lte = new Date(end_date);
    }

    // TODO: Implement proper activity logging system
    // For now, return placeholder data
    const activities = [];
    const total = 0;

    return success(
      res,
      {
        admin_id: id,
        activities,
        note: 'Activity logging system not yet implemented'
      },
      paginationMeta(validPage, validLimit, total)
    );
  } catch (err) {
    console.error('Get admin activity error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching admin activity');
  }
};
