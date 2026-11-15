const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
  payment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    index: true
  },
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  refund_amount: {
    type: Number,
    required: true,
    min: 0
  },
  refund_reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  processed_at: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
refundSchema.index({ payment_id: 1, status: 1 });
refundSchema.index({ booking_id: 1, status: 1 });

module.exports = mongoose.model('Refund', refundSchema);
