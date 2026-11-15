const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  notification_type: {
    type: String,
    required: true,
    enum: [
      'booking_confirmed',
      'booking_cancelled',
      'payment_received',
      'payment_failed',
      'refund_processed',
      'review_received',
      'message_received',
      'space_approved',
      'space_rejected',
      'booking_reminder',
      'checkout_reminder',
      'promo_code_applied'
    ],
    trim: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  reference_id: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  is_read: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
notificationSchema.index({ user_id: 1, is_read: 1 });
notificationSchema.index({ user_id: 1, created_at: -1 });
notificationSchema.index({ user_id: 1, notification_type: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
