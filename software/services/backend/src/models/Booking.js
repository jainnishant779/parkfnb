const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  booking_number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    index: true
  },
  space_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpace',
    required: true,
    index: true
  },
  vehicle_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserVehicle',
    required: true
  },
  start_time: {
    type: Date,
    required: true,
    index: true
  },
  end_time: {
    type: Date,
    required: true,
    index: true
  },
  duration_hours: {
    type: Number,
    required: true,
    min: 0
  },
  base_price: {
    type: Number,
    required: true,
    min: 0
  },
  discount_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    // Both apps only ever show ₹; nothing here charges in USD.
    default: 'INR',
    uppercase: true,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected', 'no_show'],
    default: 'pending',
    index: true
  },
  payment_status: {
    type: String,
    required: true,
    enum: ['pending', 'paid', 'refunded', 'partially_refunded', 'failed'],
    default: 'pending',
    index: true
  },
  // How the guest intends to pay. There is no online gateway wired up yet —
  // 'online' is accepted so it isn't lost once one exists, but every booking
  // created today is 'cash'.
  payment_method: {
    type: String,
    enum: ['cash', 'online'],
    default: 'cash'
  },
  check_in_time: {
    type: Date
  },
  check_out_time: {
    type: Date
  },
  // Audit trail of time extensions. extendBooking has always pushed onto this,
  // but without a schema path for it Mongoose dropped the array on save, so
  // every extension was invisible after the fact.
  extensions: [{
    old_end_time: { type: Date },
    new_end_time: { type: Date },
    extension_price: { type: Number },
    extended_at: { type: Date }
  }],
  // Why the owner turned the request down. Kept apart from
  // cancellation_reason so "the renter cancelled" and "the owner said no"
  // stay distinguishable in the booking history.
  rejection_reason: {
    type: String,
    trim: true
  },
  cancellation_reason: {
    type: String,
    trim: true
  },
  cancelled_at: {
    type: Date
  },
  // Set on cancellation per the refund-tier policy in cancelBooking. Only
  // ever non-zero for a booking that was actually paid before it was
  // cancelled — which nothing produces yet without an online gateway.
  refund_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Extra charge for staying past end_time, added by checkOut.
  overtime_charge: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound indexes for efficient queries
bookingSchema.index({ user_id: 1, status: 1 });
bookingSchema.index({ owner_id: 1, status: 1 });
bookingSchema.index({ space_id: 1, start_time: 1, end_time: 1 });
bookingSchema.index({ start_time: 1, end_time: 1 });
bookingSchema.index({ status: 1, payment_status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
