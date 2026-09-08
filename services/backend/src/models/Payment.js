const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  payment_number: {
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
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    uppercase: true,
    trim: true
  },
  payment_method: {
    type: String,
    required: true,
    enum: ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer'],
    trim: true
  },
  payment_provider: {
    type: String,
    required: true,
    enum: ['stripe', 'paypal', 'square', 'braintree'],
    trim: true
  },
  provider_transaction_id: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  payment_status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded'],
    default: 'pending',
    index: true
  },
  paid_at: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
paymentSchema.index({ user_id: 1, payment_status: 1 });
paymentSchema.index({ booking_id: 1, payment_status: 1 });
paymentSchema.index({ payment_provider: 1, provider_transaction_id: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
