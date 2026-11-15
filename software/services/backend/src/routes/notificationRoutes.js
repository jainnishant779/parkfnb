/**
 * Notification Routes
 * Handles user notifications
 */

const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');
const { protect } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');

// Get user's notifications
router.get('/', protect, notificationsController.getUserNotifications);

// Get unread notification count
router.get('/unread/count', protect, notificationsController.getUnreadCount);

// Mark all notifications as read
router.put('/read/all', protect, notificationsController.markAllAsRead);

// Clear read notifications
router.delete('/clear', protect, notificationsController.clearReadNotifications);

// Notification-specific operations
router.get('/:id', protect, validateObjectId('id'), notificationsController.getNotificationById);

router.put(
  '/:id/read',
  protect,
  validateObjectId('id'),
  notificationsController.markAsRead
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  notificationsController.deleteNotification
);

module.exports = router;
