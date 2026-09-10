const mongoose = require('mongoose');

const accessAuditLogSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true,
    index: true,
  },
  parking_space_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpace',
    default: null,
    index: true,
  },
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null,
    index: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  user_role: {
    type: String,
    enum: ['renter', 'owner', 'admin', 'system'],
    required: true,
  },
  action: {
    type: String,
    enum: ['unlock', 'lock', 'stop', 'calibrate', 'fault', 'rejected'],
    required: true,
  },
  command_n: {
    type: Number,
    default: 0,
  },
  success: {
    type: Boolean,
    default: true,
  },
  error_message: {
    type: String,
    default: null,
  },
  ip_address: {
    type: String,
    default: null,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false },
});

accessAuditLogSchema.index({ device_id: 1, created_at: -1 });
accessAuditLogSchema.index({ booking_id: 1 });

module.exports = mongoose.model('AccessAuditLog', accessAuditLogSchema);
