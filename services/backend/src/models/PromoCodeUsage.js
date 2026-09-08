const mongoose = require('mongoose');

const promoCodeUsageSchema = new mongoose.Schema({
  promo_code_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PromoCode',
    required: true,
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
  discount_applied: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
promoCodeUsageSchema.index({ promo_code_id: 1, user_id: 1 });
promoCodeUsageSchema.index({ user_id: 1, created_at: -1 });
promoCodeUsageSchema.index({ booking_id: 1 }, { unique: true });

module.exports = mongoose.model('PromoCodeUsage', promoCodeUsageSchema);
