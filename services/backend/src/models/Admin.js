const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  admin_role: {
    type: String,
    required: true,
    enum: ['super_admin', 'admin', 'moderator', 'support'],
    default: 'support',
    trim: true,
    index: true
  },
  permissions: {
    type: [String],
    default: [],
    validate: {
      validator: function(permissions) {
        const validPermissions = [
          'view_users', 'manage_users', 'delete_users',
          'view_bookings', 'manage_bookings', 'cancel_bookings',
          'view_properties', 'manage_properties', 'approve_properties',
          'view_payments', 'manage_payments', 'issue_refunds',
          'view_tickets', 'manage_tickets', 'close_tickets',
          'view_reviews', 'manage_reviews', 'delete_reviews',
          'view_analytics', 'manage_settings', 'manage_promos'
        ];
        return permissions.every(p => validPermissions.includes(p));
      },
      message: 'Invalid permission(s) provided'
    }
  },
  is_active: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound indexes for efficient queries
adminSchema.index({ admin_role: 1, is_active: 1 });

module.exports = mongoose.model('Admin', adminSchema);
