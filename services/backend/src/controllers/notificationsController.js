/**
 * Notifications Controller
 * Handles notification management and delivery
 */

const Notification = require('../models/Notification');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * @desc    Get user's notifications
 * @route   GET /api/notifications
 * @access  Private
 */
exports.getUserNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, is_read } = req.query;
    const validPage = Math.max(1, parseInt(page));
    const validLimit = Math.min(100, Math.max(1, parseInt(limit)));

    // Build filter
    const filter = { user_id: req.user._id };

    // Optional filter by read status
    if (is_read !== undefined) {
      filter.is_read = is_read === 'true';
    }

    // Get total count
    const total = await Notification.countDocuments(filter);

    // Get notifications with pagination (most recent first)
    const notifications = await Notification.find(filter)
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    const meta = paginationMeta(validPage, validLimit, total);

    return success(res, { notifications }, meta);
  } catch (err) {
    console.error('Get user notifications error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching notifications');
  }
};

/**
 * @desc    Get notification by ID
 * @route   GET /api/notifications/:id
 * @access  Private/Owner
 */
exports.getNotificationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get notification
    const notification = await Notification.findById(id);

    if (!notification) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Notification not found');
    }

    // Check authorization - user must own the notification
    if (notification.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view this notification');
    }

    return success(res, { notification });
  } catch (err) {
    console.error('Get notification by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching notification');
  }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/notifications/:id/read
 * @access  Private/Owner
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get notification
    const notification = await Notification.findById(id);

    if (!notification) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Notification not found');
    }

    // Check authorization - user must own the notification
    if (notification.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to update this notification');
    }

    // Mark as read
    notification.is_read = true;
    await notification.save();

    return success(res, { notification });
  } catch (err) {
    console.error('Mark notification as read error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error marking notification as read');
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/notifications/read-all
 * @access  Private
 */
exports.markAllAsRead = async (req, res, next) => {
  try {
    // Update all unread notifications for this user
    const result = await Notification.updateMany(
      { user_id: req.user._id, is_read: false },
      { $set: { is_read: true } }
    );

    return success(res, {
      message: 'All notifications marked as read',
      updated_count: result.modifiedCount
    });
  } catch (err) {
    console.error('Mark all notifications as read error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error marking all notifications as read');
  }
};

/**
 * @desc    Delete notification
 * @route   DELETE /api/notifications/:id
 * @access  Private/Owner
 */
exports.deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get notification
    const notification = await Notification.findById(id);

    if (!notification) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Notification not found');
    }

    // Check authorization - user must own the notification
    if (notification.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to delete this notification');
    }

    // Delete the notification
    await Notification.findByIdAndDelete(id);

    return success(res, { message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('Delete notification error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting notification');
  }
};

/**
 * @desc    Delete all read notifications
 * @route   DELETE /api/notifications/clear
 * @access  Private
 */
exports.clearReadNotifications = async (req, res, next) => {
  try {
    // Delete all read notifications for this user
    const result = await Notification.deleteMany({
      user_id: req.user._id,
      is_read: true
    });

    return success(res, {
      message: 'Read notifications cleared successfully',
      deleted_count: result.deletedCount
    });
  } catch (err) {
    console.error('Clear read notifications error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error clearing read notifications');
  }
};

/**
 * @desc    Get unread notification count
 * @route   GET /api/notifications/unread/count
 * @access  Private
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    // Count unread notifications for this user
    const unread_count = await Notification.countDocuments({
      user_id: req.user._id,
      is_read: false
    });

    return success(res, { unread_count });
  } catch (err) {
    console.error('Get unread notification count error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching unread count');
  }
};
