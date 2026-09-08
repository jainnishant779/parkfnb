const mongoose = require('mongoose');

const userPaymentMethodSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  payment_type: {
    type: String,
    required: true,
    enum: ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer'],
    trim: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['stripe', 'paypal', 'square', 'braintree'],
    trim: true
  },
  provider_payment_method_id: {
    type: String,
    required: true,
    trim: true
  },
  card_last4: {
    type: String,
    trim: true
  },
  card_brand: {
    type: String,
    enum: ['visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay'],
    trim: true
  },
  is_default: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Index for efficient queries
userPaymentMethodSchema.index({ user_id: 1, is_default: 1 });
userPaymentMethodSchema.index({ provider_payment_method_id: 1 });

module.exports = mongoose.model('UserPaymentMethod', userPaymentMethodSchema);
